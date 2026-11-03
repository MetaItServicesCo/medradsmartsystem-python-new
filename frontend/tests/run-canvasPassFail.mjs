/**
 * Compile src/utils/canvasPassFail.ts and run the checks against the output.
 *
 *   cd frontend && node tests/run-canvasPassFail.mjs
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '.build')
mkdirSync(outDir, { recursive: true })

const esbuild = join(here, '..', 'node_modules', 'esbuild', 'bin', 'esbuild')
execFileSync(process.execPath, [
  esbuild,
  join(here, '..', 'src', 'utils', 'canvasPassFail.ts'),
  '--bundle',
  '--format=esm',
  `--outfile=${join(outDir, 'canvasPassFail.mjs')}`,
], { stdio: 'inherit' })

await import(pathToFileURL(join(here, 'canvasPassFail.test.mjs')).href)
