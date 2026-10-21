/**
 * Transport-contract checks: the adapter must issue its LLM requests through
 * the GLOBAL fetch (the property read at call time), because in-process
 * interceptors install themselves as accessor chains on `globalThis.fetch`.
 *
 * The motivating bug: billion-context's dsh-native lane claims model traffic
 * by rewriting globalThis.fetch (`Object.defineProperty(globalThis, 'fetch',
 * accessor)`), exactly like the chain simulated below. The adapter used to
 * import undici's fetch as a MODULE BINDING — a function value captured at
 * import time that no accessor on globalThis can ever intercept — so every
 * request this plugin issued was invisible to ACP compression, caching and
 * attribution ("no model request has arrived with this conversation id").
 *
 * The framework's own built-in provider (dsh-llm-deepseek) honors this
 * contract with `options.fetch ?? globalThis.fetch`; this check holds OUR
 * adapter to the same bar.
 */
import { createServer } from 'node:http'
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

console.log('transport contract: the adapter reads the global fetch at call time')

// A loopback provider that the adapter must reach for a streaming call.
let server
const port = await new Promise(resolve => {
  server = createServer((req, res) => {
    let raw = ''
    req.on('data', chunk => { raw += chunk })
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'ok' } }] })}\n\n`)
      res.write(`data: ${JSON.stringify({
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      })}\n\n`)
      res.write('data: [DONE]\n\n')
      res.end()
    })
  })
  server.listen(0, '127.0.0.1', () => resolve(server.address().port))
})

const provider = resolveConfig({
  providers: {
    loop: {
      id: 'loop', baseURL: `http://127.0.0.1:${port}/v1`,
      models: [{ id: 'm', inputModalities: ['text'] }],
    },
  },
}).providers[0]

// The bili-style interceptor: an accessor chain on globalThis.fetch that
// records every call it sees. The patch itself must be a property READ at
// call time, so `deepEqual`-style binding imports still bypass it — which is
// exactly the failure mode under test.
const seen = []
const originalFetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch')
const originalFetch = globalThis.fetch
const chainedFetch = async (input, init) => {
  const url = typeof input === 'string' ? input : String(input?.url ?? input ?? '')
  const headers = init?.headers ?? {}
  seen.push({ url, headers })
  return originalFetch(input, init)
}

// Install EXACTLY like installFetchChain does: defineProperty with an accessor.
Object.defineProperty(globalThis, 'fetch', {
  configurable: true,
  enumerable: originalFetchDescriptor?.enumerable ?? true,
  get: () => chainedFetch,
  set: () => { /* third-party installs are recorded by the real chain */ },
})

let restoreFailed = false
try {
  const adapter = new ConfigAdapter(
    { get: () => provider, resolveApiKey: async () => 'k' }, 'loop')
  let sawText = false
  for await (const chunk of adapter.stream({
    provider: 'loop', model: 'm',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
  })) {
    if (chunk.type === 'text-delta' && chunk.text.trim().length > 0) sawText = true
  }
  check('a streaming request completes through the interceptor chain', sawText === true)
  check('the interceptor SAW the adapter request', seen.length === 1, `${seen.length} seen`)
  if (seen.length > 0) {
    check('the interceptor saw the chat/completions URL',
      seen[0].url.includes('/chat/completions'), seen[0].url)
  }
} catch (error) {
  check('a streaming request completes through the interceptor chain', false,
    `${error?.code ?? ''}: ${error?.message ?? String(error)}`)
} finally {
  // Restore no matter what, so a failure here never poisons other tests.
  if (originalFetchDescriptor !== undefined) {
    Object.defineProperty(globalThis, 'fetch', originalFetchDescriptor)
  } else {
    delete globalThis.fetch
    globalThis.fetch = originalFetch
    restoreFailed = originalFetch !== globalThis.fetch
  }
}
check('the global fetch is restored after the run', restoreFailed === false)

await new Promise(resolve => server.close(resolve))

console.log(`\n${failures === 0 ? 'ALL TRANSPORT CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
