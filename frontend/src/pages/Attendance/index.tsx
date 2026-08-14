import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatedNumber } from '@/components/motion'
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
  IconButton,
  InputAdornment,
  ListItemIcon,
  Menu,
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
import MoreVertIcon from '@mui/icons-material/MoreVert'
import SearchIcon from '@mui/icons-material/Search'
import VideocamIcon from '@mui/icons-material/Videocam'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import { toast } from 'react-toastify'
import { useSearchParams } from 'react-router-dom'
import ContextTableRow from '@/components/ContextTableRow'

import {
  createAttendanceEvent,
  createAttendanceProfile,
  fetchAttendanceEvents,
  fetchAttendanceProfiles,
  fetchAttendanceSummary,
  recognizeAttendanceFace,
  trainAttendanceFaceModel,
  uploadAttendanceFaceSample,
  type AttendanceEvent,
  type AttendanceFaceBox,
  type AttendanceFaceRecognitionResponse,
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

const ACTION_MENU_PAPER = {
  elevation: 12,
  sx: {
    minWidth: 210,
    borderRadius: '18px',
    border: '1px solid rgba(124,58,237,0.14)',
    boxShadow: '0 24px 60px rgba(30,27,75,0.18)',
    overflow: 'hidden',
  },
}

const ACTION_MENU_ITEM = {
  gap: 1,
  px: 2,
  py: 1.2,
  fontWeight: 800,
  color: '#1E1B4B',
  '& .MuiListItemIcon-root': { minWidth: 30, color: 'inherit' },
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

const CAMERA_WAIT_MS = 8000

const openUserCamera = async () => {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 24, max: 30 },
      },
      audio: false,
    })
  } catch {
    return navigator.mediaDevices.getUserMedia({ video: true, audio: false })
  }
}

const cameraErrorMessage = (error: unknown) => {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Camera permission is blocked. Click the camera icon in the address bar and allow camera access.'
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No camera was found on this device.'
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'Camera is already in use by another app or browser tab.'
  }
  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return 'Camera constraints failed. Retrying with the default camera may help.'
  }
  return 'Camera could not be started. Check browser permissions and device camera settings.'
}

const waitForVideoFrame = (video: HTMLVideoElement, timeoutMs = 7000) => new Promise<boolean>((resolve) => {
  const startedAt = Date.now()
  let settled = false
  let frameId = 0

  const finish = (ready: boolean) => {
    if (settled) return
    settled = true
    if (frameId) window.cancelAnimationFrame(frameId)
    resolve(ready)
  }

  const hasFrame = () => video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0

  const check = () => {
    if (hasFrame()) {
      finish(true)
      return
    }
    if (Date.now() - startedAt > timeoutMs) {
      finish(false)
      return
    }
    frameId = window.requestAnimationFrame(check)
  }

  const requestVideoFrameCallback = (video as any).requestVideoFrameCallback
  if (typeof requestVideoFrameCallback === 'function') {
    requestVideoFrameCallback.call(video, () => {
      if (hasFrame()) finish(true)
    })
  }

  check()
})

const hasLiveVideoTrack = (stream: MediaStream | null) => (
  Boolean(stream?.getVideoTracks().some((track) => track.readyState === 'live' && track.enabled))
)

const hasVideoFrame = (video: HTMLVideoElement | null) => (
  Boolean(video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0)
)

const Attendance = () => {
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const currentUser = useAuthStore((s) => s.user)
  const [tab, setTab] = useState(0)
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [selectedDate, setSelectedDate] = useState(todayIso())
  const [eventDialog, setEventDialog] = useState<AttendanceProfile | null>(null)
  const [enrollDialog, setEnrollDialog] = useState<AttendanceProfile | null>(null)
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraStatus, setCameraStatus] = useState('Camera not started')
  const [cameraAttempt, setCameraAttempt] = useState(0)
  const [attendanceCameraOpen, setAttendanceCameraOpen] = useState(false)
  const [attendanceStream, setAttendanceStream] = useState<MediaStream | null>(null)
  const [attendanceCameraReady, setAttendanceCameraReady] = useState(false)
  const [attendanceCameraStatus, setAttendanceCameraStatus] = useState('Camera not started')
  const [attendanceCameraAttempt, setAttendanceCameraAttempt] = useState(0)
  const [attendanceEventType, setAttendanceEventType] = useState<AttendanceEventPayload['event_type']>('check_in')
  const [detectedFaces, setDetectedFaces] = useState<AttendanceFaceBox[]>([])
  const [recognitionResult, setRecognitionResult] = useState<AttendanceFaceRecognitionResponse | null>(null)
  const [recognitionBusy, setRecognitionBusy] = useState(false)
  const [eventType, setEventType] = useState<AttendanceEventPayload['event_type']>('check_in')
  const [remark, setRemark] = useState('')
  const [actionAnchor, setActionAnchor] = useState<HTMLElement | null>(null)
  const [actionProfile, setActionProfile] = useState<AttendanceProfile | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const attendanceVideoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const attendanceCanvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    setSearch(searchParams.get('search') || '')
  }, [searchParams.get('search')])

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

  const attachStreamToVideo = async (
    video: HTMLVideoElement | null,
    stream: MediaStream | null,
    setReady: (ready: boolean) => void,
    setStatus: (status: string) => void,
  ) => {
    if (!video || !stream) return
    video.muted = true
    video.autoplay = true
    video.playsInline = true
    if (video.srcObject !== stream) {
      setReady(false)
      setStatus('Starting camera...')
      video.srcObject = stream
    }
    try {
      await video.play()
      const hasFrame = await waitForVideoFrame(video)
      if (hasFrame) {
        setReady(true)
        setStatus('Camera ready')
      } else {
        const track = stream.getVideoTracks()[0]
        const label = track?.label ? ` (${track.label})` : ''
        setStatus(`Camera is active${label}, but no video frame was received. Try Retry Camera or close other camera apps.`)
      }
    } catch {
      setStatus('Click inside the browser and allow camera playback')
    }
  }

  const markCameraReady = (
    video: HTMLVideoElement | null,
    stream: MediaStream | null,
    setReady: (ready: boolean) => void,
    setStatus: (status: string) => void,
  ) => {
    if (!video || !stream) return
    if (hasVideoFrame(video)) {
      setReady(true)
      setStatus('Camera ready')
    }
  }

  useEffect(() => {
    attachStreamToVideo(videoRef.current, cameraStream, setCameraReady, setCameraStatus)
  }, [cameraStream])

  useEffect(() => {
    attachStreamToVideo(attendanceVideoRef.current, attendanceStream, setAttendanceCameraReady, setAttendanceCameraStatus)
  }, [attendanceStream])

  useEffect(() => () => {
    cameraStream?.getTracks().forEach((track) => track.stop())
  }, [cameraStream])

  useEffect(() => () => {
    attendanceStream?.getTracks().forEach((track) => track.stop())
  }, [attendanceStream])

  useEffect(() => {
    if (!enrollDialog || cameraStream) return
    let cancelled = false
    let waitTimer: number | undefined
    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraStatus('Camera access is not available in this browser')
        toast.error('Camera access is not available in this browser')
        return
      }
      setCameraStatus('Requesting camera permission...')
      waitTimer = window.setTimeout(() => {
        if (!cancelled) {
          setCameraStatus('Still waiting for camera permission. Click the camera icon in the address bar and allow access.')
        }
      }, CAMERA_WAIT_MS)
      try {
        const stream = await openUserCamera()
        if (waitTimer) window.clearTimeout(waitTimer)
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        setCameraStream(stream)
      } catch (error) {
        if (waitTimer) window.clearTimeout(waitTimer)
        const message = cameraErrorMessage(error)
        setCameraStatus(message)
        toast.error(message)
      }
    }
    start()
    return () => {
      cancelled = true
      if (waitTimer) window.clearTimeout(waitTimer)
    }
  }, [enrollDialog, cameraStream, cameraAttempt])

  useEffect(() => {
    if (!attendanceCameraOpen || attendanceStream) return
    let cancelled = false
    let waitTimer: number | undefined
    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setAttendanceCameraStatus('Camera access is not available in this browser')
        toast.error('Camera access is not available in this browser')
        return
      }
      setAttendanceCameraStatus('Requesting camera permission...')
      waitTimer = window.setTimeout(() => {
        if (!cancelled) {
          setAttendanceCameraStatus('Still waiting for camera permission. Click the camera icon in the address bar and allow access.')
        }
      }, CAMERA_WAIT_MS)
      try {
        const stream = await openUserCamera()
        if (waitTimer) window.clearTimeout(waitTimer)
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        setAttendanceStream(stream)
      } catch (error) {
        if (waitTimer) window.clearTimeout(waitTimer)
        const message = cameraErrorMessage(error)
        setAttendanceCameraStatus(message)
        toast.error(message)
      }
    }
    start()
    return () => {
      cancelled = true
      if (waitTimer) window.clearTimeout(waitTimer)
    }
  }, [attendanceCameraOpen, attendanceStream, attendanceCameraAttempt])

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
          <Typography sx={{ color: '#1E1B4B', fontWeight: 900, fontSize: 28 }}>{typeof value === 'number' ? <AnimatedNumber value={value} /> : (value ?? 0)}</Typography>
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

  const openActions = (event: React.MouseEvent<HTMLElement>, profile: AttendanceProfile) => {
    event.stopPropagation()
    setActionAnchor(event.currentTarget)
    setActionProfile(profile)
  }

  const closeActions = () => {
    setActionAnchor(null)
    setActionProfile(null)
  }

  const openLiveEnroll = async (profile: AttendanceProfile) => {
    if (profile.id <= 0) {
      toast.error('Create the attendance profile before live enrollment')
      return
    }
    setCameraReady(false)
    setCameraStatus('Preparing camera...')
    setEnrollDialog(profile)
  }

  const closeLiveEnroll = () => {
    cameraStream?.getTracks().forEach((track) => track.stop())
    setCameraStream(null)
    setCameraReady(false)
    setCameraStatus('Camera not started')
    setEnrollDialog(null)
  }

  const retryLiveEnrollCamera = () => {
    cameraStream?.getTracks().forEach((track) => track.stop())
    setCameraStream(null)
    setCameraReady(false)
    setCameraStatus('Requesting camera permission...')
    setCameraAttempt((attempt) => attempt + 1)
  }

  const captureFrame = (video: HTMLVideoElement | null, canvas: HTMLCanvasElement | null, filename: string) => {
    if (!video || !canvas || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d')
    if (!context) return null
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
    const binary = atob(dataUrl.split(',')[1])
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return new File([bytes], filename, { type: 'image/jpeg' })
  }

  const openFaceAttendance = (type: AttendanceEventPayload['event_type']) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error('Camera access is not available in this browser')
      return
    }
    setAttendanceEventType(type)
    setRecognitionResult(null)
    setDetectedFaces([])
    setAttendanceStream(null)
    setAttendanceCameraReady(false)
    setAttendanceCameraStatus('Requesting camera permission...')
    setAttendanceCameraOpen(true)
    setAttendanceCameraAttempt((attempt) => attempt + 1)
  }

  const closeFaceAttendance = () => {
    attendanceStream?.getTracks().forEach((track) => track.stop())
    setAttendanceStream(null)
    setAttendanceCameraReady(false)
    setAttendanceCameraStatus('Camera not started')
    setAttendanceCameraOpen(false)
    setDetectedFaces([])
    setRecognitionResult(null)
  }

  const retryFaceAttendanceCamera = () => {
    attendanceStream?.getTracks().forEach((track) => track.stop())
    setAttendanceStream(null)
    setAttendanceCameraReady(false)
    setAttendanceCameraStatus('Requesting camera permission...')
    setDetectedFaces([])
    setRecognitionResult(null)
    setAttendanceCameraAttempt((attempt) => attempt + 1)
  }

  const scanAndMarkAttendance = async () => {
    const file = captureFrame(attendanceVideoRef.current, attendanceCanvasRef.current, 'attendance-face.jpg')
    if (!file) {
      toast.error('Camera frame is not ready yet')
      return
    }
    setRecognitionBusy(true)
    try {
      const result = await recognizeAttendanceFace(file, {
        event_type: attendanceEventType,
        device_label: 'Smart Attendance Camera',
      })
      setRecognitionResult(result)
      setDetectedFaces(result.faces || [])
      if (result.matched && result.verification_status === 'verified') {
        toast.success(`${result.profile?.full_name || 'User'} matched, attendance marked`)
        invalidateAttendance()
      } else if (result.matched && result.verification_status === 'needs_review') {
        toast.warning(`${result.profile?.full_name || 'User'} matched with low confidence, sent to review`)
        invalidateAttendance()
      } else {
        toast.error(result.message || 'Face was not recognized')
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Face recognition failed')
    } finally {
      setRecognitionBusy(false)
    }
  }

  const recognitionColor = recognitionResult?.matched
    ? recognitionResult.verification_status === 'verified'
      ? '#10B981'
      : '#F59E0B'
    : recognitionResult
    ? '#EF4444'
    : '#8B5CF6'

  const captureLiveSample = () => {
    if (!activeEnrollProfile || !videoRef.current || !canvasRef.current) return
    const file = captureFrame(videoRef.current, canvasRef.current, `live-face-${Date.now()}.jpg`)
    if (!file) return toast.error('Unable to capture face image')
    faceSampleMut.mutate({ profileId: activeEnrollProfile.id, file })
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
            <Typography sx={{ color: 'rgba(255,255,255,0.82)', fontWeight: 700 }}>All attendance and break actions require face recognition.</Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button onClick={() => openFaceAttendance('check_in')} startIcon={<VideocamIcon />} variant="contained" sx={{ bgcolor: '#111827', color: '#fff', fontWeight: 900, '&:hover': { bgcolor: '#1F2937' } }}>Face Check In</Button>
            <Button onClick={() => openFaceAttendance('check_out')} startIcon={<VideocamIcon />} variant="contained" sx={{ bgcolor: '#111827', color: '#fff', fontWeight: 900, '&:hover': { bgcolor: '#1F2937' } }}>Face Check Out</Button>
            <Button onClick={() => openFaceAttendance('break_start')} startIcon={<CoffeeIcon />} variant="contained" sx={{ bgcolor: '#fff', color: '#5B21B6', fontWeight: 900, '&:hover': { bgcolor: '#F5F3FF' } }}>Face Break Start</Button>
            <Button onClick={() => openFaceAttendance('break_end')} startIcon={<DoneAllIcon />} variant="contained" sx={{ bgcolor: '#fff', color: '#5B21B6', fontWeight: 900, '&:hover': { bgcolor: '#F5F3FF' } }}>Face Break End</Button>
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
            <TableContainer className="list-scroll-panel">
              <Table stickyHeader>
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
                      <ContextTableRow
                        key={`${profile.user_id}-${profile.id}`}
                        recordKey={`attendance-profile-${profile.user_id}-${profile.id}`}
                        recordLabel={profile.user.full_name}
                      >
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
                          <IconButton size="small" onClick={(event) => openActions(event, profile)} sx={{ bgcolor: '#F4F1FF', color: '#7C3AED', '&:hover': { bgcolor: '#EDE9FE' } }}>
                            <MoreVertIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </ContextTableRow>
                    )
                  })}
                  {profilesQ.isLoading && <TableRow><TableCell colSpan={6}><CircularProgress size={22} /></TableCell></TableRow>}
                  {!profilesQ.isLoading && profiles.length === 0 && <TableRow><TableCell colSpan={6}>No employees found</TableCell></TableRow>}
                </TableBody>
              </Table>
            </TableContainer>
            <Menu anchorEl={actionAnchor} open={Boolean(actionAnchor)} onClose={closeActions} PaperProps={ACTION_MENU_PAPER}>
              {actionProfile && actionProfile.id <= 0 ? (
                <MenuItem
                  sx={ACTION_MENU_ITEM}
                  disabled={createProfileMut.isPending}
                  onClick={() => {
                    const profile = actionProfile
                    closeActions()
                    if (profile) createProfileMut.mutate(profile)
                  }}
                >
                  <ListItemIcon><BadgeIcon fontSize="small" /></ListItemIcon>
                  Create Profile
                </MenuItem>
              ) : (
                <>
                  <MenuItem
                    sx={ACTION_MENU_ITEM}
                    onClick={() => {
                      const profile = actionProfile
                      closeActions()
                      if (profile) openLiveEnroll(profile)
                    }}
                  >
                    <ListItemIcon><VideocamIcon fontSize="small" /></ListItemIcon>
                    Live Enroll
                  </MenuItem>
                  <MenuItem component="label" sx={ACTION_MENU_ITEM}>
                    <ListItemIcon><CameraAltIcon fontSize="small" /></ListItemIcon>
                    Upload Image
                    <input
                      hidden
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) => {
                        const profile = actionProfile
                        const file = event.target.files?.[0]
                        closeActions()
                        if (profile) uploadSample(profile, file)
                      }}
                    />
                  </MenuItem>
                  <MenuItem
                    sx={ACTION_MENU_ITEM}
                    disabled={trainFaceMut.isPending || !actionProfile || actionProfile.face_samples_count < 1}
                    onClick={() => {
                      const profile = actionProfile
                      closeActions()
                      if (profile) trainFaceMut.mutate(profile.id)
                    }}
                  >
                    <ListItemIcon><ModelTrainingIcon fontSize="small" /></ListItemIcon>
                    Train
                  </MenuItem>
                  <MenuItem
                    sx={ACTION_MENU_ITEM}
                    onClick={() => {
                      const profile = actionProfile
                      closeActions()
                      if (profile) setEventDialog(profile)
                    }}
                  >
                    <ListItemIcon><DoneAllIcon fontSize="small" /></ListItemIcon>
                    Mark Event
                  </MenuItem>
                </>
              )}
            </Menu>
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

      <Dialog open={attendanceCameraOpen} onClose={closeFaceAttendance} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: '22px', overflow: 'hidden' } }}>
        <DialogTitle sx={{ fontWeight: 900, color: '#1E1B4B' }}>
          Face Recognition Attendance
          <Typography sx={{ color: '#8B95A7', fontWeight: 700, fontSize: 13 }}>
            {EVENT_LABELS[attendanceEventType]} with live face detection
          </Typography>
        </DialogTitle>
        <DialogContent dividers sx={{ display: 'grid', gap: 2 }}>
          <Box
            sx={{
              position: 'relative',
              borderRadius: '18px',
              overflow: 'hidden',
              border: `2px solid ${recognitionColor}`,
              background: '#111827',
              aspectRatio: '4 / 3',
            }}
          >
            <video
              ref={attendanceVideoRef}
              autoPlay
              muted
              playsInline
              onLoadedMetadata={() => markCameraReady(attendanceVideoRef.current, attendanceStream, setAttendanceCameraReady, setAttendanceCameraStatus)}
              onLoadedData={() => markCameraReady(attendanceVideoRef.current, attendanceStream, setAttendanceCameraReady, setAttendanceCameraStatus)}
              onCanPlay={() => markCameraReady(attendanceVideoRef.current, attendanceStream, setAttendanceCameraReady, setAttendanceCameraStatus)}
              onPlaying={() => markCameraReady(attendanceVideoRef.current, attendanceStream, setAttendanceCameraReady, setAttendanceCameraStatus)}
              onTimeUpdate={() => markCameraReady(attendanceVideoRef.current, attendanceStream, setAttendanceCameraReady, setAttendanceCameraStatus)}
              onResize={() => markCameraReady(attendanceVideoRef.current, attendanceStream, setAttendanceCameraReady, setAttendanceCameraStatus)}
              style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
            />
            <canvas ref={attendanceCanvasRef} hidden />
            {!attendanceCameraReady && (
              <Box
                sx={{
                  position: 'absolute',
                  inset: 0,
                  display: 'grid',
                  placeItems: 'center',
                  color: '#CBD5E1',
                  background: 'rgba(15,23,42,0.72)',
                  textAlign: 'center',
                  p: 3,
                }}
              >
                <Box>
                  <CircularProgress size={28} sx={{ color: '#A78BFA', mb: 1.5 }} />
                  <Typography sx={{ fontWeight: 900 }}>{attendanceCameraStatus}</Typography>
                  <Typography sx={{ fontSize: 12, color: '#94A3B8', mt: 0.5 }}>
                    Allow camera access and wait for the preview to appear.
                  </Typography>
                  <Button
                    size="small"
                    variant="contained"
                    onClick={retryFaceAttendanceCamera}
                    sx={{ mt: 1.5, borderRadius: '10px', fontWeight: 900, bgcolor: '#7C3AED', '&:hover': { bgcolor: '#6D28D9' } }}
                  >
                    Retry Camera
                  </Button>
                </Box>
              </Box>
            )}
            {detectedFaces.map((face, index) => {
              const videoWidth = attendanceVideoRef.current?.videoWidth || 1
              const videoHeight = attendanceVideoRef.current?.videoHeight || 1
              return (
                <Box
                  key={`${face.x}-${face.y}-${index}`}
                  sx={{
                    position: 'absolute',
                    left: `${(face.x / videoWidth) * 100}%`,
                    top: `${(face.y / videoHeight) * 100}%`,
                    width: `${(face.width / videoWidth) * 100}%`,
                    height: `${(face.height / videoHeight) * 100}%`,
                    border: `3px solid ${recognitionColor}`,
                    borderRadius: '12px',
                    boxShadow: `0 0 22px ${recognitionColor}66`,
                    pointerEvents: 'none',
                  }}
                >
                  <Box sx={{ position: 'absolute', left: 0, top: -30, px: 1, py: 0.3, borderRadius: '8px', bgcolor: recognitionColor, color: '#fff', fontSize: 12, fontWeight: 900 }}>
                    Face {Math.round((face.confidence || 0) * 100)}%
                  </Box>
                </Box>
              )
            })}
          </Box>

          <Card sx={{ p: 2, borderRadius: '16px', border: '1px solid #E9E5FF', bgcolor: '#F8FAFF' }}>
            <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>
              {recognitionResult?.message || (detectedFaces.length ? 'Face detected. Scan to mark attendance.' : 'Waiting for a face...')}
            </Typography>
            {recognitionResult && (
              <Typography sx={{ color: '#6B7280', fontWeight: 800, mt: 0.5 }}>
                {recognitionResult.profile?.full_name || recognitionResult.candidate?.full_name || 'Unknown'} · Confidence {Math.round(Number(recognitionResult.confidence || 0) * 100)}% · {recognitionResult.verification_status.replace('_', ' ')}
              </Typography>
            )}
          </Card>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={closeFaceAttendance} sx={{ fontWeight: 900 }}>Close</Button>
          <Button
            variant="contained"
            startIcon={recognitionBusy ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : <VideocamIcon />}
            disabled={recognitionBusy || !attendanceStream || !attendanceCameraReady}
            onClick={scanAndMarkAttendance}
            sx={{ fontWeight: 900, background: 'linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)' }}
          >
            Scan & Mark
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
              position: 'relative',
              borderRadius: '18px',
              overflow: 'hidden',
              border: '1px solid #E9E5FF',
              background: '#111827',
              aspectRatio: '4 / 3',
            }}
          >
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              onLoadedMetadata={() => attachStreamToVideo(videoRef.current, cameraStream, setCameraReady, setCameraStatus)}
              onLoadedData={() => {
                setCameraReady(true)
                setCameraStatus('Camera ready')
              }}
              onCanPlay={() => {
                setCameraReady(true)
                setCameraStatus('Camera ready')
              }}
              onPlaying={() => markCameraReady(videoRef.current, cameraStream, setCameraReady, setCameraStatus)}
              onTimeUpdate={() => markCameraReady(videoRef.current, cameraStream, setCameraReady, setCameraStatus)}
              onResize={() => markCameraReady(videoRef.current, cameraStream, setCameraReady, setCameraStatus)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
            <canvas ref={canvasRef} hidden />
            {!cameraReady && (
              <Box
                sx={{
                  position: 'absolute',
                  inset: 0,
                  display: 'grid',
                  placeItems: 'center',
                  color: '#CBD5E1',
                  background: 'rgba(15,23,42,0.72)',
                  textAlign: 'center',
                  p: 3,
                }}
              >
                <Box>
                  <CircularProgress size={28} sx={{ color: '#A78BFA', mb: 1.5 }} />
                  <Typography sx={{ fontWeight: 900 }}>{cameraStatus}</Typography>
                  <Typography sx={{ fontSize: 12, color: '#94A3B8', mt: 0.5 }}>
                    If the preview stays dark, check browser camera permissions or choose another camera in Chrome.
                  </Typography>
                  <Button
                    size="small"
                    variant="contained"
                    onClick={retryLiveEnrollCamera}
                    sx={{ mt: 1.5, borderRadius: '10px', fontWeight: 900, bgcolor: '#7C3AED', '&:hover': { bgcolor: '#6D28D9' } }}
                  >
                    Retry Camera
                  </Button>
                </Box>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={closeLiveEnroll} sx={{ fontWeight: 900 }}>Close</Button>
          <Button
            variant="contained"
            startIcon={<CameraAltIcon />}
            disabled={faceSampleMut.isPending || !cameraStream || !cameraReady}
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
  <TableContainer className="list-scroll-panel">
    <Table stickyHeader>
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
            <ContextTableRow
              key={event.id}
              recordKey={`attendance-event-${event.id}`}
              recordLabel={`${event.user.full_name} · ${EVENT_LABELS[event.event_type] || event.event_type}`}
            >
              <TableCell sx={{ fontWeight: 900, color: '#1E1B4B' }}>{event.user.full_name}</TableCell>
              <TableCell><Chip label={EVENT_LABELS[event.event_type] || event.event_type} sx={{ bgcolor: colors.bg, color: colors.color, fontWeight: 900 }} /></TableCell>
              <TableCell>{formatDateTime(event.event_time)}</TableCell>
              <TableCell>{event.facility?.name || '-'}</TableCell>
              <TableCell sx={{ textTransform: 'capitalize' }}>{event.source}</TableCell>
              <TableCell>{event.remark || '-'}</TableCell>
            </ContextTableRow>
          )
        })}
        {rows.length === 0 && <TableRow><TableCell colSpan={6}>No attendance events found</TableCell></TableRow>}
      </TableBody>
    </Table>
  </TableContainer>
)

export default Attendance
