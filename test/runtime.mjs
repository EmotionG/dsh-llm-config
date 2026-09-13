/**
 * Register the plugin's adapter with the REAL LlmRuntime and query it the way
 * DSH's model picker does. This is the check that actually answers "why can't
 * DSH find the model", rather than reasoning about it.
 */
import { LlmRuntime } from '@deepseek-ai/dsh-llm'
import { resolveConfig } from '../lib/config.js'
import { ConfigAdapter } from '../lib/adapter.js'

let failures = 0
const check = (name, ok, detail) => {
  if (ok) console.log(`  ok   ${name}`)
  else { failures += 1; console.log(`  FAIL ${name}${detail === undefined ? '' : ` — ${detail}`}`) }
}

const section = {
  providers: {
    zzzxin1: {
      id: 'zzzxin1', enabled: true, protocol: 'openai-chat',
      baseURL: 'https://zzzxin.xin/v1',
      models: [
        { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', inputModalities: ['text'] },
        { id: 'kimi-k3', name: 'Kimi K3', inputModalities: ['text'] },
      ],
    },
    off: { id: 'off', enabled: false, baseURL: 'https://off.example/v1', models: [] },
  },
}
const resolved = resolveConfig(section)
const registry = {
  get: id => resolved.providers.find(p => p.id === id),
  resolveApiKey: async () => 'k',
}

// Build a minimal host context: only what LlmRuntime reads.
const registered = []
const ctx = {
  llm: undefined,
  effect(fn) { return fn() },
  get() { return undefined },
  logger: { warn() {}, info() {} },
}
const runtime = new LlmRuntime(ctx)
ctx.llm = runtime
runtime.start?.()

console.log('real LlmRuntime registration')
const handle = runtime.registerAdapter(['zzzxin1'], new ConfigAdapter(registry, 'zzzxin1'))
check('registerAdapter returns a handle', handle !== undefined && typeof handle === 'function',
  typeof handle)
check('the handle carries replace()', typeof handle?.replace === 'function', typeof handle?.replace)

const providers = runtime.listProviders()
check('the route appears in listProviders()', providers.some(p => p.id === 'zzzxin1'),
  JSON.stringify(providers.map(p => p.id)))

console.log('\nwhat a model picker enumerates')
let listed = []
try {
  listed = await runtime.listModels('zzzxin1')
  check('listModels returns the configured models', listed.length === 2, String(listed.length))
  check('deepseek-v4-pro is offered', listed.some(m => m.id === 'deepseek-v4-pro'),
    JSON.stringify(listed.map(m => m.id)))
  check('kimi-k3 is offered', listed.some(m => m.id === 'kimi-k3'))
} catch (error) {
  check('listModels works through the runtime', false, error.message)
}

console.log('\nresolving one exact model through the runtime')
try {
  const info = await runtime.resolveModel('zzzxin1', 'kimi-k3')
  check('resolveModel returns the model', info.id === 'kimi-k3', info.id)
  check('it carries a context window', typeof info.context?.contextWindow === 'number')
} catch (error) {
  check('resolveModel works through the runtime', false, error.message)
}

console.log('\nreplacing the route set (the sync path)')
try {
  handle.replace(['zzzxin1'])
  check('replace() accepts the same route', true)
} catch (error) {
  check('replace() accepts the same route', false, error.message)
}

console.log('\ndisposal removes the route')
try {
  handle()
  const after = runtime.listProviders()
  check('disposed route is gone', !after.some(p => p.id === 'zzzxin1'),
    JSON.stringify(after.map(p => p.id)))
} catch (error) {
  check('disposal works', false, error.message)
}

console.log(`\n${failures === 0 ? 'ALL RUNTIME CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
