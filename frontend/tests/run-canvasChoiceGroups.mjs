/**
 * Compile src/utils/canvasChoiceGroups.ts and run the checks against the output.
 *
 *   cd frontend && node tests/run-canvasChoiceGroups.mjs
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '.build')
mkdirSync(outDir, { recursive: true })

const src = join(here, '..', 'src', 'utils').replace(/\\/g, '/')
const entry = join(outDir, 'canvasChoiceGroups.entry.ts')
writeFileSync(entry, `export { itemChoicePeers } from '${src}/canvasChoiceGroups'\nexport { canvasPassFail } from '${src}/canvasPassFail'\n`)

const esbuild = join(here, '..', 'node_modules', 'esbuild', 'bin', 'esbuild')
execFileSync(process.execPath, [
  esbuild,
  entry,
  '--bundle',
  '--format=esm',
  `--outfile=${join(outDir, 'canvasChoiceGroups.mjs')}`,
], { stdio: 'inherit' })

await import(pathToFileURL(join(here, 'canvasChoiceGroups.test.mjs')).href)
