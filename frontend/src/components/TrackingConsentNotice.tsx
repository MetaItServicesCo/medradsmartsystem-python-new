import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material'
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined'
import { toast } from 'react-toastify'
import { consentToTracking, fetchMyTracking } from '@/api/tracking'
import { useAuthStore } from '@/stores/authStore'
import { isCustomerAccount } from '@/utils/staffAccount'

/**
 * Shown only to someone a super admin has switched tracking on for, until they
 * have read and agreed to what is collected. Nothing is collected before that.
 * Everyone else - and anyone whose check fails - sees nothing at all.
 */
const TrackingConsentNotice = () => {
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const staff = Boolean(user) && !isCustomerAccount(user)

  const query = useQuery({
    queryKey: ['tracking-me', user?.id],
    queryFn: fetchMyTracking,
    enabled: staff,
    staleTime: 5 * 60_000,
    retry: false,
  })

  const consentMut = useMutation({
    mutationFn: () => consentToTracking(query.data!.consent_version),
    onSuccess: (state) => {
      queryClient.setQueryData(['tracking-me', user?.id], state)
      setOpen(false)
      toast.success('Thank you. Your agreement is recorded.')
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['tracking-me'] })
      toast.error('The notice could not be recorded. Please read it again and retry.')
    },
  })

  const state = query.data
  if (!staff || !state?.tracked || !state.consent_required) return null

  return (
    <>
      <Box
        role="status"
        sx={{
          mx: { xs: 1.25, sm: 2, md: 3 }, mt: 1, px: 2, py: 1.25, borderRadius: '16px',
          display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap',
          bgcolor: '#FFFBEB', border: '1px solid #FDE68A', color: '#78350F',
        }}
      >
        <ShieldOutlinedIcon sx={{ color: '#B45309' }} />
        <Typography sx={{ flex: 1, minWidth: 200, fontSize: '0.875rem', fontWeight: 700 }}>
          Work tracking has been switched on for your account. Nothing is collected until you have read and agreed to it.
        </Typography>
        <Button size="small" variant="contained" onClick={() => setOpen(true)}
          sx={{ bgcolor: '#B45309', fontWeight: 900, '&:hover': { bgcolor: '#92400E' } }}>
          Read and agree
        </Button>
      </Box>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 900 }}>Work tracking</DialogTitle>
        <DialogContent dividers>
          <Typography sx={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem', lineHeight: 1.6 }}>
            {state.consent_text}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Not now</Button>
          <Button variant="contained" disabled={consentMut.isPending} onClick={() => consentMut.mutate()} sx={{ fontWeight: 900 }}>
            I have read this and agree
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

export default TrackingConsentNotice
