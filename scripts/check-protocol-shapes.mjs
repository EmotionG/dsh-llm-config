/**
 * Protocol-shape check for the effort transport. `mode: thinking` writes
 * `{ type: <value> }` — which is only the right shape for a Kimi-style OpenAI
 * gateway. On Anthropic and Gemini the same setting produces a request those
 * APIs reject outright.
 *
 * Usage: node scripts/check-protocol-shapes.mjs
 */
import { resolveConfig } from '../lib/config.js'
import { ConfigAdapter } from '../lib/adapter.js'

async function wire(protocol, effort, value) {
  const provider = resolveConfig({
    providers: {
      p: {
        id: 'p',
        protocol,
        baseURL: 'http://127.0.0.1:1/v1',
        models: [{
          id: 'm',
          inputModalities: ['text'],
          reasoningEfforts: ['low', 'high', 'max'],
          defaultReasoningEffort: value,
          effort,
        }],
      },
    },
  }).providers[0]
  const adapter = new ConfigAdapter({ get: () => provider, resolveApiKey: async () => 'k' }, 'p')
  const originalFetch = globalThis.fetch
  let sent
  globalThis.fetch = async (_input, init) => {
    sent = JSON.parse(String(init?.body ?? '{}'))
    throw new Error('probe-stop')
  }
  try {
    for await (const _ of adapter.stream({
      provider: 'p',
      model: 'm',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }],
      reasoningEffort: value,
    })) { /* drain */ }
  } catch { /* expected */ } finally {
    globalThis.fetch = originalFetch
  }
  return sent
}

const THINKING = {
  mode: 'thinking',
  field: 'thinking',
  values: ['low', 'high', 'max'],
  default: 'max',
}
const FIELD = {
  mode: 'field',
  field: 'reasoning_effort',
  values: ['low', 'high', 'max'],
  default: 'max',
}

for (const protocol of ['openai-chat', 'openai-responses', 'anthropic-messages', 'google-gemini']) {
  console.log(`\n### ${protocol}`)
  const thinking = await wire(protocol, THINKING, 'max')
  console.log('  mode=thinking field=thinking ->', JSON.stringify(thinking))
  const field = await wire(protocol, FIELD, 'max')
  console.log('  mode=field reasoning_effort ->', JSON.stringify(field))
}
