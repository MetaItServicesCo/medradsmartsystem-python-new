/**
 * Trace a floor plan into a room register.
 *
 * For a customer with no existing room list this is not a second view of data
 * that already exists — it is where the data comes from. Click the drawing,
 * type the door number, move on. Anything that puts a form between those two
 * makes surveying a floor take a day instead of an hour.
 *
 * Pins are stored as fractions of the image, never pixels, so re-rendering the
 * source at a different resolution does not move every room on the floor.
 *
 * Drawn as an SVG overlay on a plain <img> rather than a canvas library: it
 * zooms, it stays accessible, and it grows into polygons later without a
 * rewrite.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Tooltip,
  Typography,
} from '@mui/material'
import PlaceIcon from '@mui/icons-material/Place'
import PolylineIcon from '@mui/icons-material/Polyline'
import StraightenIcon from '@mui/icons-material/Straighten'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import { useDropzone } from 'react-dropzone'
import { toast } from 'react-toastify'

import {
  calibrateFloorPlan, fetchFloorPlans, fetchPins, placePins,
  quickPin, traceRoom, updateFloorPlan, uploadFloorPlan,
  type FloorPlan, type LocationWithStatus,
} from '@/api/locations'
import { usePlanImage } from './usePlanImage'
import { palette } from '@/theme/palette'

const BRAND = palette.brand
const INK = palette.ink

const AVAILABILITY_COLOR: Record<string, string> = {
  available: palette.brandMid,
  vacant_clean: palette.brandMid,
  occupied: palette.infoBright,
  in_procedure: palette.infoBright,
  vacant_dirty: palette.warningBright,
  turnover: palette.warningBright,
  terminal_clean: palette.warningBright,
  // Violet, not green: the brand moved to emerald, which freed violet up — and
  // a reserved pin that reads as available is worse than an uncoloured one.
  reserved: palette.violetMid,
  blocked: palette.dangerBright,
  out_of_service: palette.dangerBright,
}

type Mode = 'view' | 'pin' | 'calibrate' | 'trace'

interface Props {
  location: { id: number; code: string; facility_id: number }
  canEdit: boolean
  spaceUses: Array<{ value: string; label: string }>
}

export default function FloorPlanEditor({ location, canEdit, spaceUses }: Props) {
  const queryClient = useQueryClient()
  const imageRef = useRef<HTMLImageElement | null>(null)

  const [mode, setMode] = useState<Mode>('view')
  const [pendingPoint, setPendingPoint] = useState<{ x: number; y: number } | null>(null)
  const [calibrationStart, setCalibrationStart] = useState<{ x: number; y: number } | null>(null)
  const [calibrationEnd, setCalibrationEnd] = useState<{ x: number; y: number } | null>(null)
  const [calibrationFeet, setCalibrationFeet] = useState('3')
  const [tracePoints, setTracePoints] = useState<Array<{ x: number; y: number }>>([])
  const [traceTarget, setTraceTarget] = useState<number | ''>('')

  const { data: plans, isLoading } = useQuery({
    queryKey: ['floor-plans', location.id],
    queryFn: () => fetchFloorPlans(location.id),
  })

  const plan: FloorPlan | undefined = plans?.items?.[0]

  const { data: pins } = useQuery({
    queryKey: ['floor-plan-pins', plan?.id],
    queryFn: () => fetchPins(plan!.id),
    enabled: !!plan,
  })

  // PDFs are rasterised here rather than served as-is: the most common source
  // for a hospital plan is the life safety drawing, and a PDF in an <img>
  // renders nothing at all.
  const planImage = usePlanImage(
    plan?.id ?? null,
    plan?.source_mime,
    plan?.source_filename,
    plan?.page_number,
  )

  // Record the source's true pixel size once we know it. Calibration converts a
  // line drawn on the rendered image into source pixels; without this the scale
  // silently depends on how wide the browser drew the drawing.
  useEffect(() => {
    if (!plan || !planImage.width || !planImage.height) return
    if (plan.width_px === planImage.width && plan.height_px === planImage.height) return
    updateFloorPlan(plan.id, { width_px: planImage.width, height_px: planImage.height })
      .then(() => queryClient.invalidateQueries({ queryKey: ['floor-plans', location.id] }))
      .catch(() => { /* Cosmetic: calibration falls back to the rendered size. */ })
  }, [plan, planImage.width, planImage.height, queryClient, location.id])

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadFloorPlan(location.id, file),
    onSuccess: () => {
      toast.success('Drawing uploaded')
      queryClient.invalidateQueries({ queryKey: ['floor-plans', location.id] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Upload failed'),
  })

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    multiple: false,
    accept: {
      'application/pdf': ['.pdf'],
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/webp': ['.webp'],
      'image/svg+xml': ['.svg'],
    },
    onDrop: (files) => files[0] && uploadMutation.mutate(files[0]),
    disabled: !canEdit,
  })

  const quickPinMutation = useMutation({
    mutationFn: (payload: { code: string; name?: string; space_use?: string }) =>
      quickPin(plan!.id, {
        code: payload.code,
        name: payload.name || null,
        space_use: payload.space_use || null,
        location_type: 'room',
        plan_x: pendingPoint!.x,
        plan_y: pendingPoint!.y,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['floor-plan-pins', plan?.id] })
      queryClient.invalidateQueries({ queryKey: ['location-tree'] })
      setPendingPoint(null)
      // Stay in pin mode: the loop is click, name, click, name.
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Could not place the room'),
  })

  const calibrateMutation = useMutation({
    mutationFn: ({ pixels, feet }: { pixels: number; feet: number }) =>
      calibrateFloorPlan(plan!.id, pixels, feet),
    onSuccess: () => {
      toast.success('Scale set — traced rooms now yield square feet')
      queryClient.invalidateQueries({ queryKey: ['floor-plans', location.id] })
      setMode('view')
      setCalibrationStart(null)
      setCalibrationEnd(null)
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Calibration failed'),
  })

  const traceMutation = useMutation({
    mutationFn: () => traceRoom(Number(traceTarget), tracePoints, true),
    onSuccess: (res) => {
      toast.success(
        res.area_sqft != null
          ? `Area set to ${res.area_sqft.toLocaleString()} sq ft`
          : res.message || 'Outline saved',
      )
      // A saved outline with no computable area is not a failure — it just
      // needs the drawing calibrating, and the message says so.
      if (res.area_sqft == null && res.message) toast.info(res.message)
      setTracePoints([])
      setTraceTarget('')
      queryClient.invalidateQueries({ queryKey: ['floor-plan-pins', plan?.id] })
      queryClient.invalidateQueries({ queryKey: ['location', Number(traceTarget)] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Could not save the outline'),
  })

  const movePinMutation = useMutation({
    mutationFn: (pin: { location_id: number; plan_x: number; plan_y: number }) =>
      placePins(plan!.id, [pin]),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['floor-plan-pins', plan?.id] }),
  })

  /** Click position as a fraction of the rendered image, 0..1. */
  const pointFromEvent = (e: React.MouseEvent): { x: number; y: number } | null => {
    const img = imageRef.current
    if (!img) return null
    const rect = img.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    }
  }

  const handleClick = (e: React.MouseEvent) => {
    if (!plan || !canEdit) return
    const point = pointFromEvent(e)
    if (!point) return

    if (mode === 'pin') {
      setPendingPoint(point)
      return
    }
    if (mode === 'trace') {
      setTracePoints((prev) => [...prev, point])
      return
    }
    if (mode === 'calibrate') {
      if (!calibrationStart) setCalibrationStart(point)
      else if (!calibrationEnd) setCalibrationEnd(point)
      else { setCalibrationStart(point); setCalibrationEnd(null) }
    }
  }

  const calibrationPixels = useMemo(() => {
    if (!calibrationStart || !calibrationEnd) return null
    const img = imageRef.current
    if (!img) return null
    const rect = img.getBoundingClientRect()
    const dx = (calibrationEnd.x - calibrationStart.x) * rect.width
    const dy = (calibrationEnd.y - calibrationStart.y) * rect.height
    // Measured against the rendered image, then scaled to the source, so the
    // browser zoom level at calibration time does not change the answer.
    const renderedDistance = Math.hypot(dx, dy)
    const scaleToSource = plan?.width_px ? plan.width_px / rect.width : 1
    return renderedDistance * scaleToSource
  }, [calibrationStart, calibrationEnd, plan])

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress size={22} thickness={5} sx={{ color: BRAND }} />
      </Box>
    )
  }

  if (!plan) {
    return (
      <Box sx={{ p: 3 }}>
        <Box
          {...getRootProps()}
          sx={{
            p: 5, textAlign: 'center', borderRadius: '18px', cursor: canEdit ? 'pointer' : 'default',
            border: `2px dashed ${isDragActive ? BRAND : palette.brandBorder}`,
            backgroundColor: isDragActive ? palette.brandTint : '#FCFCFD',
          }}
        >
          <input {...getInputProps()} />
          <UploadFileIcon sx={{ fontSize: 42, color: palette.brandPale, mb: 1 }} />
          <Typography sx={{ fontWeight: 900, color: INK }}>
            Upload the plan for {location.code}
          </Typography>
          <Typography sx={{ fontSize: 13, color: palette.textMuted, maxWidth: 460, mx: 'auto', mt: 0.5 }}>
            PDF, PNG or JPEG. Life safety drawings are the usual source — every hospital is
            required to keep them, so they exist even when no room list does.
          </Typography>
          {uploadMutation.isPending && (
            <CircularProgress size={20} thickness={5} sx={{ color: BRAND, mt: 2 }} />
          )}
        </Box>
      </Box>
    )
  }

  return (
    <Box sx={{ p: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
        <ToggleButtonGroup
          size="small" exclusive value={mode}
          onChange={(_, v) => { if (v) { setMode(v); setCalibrationStart(null); setCalibrationEnd(null) } }}
          disabled={!canEdit}
          sx={{ '& .MuiToggleButton-root': { fontWeight: 800, textTransform: 'none', borderRadius: '10px !important', px: 1.5 }, '& .Mui-selected': { backgroundColor: '#ECFDF5 !important', color: `${BRAND} !important` } }}
        >
          <ToggleButton value="view">View</ToggleButton>
          <ToggleButton value="pin"><PlaceIcon sx={{ fontSize: 16, mr: 0.5 }} />Place rooms</ToggleButton>
          <ToggleButton value="calibrate"><StraightenIcon sx={{ fontSize: 16, mr: 0.5 }} />Set scale</ToggleButton>
          <ToggleButton value="trace"><PolylineIcon sx={{ fontSize: 16, mr: 0.5 }} />Trace room</ToggleButton>
        </ToggleButtonGroup>

        <Box sx={{ flex: 1 }} />

        <Chip
          label={`${pins?.length || 0} placed`} size="small"
          sx={{ height: 24, fontWeight: 800, fontSize: 11, borderRadius: '8px', backgroundColor: palette.brandTint, color: palette.brandDeep }}
        />
        {plan.scale_ft_per_px ? (
          <Tooltip title="Traced rooms yield square feet, hence cubic feet, hence air changes per hour">
            <Chip
              label="Scaled" size="small"
              sx={{ height: 24, fontWeight: 800, fontSize: 11, borderRadius: '8px', backgroundColor: palette.successTint, color: palette.success }}
            />
          </Tooltip>
        ) : (
          <Chip
            label="No scale" size="small"
            sx={{ height: 24, fontWeight: 800, fontSize: 11, borderRadius: '8px', backgroundColor: palette.warningTint, color: palette.warning }}
          />
        )}
        <Chip
          label={`v${plan.version}`} size="small"
          sx={{ height: 24, fontWeight: 800, fontSize: 11, borderRadius: '8px', backgroundColor: palette.surfaceMuted, color: palette.slate600 }}
        />
      </Stack>

      {mode === 'pin' && (
        <Alert severity="info" sx={{ mb: 1.5, borderRadius: '12px', fontWeight: 700 }}>
          Click a room on the drawing, type its door number, and keep going.
        </Alert>
      )}
      {mode === 'trace' && (
        <Box sx={{ mb: 1.5 }}>
          <Alert severity="info" sx={{ borderRadius: '12px', fontWeight: 700, mb: 1 }}>
            Click each corner of the room. With the drawing calibrated, the area
            comes straight out of the trace — no tape measure, and it feeds the
            volume an air-change check needs.
          </Alert>
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField
              select size="small" label="Room" value={traceTarget} sx={{ minWidth: 220 }}
              onChange={(e) => setTraceTarget(Number(e.target.value))}
            >
              {(pins || []).map((pin) => (
                <MenuItem key={pin.id} value={pin.id}>
                  {pin.code}{pin.name ? ` — ${pin.name}` : ''}
                </MenuItem>
              ))}
            </TextField>
            <Chip
              label={`${tracePoints.length} corner${tracePoints.length === 1 ? '' : 's'}`}
              size="small"
              sx={{ height: 26, fontWeight: 800, fontSize: 11, borderRadius: '8px', backgroundColor: palette.brandTint, color: palette.brandDeep }}
            />
            <Button
              size="small" disabled={!tracePoints.length}
              onClick={() => setTracePoints((prev) => prev.slice(0, -1))}
              sx={{ fontWeight: 800, textTransform: 'none', color: palette.textMuted }}
            >
              Undo
            </Button>
            <Button
              size="small" variant="contained"
              disabled={tracePoints.length < 3 || !traceTarget || traceMutation.isPending}
              onClick={() => traceMutation.mutate()}
              sx={{ fontWeight: 900, borderRadius: '10px', textTransform: 'none', background: palette.gradientBrand }}
            >
              Save outline
            </Button>
          </Stack>
        </Box>
      )}

      {mode === 'calibrate' && (
        <Alert severity="info" sx={{ mb: 1.5, borderRadius: '12px', fontWeight: 700 }}>
          Click both ends of something you know the length of — a three-foot door leaf, or the
          drawing&apos;s own scale bar — then enter what it measures.
        </Alert>
      )}

      <Box
        sx={{
          position: 'relative', borderRadius: '16px', overflow: 'auto',
          border: `1px solid ${palette.brandBorder}`, backgroundColor: '#FAFAFB', maxHeight: 620,
        }}
      >
        {planImage.loading && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, py: 8 }}>
            <CircularProgress size={22} thickness={5} sx={{ color: BRAND }} />
            <Typography sx={{ fontSize: 12, fontWeight: 800, color: palette.textFaint }}>
              Rendering the drawing…
            </Typography>
          </Box>
        )}

        {/* A failed drawing used to render as an empty box with no explanation —
            the specific failure mode of both a 401 and a PDF in an <img>. */}
        {planImage.error && !planImage.loading && (
          <Box sx={{ py: 6, px: 3, textAlign: 'center' }}>
            <Typography sx={{ fontWeight: 900, color: INK, mb: 0.5 }}>
              {planImage.error}
            </Typography>
            <Typography sx={{ fontSize: 13, color: palette.textMuted }}>
              Upload the drawing again, or try a PNG export of it.
            </Typography>
          </Box>
        )}

        <Box sx={{
          position: 'relative', display: 'inline-block', minWidth: '100%',
          visibility: planImage.src ? 'visible' : 'hidden',
          height: planImage.src ? 'auto' : 0,
        }}>
          <img
            ref={imageRef}
            src={planImage.src || undefined}
            alt={`Floor plan for ${location.code}`}
            onClick={handleClick}
            style={{
              display: 'block', width: '100%', height: 'auto',
              cursor: mode === 'view' ? 'default' : 'crosshair',
            }}
          />

          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              pointerEvents: 'none', overflow: 'visible',
            }}
          >
            {(pins || []).map((pin: LocationWithStatus) => {
              const x = Number(pin.plan_x) * 100
              const y = Number(pin.plan_y) * 100
              const color = AVAILABILITY_COLOR[pin.availability || 'available'] || palette.textFaint
              return (
                <g key={pin.id}>
                  {/* Non-uniform viewBox scaling would squash a circle, so the
                      marker is drawn in screen units via vector-effect. */}
                  <circle
                    cx={x} cy={y} r={0.9}
                    fill={color} fillOpacity={0.9} stroke={palette.white} strokeWidth={0.25}
                    vectorEffect="non-scaling-stroke"
                  />
                  <title>{`${pin.code}${pin.name ? ` — ${pin.name}` : ''}${pin.availability ? ` (${pin.availability.replace(/_/g, ' ')})` : ''}`}</title>
                </g>
              )
            })}

            {(pins || []).filter((p) => p.plan_polygon?.length).map((pin) => (
              <polygon
                key={`poly-${pin.id}`}
                points={(pin.plan_polygon || []).map((v: any) => `${v.x * 100},${v.y * 100}`).join(' ')}
                fill={BRAND} fillOpacity={0.07}
                stroke={BRAND} strokeOpacity={0.45} strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {tracePoints.length > 0 && (
              <polygon
                points={tracePoints.map((v) => `${v.x * 100},${v.y * 100}`).join(' ')}
                fill={BRAND} fillOpacity={0.15}
                stroke={BRAND} strokeWidth={2} vectorEffect="non-scaling-stroke"
              />
            )}
            {tracePoints.map((v, i) => (
              <circle
                key={`tp-${i}`} cx={v.x * 100} cy={v.y * 100} r={0.7}
                fill={palette.white} stroke={BRAND} strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {calibrationStart && calibrationEnd && (
              <line
                x1={calibrationStart.x * 100} y1={calibrationStart.y * 100}
                x2={calibrationEnd.x * 100} y2={calibrationEnd.y * 100}
                stroke={BRAND} strokeWidth={2} vectorEffect="non-scaling-stroke"
                strokeDasharray="4 3"
              />
            )}
            {pendingPoint && (
              <circle
                cx={pendingPoint.x * 100} cy={pendingPoint.y * 100} r={1.2}
                fill="none" stroke={BRAND} strokeWidth={2} vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
        </Box>
      </Box>

      {/* Rooms in the register with no pin yet — drag them on, or leave them:
          a space is allowed to exist without a place on a drawing. */}
      <UnplacedTray planId={plan.id} facilityId={location.facility_id} onPlace={movePinMutation.mutate} />

      <QuickPinDialog
        open={!!pendingPoint}
        spaceUses={spaceUses}
        onClose={() => setPendingPoint(null)}
        onSubmit={(payload) => quickPinMutation.mutate(payload)}
        submitting={quickPinMutation.isPending}
      />

      <Dialog
        open={mode === 'calibrate' && !!calibrationPixels}
        onClose={() => { setCalibrationStart(null); setCalibrationEnd(null) }}
        fullWidth maxWidth="xs" PaperProps={{ sx: { borderRadius: '20px' } }}
      >
        <DialogTitle sx={{ fontWeight: 900, color: INK }}>Set the scale</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 13, color: palette.textMuted, mb: 2 }}>
            That line is {calibrationPixels?.toFixed(0)} px on the source drawing.
            What does it measure in the real world?
          </Typography>
          <TextField
            size="small" fullWidth label="Real length" type="number"
            value={calibrationFeet} onChange={(e) => setCalibrationFeet(e.target.value)}
            InputProps={{ endAdornment: <Typography sx={{ fontWeight: 800, color: palette.textFaint }}>ft</Typography> }}
            helperText="A standard door leaf is 3 ft"
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => { setCalibrationStart(null); setCalibrationEnd(null) }} sx={{ fontWeight: 800, color: palette.textMuted }}>
            Redo
          </Button>
          <Button
            variant="contained"
            disabled={!calibrationPixels || !Number(calibrationFeet)}
            onClick={() => calibrateMutation.mutate({
              pixels: calibrationPixels as number,
              feet: Number(calibrationFeet),
            })}
            sx={{ background: palette.gradientBrand, borderRadius: '10px', fontWeight: 900, px: 2.5 }}
          >
            Set scale
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

function QuickPinDialog({ open, spaceUses, onClose, onSubmit, submitting }: {
  open: boolean
  spaceUses: Array<{ value: string; label: string }>
  onClose: () => void
  onSubmit: (payload: { code: string; name?: string; space_use?: string }) => void
  submitting: boolean
}) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [spaceUse, setSpaceUse] = useState('')

  const submit = () => {
    if (!code.trim()) return
    onSubmit({ code: code.trim(), name, space_use: spaceUse })
    setCode('')
    setName('')
    // Space use is deliberately kept between placements: a surveyor tracing a
    // ward is placing twenty patient rooms in a row, not twenty different kinds.
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" PaperProps={{ sx: { borderRadius: '20px' } }}>
      <DialogTitle sx={{ fontWeight: 900, color: INK }}>Name this room</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField
            autoFocus size="small" label="Door number" fullWidth required value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
            helperText="OR-3, 4W-12 — exactly what is on the door"
          />
          <TextField size="small" label="Name" fullWidth value={name} onChange={(e) => setName(e.target.value)} />
          <TextField
            select size="small" label="Space use" fullWidth value={spaceUse}
            onChange={(e) => setSpaceUse(e.target.value)}
            helperText="Kept for the next room, so a ward traces quickly"
          >
            <MenuItem value="">—</MenuItem>
            {spaceUses.map((u) => <MenuItem key={u.value} value={u.value}>{u.label}</MenuItem>)}
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} sx={{ fontWeight: 800, color: palette.textMuted }}>Cancel</Button>
        <Button
          variant="contained" disabled={!code.trim() || submitting} onClick={submit}
          sx={{ background: palette.gradientBrand, borderRadius: '10px', fontWeight: 900, px: 2.5 }}
        >
          Place
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function UnplacedTray({ planId, facilityId, onPlace }: {
  planId: number
  facilityId: number
  onPlace: (pin: { location_id: number; plan_x: number; plan_y: number }) => void
}) {
  const { data } = useQuery({
    queryKey: ['unplaced-locations', facilityId],
    queryFn: async () => {
      const { fetchLocations } = await import('@/api/locations')
      return fetchLocations({ facility_id: facilityId, unplaced_only: true, location_type: 'room', limit: 50 })
    },
  })

  const items = data?.items || []
  if (!items.length) return null

  return (
    <Box sx={{ mt: 1.5, p: 1.5, borderRadius: '14px', backgroundColor: '#FCFCFD', border: `1px solid ${palette.surfaceMuted}` }}>
      <Typography sx={{ fontSize: 11, fontWeight: 900, color: palette.textFaint, textTransform: 'uppercase', letterSpacing: 0.4, mb: 0.75 }}>
        Not yet on a drawing ({items.length})
      </Typography>
      <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', gap: 0.75 }}>
        {items.slice(0, 24).map((room) => (
          <Tooltip key={room.id} title="Place at the centre, then drag into position">
            <Chip
              label={room.code} size="small" onClick={() => onPlace({ location_id: room.id, plan_x: 0.5, plan_y: 0.5 })}
              sx={{ height: 24, fontWeight: 800, fontSize: 11, borderRadius: '8px', backgroundColor: palette.white, border: `1px solid ${palette.border}`, cursor: 'pointer' }}
            />
          </Tooltip>
        ))}
      </Stack>
    </Box>
  )
}
