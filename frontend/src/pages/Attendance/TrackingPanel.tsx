import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Switch,
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
import CloseIcon from '@mui/icons-material/Close'
import DevicesIcon from '@mui/icons-material/Devices'
import SearchIcon from '@mui/icons-material/Search'
import { toast } from 'react-toastify'
import {
  fetchTrackedPeople,
  fetchTrackingDevices,
  revokeTrackingDevice,
  updateTrackingSwitches,
  type TrackedPerson,
  type TrackingSwitches,
} from '@/api/tracking'
import { asUtc } from '@/utils/attendanceTime'

const SWITCHES: { key: keyof TrackingSwitches; label: string; hint: string }[] = [
  { key: 'desktop_activity', label: 'Desktop activity', hint: 'Apps, window titles and input counts from the desktop agent. Never what is typed.' },
  { key: 'location', label: 'Location', hint: "The phone's location, kept as one point every few minutes." },
  { key: 'screen_view', label: 'Screen view', hint: 'Live view of the screen from the desktop agent. Not recorded.' },
]

const errorMessage = (error: unknown, fallback: string) => {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof detail === 'string' ? detail : fallback
}

const when = (value: string | null) => (value ? new Date(asUtc(value)).toLocaleString() : '-')

/**
 * Super admin only: who is tracked, and for what. Tracking never affects pay
 * and collects nothing outside the person's attendance shift; the person must
 * consent before anything is collected.
 */
const TrackingPanel = () => {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [devicesFor, setDevicesFor] = useState<TrackedPerson | null>(null)

  const peopleQuery = useQuery({
    queryKey: ['tracking-people', search.trim()],
    queryFn: () => fetchTrackedPeople(search.trim() || undefined),
  })

  const switchMut = useMutation({
    mutationFn: ({ person, switches }: { person: TrackedPerson; switches: TrackingSwitches }) =>
      updateTrackingSwitches(person.user_id, switches),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['tracking-people'] })
      toast.success(updated.tracked ? `Tracking updated for ${updated.full_name}` : `Tracking switched off for ${updated.full_name}`)
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not update tracking')),
  })

  const devicesQuery = useQuery({
    queryKey: ['tracking-devices', devicesFor?.user_id],
    queryFn: () => fetchTrackingDevices(devicesFor!.user_id),
    enabled: Boolean(devicesFor),
  })

  const revokeMut = useMutation({
    mutationFn: revokeTrackingDevice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tracking-devices'] })
      queryClient.invalidateQueries({ queryKey: ['tracking-people'] })
      toast.success('Device signed out')
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not sign the device out')),
  })

  const toggle = (person: TrackedPerson, key: keyof TrackingSwitches) => {
    const switches: TrackingSwitches = {
      desktop_activity: person.desktop_activity,
      location: person.location,
      screen_view: person.screen_view,
      [key]: !person[key],
    }
    switchMut.mutate({ person, switches })
  }

  const people = peopleQuery.data ?? []

  return (
    <Box sx={{ p: 3 }}>
      <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>Tracking</Typography>
      <Typography sx={{ color: '#6B7280', fontSize: '0.875rem', mb: 2, maxWidth: 760 }}>
        Choose who is tracked and for what. Nothing is collected until the person agrees, and nothing outside their
        attendance shift. Tracking does not affect pay; pay comes only from attendance hours.
      </Typography>
      <TextField
        placeholder="Search people..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
        sx={{ mb: 2, maxWidth: 420, '& .MuiOutlinedInput-root': { borderRadius: '16px' } }}
      />
      <TableContainer className="list-scroll-panel">
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell>Person</TableCell>
              {SWITCHES.map((item) => (
                <TableCell key={item.key} align="center">
                  <Tooltip title={item.hint}><span>{item.label}</span></Tooltip>
                </TableCell>
              ))}
              <TableCell>Consent</TableCell>
              <TableCell align="center">Devices</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {peopleQuery.isLoading && (
              <TableRow><TableCell colSpan={6} sx={{ color: '#6B7280' }}>Loading...</TableCell></TableRow>
            )}
            {peopleQuery.isError && (
              <TableRow><TableCell colSpan={6} sx={{ color: '#B91C1C' }}>Could not load people.</TableCell></TableRow>
            )}
            {!peopleQuery.isLoading && !peopleQuery.isError && people.length === 0 && (
              <TableRow><TableCell colSpan={6} sx={{ color: '#6B7280' }}>No one matches.</TableCell></TableRow>
            )}
            {people.map((person) => (
              <TableRow key={person.user_id} hover>
                <TableCell>
                  <Typography sx={{ fontWeight: 800, fontSize: '0.875rem' }}>{person.full_name}</Typography>
                  <Typography sx={{ color: '#6B7280', fontSize: '0.75rem' }}>
                    {person.username}{person.role ? ` · ${person.role.replace(/_/g, ' ')}` : ''}{person.is_active ? '' : ' · inactive'}
                  </Typography>
                </TableCell>
                {SWITCHES.map((item) => (
                  <TableCell key={item.key} align="center">
                    <Switch
                      checked={person[item.key]}
                      onChange={() => toggle(person, item.key)}
                      disabled={switchMut.isPending}
                      inputProps={{ 'aria-label': `${item.label} for ${person.full_name}` }}
                    />
                  </TableCell>
                ))}
                <TableCell>
                  {!person.tracked ? (
                    <Typography sx={{ color: '#9CA3AF', fontSize: '0.8rem' }}>Not tracked</Typography>
                  ) : person.consent_required ? (
                    <Chip size="small" label="Waiting for consent" sx={{ bgcolor: '#FEF3C7', color: '#92400E', fontWeight: 800 }} />
                  ) : (
                    <Tooltip title={`Agreed ${when(person.consent_at)}`}>
                      <Chip size="small" label="Agreed" sx={{ bgcolor: '#DCFCE7', color: '#166534', fontWeight: 800 }} />
                    </Tooltip>
                  )}
                </TableCell>
                <TableCell align="center">
                  <Button
                    size="small"
                    startIcon={<DevicesIcon />}
                    onClick={() => setDevicesFor(person)}
                    sx={{ fontWeight: 800, color: '#5B21B6' }}
                  >
                    {person.active_devices}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={Boolean(devicesFor)} onClose={() => setDevicesFor(null)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 900, pr: 6 }}>
          Devices · {devicesFor?.full_name}
          <IconButton aria-label="Close" onClick={() => setDevicesFor(null)} sx={{ position: 'absolute', right: 12, top: 12 }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {devicesQuery.isLoading ? (
            <Typography sx={{ color: '#6B7280' }}>Loading...</Typography>
          ) : (devicesQuery.data ?? []).length === 0 ? (
            <Typography sx={{ color: '#6B7280' }}>
              No devices yet. The person signs in once on their desktop agent or phone app with their MedRad username and password.
            </Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Device</TableCell>
                  <TableCell>Kind</TableCell>
                  <TableCell>Signed in</TableCell>
                  <TableCell>Last seen</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {(devicesQuery.data ?? []).map((device) => (
                  <TableRow key={device.id}>
                    <TableCell>
                      {device.name}
                      {device.os_name && <Typography component="span" sx={{ color: '#6B7280', fontSize: '0.75rem' }}> · {device.os_name}</Typography>}
                    </TableCell>
                    <TableCell sx={{ textTransform: 'capitalize' }}>{device.kind}</TableCell>
                    <TableCell>{when(device.created_at)}</TableCell>
                    <TableCell>{when(device.last_seen_at)}</TableCell>
                    <TableCell align="right">
                      {device.revoked_at ? (
                        <Typography sx={{ color: '#9CA3AF', fontSize: '0.8rem' }}>Signed out {when(device.revoked_at)}</Typography>
                      ) : (
                        <Button
                          size="small"
                          color="error"
                          disabled={revokeMut.isPending}
                          onClick={() => revokeMut.mutate(device.id)}
                          sx={{ fontWeight: 800 }}
                        >
                          Sign out
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDevicesFor(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default TrackingPanel
