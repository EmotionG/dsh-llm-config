/**
 * Desktop-client compatibility contract (DSH 0.2.0-rc.2).
 *
 * The runtime this plugin targets is the one bundled in the DeepSeek Harness
 * desktop client. Three things must hold for it to load and to be editable
 * there, and none of them is visible from the TypeScript build alone:
 *
 *  1. The host entry must export `Config`, `apply` and `inject` — the Loader
 *     reads `Config` to register the entry's schema.
 *  2. `Config` must carry at least one VOLATILE field at a fixed object path:
 *     `SettingsForms.volatileForm` returns `undefined` for a schema without
 *     one, and every settings write then throws "has no volatile fields" — the
 *     page could render but never save.
 *  3. The browser half must be a `__ModuleLoader__` closure factory whose
 *     `require` calls name only modules the client's shared table provides.
 */
import { readFileSync } from 'node:fs'
import z from '@deepseek-ai/schemastery'
import * as plugin from '../lib/index.js'

let failures = 0
const check = (name, ok, detail) => {
  if (ok) console.log(`  ok   ${name}`)
  else { failures += 1; console.log(`  FAIL ${name}${detail === undefined ? '' : ` — ${detail}`}`) }
}

console.log('host entry exports the Loader contract')
check('exports apply', typeof plugin.apply === 'function')
check('exports inject', Array.isArray(plugin.inject))
check('declares llm as a hard dependency', plugin.inject.includes('llm'))
check('exports Config as a schema', typeof plugin.Config === 'function'
  && typeof plugin.Config.toJSON === 'function')
check('exports the settings namespace', typeof plugin.NS === 'string' && plugin.NS.length > 0)

console.log('\nConfig exposes a volatile field the settings service can write')
// Inspect the LIVE schema: `toJSON()` returns the serialized envelope
// (`{uid, refs}`), while `volatileForm` walks the schema's own `dict`/`meta`.
const providers = plugin.Config.dict?.providers
check('providers is a declared Config field', providers !== undefined,
  JSON.stringify(Object.keys(plugin.Config.dict ?? {})))
check('providers is volatile (else every write throws "has no volatile fields")',
  providers?.meta?.volatile === true, JSON.stringify(providers?.meta))
check('volatile sits at a FIXED object path (required by validateVolatileSchema)',
  plugin.Config.meta?.volatile !== true)
check('the schema serializes and rehydrates for the settings form', (() => {
  // `SettingsForms.plainSchema` does exactly this round-trip before projecting
  // a form, so a schema that serializes without its volatile metadata would
  // silently produce an uneditable page.
  const envelope = plugin.Config.toJSON()
  const back = new z(envelope)
  return Object.keys(back.dict ?? {}).length > 0
    && back.dict?.providers?.meta?.volatile === true
})())
check('schema(entry) is accepted (the settings service checks for toJSON)',
  'toJSON' in plugin.Config)

const parsed = plugin.Config({ providers: {} })
check('the parsed entry config exposes providers.get()',
  typeof parsed.providers?.get === 'function')
check('an empty entry parses to an empty provider dict',
  JSON.stringify(parsed.providers.get()) === '{}', JSON.stringify(parsed.providers.get()))

const filled = plugin.Config({
  providers: { p: { id: 'p', baseURL: 'https://p.example/v1' } },
})
check('a stored provider survives the entry schema',
  filled.providers.get()?.p?.id === 'p', JSON.stringify(filled.providers.get()))

console.log('\nthe browser half is a module-loader closure factory')
const client = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
check('registers itself with __ModuleLoader__',
  /window\.__ModuleLoader__\.load\(\{\s*id: "dsh-llm-config"/.test(client)
  || /window\.__ModuleLoader__\.load\(\{ id: "dsh-llm-config"/.test(client))
check('is a factory receiving require()', /factory: \(require\) =>/.test(client))
check('returns its module exports', /return module\.exports; \} \}\);/.test(client))

// The shared module table the 0.2 web client installs. A require() outside it
// resolves to nothing and the whole browser half fails to load.
const SHARED = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
])
const required = [...client.matchAll(/require\("([^"]+)"\)/g)].map(m => m[1])
check('the browser half requires at least one shared module', required.length > 0)
for (const name of new Set(required)) {
  check(`require("${name}") is in the 0.2 shared table`, SHARED.has(name))
}

console.log('\nthe client manifest names the same module id')
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
check('dsh.client.platform is web', manifest.dsh?.client?.platform === 'web')
check('dsh.bundle.patch points at the bundle patch',
  manifest.dsh?.bundle?.patch === './cordis.patch.yml', String(manifest.dsh?.bundle?.patch))
check('the patch registers entry id llm-config',
  /- id: llm-config\s*\n\s*name: dsh-llm-config/.test(
    readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')))

console.log(`\n${failures === 0 ? 'ALL COMPAT CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
