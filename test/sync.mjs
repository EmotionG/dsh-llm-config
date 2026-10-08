/**
 * Does a settings change actually reach the LLM registry at runtime?
 *
 * Under the 0.2 settings model the plugin's profile entry IS the namespace:
 * `providers` is declared `.volatile()`, the Loader commits a fresh snapshot
 * into that reference on every settings edit and then emits
 * `loader/volatile-update` on the owning fiber. This test drives exactly that
 * pair — parse the new section through the plugin's own `Config` schema, commit
 * it with `updateVolatile`, emit the event — so a missing listener or a
 * captured-once config is caught here instead of in the GUI.
 */
import { Context } from '@deepseek-ai/cordis'
import { updateVolatile } from '@deepseek-ai/cosmokit'
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

// A stand-in settings service exposing only what the 0.2 plugin asks of it:
// the automatic-page policy is switched off for this instance.
let configuredWith = null
app.provide('settings', {
  configure(presentation, owner) {
    configuredWith = { presentation, owner }
    return () => {}
  },
})

// The Loader parses raw config through the plugin's exported schema; capture
// the parsed object (and the owning context) so the test can commit into the
// SAME volatile reference the plugin reads.
let mounted = null
const wrapped = {
  Config: plugin.Config,
  inject: plugin.inject,
  apply(ctx, config) {
    mounted = { ctx, config }
    return plugin.apply(ctx, config)
  },
}

/** Commit one raw section the way the Loader does on a settings edit. */
function commit(section) {
  updateVolatile(mounted.config.providers, plugin.Config(section).providers)
  mounted.ctx.emit('loader/volatile-update', [['providers']])
}

console.log('mount with an EMPTY entry, as the profile loader does')
try {
  await app.plugin(wrapped, EMPTY)
  check('mounted', true)
} catch (error) {
  check('mounted', false, error.message)
}

if (mounted !== null) {
  check('the entry config exposes a volatile providers reference',
    typeof mounted.config.providers?.get === 'function')
  check('the automatic settings page is switched off for this entry',
    configuredWith?.presentation?.auto === false,
    JSON.stringify(configuredWith?.presentation))
  check('the policy is bound to the plugin fiber, not the injected child',
    configuredWith?.owner !== undefined && configuredWith.owner === mounted.ctx.fiber)

  check('an empty entry registers no route', llm.listProviders().length === 0,
    JSON.stringify(llm.listProviders().map(p => p.id)))

  console.log('\na committed settings section registers its routes')
  commit(SAVED)
  const after = llm.listProviders()
  check('the saved provider registers', after.some(p => p.id === 'zzzxin1'),
    JSON.stringify(after.map(p => p.id)))

  if (after.some(p => p.id === 'zzzxin1')) {
    const models = await llm.listModels('zzzxin1')
    check('its models are visible', models.length === 1, String(models.length))
  }

  console.log('\na later settings change re-syncs the registry')
  commit({
    providers: {
      zzzxin1: SAVED.providers.zzzxin1,
      second: {
        id: 'second', enabled: true, baseURL: 'https://second.example/v1',
        protocol: 'openai-chat', models: [],
      },
    },
  })
  const grown = llm.listProviders()
  check('the newly added provider registers', grown.some(p => p.id === 'second'),
    JSON.stringify(grown.map(p => p.id)))

  console.log('\nremoving a provider withdraws its route')
  commit({
    providers: {
      second: {
        id: 'second', enabled: true, baseURL: 'https://second.example/v1',
        protocol: 'openai-chat', models: [],
      },
    },
  })
  const shrunk = llm.listProviders()
  check('the removed provider is gone', !shrunk.some(p => p.id === 'zzzxin1'),
    JSON.stringify(shrunk.map(p => p.id)))
  check('the remaining provider stays', shrunk.some(p => p.id === 'second'),
    JSON.stringify(shrunk.map(p => p.id)))

  console.log('\na retry-policy change re-registers the route (the policy is captured at registration)')
  commit({
    providers: {
      second: {
        id: 'second', enabled: true, baseURL: 'https://second.example/v1',
        protocol: 'openai-chat', models: [], retry: 9,
      },
    },
  })
  check('the route survives the policy change',
    llm.listProviders().some(p => p.id === 'second'),
    JSON.stringify(llm.listProviders().map(p => p.id)))
  const policy = llm.providerRetryPolicy('second')
  check('the NEW policy is live', policy.mode === 'normal' && policy.maxRetries === 9,
    JSON.stringify(policy))

  console.log('\nan unconfigured route keeps the framework default policy')
  commit({
    providers: {
      second: {
        id: 'second', enabled: true, baseURL: 'https://second.example/v1',
        protocol: 'openai-chat', models: [], retry: undefined,
      },
    },
  })
  const defaultPolicy = llm.providerRetryPolicy('second')
  check('the framework default is normal/5',
    defaultPolicy.mode === 'normal' && defaultPolicy.maxRetries === 5,
    JSON.stringify(defaultPolicy))

  console.log('\na DISABLED provider withdraws its route but stays declared')
  commit({
    providers: {
      second: {
        id: 'second', enabled: false, baseURL: 'https://second.example/v1',
        protocol: 'openai-chat', models: [],
      },
    },
  })
  check('the disabled route is gone', !llm.listProviders().some(p => p.id === 'second'),
    JSON.stringify(llm.listProviders().map(p => p.id)))
  check('but it is still offered as a configurable provider',
    llm.listConfigurableProviders().some(e => e.provider === 'second'),
    JSON.stringify(llm.listConfigurableProviders().map(e => e.provider)))

  console.log('\nan invalid committed section is ignored, not fatal')
  commit({ providers: { broken: { id: 'broken', baseURL: 'not-a-url' } } })
  check('the bad section registers nothing',
    !llm.listProviders().some(p => p.id === 'broken'),
    JSON.stringify(llm.listProviders().map(p => p.id)))
}

console.log(`\n${failures === 0 ? 'ALL SYNC CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
