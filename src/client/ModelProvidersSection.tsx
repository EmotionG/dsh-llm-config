/**
 * The Model Providers settings page.
 *
 * Data access rides the typert Remote namespaces rather than a bespoke RPC
 * channel, so the page reads and writes the same settings section the host
 * adapter reads. Discovery is delegated to the host (`remote.llm.discoverModels`)
 * because a browser fetch to an arbitrary gateway would be a cross-origin call.
 */

import { useCallback, useEffect, useState } from 'react'
import type { JSX } from 'react'

/** What the section receives from the settings shell. */
export interface InjectedProps {
  t: (key: string, params?: Record<string, unknown>) => string
  api: {
    describeSettings: () => Promise<RemoteResult<DescribePayload>>
    mutateSettings: (ns: string, ops: MutateOp[], expectedRevision?: number) => Promise<RemoteResult<{ revision?: number }>>
    describeCredentials: (refs: string[]) => Promise<RemoteResult<Record<string, CredentialView>>>
    setCredential: (ref: string, value: string) => Promise<RemoteResult<unknown>>
    discoverModels: (settingsNs: string, request: DiscoveryRequest) => Promise<RemoteResult<DiscoveredModel[]>>
    /**
     * Read public model facts (models.dev) for the named model ids. Returns
     * EVERY provider's publication per id, because one model id is commonly
     * published with conflicting context, output and reasoning vocabularies.
     */
    catalogFacts: (modelIds: string[]) => Promise<RemoteResult<Record<string, CatalogCandidate[]>>>
  }
}

/** Facts one catalog entry can contribute to a model row. */
export interface CatalogFacts {
  name?: string
  contextWindow?: number
  maxTokens?: number
  inputModalities?: string[]
  reasoningEfforts?: string[]
  defaultReasoningEffort?: string
}

/** One provider's publication of a model. */
export interface CatalogCandidate {
  provider: string
  providerName?: string
  facts: CatalogFacts
}

/**
 * Every typert Remote call resolves to this envelope. A failure is a RESULT,
 * not a throw, so the page must read `.ok` before `.value` — reading `.value`
 * off a failed response is how a page silently renders empty.
 */
export interface RemoteResult<T> {
  ok: boolean
  value?: T
  error?: { message?: string }
}

export interface DescribePayload {
  writable?: boolean
  namespaces: {
    ns: string
    value?: unknown
    user?: unknown
    revision?: number
  }[]
}

/** One path-addressed settings write. */
export interface MutateOp {
  op: 'set' | 'unset'
  path: string[]
  value?: unknown
}

export interface CredentialView {
  configured?: boolean
  writable?: boolean
}

export interface DiscoveryRequest {
  provider?: string
  baseURL?: string
  api?: string
  apiKey?: string
}

export interface DiscoveredModel {
  id: string
  name?: string
  contextWindow?: number
  maxTokens?: number
}

/**
 * The settings namespace this page owns.
 *
 * Under the 0.2 settings model a namespace is the plugin's PROFILE ENTRY ID,
 * as returned by `settings.describe()`; it is what `settings.mutate` writes to
 * and what `llm.discoverModels` keys its discovery offer by. This value must
 * therefore equal the `id` this package's `cordis.patch.yml` inserts.
 */
const NS = 'llm-config'

interface ModelRow {
  id: string
  name: string
  protocol: string
  contextWindow: string
  maxTokens: string
  temperature: string
  topP: string
  streamIdleTimeoutMs: string
  reasoningEfforts: string
  defaultReasoningEffort: string
  stop: string
  inputModalities: string[]
  effortMode: string
  effortField: string
  effortValues: string
  effortDefault: string
  extraBody: string
  extraHeaders: string
}

interface ProviderRow {
  id: string
  displayName: string
  enabled: boolean
  protocol: string
  baseURL: string
  authScheme: string
  apiKeyEnv: string
  apiKeyHeader: string
  apiKeyPrefix: string
  maxTokens: string
  defaultContextWindow: string
  streamIdleTimeoutMs: string
  modelExcludePatterns: string
  /** Retry mode: 'normal' (bounded) or 'always' (unbounded). */
  retryMode: string
  /** Max retries after the first request; empty = framework default (5). */
  retryMax: string
  models: ModelRow[]
}

const PROTOCOLS = [
  ['openai-chat', 'OpenAI Chat'],
  ['openai-responses', 'OpenAI Responses'],
  ['anthropic-messages', 'Anthropic'],
  ['google-gemini', 'Gemini'],
] as const

const AUTH_SCHEMES = [
  ['', 'protocolDefault'],
  ['bearer', 'bearer'],
  ['x-api-key', 'xApiKey'],
  ['query', 'queryParam'],
  ['none', 'noAuth'],
] as const

/** Mirror of the host's credential-reference rule, to SHOW which ref a key uses. */
export function credentialRefFor(providerId: string): string {
  const cleaned = providerId.replace(/[^A-Za-z0-9_]/g, '_')
  if (cleaned.length === 0) return ''
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : `_${cleaned}`
}

const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v))

function emptyModel(): ModelRow {
  return {
    id: '', name: '', protocol: '', contextWindow: '', maxTokens: '',
    temperature: '', topP: '', streamIdleTimeoutMs: '',
    reasoningEfforts: '', defaultReasoningEffort: '', stop: '',
    inputModalities: ['text'],
    effortMode: 'none', effortField: '', effortValues: '', effortDefault: '',
    extraBody: '', extraHeaders: '',
  }
}

function emptyProvider(): ProviderRow {
  return {
    id: '', displayName: '', enabled: true, protocol: 'openai-chat', baseURL: '',
    authScheme: '', apiKeyEnv: '', apiKeyHeader: '', apiKeyPrefix: '',
    maxTokens: '', defaultContextWindow: '', streamIdleTimeoutMs: '',
    modelExcludePatterns: '', retryMode: 'normal', retryMax: '', models: [],
  }
}

function toModelRow(raw: Record<string, unknown>): ModelRow {
  const effort = (typeof raw.effort === 'object' && raw.effort !== null ? raw.effort : {}) as
    Record<string, unknown>
  const values = Array.isArray(effort.values) ? (effort.values as string[]) : []
  return {
    id: text(raw.id),
    name: text(raw.name),
    protocol: text(raw.protocol),
    contextWindow: text(raw.contextWindow),
    maxTokens: text(raw.maxTokens),
    temperature: text(raw.temperature),
    topP: text(raw.topP),
    streamIdleTimeoutMs: text(raw.streamIdleTimeoutMs),
    reasoningEfforts: (Array.isArray(raw.reasoningEfforts) ? (raw.reasoningEfforts as string[]) : []).join(', '),
    defaultReasoningEffort: text(raw.defaultReasoningEffort),
    stop: (Array.isArray(raw.stop) ? (raw.stop as string[]) : []).join(', '),
    inputModalities: Array.isArray(raw.inputModalities) && raw.inputModalities.length > 0
      ? (raw.inputModalities as string[])
      : ['text'],
    effortMode: text(effort.mode) || 'none',
    effortField: text(effort.field),
    effortValues: values.join(', '),
    effortDefault: text(effort.default),
    extraBody: raw.extraBody === undefined || raw.extraBody === null
      ? '' : JSON.stringify(raw.extraBody, null, 2),
    extraHeaders: raw.extraHeaders === undefined || raw.extraHeaders === null
      ? '' : JSON.stringify(raw.extraHeaders, null, 2),
  }
}

function toProviderRow(raw: Record<string, unknown>): ProviderRow {
  // Retry reads BOTH stored shapes: the numeric shorthand and the full object.
  const retryRaw = raw.retry
  let retryMode = 'normal'
  let retryMax = ''
  if (typeof retryRaw === 'number') {
    retryMax = String(retryRaw)
  } else if (typeof retryRaw === 'object' && retryRaw !== null) {
    const record = retryRaw as Record<string, unknown>
    if (record.mode === 'always') retryMode = 'always'
    if (typeof record.maxRetries === 'number') retryMax = String(record.maxRetries)
  }
  return {
    id: text(raw.id),
    displayName: text(raw.displayName),
    enabled: raw.enabled !== false,
    protocol: text(raw.protocol) || 'openai-chat',
    baseURL: text(raw.baseURL),
    authScheme: text(raw.authScheme),
    apiKeyEnv: text(raw.apiKeyEnv),
    apiKeyHeader: text(raw.apiKeyHeader),
    apiKeyPrefix: text(raw.apiKeyPrefix),
    maxTokens: text(raw.maxTokens),
    defaultContextWindow: text(raw.defaultContextWindow),
    streamIdleTimeoutMs: text(raw.streamIdleTimeoutMs),
    modelExcludePatterns: (Array.isArray(raw.modelExcludePatterns)
      ? (raw.modelExcludePatterns as string[]) : []).join(', '),
    retryMode,
    retryMax,
    models: (Array.isArray(raw.models) ? raw.models : []).map(m => toModelRow(m as Record<string, unknown>)),
  }
}

const numOrUndef = (v: string): number | undefined => {
  const s = v.trim()
  if (s.length === 0) return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

const listOrUndef = (v: string): string[] | undefined => {
  const parts = v.split(',').map(s => s.trim()).filter(s => s.length > 0)
  return parts.length > 0 ? parts : undefined
}

const jsonOrUndef = (v: string): Record<string, unknown> | undefined => {
  const s = v.trim()
  if (s.length === 0) return undefined
  const parsed = JSON.parse(s) as unknown
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('must be a JSON object')
  }
  return parsed as Record<string, unknown>
}

function modelToJson(m: ModelRow): Record<string, unknown> {
  const out: Record<string, unknown> = { id: m.id.trim() }
  if (m.name.trim().length > 0) out.name = m.name.trim()
  if (m.protocol.length > 0) out.protocol = m.protocol
  const cw = numOrUndef(m.contextWindow)
  if (cw !== undefined) out.contextWindow = cw
  const mt = numOrUndef(m.maxTokens)
  if (mt !== undefined) out.maxTokens = mt
  const temp = numOrUndef(m.temperature)
  if (temp !== undefined) out.temperature = temp
  const topP = numOrUndef(m.topP)
  if (topP !== undefined) out.topP = topP
  const sit = numOrUndef(m.streamIdleTimeoutMs)
  if (sit !== undefined) out.streamIdleTimeoutMs = sit
  const efforts = listOrUndef(m.reasoningEfforts)
  if (efforts !== undefined) out.reasoningEfforts = efforts
  if (m.defaultReasoningEffort.trim().length > 0) out.defaultReasoningEffort = m.defaultReasoningEffort.trim()
  const stop = listOrUndef(m.stop)
  if (stop !== undefined) out.stop = stop
  out.inputModalities = m.inputModalities
  if (m.effortMode !== 'none') {
    const values = listOrUndef(m.effortValues) ?? []
    out.effort = {
      mode: m.effortMode,
      ...(m.effortField.trim().length > 0 ? { field: m.effortField.trim() } : {}),
      values,
      ...(m.effortDefault.trim().length > 0 ? { default: m.effortDefault.trim() } : {}),
    }
  }
  const eb = jsonOrUndef(m.extraBody)
  if (eb !== undefined) out.extraBody = eb
  const eh = jsonOrUndef(m.extraHeaders)
  if (eh !== undefined) out.extraHeaders = eh
  return out
}

function providerToJson(p: ProviderRow): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: p.id.trim(),
    enabled: p.enabled,
    protocol: p.protocol,
    baseURL: p.baseURL.trim(),
    models: p.models.map(modelToJson).filter(m => String(m.id).length > 0),
  }
  if (p.displayName.trim().length > 0) out.displayName = p.displayName.trim()
  if (p.authScheme.length > 0) out.authScheme = p.authScheme
  if (p.apiKeyEnv.trim().length > 0) out.apiKeyEnv = p.apiKeyEnv.trim()
  if (p.apiKeyHeader.trim().length > 0) out.apiKeyHeader = p.apiKeyHeader.trim()
  if (p.apiKeyPrefix.length > 0) out.apiKeyPrefix = p.apiKeyPrefix
  const mt = numOrUndef(p.maxTokens)
  if (mt !== undefined) out.maxTokens = mt
  const cw = numOrUndef(p.defaultContextWindow)
  if (cw !== undefined) out.defaultContextWindow = cw
  const sit = numOrUndef(p.streamIdleTimeoutMs)
  if (sit !== undefined) out.streamIdleTimeoutMs = sit
  const ex = listOrUndef(p.modelExcludePatterns)
  if (ex !== undefined) out.modelExcludePatterns = ex
  // Retry: the numeric shorthand when only the count differs from the default
  // shape; the full object when a mode is set. An empty count in normal mode
  // writes nothing, so the framework default (5) applies.
  const retryMax = numOrUndef(p.retryMax)
  if (p.retryMode === 'always') {
    out.retry = { mode: 'always' }
  } else if (retryMax !== undefined) {
    out.retry = retryMax
  }
  return out
}

/** Field wrapper: label above, optional hint as a tooltip so the page stays dense. */
function Field(props: {
  label: string
  hint?: string
  grow?: boolean
  /** Extra class for layout modifiers (e.g. a fixed-width select). */
  className?: string
  children: React.ReactNode
}): JSX.Element {
  const classes = ['llmcfg-field']
  if (props.grow === true) classes.push('llmcfg-field--grow')
  if (props.className !== undefined) classes.push(props.className)
  return (
    <label className={classes.join(' ')} title={props.hint}>
      <span className="llmcfg-label">{props.label}</span>
      {props.children}
    </label>
  )
}

/** One-line summary of the facts that matter when a model row is collapsed. */
function modelSummary(m: ModelRow): string {
  const bits: string[] = []
  if (m.name.trim().length > 0 && m.name.trim() !== m.id.trim()) bits.push(m.name.trim())
  if (m.contextWindow.trim().length > 0) bits.push(fmtCompact(m.contextWindow.trim()))
  if (m.maxTokens.trim().length > 0) bits.push(`out ${fmtCompact(m.maxTokens.trim())}`)
  if (m.inputModalities.includes('image')) bits.push('image')
  // The reasoning-effort vocabulary is long and lives in the expanded form;
  // keeping it out of the collapsed summary keeps the toolbar on one line.
  return bits.join(' · ')
}

/**
 * Compact rendering of a large numeric fact for the toolbar and catalog
 * pickers: 1000000 reads as 1000k, 1048576 as 1.0M, and anything already
 * non-numeric is passed through untouched.
 */
function fmtCompact(raw: string): string {
  const n = Number(raw)
  if (!Number.isFinite(n) || raw.trim().length === 0) return raw
  if (n >= 1_000_000) {
    const m = n / 1_000_000
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M`
  }
  if (n >= 1000 && Number.isInteger(n / 1000)) return `${n / 1000}k`
  return raw
}

/** The catalog option line: source, then the facts that differ. */
function catalogOptionLabel(c: CatalogCandidate): string {
  const bits = [c.providerName ?? c.provider]
  const cw = c.facts.contextWindow
  const mt = c.facts.maxTokens
  if (cw !== undefined || mt !== undefined) {
    bits.push([cw === undefined ? '—' : fmtCompact(String(cw)),
      mt === undefined ? '—' : fmtCompact(String(mt))].join(' / '))
  }
  if (c.facts.inputModalities !== undefined) bits.push(c.facts.inputModalities.join('+'))
  if (c.facts.reasoningEfforts !== undefined) bits.push(c.facts.reasoningEfforts.join('/'))
  return bits.join(' · ')
}

function Section(props: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="llmcfg-sec">
      <div className="llmcfg-sectitle">{props.title}</div>
      {props.children}
    </div>
  )
}

export function ModelProvidersSection(props: InjectedProps): JSX.Element {
  const { t, api } = props
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [rows, setRows] = useState<ProviderRow[]>([])
  const [keyStatus, setKeyStatus] = useState<Record<string, boolean>>({})
  const [open, setOpen] = useState<Record<number, boolean>>({})
  const [dirty, setDirty] = useState(false)
  const [discovery, setDiscovery] = useState<
    { provider: string; models: { id: string; name?: string }[]; picked: Record<string, boolean> } | null
  >(null)
  /**
   * The catalog candidates fetched for one provider row, awaiting a choice.
   * Different catalog providers publish one model id with different facts, so
   * the page shows them and fills from the one selected.
   */
  const [catalog, setCatalog] = useState<{
    rowIndex: number
    ids: string[]
    candidates: Record<string, CatalogCandidate[]>
    chosen: Record<string, number>
  } | null>(null)

  const [revision, setRevision] = useState<number | undefined>(undefined)
  /**
   * Keys typed but not yet committed to the credential store, held only in
   * this component so a brand-new provider can still authenticate a model
   * fetch. They never reach the settings file.
   */
  const [draftKeys, setDraftKeys] = useState<Record<string, string>>({})

  /** Read the stored section out of the settings describe payload. */
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const described = await api.describeSettings()
      if (described.ok !== true || described.value === undefined) {
        setError(described.error?.message ?? t('hostUnavailable'))
        return
      }
      const section = described.value.namespaces.find(n => n.ns === NS)
      if (section === undefined) {
        setError(t('nsNotRegistered'))
        return
      }
      // Prefer the USER layer: the base layer is the composition entry, so a
      // page echoing `value` would show the base before the user ever saved.
      //
      // Under the 0.2 settings model `user` is ALWAYS present and is a
      // projected object — a field the user never overrode is simply absent
      // from it, rather than the whole layer being omitted (which is what
      // 0.1.x did). Selecting the layer on its presence alone would therefore
      // read an empty `user` and render an empty page, so the layer is chosen
      // on whether it actually declares `providers`.
      const userLayer = section.user as Record<string, unknown> | undefined
      const value = (userLayer !== undefined && userLayer.providers !== undefined
        ? userLayer
        : (section.value ?? {})) as Record<string, unknown>
      setRevision(typeof section.revision === 'number' ? section.revision : undefined)
      const raw = value.providers
      const list: unknown[] = Array.isArray(raw)
        ? raw
        : (typeof raw === 'object' && raw !== null ? Object.values(raw) : [])
      const next = list.map(p => toProviderRow(p as Record<string, unknown>))
      setRows(next)
      setDirty(false)

      const status: Record<string, boolean> = {}
      const refs = next.map(p => credentialRefFor(p.id.trim())).filter(r => r.length > 0)
      if (refs.length > 0) {
        const described2 = await api.describeCredentials(refs)
        for (const p of next) {
          const ref = credentialRefFor(p.id.trim())
          status[p.id] = described2.value?.[ref]?.configured === true
        }
      }
      setKeyStatus(status)
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }, [api, t])

  useEffect(() => {
    void load()
  }, [load])

  const saveKey = useCallback(async (providerId: string, value: string) => {
    const ref = credentialRefFor(providerId.trim())
    if (ref.length === 0) {
      setError(t('keyNeedId'))
      return
    }
    try {
      const stored = await api.setCredential(ref, value)
      if (stored.ok !== true) {
        setError(stored.error?.message ?? t('couldNotSave'))
        return
      }
      setKeyStatus(s => ({ ...s, [providerId]: value.length > 0 }))
      setNotice(t('keySavedNotice'))
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [api, t])

  const save = useCallback(async () => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const providers: Record<string, unknown> = {}
      for (const row of rows) {
        const json = providerToJson(row)
        providers[String(json.id)] = json
      }
      // The settings write path is path-addressed ops, not a whole-section
      // replace: one op sets the provider map.
      const mutated = await api.mutateSettings(NS, [{ op: 'set', path: ['providers'], value: providers }], revision)
      if (mutated.ok !== true) {
        setError(mutated.error?.message ?? t('couldNotSave'))
        return
      }
      await load()
      setNotice(t('savedNotice'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }, [api, load, rows, revision, t])

  const runDiscover = useCallback(async (row: ProviderRow) => {
    if (row.id.trim().length === 0 || row.baseURL.trim().length === 0) {
      setError(t('needIdAndUrl'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      // The request carries the DRAFT endpoint and the one-shot key, so
      // fetching works before the provider is ever saved.
      const request: DiscoveryRequest = {
        provider: row.id.trim(),
        baseURL: row.baseURL.trim(),
        api: row.protocol,
      }
      const draftKey = draftKeys[row.id.trim()]
      if (draftKey !== undefined && draftKey.length > 0) request.apiKey = draftKey
      const result = await api.discoverModels(NS, request)
      if (result.ok !== true) {
        setError(result.error?.message ?? t('discoveryFailed'))
        return
      }
      const models = result.value ?? []
      setDiscovery({ provider: row.id.trim(), models, picked: {} })
      setNotice(t('discoveredPending', { n: models.length }))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }, [api, draftKeys, t])

  /**
   * Fetch every catalog publication of this row's models and show them.
   *
   * A model id is commonly published by many catalog providers whose facts
   * disagree — `kimi-k3` alone appears under dozens, with context windows
   * spanning 1,000,000–1,048,576 and at least four different effort
   * vocabularies. The first entry is preselected and the rest stay selectable.
   */
  const fetchCatalog = useCallback(async (pi: number) => {
    const row = rows[pi]
    const ids = row.models.map(m => m.id.trim()).filter(id => id.length > 0)
    if (ids.length === 0) {
      setError(t('needModelsFirst'))
      return
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await api.catalogFacts(ids)
      if (result.ok !== true) {
        setError(result.error?.message ?? t('catalogFailed'))
        return
      }
      const candidates = result.value ?? {}
      const chosen: Record<string, number> = {}
      // Default to the FIRST publication for every id, as catalog order.
      for (const [id, list] of Object.entries(candidates)) {
        if (list.length > 0) chosen[id] = 0
      }
      const matched = Object.keys(candidates).length
      if (matched === 0) {
        setCatalog(null)
        setNotice(t('catalogFilled', { n: 0, matched: 0, total: ids.length }))
        return
      }
      setCatalog({ rowIndex: pi, ids, candidates, chosen })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }, [api, rows, t])

  /**
   * Write the chosen publication into the row.
   *
   * Applying a source is an explicit choice, so catalog-owned fields
   * (name, context, output cap, modalities, reasoning vocabulary) are
   * overwritten from that source. Temperature, extraBody and protocol stay
   * as the user typed them. The new rows are computed as PURE DATA before
   * any `setState`: a state updater runs later (and twice under StrictMode),
   * so counting fills inside one would both read as zero and double-count.
   */
  const applyCatalog = useCallback(() => {
    const selection = catalog
    if (selection === null) return
    const row = rows[selection.rowIndex]
    if (row === undefined) return

    let filled = 0
    const nextModels = row.models.map(m => {
      const id = m.id.trim()
      const list = selection.candidates[id]
      if (list === undefined || list.length === 0) return m
      const at = selection.chosen[id] ?? 0
      const fact = (list[at] ?? list[0]).facts
      const next = { ...m }
      if (fact.name !== undefined && fact.name.length > 0) {
        next.name = fact.name
        filled += 1
      }
      if (fact.contextWindow !== undefined) {
        next.contextWindow = String(fact.contextWindow)
        filled += 1
      }
      if (fact.maxTokens !== undefined) {
        next.maxTokens = String(fact.maxTokens)
        filled += 1
      }
      // Input modalities decide whether an image can be sent at all.
      if (fact.inputModalities !== undefined && fact.inputModalities.length > 0) {
        next.inputModalities = [...fact.inputModalities]
        filled += 1
      }
      // The model's OWN vocabulary, straight from the catalog: DeepSeek takes
      // none/high/max, GLM low/high/max, Kimi five rungs. Guessing a shared
      // set here would send a value the endpoint refuses.
      if (fact.reasoningEfforts !== undefined && fact.reasoningEfforts.length > 0) {
        next.reasoningEfforts = fact.reasoningEfforts.join(', ')
        filled += 1
        next.defaultReasoningEffort = fact.defaultReasoningEffort
          ?? fact.reasoningEfforts[fact.reasoningEfforts.length - 1]
        // Effort needs a transport as well as a vocabulary; default to the
        // plain scalar field, which is what OpenAI-shaped gateways accept.
        if (next.effortMode === 'none') {
          next.effortMode = 'field'
          next.effortField = 'reasoning_effort'
        }
        next.effortValues = fact.reasoningEfforts.join(', ')
        next.effortDefault = next.defaultReasoningEffort
      }
      return next
    })

    const matched = selection.ids.filter(id => selection.candidates[id] !== undefined).length
    if (filled > 0) {
      setRows(rs => rs.map((r, i) => (i === selection.rowIndex ? { ...r, models: nextModels } : r)))
      setDirty(true)
    }
    setCatalog(null)
    setNotice(t('catalogFilled', { n: filled, matched, total: selection.ids.length }))
  }, [catalog, rows, t])

  /** Move one model's chosen catalog publication. */
  const chooseCandidate = useCallback((id: string, index: number) => {
    setCatalog(current => (current === null ? null : {
      ...current,
      chosen: { ...current.chosen, [id]: index },
    }))
  }, [])

  const patchRow = (index: number, patch: Partial<ProviderRow>): void => {
    setRows(rs => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)))
    setDirty(true)
  }
  const patchModel = (pi: number, mi: number, patch: Partial<ModelRow>): void => {
    setRows(rs => rs.map((r, i) => (i === pi
      ? { ...r, models: r.models.map((m, j) => (j === mi ? { ...m, ...patch } : m)) }
      : r)))
    setDirty(true)
  }

  const children: React.ReactNode[] = []
  children.push(<p className="llmcfg-intro" key="intro">{t('intro')}</p>)

  if (error !== null) children.push(<div className="llmcfg-banner llmcfg-error" key="err">{error}</div>)
  if (notice !== null) children.push(<div className="llmcfg-banner llmcfg-ok" key="ok">{notice}</div>)
  if (dirty) children.push(<div className="llmcfg-banner llmcfg-warn" key="dirty">{t('unsavedChanges')}</div>)

  children.push(
    <div className="llmcfg-bar" key="bar">
      <button
        type="button"
        className="llmcfg-button"
        disabled={busy}
        onClick={() => {
          setRows(rs => [...rs, emptyProvider()])
          setOpen(o => ({ ...o, [rows.length]: true }))
          setDirty(true)
        }}
      >{t('addProvider')}</button>
      <span className="llmcfg-spacer" />
      <button type="button" className="llmcfg-button llmcfg-button--ghost" disabled={busy} onClick={() => void load()}>{t('reload')}</button>
      <button type="button" className="llmcfg-button llmcfg-button--primary" disabled={busy} onClick={() => void save()}>
        {busy ? t('saving') : t('save')}
      </button>
    </div>,
  )

  if (loading) {
    children.push(<p className="llmcfg-hint" key="loading">…</p>)
  } else if (rows.length === 0) {
    children.push(
      <div className="llmcfg-empty" key="empty">
        <div className="llmcfg-empty-title">{t('emptyTitle')}</div>
        <div className="llmcfg-hint">{t('emptyHint')}</div>
      </div>,
    )
  }

  rows.forEach((row, pi) => {
    const isOpen = open[pi] === true
    const ref = credentialRefFor(row.id.trim())
    const hasKey = keyStatus[row.id] === true

    const protocolLabel = PROTOCOLS.find(([id]) => id === row.protocol)?.[1] ?? row.protocol
    const title = row.displayName.length > 0 ? row.displayName : (row.id.length > 0 ? row.id : t('newProvider'))
    const head = (
      <div className="llmcfg-cardhead">
        <span className="llmcfg-name">{title}</span>
        <span className="llmcfg-meta">
          {protocolLabel}
          {' · '}
          {t('modelCount', { n: row.models.length })}
        </span>
        <span className="llmcfg-tag" data-state={hasKey ? 'ok' : 'warn'}>{hasKey ? t('keySaved') : t('noKey')}</span>
        <span className="llmcfg-spacer" />
        <label className="llmcfg-check">
          <input type="checkbox" checked={row.enabled}
            onChange={e => patchRow(pi, { enabled: e.target.checked })} />
          {t('enabled')}
        </label>
        <button type="button" className="llmcfg-button" onClick={() => setOpen(o => ({ ...o, [pi]: !isOpen }))}>
          {isOpen ? t('done') : t('edit')}
        </button>
        <button
          type="button"
          className="llmcfg-button llmcfg-button--danger"
          onClick={() => {
            const label = title.length > 0 ? title : t('newProvider')
            if (!window.confirm(t('confirmRemoveProvider', { id: label }))) return
            setRows(rs => rs.filter((_r, i) => i !== pi))
            setOpen({})
            setDirty(true)
          }}
        >{t('remove')}</button>
      </div>
    )

    const body = isOpen ? (
      <div className="llmcfg-cardbody">
        <Section title={t('secBasics')}>
        <div className="llmcfg-row">
          <Field label={t('providerId')} hint={t('providerIdHint')}>
            <input className="llmcfg-input" value={row.id} placeholder="my-gateway"
              onChange={e => patchRow(pi, { id: e.target.value })} />
          </Field>
          <Field label={t('displayName')} hint={t('optional')}>
            <input className="llmcfg-input" value={row.displayName}
              onChange={e => patchRow(pi, { displayName: e.target.value })} />
          </Field>
          <Field label={t('protocol')}>
            <select className="llmcfg-select" value={row.protocol}
              onChange={e => patchRow(pi, { protocol: e.target.value })}>
              {PROTOCOLS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </Field>
        </div>
        <Field label={t('baseUrl')} hint={t('baseUrlHint')} grow>
          <input className="llmcfg-input" value={row.baseURL} placeholder="https://gateway.example/v1"
            onChange={e => patchRow(pi, { baseURL: e.target.value })} />
        </Field>
        <div className="llmcfg-row">
          <Field label={t('apiKey')} grow>
            <KeyField t={t} providerId={row.id.trim()} refName={ref} hasKey={hasKey}
              onSave={v => void saveKey(row.id, v)}
              onDraft={v => setDraftKeys(d => ({ ...d, [row.id.trim()]: v }))} />
          </Field>
          <Field label={t('authScheme')}>
            <select className="llmcfg-select" value={row.authScheme}
              onChange={e => patchRow(pi, { authScheme: e.target.value })}>
              {AUTH_SCHEMES.map(([id, label]) => <option key={id} value={id}>{t(label)}</option>)}
            </select>
          </Field>
        </div>

        <details className="llmcfg-details">
          <summary>{t('moreOptions')}</summary>
          <div className="llmcfg-row">
            <Field label={t('globalMaxTokens')}>
              <input className="llmcfg-input" value={row.maxTokens}
                onChange={e => patchRow(pi, { maxTokens: e.target.value })} />
            </Field>
            <Field label={t('defaultContextWindow')}>
              <input className="llmcfg-input" value={row.defaultContextWindow} placeholder="128000"
                onChange={e => patchRow(pi, { defaultContextWindow: e.target.value })} />
            </Field>
            <Field label={t('streamIdleTimeout')}>
              <input className="llmcfg-input" value={row.streamIdleTimeoutMs} placeholder="300000"
                onChange={e => patchRow(pi, { streamIdleTimeoutMs: e.target.value })} />
            </Field>
          </div>
          <div className="llmcfg-row">
            <Field label={t('authHeaderName')} hint={t('optional')}>
              <input className="llmcfg-input" value={row.apiKeyHeader} placeholder="authorization"
                onChange={e => patchRow(pi, { apiKeyHeader: e.target.value })} />
            </Field>
            <Field label={t('keyPrefix')} hint={t('optional')}>
              <input className="llmcfg-input" value={row.apiKeyPrefix} placeholder="Bearer "
                onChange={e => patchRow(pi, { apiKeyPrefix: e.target.value })} />
            </Field>
            <Field label={t('keyEnvVar')} hint={t('optional')}>
              <input className="llmcfg-input" value={row.apiKeyEnv} placeholder="MY_GATEWAY_API_KEY"
                onChange={e => patchRow(pi, { apiKeyEnv: e.target.value })} />
            </Field>
          </div>
          <Field label={t('excludePatterns')} hint={t('commaSeparated')} grow>
            <input className="llmcfg-input" value={row.modelExcludePatterns} placeholder="embed, rerank"
              onChange={e => patchRow(pi, { modelExcludePatterns: e.target.value })} />
          </Field>
          <div className="llmcfg-row">
            <Field label={t('retryMode')} className="llmcfg-field--fixed">
              <select className="llmcfg-select" value={row.retryMode}
                onChange={e => patchRow(pi, { retryMode: e.target.value })}>
                <option value="normal">{t('retryModeNormal')}</option>
                <option value="always">{t('retryModeAlways')}</option>
              </select>
            </Field>
            {row.retryMode === 'normal' ? (
              <Field label={t('retryMax')} hint={t('retryMaxHint')}>
                <input className="llmcfg-input" value={row.retryMax} placeholder="5"
                  onChange={e => patchRow(pi, { retryMax: e.target.value })} />
              </Field>
            ) : null}
          </div>
          <p className="llmcfg-hint">{t('retryHint')}</p>
        </details>
        </Section>

        <Section title={t('secModels')}>
          <div className="llmcfg-toolbar">
            <button type="button" className="llmcfg-button llmcfg-button--primary" disabled={busy}
              onClick={() => void runDiscover(row)}>
              {busy ? t('fetching') : t('fetchModels')}
            </button>
            <button type="button" className="llmcfg-button" disabled={busy || row.models.length === 0}
              onClick={() => void fetchCatalog(pi)}>
              {t('enrichModels')}
            </button>
            <span className="llmcfg-spacer" />
            <button type="button" className="llmcfg-button llmcfg-button--ghost"
              onClick={() => {
                patchRow(pi, { models: [...row.models, emptyModel()] })
              }}>{t('addModel')}</button>
          </div>

          {/* The catalog choice, one row per model: different providers
              publish an id with different facts, so the source is explicit. */}
          {catalog !== null && catalog.rowIndex === pi ? (
            <div className="llmcfg-sub">
              <div className="llmcfg-toolbar">
                <span className="llmcfg-name">{t('catalogTitle')}</span>
                <span className="llmcfg-spacer" />
                <button type="button" className="llmcfg-button llmcfg-button--primary"
                  onClick={applyCatalog}>{t('catalogApply')}</button>
                <button type="button" className="llmcfg-button"
                  onClick={() => setCatalog(null)}>{t('dismiss')}</button>
              </div>
              <p className="llmcfg-hint">{t('catalogHint')}</p>
              {catalog.ids.map(id => {
                const list = catalog.candidates[id]
                if (list === undefined || list.length === 0) {
                  return <p className="llmcfg-hint" key={id}>{t('catalogNoMatch', { id })}</p>
                }
                const at = catalog.chosen[id] ?? 0
                return (
                  <div className="llmcfg-catalogrow" key={id}>
                    <code className="llmcfg-catalogid">{id}</code>
                    <select
                      className="llmcfg-select"
                      aria-label={id}
                      value={String(at)}
                      onChange={e => chooseCandidate(id, Number(e.target.value))}
                    >
                      {list.map((c, ci) => (
                        <option key={`${c.provider}-${ci}`} value={String(ci)}>
                          {catalogOptionLabel(c)}
                        </option>
                      ))}
                    </select>
                  </div>
                )
              })}
            </div>
          ) : null}

          {row.models.length === 0 ? <p className="llmcfg-hint">{t('noModels')}</p> : (
            <div className="llmcfg-modelist">
              {row.models.map((m, mi) => (
                <ModelEditor key={mi} t={t} model={m}
                  onChange={patch => patchModel(pi, mi, patch)}
                  onRemove={() => patchRow(pi, { models: row.models.filter((_x, j) => j !== mi) })} />
              ))}
            </div>
          )}

          {discovery !== null && discovery.provider === row.id.trim() ? (
            <div className="llmcfg-sub">
              <div className="llmcfg-toolbar">
                <span className="llmcfg-name">{t('advertises', { n: discovery.models.length })}</span>
                <span className="llmcfg-spacer" />
                <button type="button" className="llmcfg-button"
                  onClick={() => setDiscovery(d => (d === null ? null : { ...d, picked: Object.fromEntries(d.models.map(m => [m.id, true])) }))}
                >{t('selectAll')}</button>
                <button type="button" className="llmcfg-button"
                  onClick={() => setDiscovery(d => (d === null ? null : { ...d, picked: {} }))}
                >{t('clearAll')}</button>
                <button type="button" className="llmcfg-button llmcfg-button--primary"
                  onClick={() => {
                    const d = discovery
                    const existing = new Set(row.models.map(m => m.id))
                    const added = d.models
                      .filter(m => d.picked[m.id] === true && !existing.has(m.id))
                      .map(m => ({ ...emptyModel(), id: m.id, name: m.name ?? '' }))
                    patchRow(pi, { models: [...row.models, ...added] })
                    setNotice(t('addedNotice', { n: added.length }))
                    setDiscovery(null)
                  }}
                >{t('addSelected')}</button>
                <button type="button" className="llmcfg-button" onClick={() => setDiscovery(null)}>{t('dismiss')}</button>
              </div>
              <div className="llmcfg-scroll">
                {discovery.models.map(m => (
                  <label className="llmcfg-pick" key={m.id}>
                    <input type="checkbox" checked={discovery.picked[m.id] === true}
                      onChange={e => setDiscovery(d => (d === null ? null : {
                        ...d,
                        picked: { ...d.picked, [m.id]: e.target.checked },
                      }))} />
                    <span>{m.name ?? m.id}</span>
                    <code>{m.id}</code>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </Section>
      </div>
    ) : null

    children.push(
      <div className="llmcfg-card" key={pi} data-off={String(row.enabled === false)}>
        {head}
        {body}
      </div>,
    )
  })

  children.push(<div className="llmcfg-note" key="note">{t('note')}</div>)

  return <section className="llmcfg-root" aria-label={t('nav')}>{children}</section>
}

/**
 * The API-key control: shows the reference in use, edits in place.
 *
 * A typed key is reported upward as a DRAFT on every keystroke, so a model
 * fetch can authenticate before the key is ever committed — and committing
 * additionally stores it in the credential service.
 */
function KeyField(props: {
  t: (key: string, params?: Record<string, unknown>) => string
  providerId: string
  refName: string
  hasKey: boolean
  onSave: (value: string) => void
  onDraft: (value: string) => void
}): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const { t } = props

  if (props.providerId.length === 0) {
    return <span className="llmcfg-hint">{t('keyNeedId')}</span>
  }
  if (!editing) {
    return (
      <div className="llmcfg-keybar">
        <span className="llmcfg-tag" data-state={props.hasKey ? 'ok' : 'warn'}>
          {props.hasKey ? t('keyStored') : t('keyNotStored')}
        </span>
        <button type="button" className="llmcfg-button" onClick={() => setEditing(true)}>
          {props.hasKey ? t('replaceKey') : t('setKey')}
        </button>
        {props.hasKey ? (
          <button type="button" className="llmcfg-button llmcfg-button--danger"
            onClick={() => { props.onSave(''); props.onDraft('') }}>{t('clearKey')}</button>
        ) : null}
        {props.refName.length > 0
          ? <span className="llmcfg-meta" title={t('keyRefNote', { ref: props.refName })}>{props.refName}</span>
          : null}
      </div>
    )
  }
  return (
    <div className="llmcfg-keybar">
      <input className="llmcfg-input llmcfg-keyinput" type="password" value={value}
        placeholder={t('pasteKey')} autoFocus
        onChange={e => { setValue(e.target.value); props.onDraft(e.target.value) }} />
      <button type="button" className="llmcfg-button llmcfg-button--primary" disabled={value.length === 0}
        onClick={() => {
          props.onSave(value)
          props.onDraft(value)
          setValue('')
          setEditing(false)
        }}>{t('saveKey')}</button>
      <button type="button" className="llmcfg-button"
        onClick={() => { setValue(''); props.onDraft(''); setEditing(false) }}>{t('cancel')}</button>
    </div>
  )
}

/** One model row, collapsed to its id until expanded. */
function ModelEditor(props: {
  t: (key: string, params?: Record<string, unknown>) => string
  model: ModelRow
  onChange: (patch: Partial<ModelRow>) => void
  onRemove: () => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const { t, model } = props
  const set = props.onChange

  const toggleModality = (modality: string): void => {
    const list = model.inputModalities
    const next = list.includes(modality) ? list.filter(m => m !== modality) : [...list, modality]
    set({ inputModalities: next.length > 0 ? next : ['text'] })
  }

  const summary = modelSummary(model)
  const head = (
    <div className="llmcfg-toolbar llmcfg-modelbar">
      <input className="llmcfg-input llmcfg-modelid" value={model.id} placeholder={t('wireModelId')}
        onChange={e => set({ id: e.target.value })} />
      {open ? null : (
        summary.length > 0
          ? <span className="llmcfg-meta llmcfg-modelsum">{summary}</span>
          : null
      )}
      <span className="llmcfg-spacer" />
      <button type="button" className="llmcfg-button llmcfg-button--ghost" onClick={() => setOpen(!open)}>
        {open ? t('hideAdvanced') : t('advanced')}
      </button>
      <button type="button" className="llmcfg-button llmcfg-button--danger"
        onClick={() => {
          const id = model.id.trim().length > 0 ? model.id.trim() : (model.name.trim() || '?')
          if (!window.confirm(t('confirmRemoveModel', { id }))) return
          props.onRemove()
        }}>
        {t('remove')}
      </button>
    </div>
  )

  if (!open) return <div className="llmcfg-modelrow">{head}</div>

  return (
    <div className="llmcfg-modelrow" data-open="true">
      {head}
      <div className="llmcfg-modelbody">
        <div className="llmcfg-row">
          <Field label={t('modelName')} hint={t('optional')}>
            <input className="llmcfg-input" value={model.name} onChange={e => set({ name: e.target.value })} />
          </Field>
          <Field label={t('contextWindow')}>
            <input className="llmcfg-input" value={model.contextWindow} placeholder="128000"
              onChange={e => set({ contextWindow: e.target.value })} />
          </Field>
          <Field label={t('maxOutputTokens')} hint={t('optional')}>
            <input className="llmcfg-input" value={model.maxTokens}
              onChange={e => set({ maxTokens: e.target.value })} />
          </Field>
        </div>
        <div className="llmcfg-row">
          <Field label={t('protocol')} hint={t('protocolDefault')}>
            <select className="llmcfg-select" value={model.protocol}
              onChange={e => set({ protocol: e.target.value })}>
              <option value="">{t('protocolDefault')}</option>
              {PROTOCOLS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </Field>
          <Field label={t('inputModalities')}>
            <div className="llmcfg-chips">
              {['text', 'image'].map(m => (
                <button key={m} type="button" className="llmcfg-chip"
                  data-on={String(model.inputModalities.includes(m))}
                  onClick={() => toggleModality(m)}>{m}</button>
              ))}
            </div>
          </Field>
        </div>
        <div className="llmcfg-row">
          <Field label={t('reasoningEfforts')} hint={t('reasoningEffortsHint')} grow>
            <input className="llmcfg-input" value={model.reasoningEfforts} placeholder="low, high, max"
              onChange={e => set({ reasoningEfforts: e.target.value })} />
          </Field>
          <Field label={t('defaultEffort')} hint={t('optional')}>
            <input className="llmcfg-input" value={model.defaultReasoningEffort} placeholder="high"
              onChange={e => set({ defaultReasoningEffort: e.target.value })} />
          </Field>
        </div>

        <details className="llmcfg-details">
          <summary>{t('moreOptions')}</summary>
          <p className="llmcfg-hint">{t('effortHint')}</p>
          <div className="llmcfg-row">
            <Field label={t('temperature')} hint={t('optional')}>
              <input className="llmcfg-input" value={model.temperature}
                onChange={e => set({ temperature: e.target.value })} />
            </Field>
            <Field label={t('topP')} hint={t('optional')}>
              <input className="llmcfg-input" value={model.topP}
                onChange={e => set({ topP: e.target.value })} />
            </Field>
            <Field label={t('stopSequences')} hint={t('commaSeparated')}>
              <input className="llmcfg-input" value={model.stop}
                onChange={e => set({ stop: e.target.value })} />
            </Field>
          </div>
          <div className="llmcfg-row">
            <Field label={t('effortMode')}>
              <select className="llmcfg-select" value={model.effortMode}
                onChange={e => set({ effortMode: e.target.value })}>
                <option value="none">{t('effortModeNone')}</option>
                <option value="field">{t('effortModeField')}</option>
                <option value="thinking">{t('effortModeThinking')}</option>
              </select>
            </Field>
            {model.effortMode === 'none' ? null : (
              <Field label={t('effortFieldName')} hint="reasoning_effort / thinking.type">
                <input className="llmcfg-input" value={model.effortField}
                  placeholder={model.effortMode === 'thinking' ? 'thinking' : 'reasoning_effort'}
                  onChange={e => set({ effortField: e.target.value })} />
              </Field>
            )}
            {model.effortMode === 'none' ? null : (
              <Field label={t('effortValues')} hint={t('commaSeparated')}>
                <input className="llmcfg-input" value={model.effortValues} placeholder="low, high, max"
                  onChange={e => set({ effortValues: e.target.value })} />
              </Field>
            )}
          </div>
          <div className="llmcfg-row">
            <Field label={t('extraBody')}>
              <textarea className="llmcfg-area" value={model.extraBody} placeholder='{"top_k": 40}'
                onChange={e => set({ extraBody: e.target.value })} />
            </Field>
            <Field label={t('extraHeaders')}>
              <textarea className="llmcfg-area" value={model.extraHeaders} placeholder='{"x-tenant": "team-a"}'
                onChange={e => set({ extraHeaders: e.target.value })} />
            </Field>
          </div>
        </details>
      </div>
    </div>
  )
}
