/**
 * The plugin's host RPC channel must actually REGISTER.
 *
 * On this host line `connection.rpc.handle(channel, handler)` takes
 * `owner = this.ctx` — the connection service's own context, which has no
 * `webServer` injected — and then runs
 * `owner.effect(() => owner.webServer.register(route))`, so it throws
 * `cannot get property "webServer" without inject`. The channel then never
 * appears and the browser meets the SPA fallback's 405, with nothing in the UI
 * explaining why.
 *
 * The plugin therefore attempts the public `rpc.handle` FIRST (so a host line
 * that fixes its owner context starts working with no change here) and falls
 * back to the owner-taking `register(owner, channel, handler)`. This test
 * covers BOTH host lines: the broken one that must reach the fallback, and a
 * fixed one that must use the public door.
 */
import { Context } from '@deepseek-ai/cordis'
import * as plugin from '../lib/index.js'

let failures = 0
const check = (name, ok, detail) => {
  if (ok) console.log(`  ok   ${name}`)
  else { failures += 1; console.log(`  FAIL ${name}${detail === undefined ? '' : ` — ${detail}`}`) }
}

/** The failure the real HostConnectionService raises through `rpc.handle`. */
const OWNER_ERROR = 'cannot get property "webServer" without inject'

/**
 * Mount the plugin over a connection stand-in and report how the channel was
 * registered.
 * @param handleWorks - whether the advertised `rpc.handle` door is usable.
 * @returns how each registration door was called.
 */
async function mount(handleWorks) {
  const registrations = []
  const connection = {
    rpc: {
      handle(channel, handler) {
        registrations.push({ via: 'rpc.handle', channel, handler })
        // The real service's getter throws synchronously before it registers.
        if (!handleWorks) throw new Error(OWNER_ERROR)
        return async () => {}
      },
    },
    register(owner, channel, handler) {
      registrations.push({ via: 'register', channel, owner, handler })
      return async () => {}
    },
  }

  const app = new Context()
  // The plugin injects `llm`, so it must exist or `apply` never runs.
  app.provide('llm', {
    registerAdapter: () => () => {},
    registerConfigurableProviders: () => ({ replace() {} }),
    registerModelDiscovery: () => {},
    listProviders: () => [],
  })
  app.provide('connection', connection)
  // `webServer` must exist for the inject to satisfy; its own shape is unused.
  app.provide('webServer', { register() { return () => {} } })

  await app.plugin(plugin, { providers: {} })
  return registrations
}

console.log('the 0.2.0-rc.2 host line falls back to the owner-taking register')
const broken = await mount(false)
const brokenFallback = broken.filter(r => r.via === 'register')
check('the channel registered through register(owner, ...)', brokenFallback.length === 1,
  JSON.stringify(broken.map(r => r.via)))
check('the channel name is the plugin constant',
  brokenFallback[0]?.channel === plugin.RPC_CHANNEL,
  `got ${brokenFallback[0]?.channel} want ${plugin.RPC_CHANNEL}`)
check('an explicit owner was passed (not undefined)', brokenFallback[0]?.owner !== undefined)

console.log('\nthe registered handler answers a real call')
const handler = brokenFallback[0]?.handler
if (typeof handler === 'function') {
  const unknown = await handler('nope', {}, new AbortController().signal)
  check('an unknown endpoint answers the error envelope', unknown.ok === false,
    JSON.stringify(unknown))

  const empty = await handler('catalog-facts', { modelIds: [] }, new AbortController().signal)
  check('an empty request answers success with no facts',
    empty.ok === true && Object.keys(empty.value).length === 0, JSON.stringify(empty))
} else {
  check('a handler was registered', false)
}

console.log('\na host line that fixes rpc.handle uses the public door')
const fixed = await mount(true)
check('rpc.handle registered the channel',
  fixed.filter(r => r.via === 'rpc.handle').length === 1,
  JSON.stringify(fixed.map(r => r.via)))
check('the fallback was NOT used when the public door works',
  fixed.filter(r => r.via === 'register').length === 0,
  JSON.stringify(fixed.map(r => r.via)))
check('the public door got the plugin constant',
  fixed[0]?.channel === plugin.RPC_CHANNEL, String(fixed[0]?.channel))

console.log(`\n${failures === 0 ? 'ALL RPC CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
