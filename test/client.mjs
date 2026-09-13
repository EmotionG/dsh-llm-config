/**
 * Client-half checks for the remote-response contracts.
 *
 * These cover the two defects that made the page useless despite saving
 * correctly: reading `described.namespaces` off a result that is actually
 * `{ok, value:{namespaces}}`, and reading `result.models` where the remote
 * returns `{ok, value: DiscoveredModel[]}`. Both are pure shape checks.
 */
import { readFileSync } from 'node:fs'

let failures = 0
const check = (name, ok, detail) => {
  if (ok) {
    console.log(`  ok   ${name}`)
  } else {
    failures += 1
    console.log(`  FAIL ${name}${detail === undefined ? '' : ` — ${detail}`}`)
  }
}

const source = readFileSync(new URL('../src/client/ModelProvidersSection.tsx', import.meta.url), 'utf8')
const applySource = readFileSync(new URL('../src/client/apply.ts', import.meta.url), 'utf8')

console.log('describe() unwrapping')
check('reads the {ok, value} envelope', /described\.ok !== true/.test(source))
check('reads namespaces OFF value', /described\.value\.namespaces\.find/.test(source))
check('never reads a bare .namespaces', !/\bdescribed\.namespaces/.test(source))
check('prefers the user layer for display', /section\.user \?\? section\.value/.test(source))

console.log('\ndiscoverModels() unwrapping')
check('reads the {ok, value} envelope', /result\.ok !== true/.test(source))
check('reads models OFF value', /result\.value \?\? \[\]/.test(source))
check('never reads a bare .models off the result', !/result\?\.models/.test(source))

console.log('\ndiscovery authenticates an UNSAVED provider')
check('sends the draft key when present', /request\.apiKey = draftKey/.test(source))
check('keeps typed keys out of the settings file', /draftKeys/.test(source))
check('KeyField reports drafts upward', /onDraft/.test(source))

console.log('\nsettings write contract')
check('uses path-addressed ops', /op: 'set', path: \['providers'\]/.test(source))
check('passes the revision for conflict detection', /mutateSettings\(NS, \[.*\], revision\)/.test(source))

console.log('\ncredentials write contract')
check('passes a bare reference string', /setCredential: \(ref, value\) => ctx\.remote\.credentials\.set\(ref as never, value\)/.test(applySource))

console.log('\nlayout contract')
check('root is a semantic section', /<section className="llmcfg-root"/.test(source))
check('root does not impose its own font-size', !/\.llmcfg-root \{[^}]*font-size/.test(applySource))
check('styles are fiber-scoped', /element\.remove\(\)/.test(applySource))

console.log('\nlocalization')
const localeSource = readFileSync(new URL('../src/client/locale.ts', import.meta.url), 'utf8')
check('declares its copy namespace', /'settings\.llm-config': keyof typeof zh/.test(localeSource))
check('has nsNotRegistered in zh', /nsNotRegistered: '设置命名空间/.test(localeSource))
check('has nsNotRegistered in en', /nsNotRegistered: 'settings namespace/.test(localeSource))
check('asks before removing a model', /window\.confirm\(t\('confirmRemoveModel'/.test(source))
check('asks before removing a provider', /window\.confirm\(t\('confirmRemoveProvider'/.test(source))

console.log(`\n${failures === 0 ? 'ALL CLIENT CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
