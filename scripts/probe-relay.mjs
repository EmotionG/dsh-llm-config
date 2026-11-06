/**
 * Probe: what request body does this plugin actually put on the wire for a
 * relay model with a declared effort vocabulary?
 *
 * Intercepts globalThis.fetch, runs one streaming call through ConfigAdapter,
 * and prints the JSON body plus the relay's parsed reply.
 *
 * Usage: node scripts/probe-relay.mjs [model] [effort]
 */
import { resolveConfig } from '../lib/config.js'
import { ConfigAdapter } from '../lib/adapter.js'

const BASE = 'https://zzzxin.xin/v1'
const KEY = process.env.PROBE_KEY
if (!KEY) {
  console.error('set PROBE_KEY first (never paste the key into a committed file)')
  process.exit(2)
}
const model = process.argv[2] ?? 'deepseek-v4.1-flash-1017'
const effort = process.argv[3]

const provider = resolveConfig({
  providers: {
    probe: {
      id: 'probe',
      displayName: 'probe',
      enabled: true,
      protocol: 'openai-chat',
      baseURL: BASE,
      models: [{
        id: model,
        inputModalities: ['text'],
        reasoningEfforts: ['low', 'high', 'max'],
        defaultReasoningEffort: 'max',
        effort: { mode: 'field', field: 'reasoning_effort', values: ['low', 'high', 'max'], default: 'max' },
      }],
    },
  },
}).providers[0]

const adapter = new ConfigAdapter(
  { get: () => provider, resolveApiKey: async () => KEY },
  'probe',
)

const originalFetch = globalThis.fetch
let sentBody
globalThis.fetch = async (input, init) => {
  sentBody = typeof init?.body === 'string' ? init.body : String(init?.body ?? '')
  const res = await originalFetch(input, init)
  if (!res.ok) {
    const text = await res.clone().text()
    console.log('HTTP', res.status, text.slice(0, 400))
  }
  return res
}

console.log('model   :', model)
console.log('effort  :', effort ?? '(default from config)')

let text = ''
let reasoning = ''
try {
  for await (const chunk of adapter.stream({
    provider: 'probe',
    model,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    ...(effort === undefined ? {} : { reasoningEffort: effort }),
    maxTokens: 40,
  })) {
    if (chunk.type === 'text-delta') text += chunk.text
    if (chunk.type === 'reasoning-delta') reasoning += chunk.text
  }
} catch (error) {
  console.log('STREAM ERROR:', error?.code ?? '', error?.message ?? String(error))
} finally {
  globalThis.fetch = originalFetch
}

console.log('\n--- request body on the wire ---')
console.log(sentBody)
console.log('\n--- decoded ---')
try {
  console.log(JSON.stringify(JSON.parse(sentBody), null, 2))
} catch {
  console.log('(not JSON)')
}
console.log('\n--- reply ---')
console.log('reasoning:', reasoning.slice(0, 200))
console.log('text     :', text.slice(0, 200))
