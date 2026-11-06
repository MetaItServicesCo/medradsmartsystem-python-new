import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  Link,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import { fetchTrackingPersonDay, type TrackingMark } from '@/api/tracking'
import { asUtc, DEFAULT_EVENT_TIMEZONE } from '@/utils/attendanceTime'
import TrackingMap, { type MapPin } from './TrackingMap'

interface Props {
  person: { user_id: number; full_name: string } | null
  date: string
  onClose: () => void
}

export const formatMinutes = (minutes: number) => {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return hours ? `${hours}h ${rest}m` : `${rest}m`
}

export const percent = (ratio: number | null) => (ratio == null ? '-' : `${Math.round(ratio * 100)}%`)

const timeIn = (value: string, tz: string) =>
  new Date(asUtc(value)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: tz })

const Stat = ({ label, value }: { label: string; value: string }) => (
  <Box sx={{ px: 2, py: 1.25, borderRadius: '14px', bgcolor: '#F5F3FF', minWidth: 120 }}>
    <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, color: '#6D28D9', textTransform: 'uppercase' }}>{label}</Typography>
    <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>{value}</Typography>
  </Box>
)

const MARK_LABELS: Record<TrackingMark['event_type'], string> = {
  check_in: 'Check in',
  check_out: 'Check out',
  break_start: 'Break start',
  break_end: 'Break end',
}

const MARK_COLOURS: Record<TrackingMark['event_type'], string> = {
  check_in: '#059669',
  check_out: '#DC2626',
  break_start: '#D97706',
  break_end: '#D97706',
}

const hasPosition = (mark: TrackingMark) => mark.latitude != null && mark.longitude != null

/**
 * Where an attendance mark was made: the address when there is one, a link to
 * the map either way, and a plain statement when no location was recorded.
 */
export const MarkPlace = ({ mark, prefix = '' }: { mark: TrackingMark | null; prefix?: string }) => {
  if (!mark) return null
  if (!hasPosition(mark)) {
    return <Typography sx={{ color: '#9CA3AF', fontSize: '0.75rem', mt: 0.5 }}>No location recorded</Typography>
  }
  const accuracy = mark.location_accuracy_m != null ? `Accurate to about ${Math.round(mark.location_accuracy_m)} m` : undefined
  return (
    <Box sx={{ mt: 0.5, maxWidth: 340 }}>
      <Link
        href={`https://www.google.com/maps?q=${mark.latitude},${mark.longitude}`}
        target="_blank"
        rel="noreferrer"
        title={[mark.location_place, accuracy].filter(Boolean).join('\n') || undefined}
        sx={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#5B21B6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {prefix}{mark.location_place || 'this location (open map)'}
      </Link>
    </Box>
  )
}

/**
 * One person's evidence for one day: shifts, where each check-in and check-out
 * was made, apps, a timeline of what was in use, and where they went. Opening
 * it is written to the audit log.
 */
const TrackingDayDialog = ({ person, date, onClose }: Props) => {
  const tz = DEFAULT_EVENT_TIMEZONE
  const query = useQuery({
    queryKey: ['tracking-day', person?.user_id, date, tz],
    queryFn: () => fetchTrackingPersonDay(person!.user_id, date, tz),
    enabled: Boolean(person),
    staleTime: 60_000,
  })
  const day = query.data
  const most = day?.apps[0]?.minutes || 1
  const markPins: MapPin[] = useMemo(() => (day?.marks ?? []).filter(hasPosition).map((mark) => ({
    id: `mark-${mark.id}`,
    lat: mark.latitude as number,
    lon: mark.longitude as number,
    label: `${MARK_LABELS[mark.event_type]} · ${timeIn(mark.event_time, tz)}`,
    detail: mark.location_place || undefined,
    colour: MARK_COLOURS[mark.event_type],
  })), [day, tz])
  const lastPoint = day?.points[day.points.length - 1]
  const pins: MapPin[] = useMemo(() => (lastPoint ? [{
    id: 'last', lat: lastPoint.lat, lon: lastPoint.lon, label: 'Last point', detail: timeIn(lastPoint.recorded_at, tz),
  }, ...markPins] : markPins), [lastPoint, markPins, tz])

  return (
    <Dialog open={Boolean(person)} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ fontWeight: 900, pr: 6 }}>
        {person?.full_name} · {date}
        <IconButton aria-label="Close" onClick={onClose} sx={{ position: 'absolute', right: 12, top: 12 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {query.isLoading && <Typography sx={{ color: '#6B7280' }}>Loading...</Typography>}
        {query.isError && <Typography sx={{ color: '#B91C1C' }}>Could not load this day.</Typography>}
        {day && (
          <Box sx={{ display: 'grid', gap: 2.5 }}>
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
              <Stat label="Shifts" value={day.shifts.length
                ? day.shifts.map((s) => `${timeIn(s.start, tz)}-${s.open ? 'now' : timeIn(s.end, tz)}`).join(', ')
                : 'Not checked in'} />
              <Stat label="Desktop activity" value={formatMinutes(day.totals.minutes)} />
              <Stat label="Active" value={percent(day.totals.active_ratio)} />
              <Stat label="Keys / clicks" value={`${day.totals.keys.toLocaleString()} / ${day.totals.clicks.toLocaleString()}`} />
              <Stat label="Location points" value={String(day.totals.points)} />
            </Box>

            {day.marks.length > 0 && (
              <Box>
                <Typography sx={{ fontWeight: 900, mb: 1 }}>Check-ins and check-outs</Typography>
                <Box sx={{ display: 'grid', gap: 0.75 }}>
                  {day.marks.map((mark) => (
                    <Box key={mark.id} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '110px 90px 1fr' }, gap: 1.5, alignItems: 'baseline' }}>
                      <Typography sx={{ fontWeight: 800, fontSize: '0.875rem', color: MARK_COLOURS[mark.event_type] }}>{MARK_LABELS[mark.event_type]}</Typography>
                      <Typography sx={{ fontSize: '0.875rem' }}>{timeIn(mark.event_time, tz)}</Typography>
                      <MarkPlace mark={mark} />
                    </Box>
                  ))}
                </Box>
              </Box>
            )}

            {pins.length > 0 && (
              <Box>
                <Typography sx={{ fontWeight: 900, mb: 1 }}>{day.points.length > 0 ? 'Route' : 'Map'}</Typography>
                <TrackingMap height={300} route={day.points} pins={pins} />
              </Box>
            )}

            <Box>
              <Typography sx={{ fontWeight: 900, mb: 1 }}>Apps</Typography>
              {day.apps.length === 0 ? (
                <Typography sx={{ color: '#6B7280' }}>No desktop activity this day.</Typography>
              ) : (
                <Box sx={{ display: 'grid', gap: 1 }}>
                  {day.apps.map((app) => (
                    <Box key={app.app} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '200px 1fr 90px' }, gap: 1.5, alignItems: 'center' }}>
                      <Typography sx={{ fontWeight: 800, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{app.app}</Typography>
                      <LinearProgress variant="determinate" value={(app.minutes / most) * 100}
                        sx={{ height: 10, borderRadius: 5, bgcolor: '#EDE9FE', '& .MuiLinearProgress-bar': { bgcolor: '#7C3AED' } }} />
                      <Typography sx={{ fontSize: '0.875rem', textAlign: { sm: 'right' } }}>{formatMinutes(app.minutes)}</Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>

            {day.blocks.length > 0 && (
              <Box>
                <Typography sx={{ fontWeight: 900, mb: 1 }}>Timeline</Typography>
                <Box sx={{ maxHeight: 360, overflow: 'auto', border: '1px solid #EEF0F6', borderRadius: '14px' }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>Time</TableCell>
                        <TableCell>App</TableCell>
                        <TableCell>Windows</TableCell>
                        <TableCell align="right">Minutes</TableCell>
                        <TableCell align="right">Keys / clicks</TableCell>
                        <TableCell align="right">Active</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {day.blocks.map((block, index) => (
                        <TableRow key={`${block.started_at}-${block.app}-${index}`}>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>{timeIn(block.started_at, tz)}-{timeIn(block.ended_at, tz)}</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>{block.app}</TableCell>
                          <TableCell sx={{ maxWidth: 360 }}>
                            <Typography title={block.titles.join('\n')} sx={{ fontSize: '0.8rem', color: '#4B5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {block.titles.join(' · ') || '-'}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">{block.minutes}</TableCell>
                          <TableCell align="right">{block.keys} / {block.clicks}</TableCell>
                          <TableCell align="right">{percent(block.active_ratio)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              </Box>
            )}
            <Typography sx={{ color: '#6B7280', fontSize: '0.8rem' }}>
              Times are shown in {tz}. Only what was collected while checked in is kept. Opening this is recorded in the audit log.
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}

export default TrackingDayDialog
