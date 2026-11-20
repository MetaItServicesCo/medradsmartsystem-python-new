/**
 * Compile src/utils/rentalTax.ts and run the checks against the output.
 *
 *   cd frontend && node tests/run-rentalTax.mjs
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
  join(here, '..', 'src', 'utils', 'rentalTax.ts'),
  '--bundle',
  '--format=esm',
  `--outfile=${join(outDir, 'rentalTax.mjs')}`,
], { stdio: 'inherit' })

await import(pathToFileURL(join(here, 'rentalTax.test.mjs')).href)
