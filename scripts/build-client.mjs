/**
 * Build the browser half into lib/client.js as a closure-factory bundle:
 * `window.__ModuleLoader__.load({ id, factory: (require) => {...} })`, with
 * the module table supplying the platform externals (react + the jsx runtime).
 *
 * dsh type faces are imported type-only by the section, so they erase at
 * bundle time and never become require calls.
 */
import { build } from 'esbuild'

const ID = 'dsh-llm-config'

const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
]

await build({
  entryPoints: ['src/client/index.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  outfile: 'lib/client.js',
  sourcemap: true,
  legalComments: 'none',
  external: CLIENT_EXTERNALS,
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
  },
  banner: {
    js: [
      `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
      'var module = { exports: {} }; var exports = module.exports;',
    ].join('\n'),
  },
  footer: { js: 'return module.exports; } });' },
})

console.log(`${ID}: wrote lib/client.js`)
