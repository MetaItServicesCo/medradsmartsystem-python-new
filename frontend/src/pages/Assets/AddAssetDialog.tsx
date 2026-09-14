/**
 * Register an asset: a room item, a piece of plant, or clinical equipment.
 *
 * The three are registered differently because they are identified
 * differently. A chair is known by what it is and where it is. Plant is
 * classified by the trade that maintains it, and often has no nameplate data
 * yet when first surveyed. Clinical equipment is classified by modality and
 * must carry make, model and serial, because that is how a recall reaches it.
 *
 * Every asset can sit anywhere — a building, a roof, a plant room, a bed — and
 * plant and clinical equipment can also say what they serve. That matters more
 * than it looks: an air handler in an ordinary plant room that supplies the
 * theatres is as critical as the theatres, and its criticality is taken from
 * the most critical of where it is and what it serves.
 *
 * Tags are issued unless the asset already has one. Nothing at a site can
 * share a tag, so the server refuses one already in use.
 */
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Autocomplete, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, MenuItem, Radio, RadioGroup, Stack, TextField, ToggleButton,
  ToggleButtonGroup, Typography,
} from '@mui/material'
import { toast } from 'react-toastify'
import { fetchDisciplines, fetchServiceTypes } from '@/api/disciplines'
import {
  addRoomItems, createEquipment, fetchNextTag, fetchRoomItemTypes, type RoomItemType,
} from '@/api/equipment'
import { fetchModalities } from '@/api/modalities'
import { palette } from '@/theme/palette'
import { sameItemName } from '../Locations/wizardModel'
import { PlacePicker, PlacesPicker } from './PlacePicker'

export type AssetKind = 'room_item' | 'plant' | 'clinical'

const KIND_HINT: Record<AssetKind, string> = {
  room_item: 'Chairs, tables, screens, computers, stretchers. Each item gets its own tag and is labelled with its room.',
  plant: 'Chillers, air handlers, lifts, generators, pumps, panels. Classified by the trade that maintains it.',
  clinical: 'Imaging, monitoring, laboratory and treatment devices. Classified by modality.',
}

/** What a trade's plant usually supplies, so the common case needs no choice. */
const DEFAULT_SERVICE: Record<string, string> = {
  mechanical: 'supply_air',
  electrical: 'normal_power',
  plumbing: 'domestic_cold_water',
  medical_gas: 'oxygen',
  fire_life_safety: 'fire_protection',
  it_low_voltage: 'data',
}

/** LO-000014 and 12 -> "LO-000014 to LO-000025". */
function tagRange(first: string | undefined, count: number): string {
  if (!first) return ''
  if (count <= 1) return first
  const match = first.match(/^(.*?)(\d+)$/)
  if (!match) return first
  const last = String(Number(match[2]) + count - 1).padStart(match[2].length, '0')
  return `${first} to ${match[1]}${last}`
}

function errorText(e: any, fallback: string): string {
  const detail = e?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg).replace(/^Value error, /, '')
  return fallback
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box sx={{ mt: 2.25 }}>
      <Typography sx={{ mb: 1.1, fontSize: 11, fontWeight: 900, letterSpacing: 0.5,
                        textTransform: 'uppercase', color: palette.textSubtle }}>
        {title}
      </Typography>
      {children}
    </Box>
  )
}

export default function AddAssetDialog({
  open, onClose, facilityId, initialKind = 'plant', initialLocationId = null, onCreated,
}: {
  open: boolean
  onClose: () => void
  facilityId: number
  initialKind?: AssetKind
  /** Opened from a room: that room is already chosen. */
  initialLocationId?: number | null
  onCreated: (ids: number[]) => void
}) {
  const queryClient = useQueryClient()
  const [kind, setKind] = useState<AssetKind>(initialKind)

  // What it is
  const [itemType, setItemType] = useState<RoomItemType | string | null>(null)
  const [quantity, setQuantity] = useState('1')
  const [customTrade, setCustomTrade] = useState('')
  const [disciplineId, setDisciplineId] = useState<number | ''>('')
  const [modalityId, setModalityId] = useState<number | ''>('')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [serial, setSerial] = useState('')

  // Where it is, and what it serves
  const [locationId, setLocationId] = useState<number | null>(initialLocationId)
  const [serves, setServes] = useState<number[]>([])
  const [serviceType, setServiceType] = useState('')

  // Tag and the rest
  const [tagMode, setTagMode] = useState<'issue' | 'existing'>('issue')
  const [existingTag, setExistingTag] = useState('')
  const [cost, setCost] = useState('')
  const [installed, setInstalled] = useState('')
  const [description, setDescription] = useState('')

  const { data: disciplines } = useQuery({
    queryKey: ['disciplines'], queryFn: fetchDisciplines, staleTime: 30 * 60_000,
  })
  const { data: itemTypes } = useQuery({
    queryKey: ['room-item-types'], queryFn: fetchRoomItemTypes, staleTime: 30 * 60_000,
    enabled: open,
  })
  const { data: modalities } = useQuery({
    queryKey: ['modalities'], queryFn: () => fetchModalities(), staleTime: 30 * 60_000,
    enabled: open && kind === 'clinical',
  })
  const { data: serviceTypes } = useQuery({
    queryKey: ['service-types'], queryFn: fetchServiceTypes, staleTime: 60 * 60_000,
    enabled: open && kind !== 'room_item',
  })
  const { data: nextTag } = useQuery({
    queryKey: ['next-tag', facilityId], queryFn: () => fetchNextTag(facilityId),
    enabled: open && !!facilityId, staleTime: 0,
  })

  const trades = disciplines?.items ?? []
  const tradeCode = trades.find((d) => d.id === disciplineId)?.code

  // Pick what the chosen trade usually supplies, until somebody picks otherwise.
  useEffect(() => {
    if (tradeCode && DEFAULT_SERVICE[tradeCode]) setServiceType((s) => s || DEFAULT_SERVICE[tradeCode])
  }, [tradeCode])

  // "Chairs" is the catalogued Chair, not a new kind of thing.
  const knownItem = useMemo(() => {
    const options = itemTypes?.types ?? []
    if (typeof itemType !== 'string') return itemType
    return options.find((o) => sameItemName(itemType, o.label, o.key)) ?? null
  }, [itemType, itemTypes])
  const typedItem = typeof itemType === 'string' ? itemType.trim() : ''
  const customItem = kind === 'room_item' && !knownItem && typedItem.length > 0

  const count = kind === 'room_item' ? Math.max(0, Math.floor(Number(quantity)) || 0) : 1
  const many = count > 1
  // Twelve chairs cannot share one sticker.
  useEffect(() => { if (many) setTagMode('issue') }, [many])

  const create = useMutation({
    mutationFn: async (): Promise<Array<{ id: number; asset_tag: string }>> => {
      const tag = tagMode === 'existing' ? existingTag.trim() : ''
      const common = {
        make: make.trim() || null, model: model.trim() || null,
        cost: cost === '' ? null : Number(cost),
        installation_date: installed || null,
        description: description.trim() || null,
      }
      if (kind === 'room_item') {
        const res = await addRoomItems({
          location_id: locationId as number,
          asset_type: knownItem ? knownItem.key : typedItem,
          count,
          discipline_code: customItem ? customTrade : null,
          asset_tag: tag || null,
          serial_number: many ? null : (serial.trim() || null),
          ...common,
        })
        return res.items
      }
      const created = await createEquipment({
        facility_id: facilityId,
        asset_tag: tag,
        make: make.trim(), model: model.trim(), serial_number: serial.trim(),
        discipline_id: kind === 'plant' ? (disciplineId as number) : null,
        modality_id: kind === 'clinical' ? (modalityId as number) : null,
        location_id: locationId,
        serves: serves.map((id) => ({ location_id: id, service_type: serviceType })),
        cost: common.cost,
        installation_date: common.installation_date,
        description: common.description,
        status: 'active',
      } as any)
      return [created]
    },
    onSuccess: (items) => {
      toast.success(items.length === 1
        ? `${items[0].asset_tag} registered`
        : `${items.length} assets registered: ${items[0].asset_tag} to ${items[items.length - 1].asset_tag}`)
      queryClient.invalidateQueries({ queryKey: ['equipment'] })
      queryClient.invalidateQueries({ queryKey: ['next-tag'] })
      onCreated(items.map((i) => i.id))
    },
    onError: (e: any) => toast.error(errorText(e, 'Could not register the asset')),
  })

  const identified = kind !== 'clinical' || (make.trim() && model.trim() && serial.trim())
  const classified = kind === 'room_item'
    ? Boolean(knownItem || (customItem && customTrade))
    : kind === 'plant' ? disciplineId !== '' : modalityId !== ''
  const placed = kind !== 'room_item' || locationId !== null
  const servesReady = !serves.length || Boolean(serviceType)
  const tagReady = tagMode === 'issue' || existingTag.trim().length > 0
  const ready = classified && identified && placed && servesReady && tagReady && count > 0

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth
            PaperProps={{ sx: { borderRadius: '18px' } }}>
      <DialogTitle sx={{ fontWeight: 900, color: palette.ink, pb: 1 }}>
        Register an asset
      </DialogTitle>
      <DialogContent dividers>
        <ToggleButtonGroup
          exclusive size="small" value={kind} fullWidth
          onChange={(_, v) => v && setKind(v)}
          sx={{ '& .MuiToggleButton-root': { fontWeight: 800, textTransform: 'none' },
                '& .Mui-selected': { bgcolor: `${palette.brandTint} !important`,
                                     color: `${palette.brandDeep} !important` } }}
        >
          <ToggleButton value="room_item">Room item</ToggleButton>
          <ToggleButton value="plant">Plant &amp; MEP</ToggleButton>
          <ToggleButton value="clinical">Clinical equipment</ToggleButton>
        </ToggleButtonGroup>
        <Typography sx={{ mt: 1.25, fontSize: 12.5, color: palette.textMuted, fontWeight: 600 }}>
          {KIND_HINT[kind]}
        </Typography>

        <Section title="What is it">
          <Box sx={{ display: 'grid', gap: 1.75, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' } }}>
            {kind === 'room_item' && (
              <>
                <Autocomplete
                  freeSolo size="small" options={itemTypes?.types ?? []} value={itemType}
                  getOptionLabel={(o) => (typeof o === 'string' ? o : o.label)}
                  isOptionEqualToValue={(o, v) => typeof v !== 'string' && o.key === v.key}
                  onChange={(_, v) => setItemType(v)}
                  onInputChange={(_, v, reason) => { if (reason === 'input') setItemType(v) }}
                  renderInput={(params) => (
                    <TextField {...params} required label="Type" placeholder="Chair, display, podium…"
                               helperText={knownItem ? 'From the list' : customItem ? 'Your own type' : ' '} />
                  )}
                />
                <TextField
                  size="small" type="number" label="Quantity" required value={quantity}
                  onChange={(e) => setQuantity(e.target.value)} onFocus={(e) => e.target.select()}
                  inputProps={{ min: 1, max: 200 }}
                  helperText={many ? `${count} separate assets, one tag each` : 'One asset'}
                />
                {customItem && (
                  <TextField
                    select size="small" label="Which trade maintains it" required
                    value={customTrade} onChange={(e) => setCustomTrade(e.target.value)}
                    helperText="Not in the list, so say who gets sent when it breaks"
                  >
                    {trades.map((d) => <MenuItem key={d.code} value={d.code}>{d.name}</MenuItem>)}
                  </TextField>
                )}
              </>
            )}

            {kind === 'plant' && (
              <TextField
                select size="small" label="Trade" required value={disciplineId}
                onChange={(e) => setDisciplineId(Number(e.target.value))}
                helperText="Routes its work orders and seeds its book life"
              >
                {trades.map((d) => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
              </TextField>
            )}
            {kind === 'clinical' && (
              <TextField
                select size="small" label="Modality" required value={modalityId}
                onChange={(e) => setModalityId(Number(e.target.value))}
              >
                {((modalities as any)?.items ?? []).map((m: any) => (
                  <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>
                ))}
              </TextField>
            )}
          </Box>

          <Box sx={{ mt: 1.75, display: 'grid', gap: 1.75,
                     gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' } }}>
            <TextField size="small" label="Make" required={kind === 'clinical'} value={make}
                       onChange={(e) => setMake(e.target.value)}
                       placeholder={kind === 'plant' ? 'Otis' : kind === 'clinical' ? 'Siemens' : 'Herman Miller'} />
            <TextField size="small" label="Model" required={kind === 'clinical'} value={model}
                       onChange={(e) => setModel(e.target.value)} />
            <TextField size="small" label="Serial number" required={kind === 'clinical'} value={serial}
                       onChange={(e) => setSerial(e.target.value)} disabled={many}
                       helperText={many ? 'Add serials on each asset afterwards' : kind === 'clinical' ? 'Recalls are tracked by it' : 'Optional'} />
          </Box>
        </Section>

        <Section title="Where is it">
          <PlacePicker
            facilityId={facilityId} value={locationId}
            onChange={(id) => setLocationId(id)}
            required={kind === 'room_item'}
            label={kind === 'room_item' ? 'Which room or space' : 'Where is it'}
            helperText={locationId === null
              ? (kind === 'room_item'
                ? 'Any level: a room, a corridor, a floor, a whole building'
                : 'Any level. Leave empty if it is in store or not installed yet')
              : undefined}
          />
        </Section>

        {kind !== 'room_item' && (
          <Section title="What does it serve (optional)">
            <Box sx={{ display: 'grid', gap: 1.75, gridTemplateColumns: { xs: '1fr', sm: '2fr 1fr' } }}>
              <PlacesPicker
                facilityId={facilityId} value={serves} onChange={setServes}
                label="Spaces it supplies"
                helperText="Choose the highest level it wholly serves — a whole floor rather than every room on it"
              />
              <TextField
                select size="small" label="Supplies" value={serviceType} required={serves.length > 0}
                onChange={(e) => setServiceType(e.target.value)} disabled={!serves.length}
              >
                {(serviceTypes ?? []).map((s) => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
              </TextField>
            </Box>
            <Typography sx={{ mt: 0.75, fontSize: 12, color: palette.textFaint }}>
              Its criticality is taken from the most critical of where it is and what it serves —
              an air handler in a plant room that supplies the theatres is as critical as the theatres.
            </Typography>
          </Section>
        )}

        <Section title="Tag">
          <RadioGroup
            value={tagMode} onChange={(e) => setTagMode(e.target.value as 'issue' | 'existing')}
            sx={{ gap: 0.25 }}
          >
            <FormControlLabel
              value="issue" control={<Radio size="small" />}
              label={
                <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>
                  Issue {many ? 'the next tags' : 'the next tag'}
                  {nextTag && (
                    <Box component="span" sx={{ ml: 0.75, fontWeight: 900, color: palette.brandDeep }}>
                      {tagRange(nextTag, count)}
                    </Box>
                  )}
                </Typography>
              }
            />
            <Stack direction="row" alignItems="center" spacing={1}>
              <FormControlLabel
                value="existing" control={<Radio size="small" />} disabled={many} sx={{ mr: 0 }}
                label={<Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>It already has a tag</Typography>}
              />
              {tagMode === 'existing' && (
                <TextField
                  size="small" autoFocus value={existingTag} placeholder="ELEV-3"
                  onChange={(e) => setExistingTag(e.target.value)} sx={{ width: 200 }}
                />
              )}
            </Stack>
          </RadioGroup>
          <Typography sx={{ fontSize: 12, color: palette.textFaint }}>
            {many
              ? 'Several items get consecutive tags. To keep existing stickers, add them one at a time.'
              : 'No two assets at this site can share a tag.'}
          </Typography>
        </Section>

        <Section title="More details (optional)">
          <Box sx={{ display: 'grid', gap: 1.75, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' } }}>
            <TextField size="small" type="number" label={many ? 'Purchase cost, each' : 'Purchase cost'}
                       value={cost} onChange={(e) => setCost(e.target.value)} />
            <TextField size="small" type="date" label="In service since"
                       InputLabelProps={{ shrink: true }} value={installed}
                       onChange={(e) => setInstalled(e.target.value)} />
          </Box>
          <TextField
            sx={{ mt: 1.75 }} fullWidth size="small" multiline minRows={2}
            label="Description" value={description} onChange={(e) => setDescription(e.target.value)}
          />
        </Section>

        <Alert severity="info" sx={{ mt: 2.25, borderRadius: '12px', fontWeight: 600, fontSize: 12.5 }}>
          Once registered you can schedule its inspections, book it in for service, assign a
          technician and move it to another space from the asset itself.
        </Alert>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} sx={{ fontWeight: 800, color: palette.textMuted }}>Cancel</Button>
        <Button
          variant="contained" disabled={!ready || create.isPending}
          onClick={() => create.mutate()}
          sx={{ fontWeight: 900, borderRadius: '10px', bgcolor: palette.brand,
                '&:hover': { bgcolor: palette.brandDeep } }}
        >
          {create.isPending ? 'Registering…' : many ? `Register ${count} assets` : 'Register asset'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
