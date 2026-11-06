/**
 * What does the plugin send when the CALL specifies nothing? The framework
 * materializes `maxTokens` from the model row, so this prints the body a normal
 * chat turn produces, with and without a UI-chosen effort.
 *
 * Usage: node scripts/probe-asdefault.mjs [model]
 */
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { resolveConfig } from '../lib/config.js'
import { ConfigAdapter } from '../lib/adapter.js'

const PATCH = 'C:/Users/shanmai/.dsh/profiles/desktop/cordis.patch.yml'
const modelId = process.argv[2] ?? 'glm-5.3'

const layers = parse(readFileSync(PATCH, 'utf8'))
const section = layers.find(l => l?.id === 'llm-config')?.config ?? { providers: {} }
const config = resolveConfig(section)
const provider = config.providers.find(p => p.models.some(m => m.id === modelId))
const model = provider.models.find(m => m.id === modelId)

const adapter = new ConfigAdapter({ get: () => provider, resolveApiKey: async () => 'k' }, provider.id)

async function body(effort) {
  const originalFetch = globalThis.fetch
  let sent
  globalThis.fetch = async (_input, init) => {
    sent = JSON.parse(String(init?.body ?? '{}'))
    throw new Error('probe-stop')
  }
  try {
    for await (const _ of adapter.stream({
      provider: provider.id,
      model: modelId,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      ...(effort === undefined ? {} : { reasoningEffort: effort }),
    })) { /* drain */ }
  } catch { /* expected */ } finally {
    globalThis.fetch = originalFetch
  }
  return sent
}

const info = await adapter.resolveModel(provider.id, modelId)
console.log(`model row      : maxTokens=${model.maxTokens} contextWindow=${model.contextWindow}`)
console.log(`resolved info  : defaultMaxTokens=${info.defaultMaxTokens} reasoning=${JSON.stringify(info.reasoning ?? null)}`)

// The framework materializes defaultMaxTokens before the adapter sees the call.
const defaulted = await body(undefined)
console.log('\ncall with no effort, framework default maxTokens applied:')
console.log(JSON.stringify({ ...defaulted, max_tokens: info.defaultMaxTokens }))

for (const effort of ['low', 'medium', 'high', 'max']) {
  console.log(`\ncall with effort=${effort}:`)
  console.log(JSON.stringify({ ...(await body(effort)), max_tokens: info.defaultMaxTokens }))
}
