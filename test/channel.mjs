/**
 * The host and client halves must agree on THREE different names:
 *
 *   - the RPC CHANNEL (absolute path), used for the plugin's own host calls;
 *   - the COPY namespace (dotted), used for locale lookup;
 *   - the SETTINGS namespace, which under the 0.2 settings model is the
 *     plugin's profile ENTRY ID and is pinned by cordis.patch.yml.
 *
 * Conflating them makes the browser POST to a channel nobody registered and
 * the web server answers 405, or read settings under a namespace nothing
 * declares. This checks the halves against each other rather than against a
 * hard-coded expectation, so a rename on one side alone fails.
 */
import { readFileSync } from 'node:fs'
import { RPC_CHANNEL, NS } from '../lib/index.js'

let failures = 0
const check = (name, ok, detail) => {
  if (ok) console.log(`  ok   ${name}`)
  else { failures += 1; console.log(`  FAIL ${name}${detail === undefined ? '' : ` — ${detail}`}`) }
}

const clientSource = readFileSync(new URL('../src/client/apply.ts', import.meta.url), 'utf8')
const pageSource = readFileSync(new URL('../src/client/ModelProvidersSection.tsx', import.meta.url), 'utf8')

console.log('host exports a single channel constant')
check('RPC_CHANNEL is an absolute path', RPC_CHANNEL.startsWith('/'), RPC_CHANNEL)
check('RPC_CHANNEL is not the settings namespace', RPC_CHANNEL !== NS, RPC_CHANNEL)

console.log('\nthe host registers exactly that channel')
const hostSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
// The rpc.handle attempt is tried first so a host line that fixes its owner
// context starts working automatically, but the owner-taking register(owner,
// channel, handler) MUST remain as the fallback: on 0.2.0-rc.2 `handle`
// captures the connection service's own context, which has no `webServer`
// injected, so it throws and the channel would silently never appear.
check('host uses the owner-taking register(owner, channel, handler)',
  /registrar\.register\(\s*scoped,\s*RPC_CHANNEL,\s*handler,?\s*\)/.test(hostSource))
check('host injects webServer alongside connection',
  /ctx\.inject\(\['connection', 'webServer'\]/.test(hostSource))
check('the owner-taking register is the FALLBACK, attempted after rpc.handle',
  hostSource.indexOf('rpc.handle(') !== -1
    && hostSource.indexOf('rpc.handle(') < hostSource.indexOf('registrar.register('))
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

console.log('\nthe settings namespace is the profile ENTRY ID')
const entryId = /- id: (\S+)\s*\n\s*name: dsh-llm-config/.exec(
  readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8'))?.[1]
const pageNs = /const NS = '([^']+)'/.exec(pageSource)?.[1]
check('the bundle patch pins an entry id', entryId !== undefined, String(entryId))
check('the host namespace equals the entry id', NS === entryId, `host=${NS} entry=${entryId}`)
check('the page namespace equals the entry id', pageNs === entryId, `page=${pageNs} entry=${entryId}`)

console.log('\nthe copy namespace stays dotted for the shell')
const copyNs = /const COPY_NS = '([^']+)'/.exec(clientSource)?.[1]
check('client copy namespace is dotted', copyNs !== undefined && copyNs.includes('.'),
  String(copyNs))
check('copy namespace is used for locale binding',
  /locale\.bind\(COPY_NS\)/.test(clientSource))
check('copy namespace is used for the slot locale seat',
  /locale: COPY_NS,/.test(clientSource))

console.log(`\n${failures === 0 ? 'ALL CHANNEL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
