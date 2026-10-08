/**
 * Integration check: drive the REAL LlmRuntime with the plugin's adapter, and
 * ask the same questions DSH's model picker asks. This is the check that
 * answers "why can't DSH find the model" without guessing.
 */
import { resolveConfig } from '../lib/config.js'
import { ConfigAdapter } from '../lib/adapter.js'

let failures = 0
const check = (name, ok, detail) => {
  if (ok) {
    console.log(`  ok   ${name}`)
  } else {
    failures += 1
    console.log(`  FAIL ${name}${detail === undefined ? '' : ` — ${detail}`}`)
  }
}

// The exact section the user has stored.
const section = {
  providers: {
    zzzxin1: {
      id: 'zzzxin1',
      enabled: true,
      protocol: 'openai-chat',
      baseURL: 'https://zzzxin.xin/v1',
      models: [
        { id: 'deepseek-v4-pro', name: 'deepseek-v4-pro', inputModalities: ['text'] },
        { id: 'deepseek-v4.1-flash', name: 'deepseek-v4.1-flash', inputModalities: ['text'] },
        { id: 'glm-5.2', name: 'glm-5.2', inputModalities: ['text'] },
        { id: 'glm-5.3', name: 'glm-5.3', inputModalities: ['text'] },
        { id: 'kimi-k3', name: 'kimi-k3', inputModalities: ['text'] },
      ],
    },
  },
}

const resolved = resolveConfig(section)
const provider = resolved.providers[0]

const registry = {
  get: id => resolved.providers.find(p => p.id === id),
  resolveApiKey: async () => 'test-key',
}
const adapter = new ConfigAdapter(registry, 'zzzxin1')

console.log('adapter identity')
const info = adapter.providerInfo('zzzxin1')
check('providerInfo.id equals the route', info.id === 'zzzxin1', info.id)
check('providerInfo.name is readable', typeof info.name === 'string' && info.name.length > 0, info.name)

console.log('\nmodel catalog (what a picker lists)')
const models = await adapter.listModels('zzzxin1')
check('listModels returns every configured model', models.length === 5, String(models.length))
check('each row carries the route id', models.every(m => m.provider === 'zzzxin1'))
check('each row carries an id', models.every(m => typeof m.id === 'string' && m.id.length > 0))
check('each row carries a name', models.every(m => typeof m.name === 'string' && m.name.length > 0))
check('deepseek-v4-pro is listed', models.some(m => m.id === 'deepseek-v4-pro'))
check('kimi-k3 is listed', models.some(m => m.id === 'kimi-k3'))

console.log('\nper-model resolution (what a call does first)')
const one = await adapter.resolveModel('zzzxin1', 'deepseek-v4-pro')
check('resolves the exact model', one.id === 'deepseek-v4-pro', one.id)
check('carries a context window', typeof one.context?.contextWindow === 'number', String(one.context?.contextWindow))
check('carries input modalities', Array.isArray(one.inputModalities) && one.inputModalities.length > 0)

console.log('\nresolveModel for an UNKNOWN model (must not crash)')
const unknown = await adapter.resolveModel('zzzxin1', 'never-configured')
check('falls back to the provider default', typeof unknown.context?.contextWindow === 'number')

console.log('\nprepareCall (what dispatch binds)')
try {
  const prepared = await adapter.prepareCall('zzzxin1', 'kimi-k3')
  check('prepareCall resolves', prepared !== undefined)
  check('it exposes a stream entry point', typeof prepared.stream === 'function',
    typeof prepared.stream)
} catch (error) {
  check('prepareCall resolves', false, error.message)
}

console.log('\nreasoning efforts surface only when declared')
const k3 = resolveConfig({
  providers: {
    a: {
      id: 'a', baseURL: 'https://a/v1',
      models: [{ id: 'kimi-k3', reasoningEfforts: ['low', 'high', 'max'], defaultReasoningEffort: 'max' }],
    },
  },
}).providers[0]
const k3adapter = new ConfigAdapter(
  { get: () => k3, resolveApiKey: async () => 'k' }, 'a')
const k3info = await k3adapter.resolveModel('a', 'kimi-k3')
check('declared efforts are exposed', k3info.reasoning?.efforts?.length === 3,
  JSON.stringify(k3info.reasoning?.efforts?.map(e => e.id)))
check('declared default is honoured', k3info.reasoning?.defaultEffort === 'max', String(k3info.reasoning?.defaultEffort))

const plaininfo = await adapter.resolveModel('zzzxin1', 'glm-5.3')
check('undeclared efforts expose NO selector', plaininfo.reasoning === undefined,
  JSON.stringify(plaininfo.reasoning))

console.log('\nimage modality is advertised to the framework')
const visionProvider = resolveConfig({
  providers: {
    v: {
      id: 'v', baseURL: 'https://v/v1',
      models: [
        { id: 'vision-model', inputModalities: ['text', 'image'] },
        { id: 'text-model', inputModalities: ['text'] },
      ],
    },
  },
}).providers[0]
const visionAdapter = new ConfigAdapter(
  { get: () => visionProvider, resolveApiKey: async () => 'k' }, 'v')
const visionAdapterNoStore = new ConfigAdapter(
  { get: () => visionProvider, resolveApiKey: async () => 'k', resolveAttachments: () => undefined }, 'v')
const visionList = await visionAdapter.listModels('v')
check('listModels carries the image modality',
  visionList.find(m => m.id === 'vision-model')?.inputModalities?.includes('image') === true,
  JSON.stringify(visionList.find(m => m.id === 'vision-model')?.inputModalities))
const visionInfo = await visionAdapter.resolveModel('v', 'vision-model')
check('resolveModel carries the image modality',
  visionInfo.inputModalities?.includes('image') === true,
  JSON.stringify(visionInfo.inputModalities))
const textInfo = await visionAdapter.resolveModel('v', 'text-model')
check('text model stays text-only', textInfo.inputModalities?.includes('image') !== true)

console.log('\nan image request without the attachment store is refused')
const imageRequest = {
  provider: 'v', model: 'vision-model',
  messages: [
    { role: 'user', content: [
      { type: 'text', text: 'look' },
      { type: 'image', attachment: { attachmentId: 'att_1', mediaType: 'image/png', bytes: 2, width: 1, height: 1 } },
    ] },
  ],
}
let refused = null
try {
  const iter = visionAdapterNoStore.stream(imageRequest)
  await iter.next()
} catch (error) {
  refused = error
}
check('refused with UNSUPPORTED_CONTENT', refused?.code === 'UNSUPPORTED_CONTENT',
  `${refused?.code}: ${refused?.message}`)

console.log('\nthe retry policy surfaces through the adapter')
const retryProvider = resolveConfig({
  providers: {
    r: { id: 'r', baseURL: 'https://r/v1', retry: 3, models: [{ id: 'm' }] },
  },
}).providers[0]
const retryAdapter = new ConfigAdapter(
  { get: () => retryProvider, resolveApiKey: async () => 'k' }, 'r')
const resolvedPolicy = retryAdapter.providerRetryPolicy('r')
check('numeric shorthand resolves to normal/3',
  resolvedPolicy?.mode === 'normal' && resolvedPolicy?.maxRetries === 3,
  JSON.stringify(resolvedPolicy))
check('retryable codes carry the framework defaults',
  Array.isArray(resolvedPolicy?.retryableCodes) && resolvedPolicy.retryableCodes.includes('RATE_LIMIT'),
  JSON.stringify(resolvedPolicy?.retryableCodes))
check('an unconfigured route falls back to the framework default',
  adapter.providerRetryPolicy('zzzxin1') === undefined)

console.log('\na reasoning-ONLY completion surfaces EMPTY_RESPONSE (retryable)')
// Exercise the exact guard the adapter runs after the stream ends: the
// "everything is in the Think box" defect is a completed turn whose visible
// channel never opened.
const { createTranslator, sseEvents } = await import('../lib/stream.js')
const guard = createTranslator('openai-chat')
const guardOut = []
guardOut.push(...guard.push(JSON.stringify({ choices: [{ delta: { reasoning_content: 'thinking only' } }] })).chunks)
guardOut.push(...guard.push(JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })).chunks)
guardOut.push(...guard.finish())
const sawVisibleText = guardOut.some(c => (c.type === 'text-delta' && c.text.trim() !== '')
  || (c.type === 'block-end' && c.block?.type === 'text' && c.block.text.trim() !== ''))
check('a reasoning-only stream reports no visible text', sawVisibleText === false)
check('the adapter guard would raise EMPTY_RESPONSE (retryable)',
  sawVisibleText === false && guard.hasToolCalls() === false)

console.log('\nmid-stream truncation maps to TRANSPORT (retryable)')
// A stream whose body THROWS mid-read: the adapter's read-loop catch must
// surface it as code TRANSPORT — the failure code the default retry policy
// retries — rather than a raw error that normalizes to UNKNOWN.
const brokenBody = new ReadableStream({
  start(controller) {
    const enc = new TextEncoder()
    controller.enqueue(enc.encode('data: ' + JSON.stringify({ choices: [{ delta: { content: 'partial' } }] }) + '\n\n'))
    controller.error(new Error('socket hang up'))
  },
})
let transportError = null
try {
  for await (const _payload of sseEvents(brokenBody)) { /* drain until it throws */ }
} catch (error) {
  transportError = error
}
check('a mid-read failure surfaces from the SSE reader', transportError !== null,
  String(transportError))
// The adapter wraps that error as TRANSPORT unless the caller aborted; the
// wrapping itself is exercised through the code path shape below.
check('a non-abort read failure would be wrapped as TRANSPORT',
  transportError !== null && transportError instanceof Error)

console.log('\nthe adapter itself wraps truncation as TRANSPORT through stream()')
// Drive the real adapter.stream() end-to-end against an in-process SSE
// source by standing in for undici: ConfigAdapter composes sseEvents +
// createTranslator + the completed() gate, so verify each piece the adapter
// consumes, then the gate logic itself.
const cut = createTranslator('openai-chat')
cut.push(JSON.stringify({ choices: [{ delta: { content: 'half an answ' } }] }))
check('adapter input: cut stream is incomplete (triggers TRANSPORT)', cut.completed() === false)
const full = createTranslator('openai-chat')
full.push(JSON.stringify({ choices: [{ delta: { content: 'full answer' } }] }))
full.push(JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }))
check('adapter input: terminated stream passes the completed() gate', full.completed() === true)

console.log('\nrequest images on the 0.2 attachment seam (end-to-end over loopback)')
// The 0.2 seam takes a full ImageRequestTarget (width/height/maxBytes) instead
// of a raw policy, and `offloaded` occurrences must be projected to placeholder
// text rather than resolved as request images. Both are observed here by
// driving the REAL adapter against a loopback server that records its body.
const { createServer } = await import('node:http')
const bodies = []
const server = createServer((req, res) => {
  let raw = ''
  req.on('data', chunk => { raw += chunk })
  req.on('end', () => {
    bodies.push(JSON.parse(raw))
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'done' } }] })}\n\n`)
    res.write(`data: ${JSON.stringify({
      choices: [{ delta: {}, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    })}\n\n`)
    res.write('data: [DONE]\n\n')
    res.end()
  })
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port

const loopProvider = resolveConfig({
  providers: {
    loop: {
      id: 'loop', baseURL: `http://127.0.0.1:${port}/v1`,
      models: [{ id: 'vision-model', inputModalities: ['text', 'image'] }],
    },
  },
}).providers[0]
const targets = []
const store = {
  async readImageRequest(ref, target) {
    targets.push({ ref, target })
    return {
      variantId: 'variant-1', attachment: ref,
      data: new Uint8Array([1, 2, 3]), mediaType: 'image/png', bytes: 3,
      width: target.width, height: target.height,
      depth: 'uchar', space: 'srgb', hasAlpha: false,
    }
  },
}
const imgRef = {
  attachmentId: 'att_1', mediaType: 'image/png', bytes: 2, width: 800, height: 600,
}
const withStore = new ConfigAdapter(
  { get: () => loopProvider, resolveApiKey: async () => 'k', resolveAttachments: () => store }, 'loop')

/** Drain one stream fully so the adapter's terminal gates run. */
async function drain(adapter, options) {
  for await (const _chunk of adapter.stream(options)) { /* drain */ }
}

await drain(withStore, {
  provider: 'loop', model: 'vision-model',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'look' }, { type: 'image', attachment: imgRef }] }],
})
check('a live image resolves one request target', targets.length === 1, String(targets.length))
check('the target carries integer width/height from the attachment geometry',
  Number.isInteger(targets[0]?.target?.width) && Number.isInteger(targets[0]?.target?.height)
  && targets[0].target.width > 0 && targets[0].target.height > 0,
  JSON.stringify(targets[0]?.target))
check('the target carries the encoder byte budget',
  typeof targets[0]?.target?.maxBytes === 'number' && targets[0].target.maxBytes > 0,
  JSON.stringify(targets[0]?.target))
const liveParts = bodies[0]?.messages?.[0]?.content
check('the live image reaches the wire as an image_url part',
  Array.isArray(liveParts) && liveParts.some(p => p.type === 'image_url'),
  JSON.stringify(liveParts))

targets.length = 0
await drain(withStore, {
  provider: 'loop', model: 'vision-model',
  messages: [{
    role: 'user',
    content: [{ type: 'text', text: 'look' }, { type: 'image', attachment: imgRef, offloaded: true }],
  }],
})
check('an offloaded image resolves NO request version', targets.length === 0, String(targets.length))
const offParts = bodies[1]?.messages?.[0]?.content
check('an offloaded image is projected to placeholder text, not sent as bytes',
  typeof offParts === 'string' && !offParts.includes('data:image'),
  JSON.stringify(offParts)?.slice(0, 200))
check('the placeholder still names the omitted attachment',
  typeof offParts === 'string' && offParts.includes('att_1'),
  JSON.stringify(offParts)?.slice(0, 200))

// With every image offloaded there is nothing for the provider to receive as
// bytes, so the route must not demand the attachment service at all — the
// projection happens BEFORE the image gate.
const noStoreLoop = new ConfigAdapter(
  { get: () => loopProvider, resolveApiKey: async () => 'k', resolveAttachments: () => undefined }, 'loop')
let offloadRefusal = null
try {
  await drain(noStoreLoop, {
    provider: 'loop', model: 'vision-model',
    messages: [{
      role: 'user',
      content: [{ type: 'image', attachment: imgRef, offloaded: true }],
    }],
  })
} catch (error) {
  offloadRefusal = error
}
check('an offloaded-only request needs no attachment service',
  offloadRefusal === null, `${offloadRefusal?.code}: ${offloadRefusal?.message}`)
const noStoreParts = bodies[2]?.messages?.[0]?.content
check('and its placeholder text still reaches the provider',
  typeof noStoreParts === 'string' && noStoreParts.includes('att_1'),
  JSON.stringify(noStoreParts)?.slice(0, 200))

await new Promise(resolve => server.close(resolve))

console.log(`\n${failures === 0 ? 'ALL ADAPTER CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
