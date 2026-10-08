/**
 * OpenAI Responses wire format: request body AND stream translation.
 *
 * This protocol was previously wired only half-way — the request went to
 * `POST <baseURL>/responses` but the body was assembled as Chat Completions
 * (`messages` / `max_tokens`) and the SSE was parsed with the Chat Completions
 * event vocabulary (`choices[].delta`). Every check here fails on that shape,
 * so the file is the regression guard for the whole path.
 *
 * The expected shapes follow the desktop runtime's own Responses adapter
 * (`@earendil-works/pi-ai@0.87.1`, `dist/api/openai-responses*.js`).
 */
import { resolveConfig } from '../lib/config.js'
import { serializeRequest, requestUrl } from '../lib/serialize.js'
import { createTranslator } from '../lib/stream.js'

let failures = 0
const check = (name, ok, detail) => {
  if (ok) console.log(`  ok   ${name}`)
  else { failures += 1; console.log(`  FAIL ${name}${detail === undefined ? '' : ` — ${detail}`}`) }
}

const provider = resolveConfig({
  providers: {
    r: {
      id: 'r', baseURL: 'https://r.example/v1', protocol: 'openai-responses',
      models: [{ id: 'gpt-5', inputModalities: ['text', 'image'] }],
    },
  },
}).providers[0]

console.log('request body is the Responses shape, not Chat Completions')
const simple = serializeRequest({
  provider: 'r', model: 'gpt-5',
  system: 'be brief',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
}, undefined, provider)
check('uses an `input` item list', Array.isArray(simple.input) && simple.messages === undefined,
  JSON.stringify(Object.keys(simple)))
check('the system prompt is the top-level `instructions`',
  simple.instructions === 'be brief' && !simple.input.some(i => i.role === 'system'),
  JSON.stringify(simple.instructions))
check('a user turn is a plain text item',
  simple.input[0].role === 'user' && simple.input[0].content === 'hi',
  JSON.stringify(simple.input[0]))
check('streams', simple.stream === true)

console.log('\ntool declarations are flattened')
const withTools = serializeRequest({
  provider: 'r', model: 'gpt-5',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
  tools: [{ name: 'read', description: 'd', parameters: { type: 'object' } }],
}, undefined, provider)
check('a tool is `{type:function, name, …}` with no `function` wrapper',
  withTools.tools[0].type === 'function' && withTools.tools[0].name === 'read'
  && withTools.tools[0].function === undefined,
  JSON.stringify(withTools.tools[0]))
check('the JSON schema rides as `parameters`',
  withTools.tools[0].parameters.type === 'object')

console.log('\nassistant turns become a SEQUENCE of items')
const history = {
  provider: 'r', model: 'gpt-5',
  messages: [
    { role: 'user', content: [{ type: 'text', text: 'go' }] },
    { role: 'assistant', content: [
      { type: 'text', text: 'calling' },
      { type: 'tool-call', id: 'call_1', name: 'read', arguments: '{"p":"/x"}' },
    ] },
    { role: 'tool', toolCallId: 'call_1', content: [{ type: 'text', text: 'ok' }] },
  ],
}
const replay = serializeRequest(history, undefined, provider)
check('an assistant text run is an `output_text` message item',
  replay.input[1].type === 'message' && replay.input[1].role === 'assistant'
  && replay.input[1].content[0].type === 'output_text',
  JSON.stringify(replay.input[1]))
check('a tool call is its own `function_call` item',
  replay.input[2].type === 'function_call' && replay.input[2].call_id === 'call_1'
  && replay.input[2].name === 'read' && replay.input[2].arguments === '{"p":"/x"}',
  JSON.stringify(replay.input[2]))
check('the optional item `id` is omitted (a foreign id fails pairing validation)',
  replay.input[2].id === undefined, JSON.stringify(replay.input[2].id))
check('a tool result is a `function_call_output` item keyed by call_id',
  replay.input[3].type === 'function_call_output' && replay.input[3].call_id === 'call_1'
  && replay.input[3].output === 'ok',
  JSON.stringify(replay.input[3]))

console.log('\nimages use the `input_image` part vocabulary')
const imgRef = { attachmentId: 'att_1', mediaType: 'image/png', bytes: 2, width: 4, height: 4 }
const versions = new Map([['att_1', {
  variantId: 'v', attachment: imgRef, data: new Uint8Array([1, 2, 3]), mediaType: 'image/png',
  bytes: 3, width: 4, height: 4, depth: 'uchar', space: 'srgb', hasAlpha: false,
}]])
const images = {
  versions,
  handle: () => 'att_1 (4x4)',
}
const pictorial = serializeRequest({
  provider: 'r', model: 'gpt-5',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'look' }, { type: 'image', attachment: imgRef }] }],
}, undefined, provider, images)
const userParts = pictorial.input[0].content
check('a user message with an image becomes a part list',
  Array.isArray(userParts), JSON.stringify(userParts))
check('text is `input_text`', userParts[0].type === 'input_text' && userParts[0].text === 'look')
check('the handle text is `input_text` too', userParts[1].type === 'input_text',
  JSON.stringify(userParts[1]))
check('the image is `input_image` with a STRING url',
  userParts[2].type === 'input_image' && typeof userParts[2].image_url === 'string'
  && userParts[2].image_url.startsWith('data:image/png;base64,'),
  JSON.stringify(userParts[2]).slice(0, 120))

console.log('\ntoken and sampling fields follow the Responses vocabulary')
const capped = serializeRequest({
  provider: 'r', model: 'gpt-5',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
  maxTokens: 4,
  stop: ['END'],
}, undefined, provider)
check('max_tokens is spelled `max_output_tokens`',
  capped.max_output_tokens !== undefined && capped.max_tokens === undefined,
  JSON.stringify(capped.max_output_tokens))
check('a cap below the API minimum of 16 is raised, not refused',
  capped.max_output_tokens === 16, String(capped.max_output_tokens))
check('there is NO `stop` field (the wire format has none)',
  capped.stop === undefined, JSON.stringify(capped.stop))

const effortModel = {
  id: 'gpt-5', protocol: 'openai-responses', inputModalities: ['text'],
  effort: { mode: 'field', field: 'reasoning.effort', values: ['low', 'high'], default: 'low' },
}
const reasoned = serializeRequest({
  provider: 'r', model: 'gpt-5', reasoningEffort: 'high',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
}, effortModel, provider)
check('reasoning effort rides the nested `reasoning.effort` path',
  reasoned.reasoning?.effort === 'high', JSON.stringify(reasoned.reasoning))

console.log('\nthe endpoint stays /responses')
check('url', requestUrl(provider, 'gpt-5', 'k', true) === 'https://r.example/v1/responses',
  requestUrl(provider, 'gpt-5', 'k', true))

console.log('\nstream translation: response.* event family')
const translator = createTranslator('openai-responses')
const feed = payload => translator.push(payload).chunks
check('completeness requires the terminal response event',
  translator.completed() === false)
const out = []
out.push(...feed(JSON.stringify({
  type: 'response.output_item.added', output_index: 0, item: { type: 'reasoning', id: 'rs_1' },
})))
out.push(...feed(JSON.stringify({
  type: 'response.reasoning_summary_text.delta', output_index: 0, delta: 'thinking',
})))
out.push(...feed(JSON.stringify({
  type: 'response.output_item.added', output_index: 1, item: { type: 'message', id: 'msg_1' },
})))
out.push(...feed(JSON.stringify({
  type: 'response.output_text.delta', output_index: 1, delta: 'Hello',
})))
out.push(...feed(JSON.stringify({
  type: 'response.output_item.done', output_index: 1,
  item: { type: 'message', id: 'msg_1', content: [{ type: 'output_text', text: 'Hello there' }] },
})))
out.push(...feed(JSON.stringify({
  type: 'response.completed',
  response: {
    id: 'resp_1', status: 'completed',
    usage: {
      input_tokens: 100, output_tokens: 20, total_tokens: 120,
      input_tokens_details: { cached_tokens: 40 },
      output_tokens_details: { reasoning_tokens: 5 },
    },
  },
})))
out.push(...translator.finish())

const reasoningBlock = out.find(c => c.type === 'block-end' && c.block.type === 'reasoning')
const textBlock = out.find(c => c.type === 'block-end' && c.block.type === 'text')
check('reasoning and text get DISTINCT block indexes',
  reasoningBlock.index !== textBlock.index,
  `${reasoningBlock.index} vs ${textBlock.index}`)
check('the reasoning summary is surfaced', reasoningBlock.block.text === 'thinking',
  JSON.stringify(reasoningBlock.block.text))
check('the done item is authoritative for text',
  textBlock.block.text === 'Hello there', JSON.stringify(textBlock.block.text))
const usageChunk = out.find(c => c.type === 'usage')
check('cache reads are subtracted out of input (counts stay disjoint)',
  usageChunk.usage.inputTokens === 60 && usageChunk.usage.cacheReadTokens === 40,
  JSON.stringify(usageChunk.usage))
check('reasoning tokens are reported',
  usageChunk.usage.reasoningTokens === 5, JSON.stringify(usageChunk.usage))
const finish = out.find(c => c.type === 'finish')
check('a completed response finishes as a stop', finish.reason.kind === 'stop',
  JSON.stringify(finish.reason))

console.log('\nstream translation: function calls')
const toolT = createTranslator('openai-responses')
const toolOut = []
toolOut.push(...toolT.push(JSON.stringify({
  type: 'response.output_item.added', output_index: 0,
  item: { type: 'function_call', id: 'fc_1', call_id: 'call_9', name: 'read', arguments: '' },
})).chunks)
toolOut.push(...toolT.push(JSON.stringify({
  type: 'response.function_call_arguments.delta', output_index: 0, delta: '{"p":',
})).chunks)
toolOut.push(...toolT.push(JSON.stringify({
  type: 'response.function_call_arguments.done', output_index: 0, arguments: '{"p":"/x"}',
})).chunks)
toolOut.push(...toolT.push(JSON.stringify({
  type: 'response.completed', response: { status: 'completed' },
})).chunks)
toolOut.push(...toolT.finish())
const callBlock = toolOut.find(c => c.type === 'block-end' && c.block.type === 'tool-call')
check('the tool-call block carries call_id, name and full arguments',
  callBlock.block.id === 'call_9' && callBlock.block.name === 'read'
  && callBlock.block.arguments === '{"p":"/x"}',
  JSON.stringify(callBlock.block))
check('hasToolCalls reports the call', toolT.hasToolCalls() === true)
check('a turn with a tool call finishes as tool-calls',
  toolOut.find(c => c.type === 'finish').reason.kind === 'tool-calls')

console.log('\nstream translation: terminal statuses')
const incomplete = createTranslator('openai-responses')
incomplete.push(JSON.stringify({ type: 'response.output_text.delta', output_index: 0, delta: 'x' }))
incomplete.push(JSON.stringify({
  type: 'response.incomplete',
  response: { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } },
}))
check('an output-cap truncation is max-tokens',
  incomplete.finish().find(c => c.type === 'finish').reason.kind === 'max-tokens')

const filtered = createTranslator('openai-responses')
filtered.push(JSON.stringify({
  type: 'response.incomplete',
  response: { status: 'incomplete', incomplete_details: { reason: 'content_filter' } },
}))
const filteredFinish = filtered.finish().find(c => c.type === 'finish')
check('a content filter is an error finish, NOT a retryable truncation',
  filteredFinish.reason.kind === 'error' && filteredFinish.reason.failure.code === 'INVALID_REQUEST',
  JSON.stringify(filteredFinish.reason))

const failed = createTranslator('openai-responses')
failed.push(JSON.stringify({
  type: 'response.failed',
  response: { status: 'failed', error: { code: 'server_error', message: 'boom' } },
}))
const failedFinish = failed.finish().find(c => c.type === 'finish')
check('a failed response carries a retryable error finish',
  failedFinish.reason.kind === 'error' && failedFinish.reason.failure.code === 'SERVER'
  && failedFinish.reason.failure.message.includes('boom'),
  JSON.stringify(failedFinish.reason))
check('a failing stream still counts as terminal', failed.completed() === true)

const refused = createTranslator('openai-responses')
const refusedOut = []
refusedOut.push(...refused.push(JSON.stringify({
  type: 'response.output_item.added', output_index: 0, item: { type: 'message', id: 'm' },
})).chunks)
refusedOut.push(...refused.push(JSON.stringify({
  type: 'response.refusal.delta', output_index: 0, delta: 'I cannot do that',
})).chunks)
refused.push(JSON.stringify({ type: 'response.completed', response: { status: 'completed' } }))
refusedOut.push(...refused.finish())
check('a refusal is surfaced as visible text, not dropped',
  refusedOut.find(c => c.type === 'block-end' && c.block.type === 'text').block.text
  === 'I cannot do that')

const done = createTranslator('openai-responses')
done.push('[DONE]')
check('[DONE] is accepted as terminal for gateways that append it', done.completed() === true)

const abandoned = createTranslator('openai-responses')
abandoned.push(JSON.stringify({ type: 'response.output_text.delta', output_index: 0, delta: 'half' }))
check('a stream that just ends is NOT complete (truncation gate holds)',
  abandoned.completed() === false)

console.log('\na gateway that omits response.output_item.added still yields content')
const terse = createTranslator('openai-responses')
const terseOut = []
terseOut.push(...terse.push(JSON.stringify({
  type: 'response.output_text.delta', output_index: 0, delta: 'no added event',
})).chunks)
terse.push(JSON.stringify({ type: 'response.completed', response: { status: 'completed' } }))
terseOut.push(...terse.finish())
const terseBlock = terseOut.find(c => c.type === 'block-end' && c.block.type === 'text')
check('the delta alone opens the text block',
  terseBlock?.block.text === 'no added event', JSON.stringify(terseBlock?.block))
check('and the block was announced for a live view',
  terseOut.some(c => c.type === 'block-start' && c.blockType === 'text'))

console.log('\nthe adapter routes the protocol end-to-end')
// The real request must leave with the Responses body: this is the defect the
// pure checks above encode, observed on the wire.
const { createServer } = await import('node:http')
const seen = []
const server = createServer((req, res) => {
  let raw = ''
  req.on('data', chunk => { raw += chunk })
  req.on('end', () => {
    seen.push({ url: req.url, body: JSON.parse(raw) })
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write(`data: ${JSON.stringify({ type: 'response.output_item.added', output_index: 0, item: { type: 'message', id: 'm' } })}\n\n`)
    res.write(`data: ${JSON.stringify({ type: 'response.output_text.delta', output_index: 0, delta: 'pong' })}\n\n`)
    res.write(`data: ${JSON.stringify({ type: 'response.completed', response: { status: 'completed', usage: { input_tokens: 3, output_tokens: 1, total_tokens: 4 } } })}\n\n`)
    res.end()
  })
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port

const { ConfigAdapter } = await import('../lib/adapter.js')
const loopProvider = resolveConfig({
  providers: {
    loop: {
      id: 'loop', baseURL: `http://127.0.0.1:${port}`, protocol: 'openai-responses',
      models: [{ id: 'gpt-5', inputModalities: ['text'] }],
    },
  },
}).providers[0]
const adapter = new ConfigAdapter(
  { get: () => loopProvider, resolveApiKey: async () => 'k', resolveAttachments: () => undefined },
  'loop')
const chunks = []
for await (const chunk of adapter.stream({
  provider: 'loop', model: 'gpt-5',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'ping' }] }],
})) chunks.push(chunk)

check('the request went to /responses', seen[0]?.url === '/responses', String(seen[0]?.url))
check('the body is the Responses shape', Array.isArray(seen[0]?.body.input)
  && seen[0]?.body.messages === undefined, JSON.stringify(Object.keys(seen[0]?.body ?? {})))
check('the streamed text reached the caller',
  chunks.some(c => c.type === 'block-end' && c.block.type === 'text' && c.block.text === 'pong'),
  JSON.stringify(chunks.filter(c => c.type === 'block-end').map(c => c.block)))
check('no second (EMPTY_RESPONSE) finish was appended after the protocol finish',
  chunks.filter(c => c.type === 'finish').length === 1,
  JSON.stringify(chunks.filter(c => c.type === 'finish').map(c => c.reason)))

await new Promise(resolve => server.close(resolve))

console.log(`\n${failures === 0 ? 'ALL RESPONSES CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
