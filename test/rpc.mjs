/**
 * The plugin's host RPC channel must actually REGISTER.
 *
 * On this host line `connection.rpc.handle(channel, handler)` captures the
 * connection service's own context, which has no `webServer` injected, so it
 * throws `cannot get property "webServer" without inject` — and the effect
 * swallows the throw. The channel then never appears and the browser meets the
 * SPA fallback's 405, with nothing in the UI explaining why.
 *
 * This test asserts the plugin registers through the owner-taking overload and
 * that the registration really reaches the transport.
 */
import { Context } from '@deepseek-ai/cordis'
import * as plugin from '../lib/index.js'

let failures = 0
const check = (name, ok, detail) => {
  if (ok) console.log(`  ok   ${name}`)
  else { failures += 1; console.log(`  FAIL ${name}${detail === undefined ? '' : ` — ${detail}`}`) }
}

/** A connection stand-in recording how the channel was registered. */
const registrations = []
const connection = {
  // The advertised door — must NOT be used on this host line.
  rpc: {
    handle(channel, handler) {
      registrations.push({ via: 'rpc.handle', channel })
      return async () => {}
    },
  },
  // The overload the plugin must use, taking an explicit owner.
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

let mounted = false
try {
  await app.plugin(plugin, { providers: {} })
  mounted = true
  check('the plugin mounted', true)
} catch (error) {
  check('the plugin mounted', false, error.message)
}

if (mounted) {
  const viaHandle = registrations.filter(r => r.via === 'rpc.handle')
  const viaRegister = registrations.filter(r => r.via === 'register')

  check('the channel registered through register(owner, ...)', viaRegister.length === 1,
    JSON.stringify(registrations.map(r => r.via)))
  check('rpc.handle was NOT used', viaHandle.length === 0,
    `handle calls: ${viaHandle.length}`)
  check('the channel name is the plugin constant', viaRegister[0]?.channel === plugin.RPC_CHANNEL,
    `got ${viaRegister[0]?.channel} want ${plugin.RPC_CHANNEL}`)
  check('an explicit owner was passed (not undefined)', viaRegister[0]?.owner !== undefined)

  console.log('\nthe registered handler answers a real call')
  const handler = viaRegister[0]?.handler
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
}

console.log(`\n${failures === 0 ? 'ALL RPC CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
