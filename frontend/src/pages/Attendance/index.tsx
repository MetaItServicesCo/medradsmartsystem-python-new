import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Avatar,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  MenuItem,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import BadgeIcon from '@mui/icons-material/Badge'
import CameraAltIcon from '@mui/icons-material/CameraAlt'
import CoffeeIcon from '@mui/icons-material/Coffee'
import DoneAllIcon from '@mui/icons-material/DoneAll'
import LoginIcon from '@mui/icons-material/Login'
import LogoutIcon from '@mui/icons-material/Logout'
import ModelTrainingIcon from '@mui/icons-material/ModelTraining'
import SearchIcon from '@mui/icons-material/Search'
import VideocamIcon from '@mui/icons-material/Videocam'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import { toast } from 'react-toastify'

import {
  createAttendanceEvent,
  createAttendanceProfile,
  fetchAttendanceEvents,
  fetchAttendanceProfiles,
  fetchAttendanceSummary,
  trainAttendanceFaceModel,
  uploadAttendanceFaceSample,
  type AttendanceEvent,
  type AttendanceEventPayload,
  type AttendanceProfile,
} from '@/api/attendance'
import { resolveUploadUrl } from '@/api/users'
import { useAuthStore } from '@/stores/authStore'

const EVENT_LABELS: Record<string, string> = {
  check_in: 'Check In',
  check_out: 'Check Out',
  break_start: 'Break Start',
  break_end: 'Break End',
}

const EVENT_COLORS: Record<string, { bg: string; color: string }> = {
  check_in: { bg: '#D1FAE5', color: '#047857' },
  check_out: { bg: '#E0E7FF', color: '#4338CA' },
  break_start: { bg: '#FEF3C7', color: '#B45309' },
  break_end: { bg: '#ECFDF5', color: '#059669' },
}

const FACE_STATUS: Record<string, { label: string; bg: string; color: string }> = {
  enrolled: { label: 'Enrolled', bg: '#D1FAE5', color: '#047857' },
  needs_retrain: { label: 'Needs Retrain', bg: '#FEF3C7', color: '#B45309' },
  not_enrolled: { label: 'Not Enrolled', bg: '#FEE2E2', color: '#DC2626' },
}

const todayIso = () => new Date().toISOString().slice(0, 10)

const formatDateTime = (value: string) => new Date(value).toLocaleString('en-US', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const Attendance = () => {
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  const [tab, setTab] = useState(0)
  const [search, setSearch] = useState('')
  const [selectedDate, setSelectedDate] = useState(todayIso())
  const [eventDialog, setEventDialog] = useState<AttendanceProfile | null>(null)
  const [enrollDialog, setEnrollDialog] = useState<AttendanceProfile | null>(null)
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
  const [eventType, setEventType] = useState<AttendanceEventPayload['event_type']>('check_in')
  const [remark, setRemark] = useState('')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const summaryQ = useQuery({
    queryKey: ['attendance-summary', selectedDate],
    queryFn: () => fetchAttendanceSummary(selectedDate),
  })

  const profilesQ = useQuery({
    queryKey: ['attendance-profiles', search],
    queryFn: () => fetchAttendanceProfiles({ search: search || undefined, limit: 200 }),
  })

  const eventsQ = useQuery({
    queryKey: ['attendance-events', selectedDate],
    queryFn: () => fetchAttendanceEvents({ date_from: selectedDate, date_to: selectedDate, limit: 200 }),
  })

  useEffect(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream
    }
  }, [cameraStream])

  useEffect(() => () => {
    cameraStream?.getTracks().forEach((track) => track.stop())
  }, [cameraStream])

  const invalidateAttendance = () => {
    queryClient.invalidateQueries({ queryKey: ['attendance-summary'] })
    queryClient.invalidateQueries({ queryKey: ['attendance-events'] })
    queryClient.invalidateQueries({ queryKey: ['attendance-profiles'] })
  }

  const createProfileMut = useMutation({
    mutationFn: (profile: AttendanceProfile) => createAttendanceProfile({
      user_id: profile.user_id,
      facility_id: profile.facility_id || null,
      employee_code: profile.employee_code || String(profile.user_id),
    }),
    onSuccess: () => {
      toast.success('Attendance profile created')
      invalidateAttendance()
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to create profile'),
  })

  const faceSampleMut = useMutation({
    mutationFn: ({ profileId, file }: { profileId: number; file: File }) => uploadAttendanceFaceSample(profileId, file),
    onSuccess: () => {
      toast.success('Face sample uploaded')
      invalidateAttendance()
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to upload face sample'),
  })

  const trainFaceMut = useMutation({
    mutationFn: (profileId: number) => trainAttendanceFaceModel(profileId),
    onSuccess: () => {
      toast.success('Face model trained')
      invalidateAttendance()
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to train face model'),
  })

  const eventMut = useMutation({
    mutationFn: (payload: AttendanceEventPayload) => createAttendanceEvent(payload),
    onSuccess: () => {
      toast.success('Attendance event recorded')
      setEventDialog(null)
      setRemark('')
      invalidateAttendance()
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to record attendance'),
  })

  const stats = summaryQ.data
  const latestEvents = stats?.latest_events || []
  const eventRows = eventsQ.data?.items || []
  const profiles = profilesQ.data?.items || []
  const activeEventProfile = eventDialog
  const activeEnrollProfile = enrollDialog

  const profileOptions = useMemo(() => profiles.filter(item => item.id > 0), [profiles])

  const renderKpi = (label: string, value: number | undefined, icon: JSX.Element, color: string) => (
    <Card sx={{ p: 2.4, borderRadius: '20px', border: '1px solid #E9E5FF', boxShadow: '0 18px 45px rgba(49,46,129,0.08)' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box sx={{ width: 48, height: 48, borderRadius: '16px', display: 'grid', placeItems: 'center', background: `${color}16`, color }}>
          {icon}
        </Box>
        <Box>
          <Typography sx={{ color: '#8B95A7', fontWeight: 900, fontSize: 12, textTransform: 'uppercase' }}>{label}</Typography>
          <Typography sx={{ color: '#1E1B4B', fontWeight: 900, fontSize: 28 }}>{value ?? 0}</Typography>
        </Box>
      </Box>
    </Card>
  )

  const markOwnAttendance = (type: AttendanceEventPayload['event_type']) => {
    eventMut.mutate({ event_type: type, user_id: currentUser?.id, source: 'manual', remark: 'Self service attendance' })
  }

  const uploadSample = (profile: AttendanceProfile, file?: File) => {
    if (!file) return
    if (profile.id <= 0) {
      toast.error('Create the attendance profile before uploading a face sample')
      return
    }
    faceSampleMut.mutate({ profileId: profile.id, file })
  }

  const openLiveEnroll = async (profile: AttendanceProfile) => {
    if (profile.id <= 0) {
      toast.error('Create the attendance profile before live enrollment')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error('Camera access is not available in this browser')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      setEnrollDialog(profile)
      setCameraStream(stream)
    } catch {
      toast.error('Camera permission was denied or no camera was found')
    }
  }

  const closeLiveEnroll = () => {
    cameraStream?.getTracks().forEach((track) => track.stop())
    setCameraStream(null)
    setEnrollDialog(null)
  }

  const captureLiveSample = () => {
    if (!activeEnrollProfile || !videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const context = canvas.getContext('2d')
    if (!context) return
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob((blob) => {
      if (!blob) {
        toast.error('Unable to capture face image')
        return
      }
      const file = new File([blob], `live-face-${Date.now()}.jpg`, { type: 'image/jpeg' })
      faceSampleMut.mutate({ profileId: activeEnrollProfile.id, file })
    }, 'image/jpeg', 0.92)
  }

  return (
    <Box sx={{ p: 4, minHeight: '100vh', background: '#F8FAFF' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'center', mb: 3, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 900, color: '#1E1B4B' }}>Smart Attendance</Typography>
          <Typography sx={{ color: '#6B7280', fontWeight: 700 }}>Face enrollment, shift attendance, breaks, and HR review.</Typography>
        </Box>
        <TextField
          type="date"
          size="small"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          sx={{ width: 180, '& .MuiOutlinedInput-root': { borderRadius: '14px', background: '#fff' } }}
        />
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(5, 1fr)' }, gap: 2, mb: 3 }}>
        {renderKpi('Employees', stats?.total_employees, <BadgeIcon />, '#7C3AED')}
        {renderKpi('Face Enrolled', stats?.enrolled_faces, <CameraAltIcon />, '#EC4899')}
        {renderKpi('Checked In', stats?.checked_in, <LoginIcon />, '#059669')}
        {renderKpi('On Break', stats?.on_break, <CoffeeIcon />, '#D97706')}
        {renderKpi('Needs Review', stats?.needs_review, <WarningAmberIcon />, '#DC2626')}
      </Box>

      <Card sx={{ mb: 3, p: 2, borderRadius: '22px', border: '1px solid #E9E5FF', background: 'linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)', color: '#fff' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          <Box>
            <Typography sx={{ fontWeight: 900, fontSize: 20 }}>Quick Attendance</Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.82)', fontWeight: 700 }}>Manual fallback while camera recognition is being productionized.</Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button onClick={() => markOwnAttendance('check_in')} startIcon={<LoginIcon />} variant="contained" sx={{ bgcolor: '#fff', color: '#5B21B6', fontWeight: 900, '&:hover': { bgcolor: '#F5F3FF' } }}>Check In</Button>
            <Button onClick={() => markOwnAttendance('break_start')} startIcon={<CoffeeIcon />} variant="contained" sx={{ bgcolor: '#fff', color: '#5B21B6', fontWeight: 900, '&:hover': { bgcolor: '#F5F3FF' } }}>Break Start</Button>
            <Button onClick={() => markOwnAttendance('break_end')} startIcon={<DoneAllIcon />} variant="contained" sx={{ bgcolor: '#fff', color: '#5B21B6', fontWeight: 900, '&:hover': { bgcolor: '#F5F3FF' } }}>Break End</Button>
            <Button onClick={() => markOwnAttendance('check_out')} startIcon={<LogoutIcon />} variant="contained" sx={{ bgcolor: '#fff', color: '#5B21B6', fontWeight: 900, '&:hover': { bgcolor: '#F5F3FF' } }}>Check Out</Button>
          </Box>
        </Box>
      </Card>

      <Card sx={{ borderRadius: '24px', border: '1px solid #E9E5FF', overflow: 'hidden', boxShadow: '0 20px 55px rgba(49,46,129,0.08)' }}>
        <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ px: 2, borderBottom: '1px solid #EEF0F6', '& .Mui-selected': { color: '#7C3AED !important', fontWeight: 900 } }}>
          <Tab label="Today" />
          <Tab label="Employees" />
          <Tab label="History" />
        </Tabs>

        {tab === 0 && (
          <Box sx={{ p: 3 }}>
            <Typography sx={{ fontWeight: 900, color: '#1E1B4B', mb: 2 }}>Recent Activity</Typography>
            <EventTable rows={latestEvents} />
          </Box>
        )}

        {tab === 1 && (
          <Box sx={{ p: 3 }}>
            <TextField
              placeholder="Search employees..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
              sx={{ mb: 2, maxWidth: 420, '& .MuiOutlinedInput-root': { borderRadius: '16px' } }}
            />
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Employee</TableCell>
                    <TableCell>Facility</TableCell>
                    <TableCell>Code</TableCell>
                    <TableCell>Face Status</TableCell>
                    <TableCell>Samples</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {profiles.map((profile) => {
                    const status = FACE_STATUS[profile.face_status] || FACE_STATUS.not_enrolled
                    return (
                      <TableRow key={`${profile.user_id}-${profile.id}`}>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Avatar src={resolveUploadUrl(profile.user.avatar_url)}>{profile.user.full_name.charAt(0)}</Avatar>
                            <Box>
                              <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>{profile.user.full_name}</Typography>
                              <Typography sx={{ color: '#8B95A7', fontSize: 13 }}>{profile.user.email}</Typography>
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell>{profile.facility?.name || '-'}</TableCell>
                        <TableCell>{profile.employee_code || profile.user_id}</TableCell>
                        <TableCell>
                          <Box sx={{ display: 'grid', gap: 0.5 }}>
                            <Chip label={status.label} sx={{ width: 'fit-content', bgcolor: status.bg, color: status.color, fontWeight: 900 }} />
                            {profile.face_model_version && (
                              <Typography sx={{ color: '#8B95A7', fontSize: 12, fontWeight: 700 }}>
                                Model: {profile.face_model_version}
                              </Typography>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>{profile.face_samples_count}</TableCell>
                        <TableCell align="right">
                          {profile.id <= 0 ? (
                            <Button size="small" onClick={() => createProfileMut.mutate(profile)} disabled={createProfileMut.isPending} sx={{ fontWeight: 900 }}>Create Profile</Button>
                          ) : (
                            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, flexWrap: 'wrap' }}>
                              <Button size="small" startIcon={<VideocamIcon />} onClick={() => openLiveEnroll(profile)} sx={{ fontWeight: 900 }}>
                                Live Enroll
                              </Button>
                              <Button component="label" size="small" startIcon={<CameraAltIcon />} sx={{ fontWeight: 900 }}>
                                Upload Image
                                <input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => uploadSample(profile, e.target.files?.[0])} />
                              </Button>
                              <Button
                                size="small"
                                startIcon={<ModelTrainingIcon />}
                                disabled={trainFaceMut.isPending || profile.face_samples_count < 1}
                                onClick={() => trainFaceMut.mutate(profile.id)}
                                sx={{ fontWeight: 900 }}
                              >
                                Train
                              </Button>
                              <Button size="small" onClick={() => setEventDialog(profile)} sx={{ fontWeight: 900 }}>Mark Event</Button>
                            </Box>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {profilesQ.isLoading && <TableRow><TableCell colSpan={6}><CircularProgress size={22} /></TableCell></TableRow>}
                  {!profilesQ.isLoading && profiles.length === 0 && <TableRow><TableCell colSpan={6}>No employees found</TableCell></TableRow>}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {tab === 2 && (
          <Box sx={{ p: 3 }}>
            <EventTable rows={eventRows} />
          </Box>
        )}
      </Card>

      <Dialog open={Boolean(activeEventProfile)} onClose={() => setEventDialog(null)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '22px' } }}>
        <DialogTitle sx={{ fontWeight: 900, color: '#1E1B4B' }}>Mark Attendance Event</DialogTitle>
        <DialogContent dividers sx={{ display: 'grid', gap: 2 }}>
          <Typography sx={{ fontWeight: 800 }}>{activeEventProfile?.user.full_name}</Typography>
          <TextField select label="Event" value={eventType} onChange={(e) => setEventType(e.target.value as AttendanceEventPayload['event_type'])}>
            {Object.entries(EVENT_LABELS).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
          </TextField>
          <TextField label="Remark" value={remark} onChange={(e) => setRemark(e.target.value)} multiline rows={3} />
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setEventDialog(null)} sx={{ fontWeight: 900 }}>Cancel</Button>
          <Button
            variant="contained"
            disabled={eventMut.isPending || !activeEventProfile}
            onClick={() => activeEventProfile && eventMut.mutate({
              user_id: activeEventProfile.user_id,
              facility_id: activeEventProfile.facility_id || undefined,
              event_type: eventType,
              source: 'admin',
              remark,
            })}
            sx={{ fontWeight: 900, background: 'linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)' }}
          >
            Save Event
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(activeEnrollProfile)} onClose={closeLiveEnroll} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '22px' } }}>
        <DialogTitle sx={{ fontWeight: 900, color: '#1E1B4B' }}>Live Face Enrollment</DialogTitle>
        <DialogContent dividers sx={{ display: 'grid', gap: 2 }}>
          <Box>
            <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>{activeEnrollProfile?.user.full_name}</Typography>
            <Typography sx={{ color: '#8B95A7', fontWeight: 700, fontSize: 13 }}>
              Center the face in the frame, use clear light, then capture one or more samples.
            </Typography>
          </Box>
          <Box
            sx={{
              borderRadius: '18px',
              overflow: 'hidden',
              border: '1px solid #E9E5FF',
              background: '#111827',
              aspectRatio: '4 / 3',
            }}
          >
            <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            <canvas ref={canvasRef} hidden />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={closeLiveEnroll} sx={{ fontWeight: 900 }}>Close</Button>
          <Button
            variant="contained"
            startIcon={<CameraAltIcon />}
            disabled={faceSampleMut.isPending || !cameraStream}
            onClick={captureLiveSample}
            sx={{ fontWeight: 900, background: 'linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)' }}
          >
            Capture Sample
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

const EventTable = ({ rows }: { rows: AttendanceEvent[] }) => (
  <TableContainer>
    <Table>
      <TableHead>
        <TableRow>
          <TableCell>Employee</TableCell>
          <TableCell>Event</TableCell>
          <TableCell>Time</TableCell>
          <TableCell>Facility</TableCell>
          <TableCell>Source</TableCell>
          <TableCell>Remark</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((event) => {
          const colors = EVENT_COLORS[event.event_type] || { bg: '#F3F4F6', color: '#374151' }
          return (
            <TableRow key={event.id}>
              <TableCell sx={{ fontWeight: 900, color: '#1E1B4B' }}>{event.user.full_name}</TableCell>
              <TableCell><Chip label={EVENT_LABELS[event.event_type] || event.event_type} sx={{ bgcolor: colors.bg, color: colors.color, fontWeight: 900 }} /></TableCell>
              <TableCell>{formatDateTime(event.event_time)}</TableCell>
              <TableCell>{event.facility?.name || '-'}</TableCell>
              <TableCell sx={{ textTransform: 'capitalize' }}>{event.source}</TableCell>
              <TableCell>{event.remark || '-'}</TableCell>
            </TableRow>
          )
        })}
        {rows.length === 0 && <TableRow><TableCell colSpan={6}>No attendance events found</TableCell></TableRow>}
      </TableBody>
    </Table>
  </TableContainer>
)

export default Attendance
