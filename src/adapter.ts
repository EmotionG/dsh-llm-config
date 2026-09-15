/**
 * `ConfigAdapter`: one adapter instance per configured provider route.
 *
 * The adapter is transport-only. Connection facts arrive through the registry
 * thunk and are re-read once per operation, so a configuration change reaches
 * the very next request without re-registering the route.
 *
 * This runs as a NORMAL plugin (not a dynamic sandbox package), which is the
 * whole point: `undici` is importable here, so the adapter can issue a real
 * POST with auth headers and consume a streaming body. The dynamic-plugin
 * sandbox denies `fetch` and offers only a GET-only `ctx.web.fetch`, which
 * cannot express an LLM call.
 *
 * @module dsh-llm-config/adapter
 */

import { fetch as undiciFetch } from 'undici'
import {
  attributionHeaders,
  contentHasImage,
  LlmAdapter,
  LlmError,
  resolveRetryPolicy,
  type GenerateOptions,
  type LlmModelInfo,
  type LlmProviderInfo,
  type LlmResolvedModelInfo,
  type ResolvedRetryPolicy,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'
import type { AttachmentStore, ImageAttachmentRef, RequestImageAttachment } from '@deepseek-ai/dsh-attachment'
import type { ConfigModel, ConfigProvider } from './config.ts'
import { authHeaders, collectImageRefs, requestImages, requestUrl, serializeRequest, type RequestImages } from './serialize.ts'
import { createTranslator, sseEvents } from './stream.ts'

export const PKG = 'llm-config'

/** The live view the adapter reads through; rebuilt whenever config changes. */
export interface ProviderRegistry {
  get(providerId: string): ConfigProvider | undefined
  resolveApiKey(provider: ConfigProvider): Promise<string>
  /**
   * The durable attachment service, when mounted. Image input is served only
   * through it: an image block carries a reference, and the bytes live in the
   * store. Returns `undefined` when the deployment offers no store, in which
   * case an image-carrying request is refused with `UNSUPPORTED_CONTENT`.
   */
  resolveAttachments(): AttachmentStore | undefined
}

/** Default request-image policy: pixel budget and encoded-byte target. */
const IMAGE_MAX_PIXELS = 64_000_000
const IMAGE_MAX_BYTES = 20 * 1024 * 1024

/** Derive the highest declared effort when a model declares no default. */
const EFFORT_RUNG: Record<string, number> = {
  max: 7, xhigh: 6, high: 5, medium: 4, low: 3, minimal: 2, none: 1, default: 0,
}

function highestEffort(values: readonly string[]): string | undefined {
  let best: string | undefined
  for (const v of values) {
    if (best === undefined || (EFFORT_RUNG[v] ?? -1) > (EFFORT_RUNG[best] ?? -1)) best = v
  }
  return best
}

/** HTTP status and provider message to a stable error code. */
function httpErrorCode(status: number, detail: string): string {
  const text = detail.toLowerCase()
  if (status === 401 || status === 403) return 'AUTH'
  if (/insufficient|quota|balance|credit/.test(text)) return 'QUOTA_EXCEEDED'
  if (status === 429) return 'RATE_LIMIT'
  if (status === 400) {
    if (/context length|too long|maximum context|token limit/.test(text)) return 'CONTEXT_WINDOW_EXCEEDED'
    return 'INVALID_REQUEST'
  }
  if (status >= 500) return 'SERVER'
  return `HTTP_${status}`
}

function errorMessageOf(body: unknown, fallback: string): string {
  if (typeof body !== 'object' || body === null) return fallback
  const record = body as Record<string, unknown>
  const error = record.error
  if (typeof error === 'object' && error !== null && typeof (error as Record<string, unknown>).message === 'string') {
    return String((error as Record<string, unknown>).message)
  }
  if (typeof record.message === 'string') return record.message
  return fallback
}

/** One adapter serving one provider route. */
export class ConfigAdapter extends LlmAdapter {
  readonly #registry: ProviderRegistry
  readonly #providerId: string

  constructor(registry: ProviderRegistry, providerId: string) {
    super()
    this.#registry = registry
    this.#providerId = providerId
  }

  #entry(): ConfigProvider | undefined {
    return this.#registry.get(this.#providerId)
  }

  providerInfo(provider: string): LlmProviderInfo {
    const entry = this.#entry()
    return { id: provider, name: entry?.displayName ?? this.#providerId }
  }

  /**
   * The provider-owned retry policy, captured when the route registers.
   *
   * `undefined` falls back to the framework's normal defaults (maxRetries 5),
   * which is exactly what an unconfigured route should do — so a configured
   * `retry` is returned verbatim-resolved, and an absent one is left alone.
   */
  providerRetryPolicy(_provider: string): ResolvedRetryPolicy | undefined {
    const entry = this.#entry()
    if (entry?.retry === undefined) return undefined
    return resolveRetryPolicy(entry.retry, `llm-config: provider "${this.#providerId}" retry`)
  }

  listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    const entry = this.#entry()
    if (entry === undefined) return Promise.resolve([])
    return Promise.resolve(entry.models.map(m => ({
      provider,
      id: m.id,
      name: m.name ?? m.id,
      ...(m.description !== undefined ? { description: m.description } : {}),
      inputModalities: m.inputModalities,
    })))
  }

  resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    const entry = this.#entry()
    const configured = entry?.models.find(m => m.id === model)
    const contextWindow = configured?.contextWindow
      ?? entry?.defaultContextWindow
      ?? 128_000
    const defaultMaxTokens = configured?.maxTokens ?? entry?.maxTokens
    const info: LlmResolvedModelInfo = {
      provider,
      id: model,
      name: configured?.name ?? model,
      ...(configured?.description !== undefined ? { description: configured.description } : {}),
      inputModalities: configured?.inputModalities ?? ['text'],
      context: { contextWindow },
    }
    if (defaultMaxTokens !== undefined) info.defaultMaxTokens = defaultMaxTokens
    // Only a model that declared its own effort vocabulary advertises a
    // selector; a model with no declaration sends nothing and rejects nothing.
    const efforts = configured?.reasoningEfforts
    if (efforts !== undefined && efforts.length > 0) {
      const dflt = configured?.defaultReasoningEffort ?? highestEffort(efforts)
      info.reasoning = {
        efforts: efforts.map(e => ({ id: e as never, name: e.charAt(0).toUpperCase() + e.slice(1) })),
        ...(dflt !== undefined ? { defaultEffort: dflt as never } : {}),
      }
    }
    return Promise.resolve(info)
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const entry = this.#entry()
    if (entry === undefined) {
      throw new Error(`${PKG}: provider route "${this.#providerId}" is no longer configured`)
    }
    const model: ConfigModel | undefined = entry.models.find(m => m.id === options.model)

    // Reject an explicit effort the configured model never declared, rather
    // than sending a value the endpoint is known to refuse.
    if (options.reasoningEffort !== undefined && model?.effort !== undefined) {
      if (!model.effort.values.includes(options.reasoningEffort)) {
        throw new Error(`${PKG}: model "${options.model}" does not accept reasoning effort `
          + `"${options.reasoningEffort}" (declared: ${model.effort.values.join(', ')})`)
      }
    }

    // Image input is served only when the model declares the modality AND the
    // durable attachment store is mounted. The framework already projected
    // images away for text-only models, so an image reaching this point on a
    // text-only route means the modality declaration changed mid-flight.
    const hasImages = options.messages.some(m => contentHasImage(m.content))
    const attachments = hasImages ? this.#registry.resolveAttachments() : undefined
    if (hasImages) {
      const declared = model?.inputModalities ?? entry.models.find(m => m.id === options.model)?.inputModalities
      if (declared === undefined || !declared.includes('image')) {
        throw new LlmError(`${PKG}: model "${options.model}" does not accept image input`, 'UNSUPPORTED_CONTENT')
      }
      if (attachments === undefined) {
        throw new LlmError(`${PKG}: image input requires the durable attachment service`, 'UNSUPPORTED_CONTENT')
      }
    }
    const images = hasImages && attachments !== undefined
      ? await this.#prepareImages(options, attachments)
      : undefined

    const apiKey = await this.#registry.resolveApiKey(entry)
    const url = requestUrl(entry, options.model, apiKey, true)
    const body = serializeRequest(options, model, entry, images)
    const headers: Record<string, string> = {
      accept: 'text/event-stream',
      // The seam requires attribution on every provider HTTP request.
      ...attributionHeaders(),
      ...authHeaders(entry, apiKey),
      ...(entry.extraHeaders as Record<string, string> | undefined ?? {}),
      ...(model?.extraHeaders as Record<string, string> | undefined ?? {}),
    }

    let response: Awaited<ReturnType<typeof undiciFetch>>
    try {
      response = await undiciFetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        ...(options.signal !== undefined ? { signal: options.signal } : {}),
      })
    } catch (error) {
      if (options.signal?.aborted === true) throw error
      throw new Error(`${PKG}: request to ${entry.baseURL} failed: `
        + `${error instanceof Error ? error.message : String(error)}`)
    }

    if (!response.ok) {
      let parsed: unknown
      try {
        parsed = await response.json()
      } catch {
        parsed = undefined
      }
      const message = errorMessageOf(parsed, 'request rejected')
      throw new Error(`${PKG}: ${entry.displayName} (${entry.protocol}) returned HTTP `
        + `${response.status} [${httpErrorCode(response.status, message)}]: ${message}`)
    }
    if (response.body === null) {
      throw new Error(`${PKG}: ${entry.displayName} returned an empty response body`)
    }

    const protocol = model?.protocol ?? entry.protocol
    const translator = createTranslator(protocol)
    let sawVisibleText = false
    for await (const payload of sseEvents(response.body as ReadableStream<Uint8Array>, options.signal)) {
      const result = translator.push(payload)
      for (const chunk of result.chunks) {
        if (chunk.type === 'text-delta' && chunk.text.trim().length > 0) sawVisibleText = true
        yield chunk
      }
      if (result.done) break
    }
    for (const chunk of translator.finish()) {
      if (chunk.type === 'block-end' && chunk.block.type === 'text' && chunk.block.text.trim().length > 0) {
        sawVisibleText = true
      }
      yield chunk
    }
    // A completed turn that streamed ONLY reasoning (thinking models
    // occasionally answer entirely inside the reasoning channel when the
    // gateway maps all output there) would otherwise commit an assistant
    // message whose visible part is empty — the UI then shows everything
    // folded into the Think disclosure and no reply. Surface it as the
    // framework's degenerate-completion failure instead, which is retryable
    // by the default policy and never silently swallows the turn.
    if (!sawVisibleText && !translator.hasToolCalls()) {
      yield {
        type: 'finish',
        reason: {
          kind: 'error',
          failure: {
            message: `${PKG}: ${entry.displayName} completed with no visible content `
              + `(reasoning only); retrying`,
            code: 'EMPTY_RESPONSE',
          },
        },
      }
    }
  }

  /**
   * Resolve every distinct image reference of one request into its
   * deterministic request version, in parallel, then expose them as the
   * serializer's {@link RequestImages} view.
   */
  async #prepareImages(
    options: GenerateOptions,
    attachments: AttachmentStore,
  ): Promise<RequestImages> {
    const refs: Map<string, ImageAttachmentRef> = collectImageRefs(options.messages)
    const policy = { maxPixels: IMAGE_MAX_PIXELS, maxBytes: IMAGE_MAX_BYTES }
    const ordered = [...refs.values()]
    const versions = await Promise.all(ordered.map(
      ref => attachments.readImageRequest(ref, policy, options.signal),
    ))
    return requestImages(new Map(ordered.map((ref, i) => [ref.attachmentId, versions[i] as RequestImageAttachment])))
  }
}

/** The public model metadata catalog this plugin enriches from. */
export const MODELS_DEV_API_URL = 'https://models.dev/api.json'
const MODELS_DEV_TIMEOUT_MS = 30_000

/** Facts one catalog entry can contribute to a model row. */
export interface CatalogFacts {
  name?: string
  contextWindow?: number
  maxTokens?: number
  inputModalities?: string[]
  reasoningEfforts?: string[]
  defaultReasoningEffort?: string
}

/** One provider entry in the models.dev catalog, as much as we read. */
interface CatalogModel {
  id?: unknown
  name?: unknown
  limit?: { context?: unknown; output?: unknown }
  modalities?: { input?: unknown }
  reasoning?: unknown
  /**
   * The effort-shaped reasoning option carries the levels the model actually
   * accepts. A `null` entry means "not settable" and drops out.
   */
  reasoning_options?: { type?: unknown; values?: unknown }[]
}

/**
 * Download the models.dev catalog and match model ids against it.
 *
 * Host-side on purpose: the browser only names the ids, so no cross-origin
 * download happens from the page.
 *
 * @param modelIds - the ids to look up.
 * @param signal - caller cancellation.
 * @returns per id the matching facts, or an empty object when nothing matched.
 */
/** One provider's publication of a model, with the facts that provider states. */
export interface CatalogCandidate {
  /** Catalog provider id, e.g. `moonshotai-cn`. */
  provider: string
  /** Human-readable provider name from the catalog, when it states one. */
  providerName?: string
  facts: CatalogFacts
}

/**
 * Download the models.dev catalog and collect EVERY provider that publishes
 * each requested id.
 *
 * Host-side on purpose: the browser only names the ids, so no cross-origin
 * download happens from the page.
 *
 * Multiple providers commonly publish one model id with materially different
 * facts — `kimi-k3` appears under dozens of providers whose context windows,
 * output caps and reasoning vocabularies disagree. Returning all of them lets
 * the caller choose instead of silently adopting whichever came first.
 *
 * @param modelIds - the ids to look up.
 * @param signal - caller cancellation.
 * @returns per id its candidates in catalog order; absent when nothing matched.
 */
export async function fetchCatalogCandidates(
  modelIds: readonly string[],
  signal?: AbortSignal,
): Promise<Record<string, CatalogCandidate[]>> {
  const timeout = AbortSignal.timeout(MODELS_DEV_TIMEOUT_MS)
  const combined = signal === undefined ? timeout : AbortSignal.any([signal, timeout])
  const response = await undiciFetch(MODELS_DEV_API_URL, {
    headers: { accept: 'application/json', ...attributionHeaders() },
    signal: combined,
  })
  if (!response.ok) {
    throw new Error(`${PKG}: models.dev catalog fetch failed (HTTP ${response.status})`)
  }
  const catalog = (await response.json()) as Record<string, unknown>
  const wanted = new Set(modelIds)

  const index = new Map<string, CatalogCandidate[]>()
  for (const [providerId, providerEntry] of Object.entries(catalog)) {
    if (typeof providerEntry !== 'object' || providerEntry === null) continue
    const record = providerEntry as Record<string, unknown>
    const models = record.models
    if (typeof models !== 'object' || models === null) continue
    const providerName = typeof record.name === 'string' && record.name.length > 0
      ? record.name
      : undefined
    for (const [key, raw] of Object.entries(models as Record<string, unknown>)) {
      if (typeof raw !== 'object' || raw === null) continue
      const model = raw as CatalogModel
      const id = typeof model.id === 'string' && model.id.length > 0 ? model.id : key
      if (!wanted.has(id)) continue

      const facts: CatalogFacts = {}
      if (typeof model.name === 'string' && model.name.length > 0) facts.name = model.name
      if (typeof model.limit?.context === 'number') facts.contextWindow = model.limit.context
      if (typeof model.limit?.output === 'number') facts.maxTokens = model.limit.output
      const input = model.modalities?.input
      if (Array.isArray(input)) {
        const list = input.filter((m): m is string => m === 'text' || m === 'image')
        if (list.length > 0) facts.inputModalities = list
      }
      // Only the effort-shaped reasoning option names the levels the model
      // actually accepts; other option types carry no rung list and must not
      // be guessed at.
      const options = model.reasoning_options
      if (Array.isArray(options)) {
        const efforts = options
          .filter(option => option?.type === 'effort')
          .flatMap(option => (Array.isArray(option?.values) ? option.values : []))
          .filter((v): v is string => typeof v === 'string' && v.length > 0)
        if (efforts.length > 0) {
          facts.reasoningEfforts = efforts
          // The highest declared rung is the working default when the model
          // itself names no preset.
          facts.defaultReasoningEffort = highestEffort(efforts) ?? efforts[efforts.length - 1]
        }
      }
      // A publication with no usable fact is not worth offering.
      if (Object.keys(facts).length === 0) continue
      const list = index.get(id) ?? []
      list.push({
        provider: providerId,
        ...(providerName === undefined ? {} : { providerName }),
        facts,
      })
      index.set(id, list)
    }
  }

  const out: Record<string, CatalogCandidate[]> = {}
  for (const id of modelIds) {
    const hits = index.get(id)
    if (hits !== undefined && hits.length > 0) out[id] = hits
  }
  return out
}

/**
 * Collapse {@link fetchCatalogCandidates} to one candidate per id — the first,
 * which is catalog order. Used by callers that want a plain lookup rather than
 * the full choice set.
 *
 * @param modelIds - the ids to look up.
 * @param signal - caller cancellation.
 * @returns per id the first matching facts, or an empty object when none did.
 */
export async function fetchCatalogFacts(
  modelIds: readonly string[],
  signal?: AbortSignal,
): Promise<Record<string, CatalogFacts>> {
  const candidates = await fetchCatalogCandidates(modelIds, signal)
  const out: Record<string, CatalogFacts> = {}
  for (const [id, list] of Object.entries(candidates)) {
    const first = list[0]
    if (first !== undefined) out[id] = first.facts
  }
  return out
}
