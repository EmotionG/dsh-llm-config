/**
 * Catalog enrichment: fetch-then-choose, then apply as PURE DATA.
 *
 * Two defects this file exists to catch:
 *
 * 1. Counting fills inside a React state updater. The updater runs later
 *    (and twice under StrictMode), so the notice always read as 0.
 * 2. Silently adopting the first catalog publication of a model id. The same
 *    id is commonly listed by many platforms with different facts, so the
 *    page must offer a choice (defaulting to the first).
 */
import { readFileSync } from 'node:fs'

let failures = 0
const check = (name, ok, detail) => {
  if (ok) console.log(`  ok   ${name}`)
  else { failures += 1; console.log(`  FAIL ${name}${detail === undefined ? '' : ` — ${detail}`}`) }
}

const source = readFileSync(new URL('../src/client/ModelProvidersSection.tsx', import.meta.url), 'utf8')
const apply = /const applyCatalog = useCallback\(\(\) => \{[\s\S]*?\n  \}, \[/.exec(source)?.[0] ?? ''
const fetch = /const fetchCatalog = useCallback\(async[\s\S]*?\n  \}, \[/.exec(source)?.[0] ?? ''
const host = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
const adapter = readFileSync(new URL('../src/adapter.ts', import.meta.url), 'utf8')
const locale = readFileSync(new URL('../src/client/locale.ts', import.meta.url), 'utf8')

console.log('the fetch-then-choose handlers were located')
check('extracted fetchCatalog', fetch.length > 200, `${fetch.length} chars`)
check('extracted applyCatalog', apply.length > 200, `${apply.length} chars`)

console.log('\nfetch defaults to the first publication')
check('defaults chosen[id] to 0', /chosen\[id\] = 0/.test(fetch))
check('does not apply facts in fetchCatalog', !/setRows\(/.test(fetch))

console.log('\nno side effects inside a state updater')
const setRowsCalls = [...apply.matchAll(/setRows\(([\s\S]*?)\)\s*$/gm)].map(m => m[1])
check('setRows is present', /setRows\(/.test(apply))
check('no counter is incremented inside setRows',
  !setRowsCalls.some(body => /\bfilled\s*\+=/.test(body)),
  'a `filled += 1` inside an updater reads as 0 afterwards')

console.log('\nthe count is computed from pure data')
check('models are mapped into a local first', /const nextModels = row\.models\.map\(/.test(apply))
check('the counter increments on that local pass', /filled \+= 1/.test(apply))
const reportAt = apply.indexOf("t('catalogFilled'")
check('matched is derived before the reporting notice',
  apply.indexOf('const matched =') !== -1 && apply.indexOf('const matched =') < reportAt,
  `matched at ${apply.indexOf('const matched =')}, report at ${reportAt}`)

console.log('\napplying a chosen source writes catalog-owned fields')
check('writes the catalog name', /next\.name = fact\.name/.test(apply))
check('writes contextWindow', /next\.contextWindow = String\(fact\.contextWindow\)/.test(apply))
check('writes maxTokens', /next\.maxTokens = String\(fact\.maxTokens\)/.test(apply))
check('writes reasoningEfforts', /next\.reasoningEfforts = fact\.reasoningEfforts\.join/.test(apply))

console.log('\ninput modalities ARE applied')
check('writes inputModalities from the chosen facts',
  /next\.inputModalities = \[\.\.\.fact\.inputModalities\]/.test(apply))

console.log('\neffort comes from the catalog, never invented')
check('uses the catalog vocabulary', /next\.effortValues = fact\.reasoningEfforts\.join/.test(apply))
check('does not hardcode a shared vocabulary',
  !/\['low', 'medium', 'high'\]/.test(source) && !/\["low", "medium", "high"\]/.test(source))

console.log('\nthe chooser UI is present')
check('renders a select of catalog candidates', /list\.map\(\(c, ci\) =>/.test(source))
check('defaults the select to the chosen index', /value=\{String\(at\)\}/.test(source))
check('zh offers a source picker', /catalogTitle: '选择数据来源'/.test(locale))
check('en offers a source picker', /catalogTitle: 'Choose a source'/.test(locale))

console.log('\nthe host returns EVERY publication, not the first')
check('host calls fetchCatalogCandidates', /fetchCatalogCandidates\(modelIds, signal\)/.test(host))
check('host does not collapse to first-writer-wins',
  !/fetchCatalogFacts\(modelIds, signal\)/.test(host))
check('adapter collects every matching provider', /list\.push\(\{/.test(adapter))
check('adapter no longer skips later providers',
  !/if \(index\.has\(id\)\) continue/.test(adapter))

console.log(`\n${failures === 0 ? 'ALL ENRICH CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
