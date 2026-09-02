import { useEffect, useRef, useState } from 'react'
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CircularProgress,
  Divider,
  Grid,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'
import SaveIcon from '@mui/icons-material/Save'
import PersonOutlineIcon from '@mui/icons-material/PersonOutline'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchCurrentUser,
  resolveUploadUrl,
  updateOwnProfile,
  uploadOwnProfilePicture,
  type UpdateOwnProfilePayload,
} from '@/api/users'
import { useAuthStore } from '@/stores/authStore'
import { formatUSPhoneInput } from '@/utils/formatters'

const Profile = () => {
  const queryClient = useQueryClient()
  const setUser = useAuthStore((s) => s.setUser)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    password: '',
    confirm_password: '',
  })
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const { data: profile, isLoading } = useQuery({
    queryKey: ['current-user-profile'],
    queryFn: fetchCurrentUser,
  })

  useEffect(() => {
    if (!profile) return
    setForm({
      full_name: profile.full_name || '',
      email: profile.email || '',
      phone: formatUSPhoneInput(profile.phone || ''),
      password: '',
      confirm_password: '',
    })
    setUser(profile)
  }, [profile, setUser])

  const updateMutation = useMutation({
    mutationFn: (payload: UpdateOwnProfilePayload) => updateOwnProfile(payload),
    onSuccess: (updated) => {
      setUser(updated)
      queryClient.setQueryData(['current-user-profile'], updated)
      setForm((prev) => ({ ...prev, password: '', confirm_password: '' }))
      setMessage({ type: 'success', text: 'Profile updated successfully.' })
    },
    onError: (error: any) => {
      setMessage({ type: 'error', text: error?.response?.data?.detail || 'Could not update profile.' })
    },
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadOwnProfilePicture(file),
    onSuccess: (updated) => {
      setUser(updated)
      queryClient.setQueryData(['current-user-profile'], updated)
      setMessage({ type: 'success', text: 'Profile picture updated.' })
    },
    onError: (error: any) => {
      setMessage({ type: 'error', text: error?.response?.data?.detail || 'Could not upload profile picture.' })
    },
  })

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    setMessage(null)

    if (form.password && form.password !== form.confirm_password) {
      setMessage({ type: 'error', text: 'Password confirmation does not match.' })
      return
    }

    updateMutation.mutate({
      full_name: form.full_name.trim(),
      email: form.email.trim(),
      phone: formatUSPhoneInput(form.phone.trim()),
      ...(form.password ? { password: form.password } : {}),
    })
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setMessage(null)
    uploadMutation.mutate(file)
  }

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map((name) => name[0]).join('').toUpperCase().slice(0, 2)
    : 'U'

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box className="page-enter">
      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <Card sx={{ p: { xs: 2, sm: 3 }, borderRadius: '16px', border: '1px solid #E5E7EB' }}>
            <Stack alignItems="center" spacing={2.5}>
              <Box sx={{ position: 'relative' }}>
                <Avatar
                  src={resolveUploadUrl(profile?.avatar_url)}
                  sx={{
                    width: 132,
                    height: 132,
                    fontSize: '2.2rem',
                    fontWeight: 900,
                    background: 'linear-gradient(135deg, #7C3AED 0%, #F472B6 100%)',
                    boxShadow: '0 16px 32px rgba(124,58,237,0.22)',
                  }}
                >
                  {initials}
                </Avatar>
                <Button
                  variant="contained"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadMutation.isPending}
                  sx={{
                    position: 'absolute',
                    right: -8,
                    bottom: 4,
                    minWidth: 44,
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    p: 0,
                    background: 'linear-gradient(135deg, #7C3AED, #EC4899)',
                  }}
                >
                  {uploadMutation.isPending ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : <PhotoCameraIcon />}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  hidden
                  onChange={handleFileChange}
                />
              </Box>

              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h6" sx={{ fontWeight: 900, color: '#1E1B4B' }}>
                  {profile?.full_name}
                </Typography>
                <Typography variant="body2" sx={{ color: '#6B7280' }}>
                  @{profile?.username}
                </Typography>
              </Box>

              <Divider flexItem />

              <Stack spacing={1} sx={{ width: '100%' }}>
                <Typography variant="body2" sx={{ color: '#6B7280' }}>
                  Role
                </Typography>
                <Typography sx={{ fontWeight: 800, color: '#374151', textTransform: 'capitalize' }}>
                  {profile?.role?.replace(/_/g, ' ')}
                </Typography>
                <Typography variant="body2" sx={{ color: '#6B7280', pt: 1 }}>
                  Account type
                </Typography>
                <Typography sx={{ fontWeight: 800, color: '#374151', textTransform: 'capitalize' }}>
                  {profile?.user_type}
                </Typography>
              </Stack>
            </Stack>
          </Card>
        </Grid>

        <Grid item xs={12} md={8}>
          <Card sx={{ p: { xs: 2, sm: 3 }, borderRadius: '16px', border: '1px solid #E5E7EB' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
              <Box sx={{ width: 42, height: 42, borderRadius: '12px', backgroundColor: '#F5F3FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7C3AED' }}>
                <PersonOutlineIcon />
              </Box>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 900, color: '#111827' }}>
                  Profile Settings
                </Typography>
                <Typography variant="body2" sx={{ color: '#6B7280' }}>
                  Update your personal details and profile picture.
                </Typography>
              </Box>
            </Box>

            {message && (
              <Alert severity={message.type} sx={{ mb: 2, borderRadius: '12px' }}>
                {message.text}
              </Alert>
            )}

            <Box component="form" onSubmit={handleSubmit}>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <TextField label="Full name" fullWidth required value={form.full_name} onChange={(e) => setForm((prev) => ({ ...prev, full_name: e.target.value }))} />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField label="Email" type="email" fullWidth required value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField label="Phone" fullWidth value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: formatUSPhoneInput(e.target.value) }))} />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField label="Username" fullWidth value={profile?.username || ''} disabled />
                </Grid>
                <Grid item xs={12}>
                  <Divider sx={{ my: 1 }} />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField label="New password" type="password" fullWidth value={form.password} onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))} />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField label="Confirm password" type="password" fullWidth value={form.confirm_password} onChange={(e) => setForm((prev) => ({ ...prev, confirm_password: e.target.value }))} />
                </Grid>
              </Grid>

              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
                <Button
                  type="submit"
                  variant="contained"
                  startIcon={updateMutation.isPending ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : <SaveIcon />}
                  disabled={updateMutation.isPending}
                  sx={{ px: 3, py: 1.2, borderRadius: '12px', background: 'linear-gradient(135deg, #7C3AED, #EC4899)', fontWeight: 900 }}
                >
                  Save Profile
                </Button>
              </Box>
            </Box>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}

export default Profile
