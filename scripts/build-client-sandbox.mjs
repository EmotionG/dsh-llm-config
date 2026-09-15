/**
 * Sandbox-compatible client build driver.
 *
 * The DSH pwsh sandbox denies child-process spawns whose stdio is piped
 * (EPERM), which is exactly how esbuild's default long-lived service talks to
 * its binary. The `ESBUILD_WORKER_THREADS=0`-proof workaround: run esbuild's
 * CLI binary directly with INHERITED stdio through a single `execFileSync`
 * call — same arguments the JS API would pass, no service channel needed.
 */
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const exe = pathToFileURL('./node_modules/@esbuild/win32-x64/esbuild.exe').pathname
  .replace(/^\//, '')

const args = [
  'src/client/index.ts',
  '--bundle',
  '--format=cjs',
  '--platform=browser',
  '--target=es2022',
  '--jsx=automatic',
  '--outfile=lib/client.js',
  '--sourcemap',
  '--legal-comments=none',
  '--external:react',
  '--external:react/jsx-runtime',
  '--external:react-dom',
  '--external:react-dom/client',
  `--define:process.env.NODE_ENV=${JSON.stringify(JSON.stringify(process.env.NODE_ENV ?? 'production'))}`,
  `--define:import.meta.env.MODE=${JSON.stringify(JSON.stringify(process.env.NODE_ENV ?? 'production'))}`,
  `--define:import.meta.env=${JSON.stringify(JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }))}`,
]

// Banner/footer carry the module-loader closure; esbuild's CLI takes inline
// text after `--banner:js=`. A multi-line banner works fine as one arg on
// Windows because execFileSync passes argv directly (no shell re-quoting).
import { readFileSync } from 'node:fs'
const banner = [
  'window.__ModuleLoader__.load({ id: "dsh-llm-config", factory: (require) => {',
  'var module = { exports: {} }; var exports = module.exports;',
].join('\n')
const footer = 'return module.exports; } });'
args.push(`--banner:js=${banner}`, `--footer:js=${footer}`)

try {
  execFileSync(exe, args, { stdio: 'inherit', shell: false })
  console.log('dsh-llm-config: wrote lib/client.js')
} finally {
  // nothing to clean up with inline banner text
}
