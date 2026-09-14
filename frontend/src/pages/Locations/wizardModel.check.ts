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
  DEPARTMENTS, fillPlan, generateRows, loadExisting, mergeRooms, sameItemName,
  type ExistingNode,
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

check('editing a preset room type replaces it rather than adding a second', () => {
  const admin = DEPARTMENTS.find((d) => d.key === 'admin')!
  const meeting = admin.rooms.find((r) => r.key === 'meeting')!
  const edited = { ...meeting, contents: [{ fixtureType: 'chair', label: 'Chair', count: 12 }] }
  const merged = mergeRooms(admin.rooms, [edited])
  assert(merged.filter((r) => r.key === 'meeting').length === 1,
    'two "Meeting rooms" would mean two counts for the same rooms')
  assert(merged.length === admin.rooms.length, `expected ${admin.rooms.length}, got ${merged.length}`)
  assert(merged.find((r) => r.key === 'meeting')!.contents?.length === 1, 'the edit must win')
})

check('a conference room arrives with chairs and tables and no beds', () => {
  const custom = {
    admin: [{
      key: 'custom-conf', label: 'Conference rooms', prefix: 'CONF', spaceUse: 'Conference Room',
      beds: 0,
      contents: [
        { fixtureType: 'chair', label: 'Chair', count: 12 },
        { fixtureType: 'table', label: 'Table', count: 2 },
        { fixtureType: 'ceiling_speaker', label: 'Ceiling speaker', count: 4,
          disciplineCode: 'it_low_voltage', prefix: 'CEIL' },
        { fixtureType: 'whiteboard', label: 'Whiteboard', count: 0 },
      ],
    }],
  }
  const floors = [{ code: `${B}-00`, name: 'Ground Floor', depts: ['admin'],
                    counts: { 'admin:custom-conf': 2 } }]
  const rows = generateRows(floors, B, DEPARTMENTS, custom, new Set())
  const rooms = rows.filter((r) => r.location_type === 'room')
  assert(rooms.length === 2, `expected 2 rooms, got ${rooms.length}`)
  assert(!rows.some((r) => r.location_type === 'bed'), 'a conference room has no beds')

  const items = rooms[0].fixtures ?? []
  assert(items.map((f) => `${f.fixture_type}x${f.count}`).join() ===
    'chairx12,tablex2,ceiling_speakerx4', `got ${items.map((f) => f.fixture_type).join(', ')}`)
  // A catalogue item routes by the catalogue; a custom one carries its trade.
  assert(items[0].discipline_code === null, 'a catalogued chair needs no trade')
  const speaker = items.find((f) => f.fixture_type === 'ceiling_speaker')!
  assert(speaker.discipline_code === 'it_low_voltage' && speaker.code_prefix === 'CEIL',
    'the custom item must say who maintains it')
  // Every room of the type gets its own set, not one set shared.
  assert((rooms[1].fixtures ?? []).length === 3, 'the second room gets its chairs too')
})

check('a ward room still gets its beds and nothing else', () => {
  const floors = [{ code: `${B}-01`, name: 'Level 1', depts: ['wards'],
                    counts: { 'wards:patient': 1 } }]
  const rows = generateRows(floors, B, DEPARTMENTS, {}, new Set())
  const room = rows.find((r) => r.location_type === 'room')!
  assert(room, `no room in ${rows.map((r) => r.location_type).join(', ')}`)
  assert(rows.filter((r) => r.location_type === 'bed').length === 2, 'patient rooms hold two beds')
  assert((room.fixtures ?? []).length === 0, 'no invented contents')
})

check('giving an existing room type contents tops up the rooms already there', () => {
  const loaded = loadExisting(B, existingBuilding())
  const ground = loaded.floors.find((f) => f.code === `${B}-00`)!
  const itKey = Object.keys(ground.existingCounts!).find((k) => k.startsWith('it:'))!
  const [deptKey, roomKey] = itKey.split(':')
  const kind = mergeRooms(DEPARTMENTS.find((d) => d.key === deptKey)!.rooms,
    loaded.customRooms[deptKey]).find((r) => r.key === roomKey)!
  const customRooms = {
    ...loaded.customRooms,
    [deptKey]: [...(loaded.customRooms[deptKey] ?? []).filter((r) => r.key !== roomKey),
                { ...kind, contents: [{ fixtureType: 'chair', label: 'Chair', count: 12 }] }],
  }
  const all = [...DEPARTMENTS, ...loaded.customDepts]

  // The trap: no new rooms, so nothing would have been sent at all.
  assert(generateRows(loaded.floors, B, all, customRooms, loaded.taken).length === 0,
    'no new spaces were asked for')
  const plan = fillPlan(loaded.floors, all, customRooms)
  assert(plan.length === 1, `expected one group, got ${plan.length}`)
  const dc1 = ground.existingRoomIds![itKey]
  assert(plan[0].location_ids.join() === dc1.join() && dc1.length === 1,
    `should target the existing room, got ${plan[0].location_ids}`)
  assert(plan[0].items[0].fixture_type === 'chair' && plan[0].items[0].count === 12, 'twelve chairs')
})

check('rooms whose type lists nothing are left alone', () => {
  const loaded = loadExisting(B, existingBuilding())
  const plan = fillPlan(loaded.floors, [...DEPARTMENTS, ...loaded.customDepts], loaded.customRooms)
  assert(plan.length === 0, `nothing was edited, but ${plan.length} groups were planned`)
})

check('a typed plural or alternative name finds the catalogue item', () => {
  assert(sameItemName('Chairs', 'Chair', 'chair'), 'Chairs is Chair')
  assert(sameItemName('  tables ', 'Table'), 'case and spaces do not matter')
  assert(sameItemName('TV', 'Display screen / TV', 'display_screen'), 'TV is the display screen')
  assert(sameItemName('display screens', 'Display screen / TV'), 'plural of the first name')
  assert(sameItemName('Benches', 'Bench'), 'benches')
  assert(sameItemName('Beds', 'Beds'), 'beds is still beds')
  assert(!sameItemName('Chair lift', 'Chair'), 'a different thing is not a chair')
  assert(!sameItemName('', 'Chair'), 'blank matches nothing')
})

console.log(`\n${passed} checks passed`)
