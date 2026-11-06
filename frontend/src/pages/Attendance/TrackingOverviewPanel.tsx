import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Box,
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import ScreenShareIcon from '@mui/icons-material/ScreenShare'
import TimelineIcon from '@mui/icons-material/Timeline'
import { fetchTrackingOverview, type TrackingOverviewPerson, type TrackingWarning } from '@/api/tracking'
import { asUtc, DEFAULT_EVENT_TIMEZONE } from '@/utils/attendanceTime'
import { isRoughLocation } from '@/utils/markLocation'
import TrackingMap, { type MapPin } from './TrackingMap'
import TrackingDayDialog, { formatMinutes, MarkPlace, percent } from './TrackingDayDialog'
import ScreenViewDialog from './ScreenViewDialog'

export const WARNING_LABELS: Record<TrackingWarning, string> = {
  no_consent: 'Waiting for consent',
  no_desktop_device: 'Desktop app not signed in',
  no_phone_device: 'Phone app not signed in',
  desktop_silent: 'Checked in, desktop app not reporting',
  phone_silent: 'Checked in, phone not reporting',
}

const tz = DEFAULT_EVENT_TIMEZONE
const todayIn = () => new Date().toLocaleDateString('en-CA', { timeZone: tz })
const timeIn = (value: string) =>
  new Date(asUtc(value)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: tz })
const ago = (value: string | null) => {
  if (!value) return 'never'
  const minutes = Math.max(0, Math.round((Date.now() - new Date(asUtc(value)).getTime()) / 60000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  return hours < 48 ? `${hours} h ago` : `${Math.floor(hours / 24)} days ago`
}

interface Props {
  canWatchScreens: boolean
}

/**
 * Everyone tracked, for HR and the super admin: on shift or not, what came in
 * today, where they are now, and what needs attention.
 */
const TrackingOverviewPanel = ({ canWatchScreens }: Props) => {
  const [date, setDate] = useState(todayIn())
  const [dayFor, setDayFor] = useState<TrackingOverviewPerson | null>(null)
  const [watching, setWatching] = useState<TrackingOverviewPerson | null>(null)
  const isToday = date === todayIn()

  const query = useQuery({
    queryKey: ['tracking-overview', date],
    queryFn: () => fetchTrackingOverview(date),
    refetchInterval: isToday ? 30_000 : false,
  })
  const people = query.data?.people ?? []
  const needsAttention = people.filter((person) => person.warnings.length).length

  const pins: MapPin[] = useMemo(() => people
    .filter((person) => person.position)
    .map((person) => ({
      id: person.user_id,
      lat: person.position!.lat,
      lon: person.position!.lon,
      label: person.full_name,
      detail: `${person.position!.source === 'live' ? 'Live' : 'Last saved'} · ${ago(person.position!.recorded_at)}`,
      faded: person.position!.source !== 'live',
      radiusM: isRoughLocation(person.position!.accuracy_m) ? (person.position!.accuracy_m as number) : undefined,
    })), [people])

  return (
    <Box sx={{ display: 'grid', gap: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <TextField
          type="date"
          size="small"
          label="Day"
          value={date}
          onChange={(event) => event.target.value && setDate(event.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: '14px' } }}
        />
        <Typography sx={{ color: '#6B7280', fontSize: '0.875rem' }}>
          {query.isSuccess
            ? `${people.length} tracked${needsAttention ? ` · ${needsAttention} need attention` : ''}${isToday ? ' · refreshes every 30 seconds' : ''}`
            : ''}
        </Typography>
      </Box>

      {isToday && (
        <Box>
          <Typography sx={{ fontWeight: 900, color: '#1E1B4B', mb: 1 }}>Where people are now</Typography>
          {pins.length ? (
            <TrackingMap pins={pins} />
          ) : (
            <Typography sx={{ color: '#6B7280', fontSize: '0.875rem' }}>
              No one is sharing a location right now. Locations show only while someone is checked in with the phone app.
            </Typography>
          )}
        </Box>
      )}

      <TableContainer className="list-scroll-panel">
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell>Person</TableCell>
              <TableCell>Shift</TableCell>
              <TableCell>Desktop activity</TableCell>
              <TableCell>Devices</TableCell>
              <TableCell>Needs attention</TableCell>
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {query.isLoading && <TableRow><TableCell colSpan={6} sx={{ color: '#6B7280' }}>Loading...</TableCell></TableRow>}
            {query.isError && <TableRow><TableCell colSpan={6} sx={{ color: '#B91C1C' }}>Could not load tracking.</TableCell></TableRow>}
            {!query.isLoading && !query.isError && people.length === 0 && (
              <TableRow><TableCell colSpan={6} sx={{ color: '#6B7280' }}>No one is tracked yet.</TableCell></TableRow>
            )}
            {people.map((person) => (
              <TableRow key={person.user_id} hover>
                <TableCell>
                  <Typography sx={{ fontWeight: 800, fontSize: '0.875rem' }}>{person.full_name}</Typography>
                  <Typography sx={{ color: '#6B7280', fontSize: '0.75rem' }}>
                    {[person.desktop_activity && 'Desktop', person.location && 'Location', person.screen_view && 'Screen'].filter(Boolean).join(' · ')}
                  </Typography>
                </TableCell>
                <TableCell>
                  {person.on_shift && person.shift_started_at ? (
                    <>
                      <Chip size="small" label={`On shift since ${timeIn(person.shift_started_at)}`} sx={{ bgcolor: '#DCFCE7', color: '#166534', fontWeight: 800 }} />
                      <MarkPlace mark={person.check_in} prefix="Checked in at " />
                    </>
                  ) : (
                    <Typography sx={{ color: '#9CA3AF', fontSize: '0.8rem' }}>Not checked in</Typography>
                  )}
                </TableCell>
                <TableCell>
                  {person.desktop_activity ? (
                    person.activity.minutes ? (
                      <>
                        <Typography sx={{ fontSize: '0.875rem', fontWeight: 700 }}>
                          {formatMinutes(person.activity.minutes)} · {percent(person.activity.active_ratio)} active
                        </Typography>
                        <Typography sx={{ color: '#6B7280', fontSize: '0.75rem' }}>Mostly {person.activity.top_app}</Typography>
                      </>
                    ) : <Typography sx={{ color: '#9CA3AF', fontSize: '0.8rem' }}>Nothing yet</Typography>
                  ) : <Typography sx={{ color: '#9CA3AF', fontSize: '0.8rem' }}>Off</Typography>}
                </TableCell>
                <TableCell sx={{ fontSize: '0.8rem', color: '#4B5563' }}>
                  {(person.desktop_activity || person.screen_view) && (
                    <div>Desktop: {person.desktop_devices ? `seen ${ago(person.desktop_last_seen_at)}` : 'none'}</div>
                  )}
                  {person.location && <div>Phone: {person.phone_devices ? `seen ${ago(person.phone_last_seen_at)}` : 'none'}</div>}
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {person.warnings.map((warning) => (
                      <Chip key={warning} size="small" label={WARNING_LABELS[warning]} sx={{ bgcolor: '#FEF3C7', color: '#92400E', fontWeight: 800 }} />
                    ))}
                  </Box>
                </TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  <Button size="small" startIcon={<TimelineIcon />} onClick={() => setDayFor(person)} sx={{ fontWeight: 800, color: '#5B21B6' }}>
                    Day
                  </Button>
                  {canWatchScreens && person.screen_view && (
                    <Tooltip title={person.screen_live ? '' : 'Their desktop app is not connected for screen view'}>
                      <span>
                        <Button size="small" startIcon={<ScreenShareIcon />} disabled={!person.screen_live}
                          onClick={() => setWatching(person)} sx={{ fontWeight: 800 }}>
                          View screen
                        </Button>
                      </span>
                    </Tooltip>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <TrackingDayDialog person={dayFor} date={date} onClose={() => setDayFor(null)} />
      {canWatchScreens && <ScreenViewDialog person={watching} onClose={() => setWatching(null)} />}
    </Box>
  )
}

export default TrackingOverviewPanel
