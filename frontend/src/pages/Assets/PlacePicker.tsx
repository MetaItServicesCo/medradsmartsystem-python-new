/**
 * Choose a space by searching for it.
 *
 * This replaces a plain dropdown of every building, floor, department, room
 * and bed in the site, which at a few hundred rooms was a list nobody could
 * find ITO-0002 in. Every level can be chosen — a lift belongs to a building,
 * a generator to a roof — and each option shows its full path, so two rooms
 * called "Room 1" on different floors cannot be confused.
 *
 * Search matches the code, the name and the path, word by word: "rad xr"
 * finds XR-0001 in Radiology.
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Autocomplete, Box, Chip, TextField, Typography, createFilterOptions } from '@mui/material'
import { fetchLocationTree } from '@/api/locations'
import { palette } from '@/theme/palette'

export interface Place {
  id: number
  code: string
  name: string
  type: string
  criticality: string | null
  /** "Building A › Ground Floor › Radiology" — the ancestors, not the place itself. */
  path: string
  label: string
  search: string
}

const TYPE_LABEL: Record<string, string> = {
  building: 'Building', floor: 'Floor', wing: 'Department', room: 'Room', bed: 'Bed',
  mech_room: 'Plant room', plenum: 'Plenum', riser: 'Riser', exterior: 'Outside',
}

export function flattenPlaces(nodes: any[]): Place[] {
  const out: Place[] = []
  const walk = (list: any[], trail: string[]) => {
    for (const n of list) {
      const label = n.name ? `${n.code} · ${n.name}` : n.code
      const path = trail.join(' › ')
      out.push({
        id: n.id, code: n.code, name: n.name ?? '', type: n.location_type,
        criticality: n.criticality ?? null, path, label,
        search: `${n.code} ${n.name ?? ''} ${path}`.toLowerCase(),
      })
      walk(n.children ?? [], [...trail, n.name || n.code])
    }
  }
  walk(nodes, [])
  return out
}

/** Every word typed has to appear somewhere in the code, name or path. */
const byWords = createFilterOptions<Place>({
  stringify: (p) => p.search,
  limit: 80,
})
function filterPlaces(options: Place[], state: { inputValue: string; getOptionLabel: (p: Place) => string }) {
  const words = state.inputValue.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length <= 1) return byWords(options, state as any)
  return options.filter((p) => words.every((w) => p.search.includes(w))).slice(0, 80)
}

export function usePlaces(facilityId: number | null | undefined) {
  const { data, isLoading } = useQuery({
    queryKey: ['location-tree', facilityId],
    queryFn: () => fetchLocationTree(facilityId as number),
    enabled: !!facilityId,
  })
  const places = useMemo(() => flattenPlaces((data as any)?.items ?? []), [data])
  return { places, isLoading }
}

function PlaceOption({ place }: { place: Place }) {
  return (
    <Box sx={{ minWidth: 0, py: 0.25 }}>
      <Typography noWrap sx={{ fontSize: 13, fontWeight: 800, color: palette.ink }}>
        {place.label}
        <Box component="span" sx={{ ml: 1, fontSize: 10.5, fontWeight: 800,
                                     color: palette.textFaint, textTransform: 'uppercase' }}>
          {TYPE_LABEL[place.type] ?? place.type.replace(/_/g, ' ')}
        </Box>
      </Typography>
      {place.path && (
        <Typography noWrap sx={{ fontSize: 11.5, color: palette.textMuted }}>{place.path}</Typography>
      )}
    </Box>
  )
}

export function PlacePicker({
  facilityId, value, onChange, label = 'Where is it', helperText, required, disabled,
}: {
  facilityId: number
  value: number | null
  onChange: (id: number | null, place: Place | null) => void
  label?: string
  helperText?: string
  required?: boolean
  disabled?: boolean
}) {
  const { places, isLoading } = usePlaces(facilityId)
  const selected = places.find((p) => p.id === value) ?? null
  return (
    <Autocomplete
      size="small" options={places} value={selected} loading={isLoading} disabled={disabled}
      filterOptions={filterPlaces}
      getOptionLabel={(p) => p.label}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      onChange={(_, p) => onChange(p?.id ?? null, p)}
      renderOption={(props, p) => <li {...props} key={p.id}><PlaceOption place={p} /></li>}
      renderInput={(params) => (
        <TextField
          {...params} label={label} required={required}
          placeholder="Search a room, floor or code…"
          helperText={helperText ?? (selected?.path ? `In ${selected.path}` : undefined)}
        />
      )}
    />
  )
}

export function PlacesPicker({
  facilityId, value, onChange, label, helperText, exclude = [],
}: {
  facilityId: number
  value: number[]
  onChange: (ids: number[]) => void
  label: string
  helperText?: string
  exclude?: number[]
}) {
  const { places, isLoading } = usePlaces(facilityId)
  const options = places.filter((p) => !exclude.includes(p.id))
  const selected = value.map((id) => places.find((p) => p.id === id)).filter(Boolean) as Place[]
  return (
    <Autocomplete
      multiple size="small" options={options} value={selected} loading={isLoading}
      filterOptions={filterPlaces} disableCloseOnSelect
      getOptionLabel={(p) => p.label}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      onChange={(_, list) => onChange(list.map((p) => p.id))}
      renderOption={(props, p) => <li {...props} key={p.id}><PlaceOption place={p} /></li>}
      renderTags={(list, getTagProps) => list.map((p, i) => (
        <Chip {...getTagProps({ index: i })} key={p.id} size="small" label={p.label}
              title={p.path} sx={{ fontWeight: 700 }} />
      ))}
      renderInput={(params) => (
        <TextField {...params} label={label} placeholder={selected.length ? '' : 'Search spaces…'}
                   helperText={helperText} />
      )}
    />
  )
}

export { TYPE_LABEL }
