/**
 * The photo taken with an attendance mark. Attendance photos are biometric, so
 * the server never serves them from a public address: they are fetched with
 * the signed-in user's login and shown from memory, never linked to.
 */
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material'

import { fetchAttendanceEventPhoto } from '@/api/attendance'

export const AttendancePhoto = ({ eventId, maxHeight = 280 }: { eventId: number; maxHeight?: number }) => {
  const photoQ = useQuery({
    queryKey: ['attendance-event-photo', eventId],
    queryFn: () => fetchAttendanceEventPhoto(eventId),
    staleTime: Infinity,
    retry: false,
  })
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!photoQ.data) return undefined
    const objectUrl = URL.createObjectURL(photoQ.data)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [photoQ.data])

  if (photoQ.isLoading) return <Box sx={{ display: 'grid', placeItems: 'center', py: 4 }}><CircularProgress size={24} /></Box>
  if (photoQ.isError || !url) return <Typography sx={{ color: '#64748B', fontSize: 13 }}>The photo could not be loaded.</Typography>
  return (
    <Box component="img" src={url} alt="Photo taken with the attendance mark"
      sx={{ width: '100%', maxHeight, objectFit: 'contain', borderRadius: '12px', bgcolor: '#0F172A' }} />
  )
}

export const AttendancePhotoButton = ({ eventId, label }: { eventId: number; label: string }) => {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="small" onClick={() => setOpen(true)} sx={{ textTransform: 'none', fontWeight: 800, minWidth: 0 }}>
        Photo
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 900 }}>{label}</DialogTitle>
        <DialogContent dividers>{open && <AttendancePhoto eventId={eventId} maxHeight={520} />}</DialogContent>
        <DialogActions><Button onClick={() => setOpen(false)}>Close</Button></DialogActions>
      </Dialog>
    </>
  )
}
