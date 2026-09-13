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

console.log(`\n${failures === 0 ? 'ALL ADAPTER CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
