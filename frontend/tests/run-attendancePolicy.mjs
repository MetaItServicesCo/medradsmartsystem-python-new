/**
 * Compile src/utils/attendancePolicy.ts and run the checks against the output.
 *
 *   cd frontend && node tests/run-attendancePolicy.mjs
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
  join(here, '..', 'src', 'utils', 'attendancePolicy.ts'),
  '--bundle',
  '--format=esm',
  `--outfile=${join(outDir, 'attendancePolicy.mjs')}`,
], { stdio: 'inherit' })

await import(pathToFileURL(join(here, 'attendancePolicy.test.mjs')).href)
