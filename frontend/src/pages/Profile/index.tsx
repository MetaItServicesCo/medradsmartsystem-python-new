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

/**
 * The server's answer as one readable sentence. A rejected field comes back as
 * a list ([{ loc, msg }]); showing that list as it is crashed the page.
 */
const profileErrorText = (error: any, fallback: string): string => {
  const detail = error?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const text = detail
      .map((item: any) => {
        const message = String(item?.msg || item?.message || '').replace(/^Value error,\s*/i, '')
        const field = Array.isArray(item?.loc) ? item.loc[item.loc.length - 1] : ''
        if (!message) return ''
        return field === 'email' ? `Email: ${message}` : message
      })
      .filter(Boolean)
      .join(' ')
    return text || fallback
  }
  return fallback
}

// The server's password rule (app/schemas/user.py), checked here first.
const PASSWORD_MIN_LENGTH = 12
const PASSWORD_MAX_BYTES = 72

const Profile = () => {
  const queryClient = useQueryClient()
  const setUser = useAuthStore((s) => s.setUser)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    current_password: '',
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
      current_password: '',
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
      setForm((prev) => ({ ...prev, current_password: '', password: '', confirm_password: '' }))
      setMessage({ type: 'success', text: 'Profile updated successfully.' })
    },
    onError: (error: any) => {
      setMessage({ type: 'error', text: profileErrorText(error, 'Could not update profile.') })
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
      setMessage({ type: 'error', text: profileErrorText(error, 'Could not upload profile picture.') })
    },
  })

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    setMessage(null)

    if (form.password && form.password !== form.confirm_password) {
      setMessage({ type: 'error', text: 'Password confirmation does not match.' })
      return
    }
    if (form.password && !form.current_password) {
      setMessage({ type: 'error', text: 'Enter your current password to set a new one.' })
      return
    }
    if (form.password && form.password.length < PASSWORD_MIN_LENGTH) {
      setMessage({ type: 'error', text: `Password must contain at least ${PASSWORD_MIN_LENGTH} characters.` })
      return
    }
    if (form.password && new TextEncoder().encode(form.password).length > PASSWORD_MAX_BYTES) {
      setMessage({ type: 'error', text: 'Password is too long.' })
      return
    }

    // The email is sent only when it was changed: some imported accounts carry a
    // placeholder address the server would refuse, and that must not stop them
    // changing their name, phone or password. A new address is still checked.
    const email = form.email.trim()
    updateMutation.mutate({
      full_name: form.full_name.trim(),
      ...(email !== (profile?.email || '') ? { email } : {}),
      phone: formatUSPhoneInput(form.phone.trim()),
      ...(form.password ? { password: form.password, current_password: form.current_password } : {}),
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
                <Grid item xs={12}>
                  <TextField label="Current password" type="password" fullWidth autoComplete="current-password"
                    helperText="Needed only when setting a new password"
                    value={form.current_password} onChange={(e) => setForm((prev) => ({ ...prev, current_password: e.target.value }))} />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField label="New password" type="password" fullWidth autoComplete="new-password" helperText={`At least ${PASSWORD_MIN_LENGTH} characters`} value={form.password} onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))} />
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
