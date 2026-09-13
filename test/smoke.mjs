/**
 * Smoke test: exercise the pure host logic (config resolution, serialization,
 * SSE translation) against the real built lib/, without needing a running
 * harness. This is the check the dynamic-plugin sandbox never allowed.
 */
import { resolveConfig, credentialRefFor } from '../lib/config.js'
import { serializeRequest, requestUrl, authHeaders } from '../lib/serialize.js'
import { createTranslator } from '../lib/stream.js'

let failures = 0
const check = (name, ok, detail) => {
  if (ok) {
    console.log(`  ok   ${name}`)
  } else {
    failures += 1
    console.log(`  FAIL ${name}${detail === undefined ? '' : ` — ${detail}`}`)
  }
}

console.log('credential reference derivation')
check('plain id is unchanged', credentialRefFor('zzzxin1') === 'zzzxin1')
check('dots become underscores', credentialRefFor('my.gateway') === 'my_gateway')
check('leading digit is prefixed', credentialRefFor('1abc') === '_1abc')
check('hyphen becomes underscore', credentialRefFor('kimi-k3') === 'kimi_k3')

console.log('\nconfig resolution')
const good = resolveConfig({
  providers: {
    zzzxin1: {
      id: 'zzzxin1', protocol: 'openai-chat', baseURL: 'https://zzzxin.xin/v1/',
      authScheme: 'bearer', models: [
        { id: 'deepseek-v4-flash', contextWindow: 128000 },
        { id: '', name: 'blank rows are dropped' },
        {
          id: 'kimi-k3', reasoningEfforts: ['low', 'high', 'max'], defaultReasoningEffort: 'max',
          effort: { mode: 'field', field: 'reasoning_effort', values: ['low', 'high', 'max'], default: 'max' },
        },
      ],
    },
  },
})
check('one provider resolves', good.providers.length === 1, String(good.providers.length))
check('baseURL trailing slash trimmed', good.providers[0].baseURL === 'https://zzzxin.xin/v1', good.providers[0].baseURL)
check('blank model dropped', good.providers[0].models.length === 2, String(good.providers[0].models.length))
check('credentialRef derived', good.providers[0].credentialRef === 'zzzxin1')
check('authScheme defaults to bearer', good.providers[0].authScheme === 'bearer')
check('defaultContextWindow default', good.providers[0].defaultContextWindow === 128000)
check('kimi effort kept', good.providers[0].models[1].effort.field === 'reasoning_effort')

console.log('\nconfig resolution accepts a legacy ARRAY too')
const legacy = resolveConfig({ providers: [{ id: 'a', baseURL: 'https://a.example/v1' }] })
check('array shape still resolves', legacy.providers.length === 1)

console.log('\nconfig rejects what the adapter cannot serve')
const rejects = (name, section) => {
  try {
    resolveConfig(section)
    check(name, false, 'it was accepted')
  } catch (error) {
    check(name, true)
  }
}
rejects('non-http baseURL', { providers: { a: { id: 'a', baseURL: 'ftp://x/y' } } })
rejects('missing baseURL', { providers: { a: { id: 'a' } } })
rejects('duplicate provider id', { providers: [{ id: 'a', baseURL: 'https://a/v1' }, { id: 'a', baseURL: 'https://b/v1' }] })
rejects('unknown protocol', { providers: { a: { id: 'a', baseURL: 'https://a/v1', protocol: 'nope' } } })
rejects('effort default outside values', {
  providers: { a: { id: 'a', baseURL: 'https://a/v1', models: [{ id: 'm', effort: { mode: 'field', field: 'reasoning_effort', values: ['low'], default: 'high' } }] } },
})
rejects('temperature out of range', {
  providers: { a: { id: 'a', baseURL: 'https://a/v1', models: [{ id: 'm', temperature: 9 }] } },
})

console.log('\nserialization: OpenAI chat')
const provider = good.providers[0]
const model = provider.models[0]
const base = {
  provider: 'zzzxin1', model: 'deepseek-v4-flash',
  messages: [
    { role: 'user', content: [{ type: 'text', text: 'hi' }] },
  ],
}
const openai = serializeRequest(base, model, provider)
check('model set', openai.model === 'deepseek-v4-flash')
check('stream true', openai.stream === true)
check('user text mapped', openai.messages[0].content === 'hi')
check('system becomes leading message', (() => {
  const withSystem = serializeRequest({ ...base, system: 'be brief' }, model, provider)
  return withSystem.messages[0].role === 'system' && withSystem.messages[0].content === 'be brief'
})())
check('tools mapped to functions', (() => {
  const withTools = serializeRequest({
    ...base, tools: [{ name: 'read', description: 'd', parameters: { type: 'object' } }],
  }, model, provider)
  return withTools.tools[0].type === 'function' && withTools.tools[0].function.name === 'read'
})())

console.log('\nserialization: tool-call replay differs per protocol')
const toolHistory = {
  provider: 'zzzxin1', model: 'm',
  messages: [
    { role: 'assistant', content: [
      { type: 'text', text: 'calling' },
      { type: 'tool-call', id: 'call_1', name: 'read', arguments: '{"p":"/x"}' },
    ] },
    { role: 'user', content: [{ type: 'tool-result', toolCallId: 'call_1', content: [{ type: 'text', text: 'ok' }] }] },
  ],
}
const oa = serializeRequest(toolHistory, model, provider)
check('openai emits tool_calls', oa.messages[0].tool_calls?.[0]?.function?.name === 'read')
check('openai emits role:tool', oa.messages[1].role === 'tool' && oa.messages[1].tool_call_id === 'call_1')

const anthropicProvider = resolveConfig({
  providers: { a: { id: 'a', baseURL: 'https://a.example/v1', protocol: 'anthropic-messages' } },
}).providers[0]
const an = serializeRequest(toolHistory, undefined, anthropicProvider)
check('anthropic emits tool_use part', an.messages[0].content[1].type === 'tool_use')
check('anthropic emits tool_result part', an.messages[1].content[0].type === 'tool_result')
check('anthropic max_tokens present', typeof an.max_tokens === 'number')
check('anthropic system is top-level', serializeRequest({ ...toolHistory, system: 'sys' }, undefined, anthropicProvider).system === 'sys')

const geminiProvider = resolveConfig({
  providers: { g: { id: 'g', baseURL: 'https://g.example/v1', protocol: 'google-gemini' } },
}).providers[0]
const gm = serializeRequest(toolHistory, undefined, geminiProvider)
check('gemini uses contents', Array.isArray(gm.contents))
check('gemini assistant role is model', gm.contents[0].role === 'model')
check('gemini emits functionCall', gm.contents[0].parts[1].functionCall.name === 'read')
check('gemini emits functionResponse', gm.contents[1].parts[0].functionResponse !== undefined)

console.log('\nreasoning effort adapts per model')
const k3 = good.providers[0].models[1]
const withEffort = serializeRequest({ ...base, model: 'kimi-k3', reasoningEffort: 'high' }, k3, provider)
check('kimi k3 sends TOP-LEVEL reasoning_effort', withEffort.reasoning_effort === 'high')
const thinkingModel = {
  id: 'kimi-k2', protocol: 'openai-chat', inputModalities: ['text'],
  effort: { mode: 'thinking', field: 'thinking', values: ['enabled', 'disabled'], default: 'enabled' },
}
const thinking = serializeRequest({ ...base, model: 'kimi-k2' }, thinkingModel, provider)
check('kimi k2 sends NESTED thinking.type', thinking.thinking?.type === 'enabled')
check('kimi k2 does NOT send reasoning_effort', thinking.reasoning_effort === undefined)
check('model with no effort sends nothing', serializeRequest(base, model, provider).reasoning_effort === undefined)

console.log('\nURL and auth per protocol')
check('openai chat url', requestUrl(provider, 'm', 'k', true) === 'https://zzzxin.xin/v1/chat/completions')
check('anthropic url', requestUrl(anthropicProvider, 'm', 'k', true) === 'https://a.example/v1/messages')
check('gemini url streams with alt=sse', (() => {
  const u = requestUrl(geminiProvider, 'gemini-pro', 'K', true)
  return u.includes(':streamGenerateContent') && u.includes('alt=sse') && u.includes('key=K')
})())
check('bearer header', authHeaders(provider, 'sk-1').authorization === 'Bearer sk-1')
check('x-api-key header for anthropic', authHeaders(anthropicProvider, 'sk-2')['x-api-key'] === 'sk-2')
check('gemini uses x-goog-api-key', authHeaders(geminiProvider, 'sk-3')['x-goog-api-key'] === 'sk-3')

console.log('\nSSE translation: OpenAI')
const t1 = createTranslator('openai-chat')
const out1 = []
out1.push(...t1.push(JSON.stringify({ choices: [{ delta: { reasoning_content: 'think' } }] })).chunks)
out1.push(...t1.push(JSON.stringify({ choices: [{ delta: { content: 'Hello' } }] })).chunks)
out1.push(...t1.push(JSON.stringify({ choices: [{ delta: { content: ' world' } }] })).chunks)
out1.push(...t1.push(JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } })).chunks)
out1.push(...t1.finish())
check('reasoning delta emitted', out1.some(c => c.type === 'reasoning-delta' && c.text === 'think'))
check('text deltas emitted', out1.filter(c => c.type === 'text-delta').map(c => c.text).join('') === 'Hello world')
check('block-start precedes text', out1.findIndex(c => c.type === 'block-start') < out1.findIndex(c => c.type === 'text-delta'))
check('usage disjoint math', (() => {
  const u = out1.find(c => c.type === 'usage')
  return u !== undefined && u.usage.inputTokens === 10 && u.usage.outputTokens === 2
})())
check('finish reason stop', out1.find(c => c.type === 'finish').reason.kind === 'stop')
check('[DONE] terminates', t1.push('[DONE]').done === true)

console.log('\nSSE translation: OpenAI streaming tool call')
const t2 = createTranslator('openai-chat')
const out2 = []
out2.push(...t2.push(JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_9', function: { name: 'read' } }] } }] })).chunks)
out2.push(...t2.push(JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"p":' } }] } }] })).chunks)
out2.push(...t2.push(JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"/x"}' } }] } }] })).chunks)
out2.push(...t2.finish())
const end2 = out2.find(c => c.type === 'block-end')
check('args accumulate', end2?.block?.arguments === '{"p":"/x"}', end2?.block?.arguments)
check('tool-calls finish reason', out2.find(c => c.type === 'finish').reason.kind === 'tool-calls')

console.log('\nSSE translation: Anthropic')
const t3 = createTranslator('anthropic-messages')
const out3 = []
out3.push(...t3.push(JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 5 } } })).chunks)
out3.push(...t3.push(JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text' } })).chunks)
out3.push(...t3.push(JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hi' } })).chunks)
out3.push(...t3.push(JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } })).chunks)
out3.push(...t3.finish())
check('anthropic text delta', out3.some(c => c.type === 'text-delta' && c.text === 'Hi'))
check('anthropic usage', (() => {
  const u = out3.find(c => c.type === 'usage')
  return u?.usage.inputTokens === 5 && u?.usage.outputTokens === 3
})())
check('anthropic stop', out3.find(c => c.type === 'finish').reason.kind === 'stop')

console.log('\nSSE translation: Gemini')
const t4 = createTranslator('google-gemini')
const out4 = []
out4.push(...t4.push(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Gem' }] } }] })).chunks)
out4.push(...t4.push(JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name: 'read', args: { p: '/x' } } }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 6, totalTokenCount: 10 } })).chunks)
out4.push(...t4.finish())
check('gemini text delta', out4.some(c => c.type === 'text-delta' && c.text === 'Gem'))
check('gemini functionCall', out4.some(c => c.type === 'block-end' && c.block?.type === 'tool-call'))
check('gemini usage', out4.find(c => c.type === 'usage')?.usage.totalTokens === 10)
check('gemini tool-calls finish', out4.find(c => c.type === 'finish').reason.kind === 'tool-calls')

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
