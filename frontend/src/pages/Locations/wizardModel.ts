/**
 * The structure behind the building wizard, kept apart from its screens.
 *
 * Everything here is plain data in and rows out, with no React, so it can be
 * exercised directly. That matters for this file in particular: the wizard has
 * already shipped once with a path nobody had run, and "it reads right" is
 * not the same as "it was tried".
 */
import type { BulkLocationRow } from '@/api/locations'

/** A kind of room, with the clinical use and default size the tree needs. */
export interface RoomKind {
  key: string
  label: string
  prefix: string
  spaceUse: string
  type?: string
  /** Beds are spaces with their own status, so they arrive as child locations. */
  beds?: number
  criticality?: string
  /**
   * Everything else each room contains. Sockets and gas outlets are fixtures,
   * part of the room. Chairs and a display are assets, each with its own tag,
   * recorded in the asset register as being in this room. Both are created in
   * the same save as the room itself.
   */
  contents?: RoomContent[]
}

export interface RoomContent {
  /** A catalogue key, or a custom one for something the catalogue lacks. */
  fixtureType: string
  label: string
  count: number
  /** Part of the room (fixture) or a thing in it (asset). Older state means fixture. */
  kind?: 'fixture' | 'asset'
  /**
   * What one of these cost, when already known. Assets only: fixtures are part
   * of the building and are not valued one socket at a time.
   */
  costEach?: number
  /** Only for a custom item: the trade that maintains it, which routes faults. */
  disciplineCode?: string
  prefix?: string
}

const isAsset = (c: RoomContent) => c.kind === 'asset'

/** Details applied to every asset a run of the setup creates. */
export interface SetupOptions {
  /** When the fit-out went into service, yyyy-mm-dd. Depreciation counts from it. */
  installedOn?: string
}

/** The fixtures and assets a room kind puts in each room, in the shape the API takes. */
export function contentsPayload(contents: RoomContent[] = [], options: SetupOptions = {}) {
  const wanted = contents.filter((c) => c.count > 0 && c.fixtureType)
  return {
    fixtures: wanted.filter((c) => !isAsset(c)).map((c) => ({
      fixture_type: c.fixtureType,
      count: c.count,
      discipline_code: c.disciplineCode ?? null,
      code_prefix: c.prefix ?? null,
    })),
    assets: wanted.filter(isAsset).map((c) => ({
      asset_type: c.fixtureType,
      count: c.count,
      discipline_code: c.disciplineCode ?? null,
      cost: c.costEach != null && c.costEach >= 0 ? c.costEach : null,
      installation_date: options.installedOn || null,
    })),
  }
}

/**
 * A department's room kinds with any edits applied.
 *
 * Editing a preset — giving Meeting rooms their chairs — stores the edited kind
 * under the same key, so it has to replace the preset rather than appear
 * beside it as a second "Meeting rooms" with its own count.
 */
export function mergeRooms(presets: RoomKind[], custom: RoomKind[] = []): RoomKind[] {
  const overrides = new Map(custom.map((r) => [r.key, r]))
  const merged = presets.map((r) => overrides.get(r.key) ?? r)
  const presetKeys = new Set(presets.map((r) => r.key))
  return [...merged, ...custom.filter((r) => !presetKeys.has(r.key))]
}

/**
 * What a hospital department is made of.
 *
 * The room kinds under each are what that department ordinarily contains, so
 * the third step offers Radiology an X-ray room and a CT suite rather than a
 * list of every space type in the building.
 */
export interface DeptKind {
  key: string
  label: string
  prefix: string
  rooms: RoomKind[]
}

export const DEPARTMENTS: DeptKind[] = [
  {
    key: 'surgery', label: 'Surgery', prefix: 'SUR', rooms: [
      { key: 'or', label: 'Operating rooms', prefix: 'OR', spaceUse: 'operating_room', criticality: 'critical' },
      { key: 'proc', label: 'Procedure rooms', prefix: 'PROC', spaceUse: 'procedure_room', criticality: 'high' },
      { key: 'recovery', label: 'Recovery bays', prefix: 'PACU', spaceUse: 'patient_room', beds: 1, criticality: 'high' },
      { key: 'sterile', label: 'Sterile store', prefix: 'STS', spaceUse: 'storage' },
    ],
  },
  {
    key: 'radiology', label: 'Radiology', prefix: 'RAD', rooms: [
      { key: 'xray', label: 'X-ray rooms', prefix: 'XR', spaceUse: 'imaging', criticality: 'high' },
      { key: 'ct', label: 'CT suites', prefix: 'CT', spaceUse: 'imaging', criticality: 'high' },
      { key: 'mri', label: 'MRI suites', prefix: 'MRI', spaceUse: 'imaging', criticality: 'high' },
      { key: 'us', label: 'Ultrasound rooms', prefix: 'US', spaceUse: 'imaging' },
      { key: 'reporting', label: 'Reporting rooms', prefix: 'RPT', spaceUse: 'office' },
    ],
  },
  {
    key: 'critical', label: 'Critical Care', prefix: 'CC', rooms: [
      { key: 'icu', label: 'ICU bays', prefix: 'ICU', spaceUse: 'icu', beds: 1, criticality: 'critical' },
      { key: 'nicu', label: 'NICU bays', prefix: 'NICU', spaceUse: 'nicu', beds: 1, criticality: 'critical' },
      { key: 'aiir', label: 'Isolation rooms', prefix: 'AIIR', spaceUse: 'aiir', beds: 1, criticality: 'critical' },
    ],
  },
  {
    key: 'emergency', label: 'Emergency', prefix: 'ED', rooms: [
      { key: 'bay', label: 'Treatment bays', prefix: 'ED', spaceUse: 'emergency', beds: 1, criticality: 'critical' },
      { key: 'triage', label: 'Triage rooms', prefix: 'TRI', spaceUse: 'emergency', criticality: 'high' },
      { key: 'resus', label: 'Resuscitation rooms', prefix: 'RES', spaceUse: 'emergency', beds: 1, criticality: 'critical' },
    ],
  },
  {
    key: 'wards', label: 'Inpatient Wards', prefix: 'WRD', rooms: [
      { key: 'patient', label: 'Patient rooms', prefix: 'PR', spaceUse: 'patient_room', beds: 2, criticality: 'high' },
      { key: 'nurse', label: 'Nurse stations', prefix: 'NS', spaceUse: 'office' },
      { key: 'clean', label: 'Clean utility', prefix: 'CU', spaceUse: 'storage' },
      { key: 'dirty', label: 'Dirty utility', prefix: 'DU', spaceUse: 'storage' },
    ],
  },
  {
    key: 'laboratory', label: 'Laboratory', prefix: 'LAB', rooms: [
      { key: 'lab', label: 'Laboratories', prefix: 'LAB', spaceUse: 'laboratory', criticality: 'high' },
      { key: 'specimen', label: 'Specimen reception', prefix: 'SPC', spaceUse: 'laboratory' },
    ],
  },
  {
    key: 'pharmacy', label: 'Pharmacy', prefix: 'PHA', rooms: [
      { key: 'dispensary', label: 'Dispensary', prefix: 'PH', spaceUse: 'pharmacy', criticality: 'high' },
      { key: 'cleanroom', label: 'Compounding cleanroom', prefix: 'CR', spaceUse: 'pharmacy', criticality: 'critical' },
      { key: 'store', label: 'Drug store', prefix: 'DS', spaceUse: 'storage', criticality: 'high' },
    ],
  },
  {
    key: 'spd', label: 'Sterile Processing', prefix: 'SPD', rooms: [
      { key: 'decon', label: 'Decontamination', prefix: 'DEC', spaceUse: 'sterile_processing', criticality: 'high' },
      { key: 'assembly', label: 'Assembly and packing', prefix: 'ASM', spaceUse: 'sterile_processing', criticality: 'high' },
      { key: 'sterile', label: 'Sterile store', prefix: 'SS', spaceUse: 'storage', criticality: 'high' },
    ],
  },
  {
    key: 'dialysis', label: 'Dialysis', prefix: 'DIA', rooms: [
      { key: 'station', label: 'Dialysis stations', prefix: 'DIA', spaceUse: 'dialysis', beds: 1, criticality: 'high' },
      { key: 'water', label: 'Water treatment', prefix: 'WTR', spaceUse: 'mechanical', criticality: 'high' },
    ],
  },
  {
    key: 'it', label: 'IT and Communications', prefix: 'IT', rooms: [
      { key: 'data', label: 'Data centre', prefix: 'DC', spaceUse: 'data', criticality: 'critical' },
      { key: 'comms', label: 'Comms rooms', prefix: 'COM', spaceUse: 'data', criticality: 'critical' },
      { key: 'office', label: 'IT offices', prefix: 'ITO', spaceUse: 'office' },
    ],
  },
  {
    key: 'admin', label: 'Administration', prefix: 'ADM', rooms: [
      { key: 'office', label: 'Offices', prefix: 'OFF', spaceUse: 'office' },
      { key: 'meeting', label: 'Meeting rooms', prefix: 'MTG', spaceUse: 'office' },
      { key: 'records', label: 'Records store', prefix: 'RCD', spaceUse: 'storage' },
    ],
  },
  {
    key: 'public', label: 'Public Areas', prefix: 'PUB', rooms: [
      { key: 'reception', label: 'Reception', prefix: 'REC', spaceUse: 'public' },
      { key: 'waiting', label: 'Waiting areas', prefix: 'WAI', spaceUse: 'public' },
      { key: 'cafe', label: 'Catering', prefix: 'CAF', spaceUse: 'kitchen' },
    ],
  },
  {
    key: 'plant', label: 'Plant and Services', prefix: 'PLT', rooms: [
      { key: 'mech', label: 'Mechanical rooms', prefix: 'MR', spaceUse: 'mechanical', type: 'mech_room', criticality: 'high' },
      { key: 'elec', label: 'Electrical rooms', prefix: 'ER', spaceUse: 'electrical', criticality: 'critical' },
      { key: 'store', label: 'Stores and workshop', prefix: 'WKS', spaceUse: 'storage' },
    ],
  },
]

export interface FloorSpec {
  code: string
  name: string
  depts: string[]
  /** Keyed `${deptKey}:${roomKey}` so a count belongs to one floor's department. */
  counts: Record<string, number>
  /** Loaded from the building rather than described in this run. */
  existing?: boolean
  /** Departments already on this floor; they cannot be unticked here. */
  existingDepts?: string[]
  /** How many of each room kind already exist, the floor a count cannot go below. */
  existingCounts?: Record<string, number>
  /** The real code of each existing department, which need not follow the scheme. */
  deptCodes?: Record<string, string>
  /** The rooms already there, per room kind: topped up, or chosen for removal. */
  existingRooms?: Record<string, ExistingRoom[]>
  /** Ids of existing rooms on this floor that saving will remove. */
  removed?: number[]
}

export interface ExistingRoom {
  id: number
  code: string
  name: string
}

/** A node from the location tree, as much of it as the wizard reads. */
export interface ExistingNode {
  id: number
  code: string
  name?: string | null
  location_type: string
  space_use?: string | null
  bed_count?: number
  children?: ExistingNode[]
}

/**
 * Turn the building's current tree back into wizard state.
 *
 * Existing departments are matched to a preset by code or name; anything that
 * matches nothing — a department added by hand, or a custom one from an
 * earlier run — becomes a custom department with the same code, so it appears
 * in the wizard exactly as it is in the register. Rooms are grouped by the
 * prefix of their code, and a prefix no preset uses becomes a custom room kind.
 */
export function loadExisting(buildingCode: string, children: ExistingNode[]) {
  const customDepts: DeptKind[] = []
  const customRooms: Record<string, RoomKind[]> = {}
  const taken = new Set<string>()

  const walk = (nodes: ExistingNode[]) => nodes.forEach((n) => {
    taken.add(n.code)
    walk(n.children ?? [])
  })
  walk(children)

  const floors: FloorSpec[] = children
    .filter((n) => n.location_type === 'floor')
    .map((floor) => {
      const spec: FloorSpec = {
        code: floor.code, name: floor.name || floor.code, depts: [], counts: {},
        existing: true, existingDepts: [], existingCounts: {}, deptCodes: {},
        existingRooms: {},
      }

      for (const wing of (floor.children ?? []).filter((c) => c.location_type === 'wing')) {
        let dept = [...DEPARTMENTS, ...customDepts].find((d) =>
          wing.code === `${floor.code}-${d.prefix}` || (wing.name && wing.name === d.label))
        if (!dept) {
          dept = {
            key: `existing-${wing.id}`,
            label: wing.name || wing.code,
            prefix: wing.code.split('-').pop() || wing.code,
            rooms: [],
          }
          customDepts.push(dept)
        }
        spec.depts.push(dept.key)
        spec.existingDepts!.push(dept.key)
        spec.deptCodes![dept.key] = wing.code

        for (const room of (wing.children ?? []).filter((c) => c.location_type !== 'bed')) {
          const prefix = room.code.split('-')[0]
          let kind = mergeRooms(dept.rooms, customRooms[dept.key])
            .find((r) => r.prefix === prefix)
          if (!kind) {
            kind = {
              key: `existing-${prefix}`,
              label: (room.name || prefix).replace(/\s*\d+$/, '') || prefix,
              prefix,
              spaceUse: room.space_use || 'other',
              type: room.location_type,
              beds: room.bed_count || 0,
            }
            customRooms[dept.key] = [...(customRooms[dept.key] ?? []), kind]
          }
          const key = `${dept.key}:${kind.key}`
          spec.existingCounts![key] = (spec.existingCounts![key] ?? 0) + 1
          spec.existingRooms![key] = [...(spec.existingRooms![key] ?? []),
                                      { id: room.id, code: room.code, name: room.name || room.code }]
          spec.counts[key] = spec.existingCounts![key]
        }
      }
      return spec
    })

  // Where new floors continue from: the highest level and basement already there.
  const escaped = buildingCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const levels = floors.map((f) => f.code.match(new RegExp(`^${escaped}-(\\d+)$`)))
    .filter(Boolean).map((m) => Number(m![1]))
  const basements = floors.map((f) => f.code.match(new RegExp(`^${escaped}-B(\\d+)$`)))
    .filter(Boolean).map((m) => Number(m![1]))

  return {
    floors, customDepts, customRooms, taken,
    nextLevel: levels.length ? Math.max(...levels) + 1 : 0,
    nextBasement: basements.length ? Math.max(...basements) + 1 : 1,
  }
}

export const pad = (n: number) => String(n).padStart(2, '0')

/** Basement, ground, then levels — how a building is actually numbered. */
export function defaultFloors(buildingCode: string, above: number, below: number): FloorSpec[] {
  const floors: FloorSpec[] = []
  for (let i = below; i >= 1; i -= 1) {
    floors.push({ code: `${buildingCode}-B${i}`, name: i === 1 ? 'Basement' : `Basement ${i}`,
                  depts: [], counts: {} })
  }
  for (let i = 0; i < above; i += 1) {
    floors.push({
      code: `${buildingCode}-${pad(i)}`,
      name: i === 0 ? 'Ground Floor' : `Level ${i}`,
      depts: [], counts: {},
    })
  }
  return floors
}


/** A code prefix from a name: first word, letters only, at most four. */
export function prefixFrom(name: string, taken: Set<string>): string {
  const base = (name.replace(/[^A-Za-z ]/g, '').trim().split(/\s+/)[0] || 'DEP')
    .slice(0, 4).toUpperCase() || 'DEP'
  let candidate = base
  let n = 2
  while (taken.has(candidate)) { candidate = `${base}${n}`; n += 1 }
  return candidate
}

/**
 * What will be sent: only the spaces that do not exist yet.
 *
 * Existing floors, departments and rooms are never re-sent. The import would
 * update them in place, and that would overwrite a room somebody renamed to
 * "Hybrid OR" back to "Operating room 3". New rooms number on from the
 * highest already there and skip any code already taken, so they cannot
 * collide with rooms added by hand under a different scheme.
 */
export function generateRows(
  floors: FloorSpec[],
  buildingCode: string,
  departments: DeptKind[],
  customRooms: Record<string, RoomKind[]>,
  taken: Set<string>,
  options: SetupOptions = {},
): BulkLocationRow[] {
    const out: BulkLocationRow[] = []
    const used = new Set(taken)

    for (const floor of floors) {
      if (!floor.existing) {
        out.push({
          parent_code: buildingCode, location_type: 'floor',
          code: floor.code, name: floor.name,
        } as BulkLocationRow)
        used.add(floor.code)
      }
      const suffix = floor.code.split('-').pop()

      for (const deptKey of floor.depts) {
        const dept = departments.find((d) => d.key === deptKey)
        if (!dept) continue
        // The department is a wing so it is a node you can open, not a label.
        const deptCode = floor.deptCodes?.[deptKey] ?? `${floor.code}-${dept.prefix}`
        if (!floor.existingDepts?.includes(deptKey)) {
          out.push({
            parent_code: floor.code, location_type: 'wing',
            code: deptCode, name: dept.label,
          } as BulkLocationRow)
          used.add(deptCode)
        }

        for (const room of mergeRooms(dept.rooms, customRooms[dept.key])) {
          const key = `${deptKey}:${room.key}`
          const have = floor.existingCounts?.[key] ?? 0
          const want = floor.counts[key] ?? 0
          let n = have
          let made = 0
          while (made < want - have) {
            n += 1
            const code = `${room.prefix}-${suffix}${pad(n)}`
            if (used.has(code)) continue
            used.add(code)
            made += 1
            out.push({
              parent_code: deptCode,
              location_type: room.type ?? 'room',
              code,
              name: `${room.label.replace(/s$/, '')} ${n}`,
              space_use: room.spaceUse,
              criticality: room.criticality ?? null,
              bed_count: room.beds ?? null,
              ...contentsPayload(room.contents, options),
            } as BulkLocationRow)
            for (let b = 0; b < (room.beds ?? 0); b += 1) {
              out.push({
                parent_code: code, location_type: 'bed',
                code: `${code}-${String.fromCharCode(65 + b)}`,
                name: `Bed ${String.fromCharCode(65 + b)}`,
              } as BulkLocationRow)
            }
          }
        }
      }
    }
    return out
}

/** One call that tops a set of existing rooms up to what their kind contains. */
export interface FillGroup {
  label: string
  location_ids: number[]
  fixtures: ReturnType<typeof contentsPayload>['fixtures']
  assets: ReturnType<typeof contentsPayload>['assets']
}

/**
 * The rooms that already exist and whose kind now says what they contain.
 *
 * generateRows only sends rooms that are not there yet, so without this a
 * Conference rooms type given twelve chairs would reach none of the
 * conference rooms already in the register. The server tops each room up and
 * never removes, so sending this again after a second save changes nothing.
 *
 * Beds are left out: in an existing room they are spaces of their own, and
 * adding them is done on the room itself.
 */
export function fillPlan(
  floors: FloorSpec[],
  departments: DeptKind[],
  customRooms: Record<string, RoomKind[]>,
  options: SetupOptions = {},
): FillGroup[] {
  const groups = new Map<string, FillGroup>()
  for (const floor of floors) {
    for (const deptKey of floor.depts) {
      const dept = departments.find((d) => d.key === deptKey)
      if (!dept) continue
      for (const room of mergeRooms(dept.rooms, customRooms[dept.key])) {
        const key = `${deptKey}:${room.key}`
        // A room about to be removed is not worth furnishing first.
        const ids = (floor.existingRooms?.[key] ?? [])
          .map((r) => r.id).filter((id) => !floor.removed?.includes(id))
        const payload = contentsPayload(room.contents, options)
        if (!ids.length || !(payload.fixtures.length + payload.assets.length)) continue
        const group = groups.get(key) ?? { label: room.label, location_ids: [], ...payload }
        group.location_ids.push(...ids)
        groups.set(key, group)
      }
    }
  }
  return [...groups.values()]
}

/** How many rooms of this kind already exist, across every floor. */
export function existingRoomsOf(floors: FloorSpec[], deptKey: string, roomKey: string): number {
  return floors.reduce((n, f) => n + (f.existingCounts?.[`${deptKey}:${roomKey}`] ?? 0), 0)
}

/**
 * Whether something typed names a catalogue item: "Chairs" is Chair, "TV" is
 * "Display screen / TV". Without this a plural became a second, custom kind of
 * chair that had to be given a trade the catalogue already knew.
 */
export function sameItemName(typed: string, label: string, key?: string): boolean {
  const norm = (s: string) => singular(s.trim().toLowerCase().replace(/[_\s]+/g, ' '))
  const wanted = norm(typed)
  if (!wanted) return false
  const names = [...label.split('/'), ...(key ? [key] : [])]
  return names.some((n) => norm(n) === wanted)
}

function singular(word: string): string {
  if (/ies$/.test(word)) return word.replace(/ies$/, 'y')
  if (/(ches|shes|sses|xes)$/.test(word)) return word.slice(0, -2)
  if (/[^s]s$/.test(word)) return word.slice(0, -1)
  return word
}

/** The existing rooms of one kind on a floor that saving will remove. */
export function removedOf(floor: FloorSpec, key: string): ExistingRoom[] {
  const removed = new Set(floor.removed ?? [])
  return (floor.existingRooms?.[key] ?? []).filter((r) => removed.has(r.id))
}

/**
 * Set how many rooms of a kind a floor should have.
 *
 * Above what is there, the difference is created. Below it, that many existing
 * rooms are marked for removal: any the person already picked are kept, and
 * the rest are taken from the highest-numbered, which is usually the one added
 * last. Nothing is removed by this alone — the review names each room first.
 */
export function setRoomCount(floor: FloorSpec, key: string, value: number): FloorSpec {
  const rooms = floor.existingRooms?.[key] ?? []
  const want = Math.max(0, Math.floor(Number(value)) || 0)
  const need = Math.max(0, rooms.length - want)
  const mineIds = new Set(rooms.map((r) => r.id))
  const others = (floor.removed ?? []).filter((id) => !mineIds.has(id))

  const chosen = (floor.removed ?? []).filter((id) => mineIds.has(id)).slice(0, need)
  const highestFirst = [...rooms].sort(
    (a, b) => b.code.localeCompare(a.code, undefined, { numeric: true }))
  for (const room of highestFirst) {
    if (chosen.length >= need) break
    if (!chosen.includes(room.id)) chosen.push(room.id)
  }
  return { ...floor, counts: { ...floor.counts, [key]: want }, removed: [...others, ...chosen] }
}

/** Swap whether one existing room goes; the count follows. */
export function toggleRemoval(floor: FloorSpec, key: string, id: number): FloorSpec {
  const rooms = floor.existingRooms?.[key] ?? []
  const removed = new Set(floor.removed ?? [])
  if (removed.has(id)) removed.delete(id)
  else removed.add(id)
  const going = rooms.filter((r) => removed.has(r.id)).length
  return { ...floor, removed: [...removed], counts: { ...floor.counts, [key]: rooms.length - going } }
}

/** Every existing room that saving will remove, with the floor it is on. */
export function removalPlan(floors: FloorSpec[]): Array<ExistingRoom & { floor: string }> {
  return floors.flatMap((floor) => Object.values(floor.existingRooms ?? {})
    .flat()
    .filter((room) => floor.removed?.includes(room.id))
    .map((room) => ({ ...room, floor: floor.name })))
}

/** Every code under a tree, removed spaces included, so none is handed out twice. */
export function codesIn(nodes: Array<{ code: string; children?: unknown[] }>): string[] {
  return nodes.flatMap((n) => [n.code, ...codesIn((n.children ?? []) as typeof nodes)])
}

/**
 * What the new assets in these rows are worth, from the costs given.
 * `priced` says how many of them had a cost, so the review can say "12 of 40
 * priced" rather than presenting a partial sum as the value of the setup.
 */
export function setupValue(rows: BulkLocationRow[]): { value: number; priced: number; total: number } {
  let value = 0
  let priced = 0
  let total = 0
  for (const row of rows) {
    for (const a of row.assets ?? []) {
      total += a.count
      if (a.cost != null) {
        value += a.count * Number(a.cost)
        priced += a.count
      }
    }
  }
  return { value, priced, total }
}
