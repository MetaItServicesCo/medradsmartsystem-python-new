/**
 * Compile src/utils/keyboardViewport.ts and check how the part of the screen
 * above a phone's keyboard is worked out.
 *
 *   cd frontend && node tests/run-keyboardViewport.mjs
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
  join(here, '..', 'src', 'utils', 'keyboardViewport.ts'),
  '--bundle',
  '--format=esm',
  '--log-level=warning',
  `--outfile=${join(outDir, 'keyboardViewport.mjs')}`,
], { stdio: 'inherit' })
const { visibleArea, installKeyboardViewport } = await import(pathToFileURL(join(outDir, 'keyboardViewport.mjs')).href)

let failures = 0
const ok = (label, condition, detail = '') => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail && !condition ? `  ${detail}` : ''}`)
  if (!condition) failures += 1
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

ok('no keyboard: the whole screen', same(visibleArea(844, { height: 844, offsetTop: 0, scale: 1 }), { height: 844, top: 0, keyboardOpen: false }))
ok('keyboard open: the part above it', same(visibleArea(844, { height: 470.4, offsetTop: 0, scale: 1 }), { height: 470, top: 0, keyboardOpen: true }))
ok('  and where it starts, if the phone scrolled the page up', same(visibleArea(844, { height: 470, offsetTop: 120.6, scale: 1 }), { height: 470, top: 121, keyboardOpen: true }))
ok('a browser bar hiding or showing is not a keyboard', visibleArea(844, { height: 790, offsetTop: 0, scale: 1 }).keyboardOpen === false)
ok('pinch zoom is not a keyboard, so windows keep their size', same(visibleArea(844, { height: 400, offsetTop: 200, scale: 2.1 }), { height: 844, top: 0, keyboardOpen: false }))
ok('no visual viewport (older browsers): the whole screen', same(visibleArea(844, null), { height: 844, top: 0, keyboardOpen: false }))

// Installing it: the styles get the visible area and the class, and follow the keyboard.
const pending = []
const flush = () => { while (pending.length) pending.shift()() }
const listeners = {}
const props = {}
const classes = new Set()
const viewport = { height: 844, offsetTop: 0, scale: 1, addEventListener: (t, f) => { listeners[t] = f }, removeEventListener: (t) => { delete listeners[t] } }
const win = {
  innerHeight: 844,
  visualViewport: viewport,
  document: { documentElement: { style: { setProperty: (k, v) => { props[k] = v } }, classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) } } },
  addEventListener: () => {},
  removeEventListener: () => {},
  // Like a browser: the frame runs later, not inside the call.
  requestAnimationFrame: f => { pending.push(f); return pending.length },
  cancelAnimationFrame: () => {},
}
const remove = installKeyboardViewport(win)
ok('installed: the full screen to start with', props['--visible-height'] === '844px' && !classes.has('keyboard-open'))
viewport.height = 460
listeners.resize()
flush()
ok('the keyboard opens: windows get the part above it', props['--visible-height'] === '460px' && classes.has('keyboard-open'))
viewport.height = 844
listeners.resize()
flush()
ok('the keyboard closes: back to the full screen', props['--visible-height'] === '844px' && !classes.has('keyboard-open'))
remove()
ok('removing it stops listening', !listeners.resize && !listeners.scroll)
ok('a browser without it is left alone', typeof installKeyboardViewport({ visualViewport: null }) === 'function')

console.log()
if (failures) {
  console.log(`${failures} check(s) failed`)
  process.exit(1)
}
console.log('All keyboard viewport checks passed')
