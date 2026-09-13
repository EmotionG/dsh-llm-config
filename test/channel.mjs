/**
 * The host and client halves must agree on two different names:
 *
 *   - the SETTINGS namespace (dotted), used for settings and copy lookup;
 *   - the RPC CHANNEL (absolute path), used for the plugin's own host calls.
 *
 * Conflating them makes the browser POST to a channel nobody registered and
 * the web server answers 405. This checks the halves against each other rather
 * than against a hard-coded expectation, so a rename on one side alone fails.
 */
import { readFileSync } from 'node:fs'
import { RPC_CHANNEL, NS } from '../lib/index.js'

let failures = 0
const check = (name, ok, detail) => {
  if (ok) console.log(`  ok   ${name}`)
  else { failures += 1; console.log(`  FAIL ${name}${detail === undefined ? '' : ` — ${detail}`}`) }
}

const clientSource = readFileSync(new URL('../src/client/apply.ts', import.meta.url), 'utf8')

console.log('host exports a single channel constant')
check('RPC_CHANNEL is an absolute path', RPC_CHANNEL.startsWith('/'), RPC_CHANNEL)
check('RPC_CHANNEL is not the settings namespace', RPC_CHANNEL !== NS, RPC_CHANNEL)

console.log('\nthe host registers exactly that channel')
const hostSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
// The owner-taking overload, NOT rpc.handle: on this host line `handle`
// captures the connection service's own context, which has no `webServer`
// injected, and the swallowed throw leaves the browser meeting a 405.
check('host uses the owner-taking register(owner, channel, handler)',
  /registrar\.register\(\s*\n?\s*scoped,\s*\n?\s*RPC_CHANNEL,/.test(hostSource))
check('host injects webServer alongside connection',
  /ctx\.inject\(\['connection', 'webServer'\]/.test(hostSource))
// Assert against CODE, not prose: the file explains the rpc.handle trap in a
// comment, and that explanation must not read as a violation.
const hostCode = hostSource
  .split('\n')
  .filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line))
  .join('\n')
check('host does NOT use rpc.handle', !/rpc\.handle\(/.test(hostCode),
  'the owner-taking register is required on this host line')
check('host does not build the channel from NS',
  !/register\([^)]*`\/\$\{NS\}`/.test(hostSource))
check('the channel constant is exported for the client to match',
  /export const RPC_CHANNEL =/.test(hostSource))

console.log('\nthe client calls exactly that channel')
check('client declares an RPC_CHANNEL constant', /const RPC_CHANNEL = '\//.test(clientSource))
check('client calls through the constant',
  /rpc\.call\(RPC_CHANNEL, 'catalog-facts'/.test(clientSource))
check('client does not build the channel from a namespace',
  !/rpc\.call\(`\/\$\{/.test(clientSource))

console.log('\nthe two halves name the SAME channel')
const clientChannel = /const RPC_CHANNEL = '([^']+)'/.exec(clientSource)?.[1]
check('client channel equals the host channel', clientChannel === RPC_CHANNEL,
  `client=${clientChannel} host=${RPC_CHANNEL}`)

console.log('\nthe settings namespace stays dotted for the shell')
const clientNs = /const SETTINGS_NS = '([^']+)'/.exec(clientSource)?.[1]
check('client settings namespace is dotted', clientNs !== undefined && clientNs.includes('.'),
  String(clientNs))
check('settings namespace is used for locale binding',
  /locale\.bind\(SETTINGS_NS\)/.test(clientSource))
check('settings namespace is used for the slot locale seat',
  /locale: SETTINGS_NS,/.test(clientSource))

console.log(`\n${failures === 0 ? 'ALL CHANNEL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
