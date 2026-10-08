// Extract selected @deepseek-ai packages from the installed desktop runtime
// (app.asar) into a local reference tree so the plugin can be typechecked
// against the exact API surface the desktop client ships.
//
// Usage: node scripts/extract-runtime.mjs [outDir]

import fs from 'node:fs'
import path from 'node:path'

const ASAR = 'D:/app/DeepSeekHarness/resources/app.asar'
const OUT = process.argv[2] ?? '.dsh-ref'

const WANTED = [
  '@deepseek-ai/cordis',
  '@deepseek-ai/schemastery',
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-attachment',
  '@deepseek-ai/dsh-credentials',
  '@deepseek-ai/dsh-settings',
  '@deepseek-ai/dsh-client-connection',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-ui-renderer',
  '@deepseek-ai/dsh-client-ui-settings',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-api-remotes',
  '@deepseek-ai/dsh-launch-environment',
  '@deepseek-ai/dsh-scope',
  '@deepseek-ai/dsh-invariants',
  // The Responses wire shapes (request body + `response.*` event family) were
  // taken from the runtime's own Responses adapter, so keep it on hand.
  '@earendil-works/pi-ai',
]

function readHeader() {
  const fd = fs.openSync(ASAR, 'r')
  const head = Buffer.alloc(16)
  fs.readSync(fd, head, 0, 16, 0)
  const headerSize = head.readUInt32LE(12)
  const hb = Buffer.alloc(headerSize)
  fs.readSync(fd, hb, 0, headerSize, 16)
  fs.closeSync(fd)
  const json = JSON.parse(hb.slice(hb.indexOf(0x7b)).toString('utf8'))
  return { json, base: 16 + headerSize }
}

const { json: header, base } = readHeader()
const fd = fs.openSync(ASAR, 'r')

let files = 0
let bytes = 0

function walk(node, rel) {
  if (!node.files) {
    const buf = Buffer.alloc(Number(node.size))
    fs.readSync(fd, buf, 0, buf.length, base + Number(node.offset))
    const target = path.join(OUT, rel)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, buf)
    files += 1
    bytes += buf.length
    return
  }
  for (const [name, child] of Object.entries(node.files)) walk(child, path.join(rel, name))
}

for (const spec of WANTED) {
  // `@scope/name` is two levels deep in the runtime's node_modules tree.
  const parts = spec.split('/')
  let node = header.files.dsh?.files?.node_modules
  for (const part of parts) node = node?.files?.[part]
  if (!node) {
    console.log(`MISS ${spec}`)
    continue
  }
  walk(node, path.join('node_modules', ...parts))
}

// The runtime's own root package.json records the exact dependency set.
const rootPkg = header.files.dsh?.files?.['package.json']
if (rootPkg) {
  const buf = Buffer.alloc(Number(rootPkg.size))
  fs.readSync(fd, buf, 0, buf.length, base + Number(rootPkg.offset))
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(path.join(OUT, 'runtime-package.json'), buf)
}

fs.closeSync(fd)
console.log(`extracted ${files} files (${(bytes / 1024 / 1024).toFixed(1)} MiB) -> ${OUT}`)
