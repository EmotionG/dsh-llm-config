/**
 * Request serialization for the four supported wire formats.
 *
 * Each builder returns the POST body for one exact provider/model pair. They
 * differ in more than naming: tool-call replay is `tool_calls` + `role:'tool'`
 * for OpenAI, `tool_use`/`tool_result` parts for Anthropic, and
 * `functionCall`/`functionResponse` for Gemini; the system prompt is a leading
 * message, a top-level `system`, or `systemInstruction`.
 *
 * @module dsh-llm-config/serialize
 */

import type { ContentBlock, GenerateOptions } from '@deepseek-ai/dsh-llm'
import type { ConfigModel, ConfigProvider, ModelEffort } from './config.ts'

/** Prefix for adapter-raised diagnostics. */
const PKG = 'llm-config'

/**
 * Image blocks carry an attachment REFERENCE, not inline bytes: the provider
 * never receives the image natively. Rather than invent a half-serializer, an
 * adapter that cannot serve an image rejects the request explicitly — the same
 * posture the shipped NewAPI adapter takes.
 */
export function contentHasImage(blocks: readonly ContentBlock[]): boolean {
  return blocks.some(b => b.type === 'image')
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

/** OpenAI Chat Completions request body. */
function buildOpenAiChat(
  options: GenerateOptions,
  model: ConfigModel | undefined,
  provider: ConfigProvider,
): Record<string, unknown> {
  const messages: Record<string, unknown>[] = []
  if (options.system !== undefined && options.system.length > 0) {
    messages.push({ role: 'system', content: options.system })
  }
  for (const message of options.messages) {
    const blocks = message.content
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
    const results = blocks.filter(b => b.type === 'tool-result')
    if (results.length > 0) {
      for (const r of results) {
        messages.push({ role: 'tool', tool_call_id: r.toolCallId, content: textOf(r.content) })
      }
      continue
    }
    const images = blocks.filter(b => b.type === 'image')
    if (images.length > 0) {
      throw new Error(`${PKG}: the OpenAI chat serializer does not support image content`)
    }
    messages.push({ role: 'user', content: textOf(blocks) })
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

/** Anthropic Messages request body. */
function buildAnthropic(
  options: GenerateOptions,
  model: ConfigModel | undefined,
  provider: ConfigProvider,
): Record<string, unknown> {
  const messages: Record<string, unknown>[] = []
  for (const message of options.messages) {
    const blocks = message.content
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
      if (blocks.some(b => b.type === 'image')) {
        throw new Error(`${PKG}: the Anthropic serializer does not support image content`)
      }
      for (const r of blocks.filter(b => b.type === 'tool-result')) {
        parts.push({
          type: 'tool_result',
          tool_use_id: r.toolCallId,
          content: textOf(r.content),
          ...(r.isError === true ? { is_error: true } : {}),
        })
      }
    }
    if (parts.length > 0) messages.push({ role: message.role, content: parts })
  }

  const body: Record<string, unknown> = {
    model: options.model,
    max_tokens: resolveMaxTokens(options, model, provider) ?? 4096,
    messages,
    stream: true,
  }
  if (options.system !== undefined && options.system.length > 0) body.system = options.system
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

/** Google Gemini generateContent request body. */
function buildGemini(
  options: GenerateOptions,
  model: ConfigModel | undefined,
  provider: ConfigProvider,
): Record<string, unknown> {
  const contents: Record<string, unknown>[] = []
  for (const message of options.messages) {
    const blocks = message.content
    const parts: Record<string, unknown>[] = []
    if (message.role === 'assistant') {
      const text = textOf(blocks)
      if (text.length > 0) parts.push({ text })
      for (const c of blocks.filter(b => b.type === 'tool-call')) {
        parts.push({ functionCall: { name: c.name, args: parseArgs(c.arguments) } })
      }
    } else {
      const text = textOf(blocks)
      if (text.length > 0) parts.push({ text })
      if (blocks.some(b => b.type === 'image')) {
        throw new Error(`${PKG}: the Gemini serializer does not support image content`)
      }
      for (const r of blocks.filter(b => b.type === 'tool-result')) {
        parts.push({ functionResponse: { name: 'tool', response: { result: textOf(r.content) } } })
      }
    }
    if (parts.length > 0) contents.push({ role: message.role === 'assistant' ? 'model' : 'user', parts })
  }

  const body: Record<string, unknown> = { contents }
  if (options.system !== undefined && options.system.length > 0) {
    body.systemInstruction = { parts: [{ text: options.system }] }
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
): Record<string, unknown> {
  const protocol = model?.protocol ?? provider.protocol
  if (protocol === 'anthropic-messages') return buildAnthropic(options, model, provider)
  if (protocol === 'google-gemini') return buildGemini(options, model, provider)
  return buildOpenAiChat(options, model, provider)
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
