/**
 * Checks for the building wizard's structure logic.
 *
 * Runs with no test framework, because the project has none:
 *
 *   npx esbuild src/pages/Locations/wizardModel.check.ts --bundle \
 *     --platform=node --alias:@=./src --outfile=.wizard-check.cjs \
 *     && node .wizard-check.cjs
 *
 * The situation modelled is the one that prompted edit mode: a building
 * already set up with a basement and a ground floor, opened again to add to it.
 */
import {
  DEPARTMENTS, generateRows, loadExisting, type ExistingNode,
} from './wizardModel'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed += 1
  console.log(`ok  ${name}`)
}
function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message)
}

const B = 'Building A'

/** Building A as the wizard would have left it after a first run. */
function existingBuilding(): ExistingNode[] {
  let id = 100
  const node = (code: string, type: string, name: string, extra: Partial<ExistingNode> = {},
                children: ExistingNode[] = []): ExistingNode =>
    ({ id: id++, code, location_type: type, name, children, ...extra })

  return [
    node(`${B}-B1`, 'floor', 'Basement'),
    node(`${B}-00`, 'floor', 'Ground Floor', {}, [
      node(`${B}-00-ED`, 'wing', 'Emergency', {}, [
        node('ED-0001', 'room', 'Treatment bay 1', { space_use: 'emergency', bed_count: 1 }, [
          node('ED-0001-A', 'bed', 'Bed A'),
        ]),
        node('ED-0002', 'room', 'Treatment bay 2', { space_use: 'emergency', bed_count: 1 }, [
          node('ED-0002-A', 'bed', 'Bed A'),
        ]),
      ]),
      // A custom department from an earlier run: not a preset.
      node(`${B}-00-RECE`, 'wing', 'Reception', {}, [
        node('DESK-0001', 'room', 'Front desk 1', { space_use: 'public' }),
      ]),
      // Added by hand under a different numbering scheme.
      node(`${B}-00-IT`, 'wing', 'IT and Communications', {}, [
        node('DC-1', 'room', 'Main server room', { space_use: 'data' }),
      ]),
    ]),
  ]
}

check('loading an existing building recognises its floors and departments', () => {
  const loaded = loadExisting(B, existingBuilding())
  assert(loaded.floors.length === 2, `expected 2 floors, got ${loaded.floors.length}`)
  const ground = loaded.floors.find((f) => f.code === `${B}-00`)!
  assert(ground.existing, 'ground floor should be marked existing')
  assert(ground.depts.includes('emergency'), 'Emergency should match its preset')
  assert(ground.existingCounts!['emergency:bay'] === 2, 'two treatment bays already exist')
  // Custom and hand-made departments come back as themselves, not dropped.
  assert(ground.depts.length === 3, `expected 3 departments, got ${ground.depts.length}`)
  assert(loaded.customDepts.some((d) => d.label === 'Reception'),
    'the custom Reception department must survive a reload')
})

check('opening an existing building and changing nothing sends nothing', () => {
  const loaded = loadExisting(B, existingBuilding())
  const all = [...DEPARTMENTS, ...loaded.customDepts]
  const rows = generateRows(loaded.floors, B, all, loaded.customRooms, loaded.taken)
  // The failure this guards against is a second run re-sending every room and
  // overwriting names somebody changed since.
  assert(rows.length === 0, `expected no rows, got ${rows.length}: ${rows.map((r) => r.code).join(', ')}`)
})

check('adding a room to an existing department numbers on and sends only it', () => {
  const loaded = loadExisting(B, existingBuilding())
  const ground = loaded.floors.find((f) => f.code === `${B}-00`)!
  ground.counts['emergency:bay'] = 3
  const rows = generateRows(loaded.floors, B, [...DEPARTMENTS, ...loaded.customDepts],
    loaded.customRooms, loaded.taken)
  const codes = rows.map((r) => r.code)
  assert(codes.join() === 'ED-0003,ED-0003-A', `got ${codes.join(', ')}`)
  // It hangs off the department that is already there, by its real code.
  assert(rows[0].parent_code === `${B}-00-ED`, `parent was ${rows[0].parent_code}`)
})

check('a hand-numbered room is not collided with or double counted', () => {
  const loaded = loadExisting(B, existingBuilding())
  const ground = loaded.floors.find((f) => f.code === `${B}-00`)!
  const key = Object.keys(ground.existingCounts!).find((k) => k.startsWith('it:'))!
  assert(ground.existingCounts![key] === 1, 'the hand-made DC-1 counts as one')
  ground.counts[key] = 2
  const rows = generateRows(loaded.floors, B, [...DEPARTMENTS, ...loaded.customDepts],
    loaded.customRooms, loaded.taken)
  assert(rows.length === 1, `expected one new room, got ${rows.length}`)
  assert(rows[0].code !== 'DC-1', 'must not reuse the existing code')
})

check('adding a department to an existing floor creates it under that floor', () => {
  const loaded = loadExisting(B, existingBuilding())
  const ground = loaded.floors.find((f) => f.code === `${B}-00`)!
  ground.depts.push('radiology')
  ground.counts['radiology:xray'] = 2
  const rows = generateRows(loaded.floors, B, [...DEPARTMENTS, ...loaded.customDepts],
    loaded.customRooms, loaded.taken)
  const wing = rows.find((r) => r.location_type === 'wing')!
  assert(wing && wing.code === `${B}-00-RAD` && wing.parent_code === `${B}-00`,
    `wing was ${wing?.code} under ${wing?.parent_code}`)
  assert(rows.filter((r) => r.parent_code === `${B}-00-RAD`).length === 2, 'two x-ray rooms')
  assert(!rows.some((r) => r.location_type === 'floor'), 'must not re-send the floor')
})

check('new floors continue from the highest level and basement', () => {
  const loaded = loadExisting(B, existingBuilding())
  assert(loaded.nextLevel === 1, `next level should be 1, got ${loaded.nextLevel}`)
  assert(loaded.nextBasement === 2, `next basement should be B2, got B${loaded.nextBasement}`)
})

check('a fresh building still produces its whole structure', () => {
  const loaded = loadExisting(B, [])
  assert(loaded.floors.length === 0, 'nothing to load')
  const floors = [{ code: `${B}-00`, name: 'Ground Floor', depts: ['surgery'],
                    counts: { 'surgery:or': 2 } }]
  const rows = generateRows(floors, B, DEPARTMENTS, {}, loaded.taken)
  assert(rows.map((r) => r.location_type).join() === 'floor,wing,room,room',
    `got ${rows.map((r) => r.location_type).join(', ')}`)
})

console.log(`\n${passed} checks passed`)
