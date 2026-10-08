/**
 * Request serialization for the four supported wire formats.
 *
 * Each builder returns the POST body for one exact provider/model pair. They
 * differ in more than naming: tool-call replay is `tool_calls` + `role:'tool'`
 * for OpenAI, `tool_use`/`tool_result` parts for Anthropic, and
 * `functionCall`/`functionResponse` for Gemini; the system prompt is a leading
 * message, a top-level `system`, or `systemInstruction`.
 *
 * Image input: image blocks carry an attachment REFERENCE; the caller resolves
 * each one through the durable attachment service (`readImageRequest`) into a
 * `RequestImageAttachment` and hands the map to {@link serializeRequest}. A
 * request carrying images WITHOUT that map is refused — a half-serializer that
 * silently drops the image would tell the user it was seen.
 *
 * @module dsh-llm-config/serialize
 */

import type {
  ContentBlock,
  GenerateOptions,
  RequestMessage,
} from '@deepseek-ai/dsh-llm'
import { LlmError, requestImageHandleText } from '@deepseek-ai/dsh-llm'
import type { ImageAttachmentRef, RequestImageAttachment } from '@deepseek-ai/dsh-attachment'
import type { ConfigModel, ConfigProvider, ModelEffort } from './config.ts'

/** Prefix for adapter-raised diagnostics. */
const PKG = 'llm-config'

/**
 * Prepared request images for one serialization, keyed by attachment id. Built
 * by the adapter from the durable attachment service; one map serves one
 * request body.
 */
export interface RequestImages {
  readonly versions: ReadonlyMap<AttachmentKey, RequestImageAttachment>
  /** Model-facing handle text for one image, beside its wire part. */
  handle(ref: ImageAttachmentRef, version: RequestImageAttachment): string
}

/** Build the standard {@link RequestImages} view over prepared versions. */
export function requestImages(versions: ReadonlyMap<AttachmentKey, RequestImageAttachment>): RequestImages {
  return {
    versions,
    handle: (ref, version) => requestImageHandleText(ref, version),
  }
}

/** Key an image occurrence resolves its prepared version by. */
export type AttachmentKey = string

/**
 * Collect every LIVE image reference in request order, deduplicated by id.
 *
 * Two facts of the 0.2 message model are load-bearing here:
 *
 * - An image the framework marked `offloaded` is not sent as an image at all:
 *   it is projected to placeholder text before serialization, so resolving a
 *   request version for it would be wasted work (and preparing none for it is
 *   what keeps the placeholder path from tripping the "not prepared" guard).
 * - Tool results are first-class `tool` ROLE messages, so their content is
 *   walked like any other message's. The 0.1.x nesting (`tool-result` blocks
 *   inside a user message) no longer exists.
 */
export function collectImageRefs(
  messages: readonly { readonly content: readonly ContentBlock[] }[],
): Map<AttachmentKey, ImageAttachmentRef> {
  const refs = new Map<AttachmentKey, ImageAttachmentRef>()
  const walk = (blocks: readonly ContentBlock[]): void => {
    for (const block of blocks) {
      if (block.type === 'image' && block.offloaded !== true) {
        refs.set(block.attachment.attachmentId, block.attachment)
      }
    }
  }
  for (const message of messages) walk(message.content)
  return refs
}

/** Concatenate the text blocks of one message. */
export function textOf(content: readonly ContentBlock[] | string): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
    .map(b => b.text)
    .join('')
}

function parseArgs(v: unknown): Record<string, unknown> {
  if (typeof v === 'object' && v !== null) return v as Record<string, unknown>
  if (typeof v !== 'string') return {}
  try {
    const parsed: unknown = JSON.parse(v === '' ? '{}' : v)
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/**
 * Write one reasoning-effort value onto the request at the model's declared
 * location. `field` assigns a scalar at a dotted path; `thinking` writes the
 * nested toggle object Kimi K2.x expects.
 */
export function applyEffort(
  target: Record<string, unknown>,
  effort: ModelEffort | undefined,
  override: string | undefined,
): void {
  if (effort === undefined) return
  const value = override !== undefined && override.length > 0 ? override : effort.default
  if (value === undefined || value.length === 0) return
  const path = effort.field.split('.')
  let node = target
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i]
    if (typeof node[key] !== 'object' || node[key] === null) node[key] = {}
    node = node[key] as Record<string, unknown>
  }
  node[path[path.length - 1]] = effort.mode === 'thinking' ? { type: value } : value
}

function resolveMaxTokens(
  options: GenerateOptions,
  model: ConfigModel | undefined,
  provider: ConfigProvider,
): number | undefined {
  return options.maxTokens ?? model?.maxTokens ?? provider.maxTokens
}

function resolveTemperature(options: GenerateOptions, model: ConfigModel | undefined): number | undefined {
  return options.temperature ?? model?.temperature
}

function resolveStop(options: GenerateOptions, model: ConfigModel | undefined): string[] | undefined {
  if (options.stop !== undefined && options.stop.length > 0) return options.stop
  if (model?.stop !== undefined && model.stop.length > 0) return model.stop
  return undefined
}

/** Canonical base64 of raw bytes, in Node or browser alike. */
function base64(bytes: Uint8Array): string {
  let text = ''
  for (const b of bytes) text += String.fromCharCode(b)
  // Node 18+ and every modern browser expose btoa on the global.
  return btoa(text)
}

/**
 * Resolve one image block into `[handle-text part, wire image part]`.
 *
 * The handle text is model-visible beside the image (it names the attachment
 * and its request dimensions, the same convention the shipped adapters use);
 * the wire part comes from the protocol-specific builder. A missing prepared
 * version — the caller did not resolve this reference — is an error, because
 * silently omitting an image the user attached is exactly the defect the
 * old explicit rejection existed to prevent.
 */
function imagePartsFor(
  block: Extract<ContentBlock, { type: 'image' }>,
  images: RequestImages | undefined,
  buildPart: (version: RequestImageAttachment) => Record<string, unknown>,
  buildText: (text: string) => Record<string, unknown> = chatTextPart,
): Record<string, unknown>[] {
  if (images === undefined) {
    throw new Error(`${PKG}: image input was not prepared for this request; `
      + `the model declares image support but the request carried no resolved attachment`)
  }
  const version = images.versions.get(block.attachment.attachmentId)
  if (version === undefined) {
    throw new Error(`${PKG}: request image ${block.attachment.attachmentId} was not prepared`)
  }
  return [
    buildText(images.handle(block.attachment, version)),
    buildPart(version),
  ]
}

/**
 * One text part in the Chat Completions / Anthropic vocabulary. The Responses
 * wire format spells the same part `input_text`, so every builder that can
 * appear on either wire takes its text-part constructor as a parameter.
 */
function chatTextPart(text: string): Record<string, unknown> {
  return { type: 'text', text }
}

/** One text part in the Responses vocabulary. */
function responsesTextPart(text: string): Record<string, unknown> {
  return { type: 'input_text', text }
}

/**
 * Build the content parts of one user message: text first, then each image as
 * handle + wire part. Returns `undefined` when the message carries no image,
 * so the caller keeps the compact string form.
 */
function userContentParts(
  blocks: readonly ContentBlock[],
  images: RequestImages | undefined,
  buildPart: (version: RequestImageAttachment) => Record<string, unknown>,
  buildText: (text: string) => Record<string, unknown> = chatTextPart,
): Record<string, unknown>[] | undefined {
  if (!blocks.some(b => b.type === 'image')) return undefined
  const parts: Record<string, unknown>[] = []
  for (const block of blocks) {
    if (block.type === 'text' && block.text.length > 0) parts.push(buildText(block.text))
    else if (block.type === 'image') parts.push(...imagePartsFor(block, images, buildPart, buildText))
  }
  return parts.length === 0 ? undefined : parts
}

/**
 * Tool-result content as one OpenAI/Anthropic/Responses-compatible value: text
 * plus any nested image parts. Nested images inside tool results are inlined
 * the same way user images are.
 */
function toolResultValue(
  blocks: readonly ContentBlock[],
  images: RequestImages | undefined,
  buildText: (text: string) => Record<string, unknown>,
  buildImage: (version: RequestImageAttachment) => Record<string, unknown>,
): string | Record<string, unknown>[] {
  if (!blocks.some(b => b.type === 'image')) return textOf(blocks)
  const parts: Record<string, unknown>[] = []
  for (const block of blocks) {
    if (block.type === 'text' && block.text.length > 0) parts.push(buildText(block.text))
    else if (block.type === 'image') parts.push(...imagePartsFor(block, images, buildImage, buildText))
  }
  return parts
}

/** OpenAI Chat / Anthropic tool-result value, in the `text` part vocabulary. */
function toolResultContent(
  blocks: readonly ContentBlock[],
  images: RequestImages | undefined,
): string | Record<string, unknown>[] {
  return toolResultValue(blocks, images, chatTextPart, openAiImagePart)
}

/** Tool-result text for protocols whose tool results stay textual (Gemini). */
function toolResultText(blocks: readonly ContentBlock[], images: RequestImages | undefined): string {
  if (!blocks.some(b => b.type === 'image')) return textOf(blocks)
  // Gemini functionResponse carries text; an image inside a tool result is
  // represented by its handle text only (the same projection the framework's
  // text-only path applies).
  const parts = toolResultContent(blocks, images) as Record<string, unknown>[]
  return parts.filter(p => p.type === 'text').map(p => String(p.text)).join('')
}

/**
 * Refuse history this adapter cannot represent faithfully.
 *
 * A `developer` message carries tool-declaration changes (`tool-addition` /
 * `tool-removal` blocks) that no provider wire format below can express, and
 * silently replaying them as user text would corrupt the conversation. The
 * framework only emits them to a route that declared `toolUpdate` support, so
 * reaching this point is a genuine composition error and fails loud — the same
 * contract the shipped adapters implement.
 */
function assertRepresentable(message: RequestMessage): void {
  if (message.role === 'developer') {
    throw new LlmError(`${PKG}: tool declaration updates (developer messages) are not supported by this adapter`, 'UNSUPPORTED_CONTENT')
  }
  if (message.content.some(b => b.type === 'tool-addition' || b.type === 'tool-removal')) {
    throw new LlmError(`${PKG}: tool-change content blocks require a developer message`, 'UNSUPPORTED_CONTENT')
  }
}

/**
 * Resolve the system prompt and the history to serialize, following the
 * framework's 0.2 convention: a loop-built request carries the prompt as the
 * LEADING `system` message, while a one-shot caller supplies `options.system`.
 * `options.system` wins when both are present; a leading empty system message
 * contributes no prompt.
 */
function splitSystemPrompt(options: GenerateOptions): {
  system: string | undefined
  messages: readonly RequestMessage[]
} {
  if (options.system !== undefined) return { system: options.system, messages: options.messages }
  const [first, ...rest] = options.messages
  if (first === undefined || first.role !== 'system') {
    return { system: undefined, messages: options.messages }
  }
  const text = textOf(first.content)
  return { system: text.length > 0 ? text : undefined, messages: rest }
}

/**
 * Record every tool call of an assistant message so a later tool RESULT can
 * name the function it answers. Gemini's `functionResponse` is keyed by name
 * rather than by call id, so the replay needs this lookup to be usable.
 */
function recordToolCalls(blocks: readonly ContentBlock[], names: Map<string, string>): void {
  for (const block of blocks) {
    if (block.type === 'tool-call') names.set(block.id, block.name)
  }
}

/** One inline OpenAI-style image part from a prepared request version. */
function openAiImagePart(version: RequestImageAttachment): Record<string, unknown> {
  return {
    type: 'image_url',
    image_url: { url: `data:${version.mediaType};base64,${base64(version.data)}` },
  }
}

/** OpenAI Chat Completions request body. */
function buildOpenAiChat(
  options: GenerateOptions,
  model: ConfigModel | undefined,
  provider: ConfigProvider,
  images: RequestImages | undefined,
): Record<string, unknown> {
  const { system, messages: history } = splitSystemPrompt(options)
  const messages: Record<string, unknown>[] = []
  if (system !== undefined && system.length > 0) {
    messages.push({ role: 'system', content: system })
  }
  for (const message of history) {
    assertRepresentable(message)
    const blocks = message.content
    if (message.role === 'tool') {
      messages.push({
        role: 'tool',
        tool_call_id: message.toolCallId,
        content: toolResultContent(blocks, images),
      })
      continue
    }
    if (message.role === 'system') {
      // A system message the loop placed AFTER the leading one has no provider
      // slot once tool turns are in play; the shipped adapters fold it into
      // user content rather than dropping the text.
      messages.push({ role: 'user', content: textOf(blocks) })
      continue
    }
    if (message.role === 'assistant') {
      const text = textOf(blocks)
      const calls = blocks.filter(b => b.type === 'tool-call')
      if (calls.length === 0) {
        messages.push({ role: 'assistant', content: text })
        continue
      }
      messages.push({
        role: 'assistant',
        content: text,
        tool_calls: calls.map(c => ({
          id: c.id,
          type: 'function',
          function: {
            name: c.name,
            arguments: typeof c.arguments === 'string' ? c.arguments : JSON.stringify(c.arguments ?? {}),
          },
        })),
      })
      continue
    }
    const parts = userContentParts(blocks, images, openAiImagePart)
    messages.push(parts === undefined
      ? { role: 'user', content: textOf(blocks) }
      : { role: 'user', content: parts })
  }

  const body: Record<string, unknown> = { model: options.model, messages, stream: true }
  if (options.tools !== undefined && options.tools.length > 0) {
    body.tools = options.tools.map(t => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }))
  }
  applyEffort(body, model?.effort, options.reasoningEffort)
  const maxTokens = resolveMaxTokens(options, model, provider)
  if (maxTokens !== undefined) body.max_tokens = maxTokens
  const temperature = resolveTemperature(options, model)
  if (temperature !== undefined) body.temperature = temperature
  if (model?.topP !== undefined) body.top_p = model.topP
  const stop = resolveStop(options, model)
  if (stop !== undefined) body.stop = stop
  if (model?.extraBody !== undefined) Object.assign(body, model.extraBody)
  return body
}

/** One inline Responses image part from a prepared request version. */
function responsesImagePart(version: RequestImageAttachment): Record<string, unknown> {
  // Responses spells the part `input_image` and takes the URL as a STRING,
  // not the `{url}` object the Chat Completions wire uses.
  return {
    type: 'input_image',
    detail: 'auto',
    image_url: `data:${version.mediaType};base64,${base64(version.data)}`,
  }
}

/**
 * OpenAI rejects `max_output_tokens` below this on the Responses endpoint
 * (`invalid_request_error`), so a small configured cap is raised rather than
 * sent and refused.
 */
const RESPONSES_MIN_OUTPUT_TOKENS = 16

/**
 * OpenAI Responses request body (`POST {baseURL}/responses`).
 *
 * The Responses wire format is structurally different from Chat Completions:
 *
 * - `input` is a flat list of ITEMS, not a list of role messages. An assistant
 *   turn becomes one `message` item per text run plus one `function_call` item
 *   per call, and a tool result is its own `function_call_output` item keyed by
 *   `call_id`.
 * - the system prompt is the top-level `instructions` string.
 * - `max_tokens` is spelled `max_output_tokens`, and there is NO `stop` field
 *   at all, so a configured stop list is dropped here (use `extraBody` if a
 *   gateway needs a non-standard spelling).
 * - content parts are `input_text` / `input_image` for input and `output_text`
 *   for replayed assistant text.
 */
function buildOpenAiResponses(
  options: GenerateOptions,
  model: ConfigModel | undefined,
  provider: ConfigProvider,
  images: RequestImages | undefined,
): Record<string, unknown> {
  const { system, messages: history } = splitSystemPrompt(options)
  const input: Record<string, unknown>[] = []
  for (const message of history) {
    assertRepresentable(message)
    const blocks = message.content
    if (message.role === 'tool') {
      input.push({
        type: 'function_call_output',
        call_id: message.toolCallId,
        output: toolResultValue(blocks, images, responsesTextPart, responsesImagePart),
      })
      continue
    }
    if (message.role === 'system') {
      const text = textOf(blocks)
      if (text.length > 0) input.push({ role: 'system', content: text })
      continue
    }
    if (message.role === 'assistant') {
      const text = textOf(blocks)
      if (text.length > 0) {
        input.push({
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text }],
        })
      }
      for (const call of blocks.filter(b => b.type === 'tool-call')) {
        input.push({
          type: 'function_call',
          // `call_id` is what pairs with the matching `function_call_output`.
          // The optional item `id` is deliberately omitted: it must be the
          // provider's own `fc_*` item id to replay, and a foreign id (a
          // `call_*` from the Chat wire, a `toolu_*` from Anthropic) is
          // refused by pairing validation.
          call_id: call.id,
          name: call.name,
          arguments: typeof call.arguments === 'string'
            ? call.arguments
            : JSON.stringify(call.arguments ?? {}),
        })
      }
      continue
    }
    const parts = userContentParts(blocks, images, responsesImagePart, responsesTextPart)
    if (parts !== undefined) input.push({ role: 'user', content: parts })
    else input.push({ role: 'user', content: textOf(blocks) })
  }

  const body: Record<string, unknown> = { model: options.model, input, stream: true }
  if (system !== undefined && system.length > 0) body.instructions = system
  if (options.tools !== undefined && options.tools.length > 0) {
    // Flattened declaration: no `function` wrapper, and `strict` is left to the
    // endpoint rather than asserted on gateways that do not implement it.
    body.tools = options.tools.map(t => ({
      type: 'function',
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }))
  }
  applyEffort(body, model?.effort, options.reasoningEffort)
  const maxTokens = resolveMaxTokens(options, model, provider)
  if (maxTokens !== undefined) {
    body.max_output_tokens = Math.max(maxTokens, RESPONSES_MIN_OUTPUT_TOKENS)
  }
  const temperature = resolveTemperature(options, model)
  if (temperature !== undefined) body.temperature = temperature
  if (model?.topP !== undefined) body.top_p = model.topP
  if (model?.extraBody !== undefined) Object.assign(body, model.extraBody)
  return body
}

/** One inline Anthropic image part from a prepared request version. */
function anthropicImagePart(version: RequestImageAttachment): Record<string, unknown> {
  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: version.mediaType,
      data: base64(version.data),
    },
  }
}
/** Anthropic Messages request body. */
function buildAnthropic(
  options: GenerateOptions,
  model: ConfigModel | undefined,
  provider: ConfigProvider,
  images: RequestImages | undefined,
): Record<string, unknown> {
  const { system, messages: history } = splitSystemPrompt(options)
  const messages: Record<string, unknown>[] = []
  // Anthropic has no tool ROLE: a tool result is a `tool_result` part of a
  // USER message, and consecutive results answering one assistant turn belong
  // to the SAME user message. Accumulate and flush on the next real turn.
  let pendingResults: Record<string, unknown>[] = []
  const flushResults = (): void => {
    if (pendingResults.length === 0) return
    messages.push({ role: 'user', content: pendingResults })
    pendingResults = []
  }
  for (const message of history) {
    assertRepresentable(message)
    const blocks = message.content
    if (message.role === 'tool') {
      pendingResults.push({
        type: 'tool_result',
        tool_use_id: message.toolCallId,
        content: toolResultContent(blocks, images),
        ...(message.isError === true ? { is_error: true } : {}),
      })
      continue
    }
    flushResults()
    const parts: Record<string, unknown>[] = []
    if (message.role === 'assistant') {
      const text = textOf(blocks)
      if (text.length > 0) parts.push({ type: 'text', text })
      for (const c of blocks.filter(b => b.type === 'tool-call')) {
        parts.push({ type: 'tool_use', id: c.id, name: c.name, input: parseArgs(c.arguments) })
      }
    } else {
      const text = textOf(blocks)
      if (text.length > 0) parts.push({ type: 'text', text })
      for (const b of blocks) {
        if (b.type !== 'image') continue
        parts.push(...imagePartsFor(b, images, anthropicImagePart))
      }
    }
    // A later system message folds into user content: Anthropic reads the
    // prompt from the top-level `system` slot only.
    const role = message.role === 'assistant' ? 'assistant' : 'user'
    if (parts.length > 0) messages.push({ role, content: parts })
  }
  flushResults()

  const body: Record<string, unknown> = {
    model: options.model,
    max_tokens: resolveMaxTokens(options, model, provider) ?? 4096,
    messages,
    stream: true,
  }
  if (system !== undefined && system.length > 0) body.system = system
  if (options.tools !== undefined && options.tools.length > 0) {
    body.tools = options.tools.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters }))
  }
  applyEffort(body, model?.effort, options.reasoningEffort)
  const temperature = resolveTemperature(options, model)
  if (temperature !== undefined) body.temperature = temperature
  if (model?.topP !== undefined) body.top_p = model.topP
  const stop = resolveStop(options, model)
  if (stop !== undefined) body.stop_sequences = stop
  if (model?.extraBody !== undefined) Object.assign(body, model.extraBody)
  return body
}

/** One inline Gemini image part from a prepared request version. */
function geminiImagePart(version: RequestImageAttachment): Record<string, unknown> {
  return {
    inlineData: {
      mimeType: version.mediaType,
      data: base64(version.data),
    },
  }
}

/** Google Gemini generateContent request body. */
function buildGemini(
  options: GenerateOptions,
  model: ConfigModel | undefined,
  provider: ConfigProvider,
  images: RequestImages | undefined,
): Record<string, unknown> {
  const { system, messages: history } = splitSystemPrompt(options)
  const contents: Record<string, unknown>[] = []
  // Gemini's functionResponse is addressed by FUNCTION NAME, not by call id,
  // so every tool result is replayed under the name of the call it answers.
  const toolNames = new Map<string, string>()
  for (const message of history) {
    assertRepresentable(message)
    const blocks = message.content
    const parts: Record<string, unknown>[] = []
    if (message.role === 'assistant') {
      const text = textOf(blocks)
      if (text.length > 0) parts.push({ text })
      for (const c of blocks.filter(b => b.type === 'tool-call')) {
        parts.push({ functionCall: { name: c.name, args: parseArgs(c.arguments) } })
      }
      recordToolCalls(blocks, toolNames)
    } else if (message.role === 'tool') {
      parts.push({
        functionResponse: {
          name: toolNames.get(message.toolCallId) ?? 'tool',
          response: { result: toolResultText(blocks, images) },
        },
      })
    } else {
      const text = textOf(blocks)
      if (text.length > 0) parts.push({ text })
      for (const b of blocks) {
        if (b.type !== 'image') continue
        parts.push(...imagePartsFor(b, images, geminiImagePart))
      }
    }
    if (parts.length > 0) contents.push({ role: message.role === 'assistant' ? 'model' : 'user', parts })
  }

  const body: Record<string, unknown> = { contents }
  if (system !== undefined && system.length > 0) {
    body.systemInstruction = { parts: [{ text: system }] }
  }
  if (options.tools !== undefined && options.tools.length > 0) {
    body.tools = [{
      functionDeclarations: options.tools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    }]
  }
  const generationConfig: Record<string, unknown> = {}
  const maxTokens = resolveMaxTokens(options, model, provider)
  if (maxTokens !== undefined) generationConfig.maxOutputTokens = maxTokens
  const temperature = resolveTemperature(options, model)
  if (temperature !== undefined) generationConfig.temperature = temperature
  if (model?.topP !== undefined) generationConfig.topP = model.topP
  const stop = resolveStop(options, model)
  if (stop !== undefined) generationConfig.stopSequences = stop
  if (Object.keys(generationConfig).length > 0) body.generationConfig = generationConfig
  // Effort rides generationConfig for Gemini.
  applyEffort(generationConfig, model?.effort, options.reasoningEffort)
  if (model?.extraBody !== undefined) Object.assign(body, model.extraBody)
  return body
}

/** Serialize one request for the provider's (or model's) protocol. */
export function serializeRequest(
  options: GenerateOptions,
  model: ConfigModel | undefined,
  provider: ConfigProvider,
  images?: RequestImages,
): Record<string, unknown> {
  const protocol = model?.protocol ?? provider.protocol
  if (protocol === 'anthropic-messages') return buildAnthropic(options, model, provider, images)
  if (protocol === 'google-gemini') return buildGemini(options, model, provider, images)
  if (protocol === 'openai-responses') return buildOpenAiResponses(options, model, provider, images)
  return buildOpenAiChat(options, model, provider, images)
}

/** The request URL for one exact provider/model pair. */
export function requestUrl(
  provider: ConfigProvider,
  model: string,
  apiKey: string,
  streaming: boolean,
): string {
  const base = provider.baseURL
  if (provider.protocol === 'anthropic-messages') return `${base}/messages`
  if (provider.protocol === 'google-gemini') {
    const verb = streaming ? ':streamGenerateContent' : ':generateContent'
    let url = `${base}/models/${encodeURIComponent(model)}${verb}`
    if (provider.authScheme === 'query' && apiKey.length > 0) {
      url += `${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(apiKey)}`
    }
    if (streaming) url += `${url.includes('?') ? '&' : '?'}alt=sse`
    return url
  }
  if (provider.protocol === 'openai-responses') return `${base}/responses`
  return `${base}/chat/completions`
}

/** Auth headers for one provider, honouring its scheme and prefix. */
export function authHeaders(provider: ConfigProvider, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (apiKey.length === 0 || provider.authScheme === 'none') return headers
  if (provider.authScheme === 'x-api-key') {
    headers[provider.apiKeyHeader ?? 'x-api-key'] = `${provider.apiKeyPrefix ?? ''}${apiKey}`
    return headers
  }
  if (provider.authScheme === 'query') {
    if (provider.protocol === 'anthropic-messages') {
      headers['x-api-key'] = `${provider.apiKeyPrefix ?? ''}${apiKey}`
    }
    if (provider.protocol === 'google-gemini') headers['x-goog-api-key'] = apiKey
    return headers
  }
  const name = provider.apiKeyHeader ?? 'authorization'
  headers[name] = provider.apiKeyPrefix !== undefined ? `${provider.apiKeyPrefix}${apiKey}` : `Bearer ${apiKey}`
  return headers
}
