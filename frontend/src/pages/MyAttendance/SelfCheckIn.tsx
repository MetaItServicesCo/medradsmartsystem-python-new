/**
 * Mark my own attendance - check in, breaks, check out - from a phone or the web.
 *
 * A photo is taken with the front camera and checked on the server against my
 * own enrolled face only. If it is confirmed, the mark is verified. If not (or
 * there is no camera, or no enrolment), it can be marked by hand with a note:
 * that counts, but is flagged for HR, with the photo that was taken. The
 * phone's location is attached when the browser shares it. The time is always
 * the server's, so the device clock does not matter.
 */
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Box, Button, Card, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  TextField, Typography, useMediaQuery, useTheme,
} from '@mui/material'
import CameraAltIcon from '@mui/icons-material/CameraAlt'
import EditNoteIcon from '@mui/icons-material/EditNote'
import FingerprintIcon from '@mui/icons-material/Fingerprint'
import { toast } from 'react-toastify'

import {
  fetchMyAttendanceStatus, markMyAttendance, type AttendanceEventType, type MyAttendanceMark,
} from '@/api/attendance'
import { asUtc } from '@/utils/attendanceTime'

const ACTION_LABELS: Record<AttendanceEventType, string> = {
  check_in: 'Check in',
  break_start: 'Start break',
  break_end: 'End break',
  check_out: 'Check out',
}

type Location = { latitude: number; longitude: number; location_accuracy_m?: number }
type Phase = 'camera' | 'checking' | 'failed' | 'manual'

const timeOf = (value: string) => new Date(asUtc(value)).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

const openFrontCamera = async () => {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    })
  } catch {
    return navigator.mediaDevices.getUserMedia({ video: true, audio: false })
  }
}

const cameraProblem = (error: unknown) => {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return 'Camera access is blocked for this site.'
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'No camera was found on this device.'
  if (name === 'NotReadableError' || name === 'TrackStartError') return 'The camera is in use by another app.'
  return 'The camera could not be started.'
}

type LocationResult = { location: Location | null; blocked: boolean }

const readPosition = (enableHighAccuracy: boolean) => new Promise<LocationResult>((resolve) => {
  navigator.geolocation.getCurrentPosition(
    position => resolve({
      location: {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        location_accuracy_m: position.coords.accuracy,
      },
      blocked: false,
    }),
    error => resolve({ location: null, blocked: error.code === error.PERMISSION_DENIED }),
    { enableHighAccuracy, timeout: 10_000, maximumAge: 60_000 },
  )
})

// The best position first; a laptop with no GPS can time out on that and still
// have a usable network position, so ask once more before giving up.
const currentLocation = async (): Promise<LocationResult> => {
  if (!navigator.geolocation) return { location: null, blocked: false }
  const precise = await readPosition(true)
  if (precise.location || precise.blocked) return precise
  return readPosition(false)
}

const SelfCheckIn = () => {
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'))
  const queryClient = useQueryClient()
  const statusQ = useQuery({ queryKey: ['my-attendance-status'], queryFn: fetchMyAttendanceStatus })

  const [action, setAction] = useState<AttendanceEventType | null>(null)
  const [phase, setPhase] = useState<Phase>('camera')
  const [problem, setProblem] = useState('')
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [photoUrl, setPhotoUrl] = useState('')
  const [note, setNote] = useState('')
  // undefined while it is being read, so nothing is marked before it is known.
  const [location, setLocation] = useState<Location | null | undefined>(undefined)
  const [locationBlocked, setLocationBlocked] = useState(false)
  const locationRequest = useRef(0)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
  }

  // The video element is unmounted while a result is shown; whenever one
  // mounts, it is given the camera that is already running.
  const attachVideo = (element: HTMLVideoElement | null) => {
    videoRef.current = element
    if (element && streamRef.current && element.srcObject !== streamRef.current) {
      element.srcObject = streamRef.current
      void element.play().catch(() => undefined)
    }
  }

  const startCamera = async () => {
    stopCamera()
    try {
      const stream = await openFrontCamera()
      streamRef.current = stream
      attachVideo(videoRef.current)
      setPhase('camera')
    } catch (error) {
      // No camera: it can still be marked by hand, flagged for HR.
      setProblem(`${cameraProblem(error)} You can mark it by hand with a note; HR will review it.`)
      setPhase('manual')
    }
  }

  const readLocation = () => {
    const request = ++locationRequest.current
    setLocation(undefined)
    setLocationBlocked(false)
    void currentLocation().then((result) => {
      if (request !== locationRequest.current) return
      setLocation(result.location)
      setLocationBlocked(result.blocked)
    })
  }

  const open = (next: AttendanceEventType) => {
    setAction(next)
    setProblem('')
    setNote('')
    setPhoto(null)
    setPhotoUrl('')
    setPhase('camera')
    readLocation()
  }

  const close = () => {
    stopCamera()
    locationRequest.current += 1
    setAction(null)
  }

  useEffect(() => {
    if (action && phase === 'camera' && !streamRef.current) void startCamera()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, phase])
  useEffect(() => () => stopCamera(), [])
  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl) }, [photoUrl])

  const mark = useMutation({
    mutationFn: (payload: MyAttendanceMark) => markMyAttendance(payload),
    onSuccess: (result, payload) => {
      if (result.recorded) {
        if (result.verification_status === 'verified') toast.success(`${ACTION_LABELS[payload.event_type]} marked`)
        else toast.info(`${ACTION_LABELS[payload.event_type]} marked - flagged for HR review`)
        queryClient.invalidateQueries({ queryKey: ['my-attendance-status'] })
        queryClient.invalidateQueries({ queryKey: ['my-attendance-register'] })
        close()
        return
      }
      setProblem(result.message)
      setPhase('failed')
    },
    onError: (error: any) => {
      setProblem(error?.response?.data?.detail || 'It could not be marked. Check your connection and try again.')
      setPhase(current => (current === 'checking' ? 'failed' : current))
    },
  })

  const locationFields = () => (location ? { ...location } : {})

  const takePhotoAndMark = () => {
    const video = videoRef.current
    if (!action || !video || !video.videoWidth) {
      setProblem('The camera is not ready yet.')
      return
    }
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    canvas.toBlob((blob) => {
      if (!blob) {
        setProblem('The photo could not be taken.')
        return
      }
      setPhoto(blob)
      setPhotoUrl(URL.createObjectURL(blob))
      setPhase('checking')
      mark.mutate({ event_type: action, photo: blob, ...locationFields() })
    }, 'image/jpeg', 0.85)
  }

  const markByHand = () => {
    if (!action) return
    if (note.trim().length < 3) {
      toast.warning('Say why it is marked by hand')
      return
    }
    mark.mutate({ event_type: action, photo, manual: true, note: note.trim(), ...locationFields() })
  }

  const last = statusQ.data?.last_event
  const lastType = last?.event_type as AttendanceEventType | undefined
  const actions: AttendanceEventType[] = !lastType || lastType === 'check_out'
    ? ['check_in']
    : lastType === 'break_start'
      ? ['break_end', 'check_out']
      : ['break_start', 'check_out']
  const stateText = !last
    ? 'Not checked in'
    : lastType === 'check_out'
      ? `Checked out at ${timeOf(last.event_time)}`
      : lastType === 'break_start'
        ? `On a break since ${timeOf(last.event_time)}`
        : `Working since ${timeOf(last.event_time)}`

  return (
    <Card variant="outlined" sx={{ p: 2, mb: 2, borderRadius: '16px', borderColor: '#C7D2FE' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <FingerprintIcon sx={{ color: '#4F46E5', fontSize: 34 }} />
          <Box>
            <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>Mark my attendance</Typography>
            <Typography variant="body2" color="text.secondary">
              {statusQ.isLoading ? 'Loading…' : stateText}
              {last && last.verification_status === 'needs_review' && (
                <Chip label="with HR for review" size="small" color="warning" variant="outlined" sx={{ ml: 1 }} />
              )}
            </Typography>
            {statusQ.data && !statusQ.data.face_enrolled && (
              <Typography variant="caption" sx={{ color: '#B45309' }}>
                Your face is not enrolled yet, so marks go to HR for review. Ask HR to enrol you.
              </Typography>
            )}
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {actions.map(next => (
            <Button
              key={next}
              variant={next === 'check_out' && actions.length > 1 ? 'outlined' : 'contained'}
              startIcon={<CameraAltIcon />}
              onClick={() => open(next)}
              disabled={statusQ.isLoading || statusQ.isError}
              sx={{ borderRadius: '12px', fontWeight: 900, textTransform: 'none' }}
            >
              {ACTION_LABELS[next]}
            </Button>
          ))}
        </Box>
      </Box>
      {statusQ.isError && (
        <Typography variant="body2" sx={{ color: '#991B1B', mt: 1 }}>
          Your attendance status could not be loaded. Refresh the page to try again.
        </Typography>
      )}

      <Dialog open={Boolean(action)} onClose={close} fullScreen={fullScreen} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 900 }}>{action ? ACTION_LABELS[action] : ''}</DialogTitle>
        <DialogContent>
          {(phase === 'camera' || phase === 'checking') && (
            <Box sx={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', bgcolor: '#0F172A', aspectRatio: '4 / 3' }}>
              <Box component="video" ref={attachVideo} autoPlay playsInline muted
                sx={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
              {phase === 'checking' && (
                <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', bgcolor: 'rgba(15,23,42,0.55)' }}>
                  <Box sx={{ textAlign: 'center', color: '#fff' }}>
                    <CircularProgress color="inherit" size={32} />
                    <Typography sx={{ mt: 1, fontWeight: 700 }}>Checking your face…</Typography>
                  </Box>
                </Box>
              )}
            </Box>
          )}
          {(phase === 'failed' || phase === 'manual') && photoUrl && (
            <Box component="img" src={photoUrl} alt="Photo taken"
              sx={{ width: '100%', borderRadius: '12px', transform: 'scaleX(-1)', mb: 1.5 }} />
          )}
          {problem && (
            <Alert severity={phase === 'manual' ? 'info' : 'warning'} sx={{ mt: 1.5 }}>{problem}</Alert>
          )}
          {phase === 'manual' && (
            <TextField
              label="Why is it marked by hand?"
              placeholder="e.g. the face check failed in poor light"
              value={note}
              onChange={event => setNote(event.target.value)}
              inputProps={{ maxLength: 1000 }}
              multiline
              minRows={2}
              fullWidth
              autoFocus
              sx={{ mt: 1.5 }}
              helperText={photo ? 'Your photo is sent with this for HR.' : 'Marked without a photo.'}
            />
          )}
          {location === null ? (
            <Alert
              severity="warning"
              sx={{ mt: 1.5 }}
              action={<Button color="inherit" size="small" onClick={readLocation} sx={{ textTransform: 'none', fontWeight: 800 }}>Try again</Button>}
            >
              {locationBlocked
                ? 'Location is blocked. Allow it for this site in your browser, and on an iPhone also in Settings > Privacy & Security > Location Services > Safari Websites.'
                : 'Your location could not be found. Check that location is switched on for this device.'}
              {' '}HR will see this mark has no location.
            </Alert>
          ) : (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
              {location === undefined ? 'Getting your location…' : 'Your location is attached to this mark.'}
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, flexWrap: 'wrap', gap: 1 }}>
          <Button onClick={close} disabled={mark.isPending}>Cancel</Button>
          {phase === 'camera' && (
            <Button variant="contained" startIcon={<CameraAltIcon />} onClick={takePhotoAndMark}
              disabled={location === undefined}
              sx={{ fontWeight: 900, textTransform: 'none' }}>
              Take photo and mark
            </Button>
          )}
          {phase === 'failed' && (
            <>
              <Button onClick={() => { setProblem(''); setPhase('camera') }} sx={{ textTransform: 'none' }}>Try again</Button>
              <Button variant="contained" startIcon={<EditNoteIcon />} onClick={() => { stopCamera(); setPhase('manual') }}
                sx={{ fontWeight: 900, textTransform: 'none' }}>
                Mark by hand
              </Button>
            </>
          )}
          {phase === 'manual' && (
            <Button variant="contained" onClick={markByHand} disabled={mark.isPending || location === undefined}
              startIcon={mark.isPending ? <CircularProgress size={16} color="inherit" /> : <EditNoteIcon />}
              sx={{ fontWeight: 900, textTransform: 'none' }}>
              Mark by hand
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Card>
  )
}

export default SelfCheckIn
