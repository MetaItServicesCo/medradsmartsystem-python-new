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
  DEPARTMENTS, codesIn, fillPlan, generateRows, loadExisting, mergeRooms, removalPlan,
  sameItemName, setRoomCount, setupValue, toggleRemoval, type ExistingNode,
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
        { fixtureType: 'chair', label: 'Chair', count: 12, kind: 'asset' as const },
        { fixtureType: 'table', label: 'Table', count: 2, kind: 'asset' as const },
        { fixtureType: 'podium', label: 'Podium', count: 1, kind: 'asset' as const,
          disciplineCode: 'building_envelope' },
        { fixtureType: 'receptacle', label: 'Receptacle', count: 6, kind: 'fixture' as const },
        { fixtureType: 'ceiling_speaker', label: 'Ceiling speaker', count: 4, kind: 'fixture' as const,
          disciplineCode: 'it_low_voltage', prefix: 'CEIL' },
        { fixtureType: 'whiteboard', label: 'Whiteboard', count: 0, kind: 'asset' as const },
      ],
    }],
  }
  const floors = [{ code: `${B}-00`, name: 'Ground Floor', depts: ['admin'],
                    counts: { 'admin:custom-conf': 2 } }]
  const rows = generateRows(floors, B, DEPARTMENTS, custom, new Set())
  const rooms = rows.filter((r) => r.location_type === 'room')
  assert(rooms.length === 2, `expected 2 rooms, got ${rooms.length}`)
  assert(!rows.some((r) => r.location_type === 'bed'), 'a conference room has no beds')

  // Chairs, tables and the podium are assets; sockets and speakers are fixtures.
  const assets = rooms[0].assets ?? []
  assert(assets.map((a) => `${a.asset_type}x${a.count}`).join() === 'chairx12,tablex2,podiumx1',
    `assets were ${assets.map((a) => a.asset_type).join(', ')}`)
  const fixtures = rooms[0].fixtures ?? []
  assert(fixtures.map((f) => `${f.fixture_type}x${f.count}`).join() ===
    'receptaclex6,ceiling_speakerx4', `fixtures were ${fixtures.map((f) => f.fixture_type).join(', ')}`)
  // A catalogue item routes by the catalogue; a custom one carries its trade.
  assert(assets[0].discipline_code === null, 'a catalogued chair needs no trade')
  assert(assets[2].discipline_code === 'building_envelope', 'the podium says who maintains it')
  const speaker = fixtures.find((f) => f.fixture_type === 'ceiling_speaker')!
  assert(speaker.discipline_code === 'it_low_voltage' && speaker.code_prefix === 'CEIL',
    'the custom fixture must say who maintains it')
  assert(!fixtures.some((f) => f.fixture_type === 'chair'), 'a chair must never be sent as a fixture')
  // Every room of the type gets its own set, not one set shared.
  assert((rooms[1].assets ?? []).length === 3, 'the second room gets its chairs too')
})

check('a ward room still gets its beds and nothing else', () => {
  const floors = [{ code: `${B}-01`, name: 'Level 1', depts: ['wards'],
                    counts: { 'wards:patient': 1 } }]
  const rows = generateRows(floors, B, DEPARTMENTS, {}, new Set())
  const room = rows.find((r) => r.location_type === 'room')!
  assert(room, `no room in ${rows.map((r) => r.location_type).join(', ')}`)
  assert(rows.filter((r) => r.location_type === 'bed').length === 2, 'patient rooms hold two beds')
  assert((room.fixtures ?? []).length === 0 && (room.assets ?? []).length === 0, 'no invented contents')
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
                { ...kind, contents: [{ fixtureType: 'chair', label: 'Chair', count: 12, kind: 'asset' as const }] }],
  }
  const all = [...DEPARTMENTS, ...loaded.customDepts]

  // The trap: no new rooms, so nothing would have been sent at all.
  assert(generateRows(loaded.floors, B, all, customRooms, loaded.taken).length === 0,
    'no new spaces were asked for')
  const plan = fillPlan(loaded.floors, all, customRooms)
  assert(plan.length === 1, `expected one group, got ${plan.length}`)
  const dc1 = ground.existingRooms![itKey].map((r) => r.id)
  assert(plan[0].location_ids.join() === dc1.join() && dc1.length === 1,
    `should target the existing room, got ${plan[0].location_ids}`)
  assert(plan[0].assets[0].asset_type === 'chair' && plan[0].assets[0].count === 12, 'twelve chairs')
  assert(plan[0].fixtures.length === 0, 'chairs are not topped up as fixtures')
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

check('lowering a count marks the highest-numbered room and creates nothing', () => {
  const loaded = loadExisting(B, existingBuilding())
  const all = [...DEPARTMENTS, ...loaded.customDepts]
  const i = loaded.floors.findIndex((f) => f.code === `${B}-00`)
  loaded.floors[i] = setRoomCount(loaded.floors[i], 'emergency:bay', 1)

  const going = removalPlan(loaded.floors)
  assert(going.map((r) => r.code).join() === 'ED-0002', `got ${going.map((r) => r.code)}`)
  assert(going[0].floor === 'Ground Floor', 'the review says which floor')
  assert(generateRows(loaded.floors, B, all, loaded.customRooms, loaded.taken).length === 0,
    'removing must not also create')
})

check('choosing a different room swaps which one goes and keeps the count', () => {
  const loaded = loadExisting(B, existingBuilding())
  const i = loaded.floors.findIndex((f) => f.code === `${B}-00`)
  let floor = setRoomCount(loaded.floors[i], 'emergency:bay', 1)
  const [bay1, bay2] = floor.existingRooms!['emergency:bay']
  floor = toggleRemoval(floor, 'emergency:bay', bay2.id)   // keep bay 2 after all
  assert(floor.counts['emergency:bay'] === 2, 'un-choosing puts the count back')
  floor = toggleRemoval(floor, 'emergency:bay', bay1.id)   // remove bay 1 instead
  assert(floor.counts['emergency:bay'] === 1, `count ${floor.counts['emergency:bay']}`)
  assert(removalPlan([floor]).map((r) => r.code).join() === 'ED-0001', 'bay 1 goes')

  // Typing a count again keeps the room the person picked.
  floor = setRoomCount(floor, 'emergency:bay', 1)
  assert(removalPlan([floor]).map((r) => r.code).join() === 'ED-0001', 'the choice survives')
})

check('raising the count back cancels the removal', () => {
  const loaded = loadExisting(B, existingBuilding())
  const i = loaded.floors.findIndex((f) => f.code === `${B}-00`)
  let floor = setRoomCount(loaded.floors[i], 'emergency:bay', 0)
  assert(removalPlan([floor]).length === 2, 'zero removes both')
  floor = setRoomCount(floor, 'emergency:bay', 2)
  assert(removalPlan([floor]).length === 0, 'back to two removes nothing')
  // Removals on another kind are not disturbed by this one.
  const key = Object.keys(floor.existingCounts!).find((k) => k.startsWith('it:'))!
  floor = setRoomCount(floor, key, 0)
  floor = setRoomCount(floor, 'emergency:bay', 2)
  assert(removalPlan([floor]).map((r) => r.code).join() === 'DC-1', 'the IT removal stays')
})

check('a room being removed is not topped up first', () => {
  const loaded = loadExisting(B, existingBuilding())
  const all = [...DEPARTMENTS, ...loaded.customDepts]
  const i = loaded.floors.findIndex((f) => f.code === `${B}-00`)
  loaded.floors[i] = setRoomCount(loaded.floors[i], 'emergency:bay', 1)
  const bay = DEPARTMENTS.find((d) => d.key === 'emergency')!.rooms.find((r) => r.key === 'bay')!
  const rooms = { emergency: [{ ...bay, contents: [{ fixtureType: 'chair', label: 'Chair', count: 1 }] }] }
  const plan = fillPlan(loaded.floors, all, rooms)
  const ids = plan.flatMap((g) => g.location_ids)
  const going = removalPlan(loaded.floors)[0].id
  assert(ids.length === 1 && !ids.includes(going), `fill targeted ${ids}`)
})

check('a code that belonged to a removed room is not handed out again', () => {
  const loaded = loadExisting(B, existingBuilding())
  const all = [...DEPARTMENTS, ...loaded.customDepts]
  // ED-0003 was added once and removed: the tree the wizard is given omits it,
  // but the full tree, removed spaces included, still has it.
  const withRemoved = [...existingBuilding(), { id: 1, code: 'ED-0003', location_type: 'room' }]
  const taken = new Set([...loaded.taken, ...codesIn(withRemoved)])
  const ground = loaded.floors.find((f) => f.code === `${B}-00`)!
  ground.counts['emergency:bay'] = 3
  const rows = generateRows(loaded.floors, B, all, loaded.customRooms, taken)
  const room = rows.find((r) => r.location_type === 'room')!
  assert(room.code === 'ED-0004', `reused a removed code: ${room.code}`)
})

check('costs and the in-service date travel with the assets, never the fixtures', () => {
  const custom = {
    admin: [{
      key: 'custom-conf', label: 'Conference rooms', prefix: 'CONF', spaceUse: 'office',
      contents: [
        { fixtureType: 'chair', label: 'Chair', count: 12, kind: 'asset' as const, costEach: 180 },
        { fixtureType: 'table', label: 'Table', count: 2, kind: 'asset' as const },
        { fixtureType: 'receptacle', label: 'Receptacle', count: 6, kind: 'fixture' as const, costEach: 25 },
      ],
    }],
  }
  const floors = [{ code: `${B}-00`, name: 'Ground Floor', depts: ['admin'],
                    counts: { 'admin:custom-conf': 3 } }]
  const rows = generateRows(floors, B, DEPARTMENTS, custom, new Set(), { installedOn: '2026-09-01' })
  const room = rows.find((r) => r.location_type === 'room')!
  const chair = room.assets!.find((a) => a.asset_type === 'chair')!
  const table = room.assets!.find((a) => a.asset_type === 'table')!
  assert(chair.cost === 180 && chair.installation_date === '2026-09-01', 'chairs carry cost and date')
  assert(table.cost === null && table.installation_date === '2026-09-01', 'no cost given, none invented')
  assert(!('cost' in room.fixtures![0]), 'a socket is not valued')

  const withoutDate = generateRows(floors, B, DEPARTMENTS, custom, new Set())
  assert(withoutDate.find((r) => r.location_type === 'room')!.assets![0].installation_date === null,
    'no date given, none invented')

  // Three rooms of twelve chairs at 180, and six tables with no price.
  const value = setupValue(rows)
  assert(value.value === 3 * 12 * 180, `value was ${value.value}`)
  assert(value.priced === 36 && value.total === 42, `priced ${value.priced} of ${value.total}`)
})

check('a top-up carries the cost and date for what it adds', () => {
  const loaded = loadExisting(B, existingBuilding())
  const all = [...DEPARTMENTS, ...loaded.customDepts]
  const bay = DEPARTMENTS.find((d) => d.key === 'emergency')!.rooms.find((r) => r.key === 'bay')!
  const rooms = { emergency: [{ ...bay, contents: [
    { fixtureType: 'stretcher', label: 'Stretcher', count: 1, kind: 'asset' as const, costEach: 2400 },
  ] }] }
  const plan = fillPlan(loaded.floors, all, rooms, { installedOn: '2026-10-01' })
  assert(plan.length === 1 && plan[0].assets[0].cost === 2400
    && plan[0].assets[0].installation_date === '2026-10-01', JSON.stringify(plan[0]?.assets))
})

console.log(`\n${passed} checks passed`)
