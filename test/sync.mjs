/**
 * Does a settings change actually reach the LLM registry at runtime?
 *
 * The plugin mounts with an EMPTY composition entry and learns the saved
 * configuration through `installSection`'s `setSource`/`onChange`. If that
 * chain does not fire, the route is never registered and DSH's picker stays
 * empty even though the settings file is correct.
 */
import { Context } from '@deepseek-ai/cordis'
import { LlmRuntime } from '@deepseek-ai/dsh-llm'
import * as plugin from '../lib/index.js'

let failures = 0
const check = (name, ok, detail) => {
  if (ok) console.log(`  ok   ${name}`)
  else { failures += 1; console.log(`  FAIL ${name}${detail === undefined ? '' : ` — ${detail}`}`) }
}

const SAVED = {
  providers: {
    zzzxin1: {
      id: 'zzzxin1', enabled: true, baseURL: 'https://zzzxin.xin/v1',
      protocol: 'openai-chat',
      models: [{ id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', inputModalities: ['text'] }],
    },
  },
}
const EMPTY = { providers: {} }

const app = new Context()
const llm = new LlmRuntime(app)

// A stand-in settings provider that behaves like dsh-settings: register()
// resolves base+user, and installSection() hands the consumer a source thunk.
let currentValue = SAVED
const watchers = []
const settings = {
  register(ns, schema, options) {
    const scope = {
      get: () => currentValue,
      watch: (fn) => { watchers.push(fn); return () => {} },
      update: async () => {},
    }
    return scope
  },
  installSection(owner, ns, schema, entry, hooks) {
    const scope = this.register(ns, schema, { base: entry })
    hooks.setSource(() => scope.get())
    hooks.onChange()
    scope.watch(() => hooks.onChange())
  },
}
app.provide('settings', settings)

console.log('mount with an EMPTY entry, as the profile loader does')
let mounted = false
try {
  await app.plugin(plugin, EMPTY)
  mounted = true
  check('mounted', true)
} catch (error) {
  check('mounted', false, error.message)
}

if (mounted) {
  const after = llm.listProviders()
  check('a SAVED provider registers even though the entry was empty',
    after.some(p => p.id === 'zzzxin1'), JSON.stringify(after.map(p => p.id)))

  if (after.some(p => p.id === 'zzzxin1')) {
    const models = await llm.listModels('zzzxin1')
    check('its models are visible', models.length === 1, String(models.length))
  }

  console.log('\na later settings change re-syncs the registry')
  currentValue = {
    providers: {
      zzzxin1: SAVED.providers.zzzxin1,
      second: {
        id: 'second', enabled: true, baseURL: 'https://second.example/v1',
        protocol: 'openai-chat', models: [],
      },
    },
  }
  // `watch` invokes callbacks ASYNCHRONOUSLY, so drain the microtask queue.
  for (const fn of watchers) await fn()
  await new Promise(resolve => setTimeout(resolve, 0))
  const grown = llm.listProviders()
  check('the newly added provider registers', grown.some(p => p.id === 'second'),
    JSON.stringify(grown.map(p => p.id)))

  console.log('\nremoving a provider withdraws its route')
  currentValue = { providers: { second: currentValue.providers.second } }
  for (const fn of watchers) await fn()
  await new Promise(resolve => setTimeout(resolve, 0))
  const shrunk = llm.listProviders()
  check('the removed provider is gone', !shrunk.some(p => p.id === 'zzzxin1'),
    JSON.stringify(shrunk.map(p => p.id)))
  check('the remaining provider stays', shrunk.some(p => p.id === 'second'),
    JSON.stringify(shrunk.map(p => p.id)))

  console.log('\na retry-policy change re-registers the route (the policy is captured at registration)')
  currentValue = {
    providers: {
      second: {
        ...currentValue.providers.second,
        retry: 9,
      },
    },
  }
  for (const fn of watchers) await fn()
  await new Promise(resolve => setTimeout(resolve, 0))
  check('the route survives the policy change',
    llm.listProviders().some(p => p.id === 'second'),
    JSON.stringify(llm.listProviders().map(p => p.id)))
  const policy = llm.providerRetryPolicy('second')
  check('the NEW policy is live', policy.mode === 'normal' && policy.maxRetries === 9,
    JSON.stringify(policy))

  console.log('\nan unconfigured route keeps the framework default policy')
  currentValue = {
    providers: {
      second: { ...currentValue.providers.second, retry: undefined },
    },
  }
  for (const fn of watchers) await fn()
  await new Promise(resolve => setTimeout(resolve, 0))
  const defaultPolicy = llm.providerRetryPolicy('second')
  check('the framework default is normal/5',
    defaultPolicy.mode === 'normal' && defaultPolicy.maxRetries === 5,
    JSON.stringify(defaultPolicy))
}

console.log(`\n${failures === 0 ? 'ALL SYNC CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
