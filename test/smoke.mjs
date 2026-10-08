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

console.log('\nretry policy config')
const retrySection = resolveConfig({
  providers: {
    r: { id: 'r', baseURL: 'https://r.example/v1', retry: 3 },
  },
})
check('numeric shorthand becomes normal maxRetries', retrySection.providers[0].retry?.mode === 'normal'
  && retrySection.providers[0].retry?.maxRetries === 3, JSON.stringify(retrySection.providers[0].retry))
const retryObj = resolveConfig({
  providers: {
    r: { id: 'r', baseURL: 'https://r.example/v1', retry: { mode: 'always' } },
  },
})
check('object form passes through', retryObj.providers[0].retry?.mode === 'always')
const retryNone = resolveConfig({
  providers: { r: { id: 'r', baseURL: 'https://r.example/v1' } },
})
check('absent retry stays undefined (framework default 5)', retryNone.providers[0].retry === undefined)
const rejectsRetry = (name, section) => {
  try {
    resolveConfig(section)
    check(name, false, 'it was accepted')
  } catch {
    check(name, true)
  }
}
rejectsRetry('negative retry count rejected', {
  providers: { r: { id: 'r', baseURL: 'https://r.example/v1', retry: -1 } },
})
rejectsRetry('unknown retry mode rejected', {
  providers: { r: { id: 'r', baseURL: 'https://r.example/v1', retry: { mode: 'nope' } } },
})
rejectsRetry('bad backoff rejected', {
  providers: { r: { id: 'r', baseURL: 'https://r.example/v1', retry: { mode: 'normal', backoff: { initialDelayMs: -5 } } } },
})

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
check('user text mapped', (() => {
  const text = openai.messages[0].content
  return text === 'hi' || (Array.isArray(text) && text.length === 1 && text[0].text === 'hi')
})())
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
// 0.2 message model: a tool result is a first-class `tool` ROLE message, not a
// `tool-result` content block nested inside a user message.
const toolHistory = {
  provider: 'zzzxin1', model: 'm',
  messages: [
    { role: 'assistant', content: [
      { type: 'text', text: 'calling' },
      { type: 'tool-call', id: 'call_1', name: 'read', arguments: '{"p":"/x"}' },
    ] },
    { role: 'tool', toolCallId: 'call_1', content: [{ type: 'text', text: 'ok' }] },
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
check('anthropic tool_result is a USER message', an.messages[1].role === 'user')
check('anthropic max_tokens present', typeof an.max_tokens === 'number')
check('anthropic system is top-level', serializeRequest({ ...toolHistory, system: 'sys' }, undefined, anthropicProvider).system === 'sys')

// Consecutive tool results answering one assistant turn belong to ONE user
// message on the Anthropic wire; they must not become one message each.
const parallelHistory = {
  provider: 'zzzxin1', model: 'm',
  messages: [
    { role: 'assistant', content: [
      { type: 'tool-call', id: 'c1', name: 'read', arguments: '{}' },
      { type: 'tool-call', id: 'c2', name: 'write', arguments: '{}' },
    ] },
    { role: 'tool', toolCallId: 'c1', content: [{ type: 'text', text: 'a' }] },
    { role: 'tool', toolCallId: 'c2', content: [{ type: 'text', text: 'b' }], isError: true },
  ],
}
const merged = serializeRequest(parallelHistory, undefined, anthropicProvider)
check('anthropic merges parallel tool results into one user message',
  merged.messages.length === 2 && merged.messages[1].content.length === 2,
  JSON.stringify(merged.messages.map(m => m.role)))
check('anthropic carries is_error on a failed tool result',
  merged.messages[1].content[1].is_error === true)

const geminiProvider = resolveConfig({
  providers: { g: { id: 'g', baseURL: 'https://g.example/v1', protocol: 'google-gemini' } },
}).providers[0]
const gm = serializeRequest(toolHistory, undefined, geminiProvider)
check('gemini uses contents', Array.isArray(gm.contents))
check('gemini assistant role is model', gm.contents[0].role === 'model')
check('gemini emits functionCall', gm.contents[0].parts[1].functionCall.name === 'read')
check('gemini emits functionResponse', gm.contents[1].parts[0].functionResponse !== undefined)
check('gemini names the function it answers, not the call id',
  gm.contents[1].parts[0].functionResponse.name === 'read',
  gm.contents[1].parts[0].functionResponse.name)

console.log('\nserialization: 0.2 message roles')
// A loop-built request carries the system prompt as the LEADING system message.
const leadingSystem = {
  provider: 'zzzxin1', model: 'm',
  messages: [
    { role: 'system', content: [{ type: 'text', text: 'be brief' }] },
    { role: 'user', content: [{ type: 'text', text: 'hi' }] },
  ],
}
const ls = serializeRequest(leadingSystem, model, provider)
check('a leading system message becomes the provider system slot',
  ls.messages[0].role === 'system' && ls.messages[0].content === 'be brief',
  JSON.stringify(ls.messages))
check('the leading system message is not replayed as user text',
  ls.messages.length === 2 && ls.messages[1].role === 'user')
check('gemini folds the leading system message into systemInstruction',
  serializeRequest(leadingSystem, undefined, geminiProvider).systemInstruction?.parts?.[0]?.text === 'be brief')
check('anthropic folds the leading system message into the top-level system',
  serializeRequest(leadingSystem, undefined, anthropicProvider).system === 'be brief')

// Developer messages carry tool-declaration updates no wire format here can
// express; replaying them as user text would corrupt the conversation.
const developerHistory = {
  provider: 'zzzxin1', model: 'm',
  messages: [
    { role: 'user', content: [{ type: 'text', text: 'hi' }] },
    { role: 'developer', content: [{ type: 'tool-addition', toolName: 'read' }] },
  ],
}
let developerRefusal
try {
  serializeRequest(developerHistory, model, provider)
} catch (error) {
  developerRefusal = error
}
check('a developer message is refused with UNSUPPORTED_CONTENT',
  developerRefusal?.code === 'UNSUPPORTED_CONTENT',
  JSON.stringify(developerRefusal?.code ?? developerRefusal?.message))

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
check('reasoning and text own DISTINCT block indexes', (() => {
  const reasoningAt = out1.find(c => c.type === 'reasoning-delta')?.index
  const textAt = out1.find(c => c.type === 'text-delta')?.index
  return reasoningAt !== undefined && textAt !== undefined && reasoningAt !== textAt
})(), `reasoning@${out1.find(c => c.type === 'reasoning-delta')?.index} text@${out1.find(c => c.type === 'text-delta')?.index}`)
check('reasoning closes as a reasoning block', out1.some(c => c.type === 'block-end' && c.block?.type === 'reasoning' && c.block.text === 'think'))
check('text closes as a text block', out1.some(c => c.type === 'block-end' && c.block?.type === 'text' && c.block.text === 'Hello world'))
check('block-start precedes text', out1.findIndex(c => c.type === 'block-start') < out1.findIndex(c => c.type === 'text-delta'))
check('usage disjoint math', (() => {
  const u = out1.find(c => c.type === 'usage')
  return u !== undefined && u.usage.inputTokens === 10 && u.usage.outputTokens === 2
})())
check('finish reason stop', out1.find(c => c.type === 'finish').reason.kind === 'stop')
check('[DONE] terminates', t1.push('[DONE]').done === true)

console.log('\nSSE translation: reasoning-ONLY completion stays separate')
const t1b = createTranslator('openai-chat')
const out1b = []
out1b.push(...t1b.push(JSON.stringify({ choices: [{ delta: { reasoning_content: 'all in head' } }] })).chunks)
out1b.push(...t1b.push(JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 } })).chunks)
out1b.push(...t1b.finish())
check('reasoning still closes as reasoning', out1b.some(c => c.type === 'block-end' && c.block?.type === 'reasoning'))
check('no text block is fabricated', !out1b.some(c => c.type === 'block-end' && c.block?.type === 'text'))
check('hasToolCalls reports none', t1b.hasToolCalls() === false)

console.log('\nSSE translation: reasoning + tool call indexes stay distinct')
const t1c = createTranslator('openai-chat')
const out1c = []
out1c.push(...t1c.push(JSON.stringify({ choices: [{ delta: { reasoning_content: 'plan' } }] })).chunks)
out1c.push(...t1c.push(JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'read' } }] } }] })).chunks)
out1c.push(...t1c.push(JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{}' } }] } }] })).chunks)
out1c.push(...t1c.finish())
check('tool call block does not collide with reasoning', (() => {
  const reasoningAt = out1c.find(c => c.type === 'reasoning-delta')?.index
  const toolAt = out1c.find(c => c.type === 'tool-call-delta')?.index
  return reasoningAt !== undefined && toolAt !== undefined && reasoningAt !== toolAt
})(), `reasoning@${out1c.find(c => c.type === 'reasoning-delta')?.index} tool@${out1c.find(c => c.type === 'tool-call-delta')?.index}`)
check('both blocks close with their own content', out1c.filter(c => c.type === 'block-end').length === 2)
check('hasToolCalls reports the call', t1c.hasToolCalls() === true)

console.log('\ncompletion detection: a cut stream is NOT completed')
const c1 = createTranslator('openai-chat')
c1.push(JSON.stringify({ choices: [{ delta: { content: 'partial answ' } }] }))
check('openai: no [DONE] and no finish_reason → incomplete', c1.completed() === false)
const c1b = createTranslator('openai-chat')
c1b.push(JSON.stringify({ choices: [{ delta: { content: 'hi' } }] }))
c1b.push(JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }))
check('openai: finish_reason marks completion', c1b.completed() === true)
const c1c = createTranslator('openai-chat')
c1c.push(JSON.stringify({ choices: [{ delta: { content: 'hi' } }] }))
c1c.push('[DONE]')
check('openai: [DONE] marks completion', c1c.completed() === true)

const c3 = createTranslator('anthropic-messages')
c3.push(JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 5 } } }))
c3.push(JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'par' } }))
check('anthropic: only block events → incomplete', c3.completed() === false)
const c3b = createTranslator('anthropic-messages')
c3b.push(JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn' } }))
check('anthropic: message_delta marks completion', c3b.completed() === true)
const c3c = createTranslator('anthropic-messages')
c3c.push(JSON.stringify({ type: 'message_stop' }))
check('anthropic: message_stop marks completion', c3c.completed() === true)

const c4 = createTranslator('google-gemini')
c4.push(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'par' }] } }] }))
check('gemini: no finishReason → incomplete', c4.completed() === false)
const c4b = createTranslator('google-gemini')
c4b.push(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'hi' }] }, finishReason: 'STOP' }] }))
check('gemini: finishReason marks completion', c4b.completed() === true)

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
check('gemini text and tool blocks stay distinct', (() => {
  const textAt = out4.find(c => c.type === 'text-delta')?.index
  const toolAt = out4.find(c => c.type === 'tool-call-delta')?.index
  return textAt !== undefined && toolAt !== undefined && textAt !== toolAt
})())
check('gemini usage', out4.find(c => c.type === 'usage')?.usage.totalTokens === 10)
check('gemini tool-calls finish', out4.find(c => c.type === 'finish').reason.kind === 'tool-calls')

console.log('\nSSE translation: Gemini thought parts map to reasoning')
const t4b = createTranslator('google-gemini')
const out4b = []
out4b.push(...t4b.push(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ponder', thought: true }] } }] })).chunks)
out4b.push(...t4b.push(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'answer' }] }, finishReason: 'STOP' }] })).chunks)
out4b.push(...t4b.finish())
check('thought part becomes a reasoning block', out4b.some(c => c.type === 'block-end' && c.block?.type === 'reasoning' && c.block.text === 'ponder'))
check('answer part stays a text block', out4b.some(c => c.type === 'block-end' && c.block?.type === 'text' && c.block.text === 'answer'))

console.log('\nimage serialization (inline, per protocol)')
// A stand-in RequestImages map: one fake attachment with two red bytes.
const fakeVersion = {
  attachmentId: 'att_1', mediaType: 'image/png', bytes: 2, width: 1, height: 1,
  data: new Uint8Array([255, 0, 0]), variantId: 'v1', depth: 'uchar', space: 'srgb', hasAlpha: false,
}
const imageRef = { attachmentId: 'att_1', mediaType: 'image/png', bytes: 2, width: 1, height: 1 }
const images = {
  versions: new Map([['att_1', fakeVersion]]),
  handle: () => 'Image att_1; request preview 1x1px.',
}
const imageRequest = {
  provider: 'zzzxin1', model: 'deepseek-v4-flash',
  messages: [
    { role: 'user', content: [
      { type: 'text', text: 'what is this' },
      { type: 'image', attachment: imageRef },
    ] },
  ],
}
const openaiImg = serializeRequest(imageRequest, model, provider, images)
const openaiParts = openaiImg.messages[0].content
check('openai user content becomes parts', Array.isArray(openaiParts))
check('openai image part is inline base64', openaiParts[2]?.type === 'image_url'
  && String(openaiParts[2]?.image_url?.url).startsWith('data:image/png;base64,'), JSON.stringify(openaiParts?.[2]))
check('openai keeps the text part', openaiParts[0]?.text === 'what is this')
check('openai writes the handle beside the image', openaiParts[1]?.type === 'text'
  && String(openaiParts[1]?.text).includes('att_1'))
const anthropicImg = serializeRequest(imageRequest, undefined, anthropicProvider, images)
const anthropicParts = anthropicImg.messages[0].content
check('anthropic image part is base64 source', anthropicParts[2]?.type === 'image'
  && anthropicParts[2]?.source?.type === 'base64'
  && typeof anthropicParts[2]?.source?.data === 'string',
  JSON.stringify(anthropicParts))
const geminiImg = serializeRequest(imageRequest, undefined, geminiProvider, images)
const geminiParts = geminiImg.contents[0].parts
check('gemini image part is inlineData', geminiParts[2]?.inlineData?.mimeType === 'image/png'
  && typeof geminiParts[2]?.inlineData?.data === 'string',
  JSON.stringify(geminiParts))
let refusedImage = false
try {
  serializeRequest(imageRequest, model, provider, undefined)
} catch {
  refusedImage = true
}
check('an unprepared image is REFUSED, not dropped', refusedImage)

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
