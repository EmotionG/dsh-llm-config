// Verify the plugin's peer declarations against the DESKTOP MARKET's own
// compatibility gate — the check that rejected the previous release with
// `... <0.1.6` while the desktop runtime is 0.2.0-rc.2.
//
// The runtime version is read from the copy of the desktop runtime manifest
// that `scripts/extract-runtime.mjs` pulls out of the installed app.asar, so
// this verifies against the ACTUAL desktop client rather than a guess.
//
// Usage: node scripts/check-market-compat.mjs
import { readFileSync } from 'node:fs'

const MARKET_MODULE = process.env.DSHMARKET_CHECK
  ?? 'file:///C:/Users/shanmai/.dsh/profiles/desktop/node_modules/dshmarket/lib/check.js'
const RUNTIME_MANIFEST = new URL('../.dsh-ref/runtime-package.json', import.meta.url)

const { satisfiesRange } = await import(MARKET_MODULE)
let runtimeManifest
try {
  runtimeManifest = JSON.parse(readFileSync(RUNTIME_MANIFEST, 'utf8'))
} catch {
  console.error(`missing ${RUNTIME_MANIFEST.pathname}\n`
    + 'run `node scripts/extract-runtime.mjs` first (it reads the installed desktop app.asar)')
  process.exit(1)
}
const runtimeVersion = runtimeManifest.version

console.log(`desktop runtime (@deepseek-ai/dsh-desktop-runtime ${runtimeVersion})`)

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const isDshPeer = peer => peer === '@deepseek-ai/dsh' || peer.startsWith('@deepseek-ai/dsh-')

let checked = 0
let failures = 0
for (const [peer, range] of Object.entries(manifest.peerDependencies ?? {})) {
  if (!isDshPeer(peer)) continue
  checked += 1
  // `includePrerelease` mirrors the host's own semantics: every published host
  // line is itself a prerelease, so the market evaluates with it on.
  const satisfied = satisfiesRange(runtimeVersion, range.trim(), { includePrerelease: true })
  console.log(`  ${satisfied ? 'ok  ' : 'FAIL'} ${peer} ${range}`)
  if (!satisfied) failures += 1
}

if (checked === 0) {
  console.log('\nno lockstep dsh peers declared — nothing to gate on')
  process.exit(1)
}
console.log(failures === 0
  ? `\nall ${checked} lockstep dsh peers accept the desktop runtime ${runtimeVersion}`
  : `\n${failures} peer(s) still exclude ${runtimeVersion}`)
process.exit(failures === 0 ? 0 : 1)
