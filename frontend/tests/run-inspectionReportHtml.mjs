/**
 * Bundle src/utils/inspectionReportHtml.ts for the browser and run the checks
 * against it in Node, with the few browser globals its API imports touch.
 *
 *   cd frontend && node tests/run-inspectionReportHtml.mjs
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
  join(here, '..', 'src', 'utils', 'inspectionReportHtml.ts'),
  '--bundle',
  '--format=esm',
  '--platform=browser',
  '--define:import.meta.env={}',
  '--log-level=warning',
  `--outfile=${join(outDir, 'inspectionReportHtml.mjs')}`,
], { stdio: 'inherit' })

const storage = { getItem: () => null, setItem() {}, removeItem() {} }
globalThis.window = globalThis
globalThis.localStorage = storage
globalThis.sessionStorage = storage
globalThis.document = { createElement: () => ({}) }
globalThis.location = { href: 'http://localhost/', protocol: 'http:', hostname: 'localhost', origin: 'http://localhost' }

await import(pathToFileURL(join(here, 'inspectionReportHtml.test.mjs')).href)
