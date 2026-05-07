import { useState } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  TextField, Grid, FormControl, InputLabel, Select, MenuItem,
  Box, Typography, CircularProgress, InputAdornment, IconButton,
  Chip, Autocomplete,
} from '@mui/material'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import VisibilityIcon from '@mui/icons-material/Visibility'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-toastify'
import { createUser } from '@/api/users'
import { fetchFacilities } from '@/api/facilities'

const ROLE_OPTIONS = [
  { value: 'superadmin', label: 'Super Admin' },
  { value: 'admin', label: 'Admin' },
  { value: 'facility_admin', label: 'Facility Admin' },
  { value: 'technician', label: 'Technician' },
  { value: 'hr_manager', label: 'HR Manager' },
  { value: 'facility_manager', label: 'Facility Manager' },
  { value: 'employee', label: 'Employee' },
  { value: 'client', label: 'Client' },
]

interface Props {
  open: boolean
  onClose: () => void
}

const CreateUserModal = ({ open, onClose }: Props) => {
  const queryClient = useQueryClient()
  const [showPassword, setShowPassword] = useState(false)
  const [form, setForm] = useState({
    username: '',
    email: '',
    full_name: '',
    password: '',
    phone: '',
    role: 'employee',
    user_type: 'employee',
    facility_ids: [] as number[],
  })

  const { data: facilitiesData } = useQuery({
    queryKey: ['facilities-brief'],
    queryFn: () => fetchFacilities(),
    enabled: open,
  })

  const facilities = facilitiesData?.items || []

  const mutation = useMutation({
    mutationFn: () => createUser({
      username: form.username,
      email: form.email,
      full_name: form.full_name,
      password: form.password,
      phone: form.phone || undefined,
      role: form.role,
      user_type: form.user_type,
      facility_ids: form.facility_ids.length > 0 ? form.facility_ids : undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('User created successfully')
      handleClose()
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to create user')
    },
  })

  const handleClose = () => {
    setForm({
      username: '', email: '', full_name: '', password: '',
      phone: '', role: 'employee', user_type: 'employee', facility_ids: [],
    })
    onClose()
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.username || !form.email || !form.full_name || !form.password) {
      toast.error('Please fill all required fields')
      return
    }
    mutation.mutate()
  }

  const passwordStrength = (pw: string) => {
    let score = 0
    if (pw.length >= 8) score++
    if (/[A-Z]/.test(pw)) score++
    if (/[0-9]/.test(pw)) score++
    if (/[^A-Za-z0-9]/.test(pw)) score++
    return score
  }

  const strength = passwordStrength(form.password)
  const strengthColor = ['#EF4444', '#F59E0B', '#3B82F6', '#10B981'][strength - 1] || '#E5E7EB'
  const strengthLabel = ['Weak', 'Fair', 'Good', 'Strong'][strength - 1] || ''

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
          Create New User
          <Typography variant="body2" sx={{ color: '#9CA3AF', fontWeight: 400 }}>
            Set up credentials and assign role
          </Typography>
        </DialogTitle>

        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth size="small" label="Username *"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth size="small" label="Email *" type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth size="small" label="Full Name *"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth size="small" label="Phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth size="small" label="Password *"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => setShowPassword(!showPassword)}>
                        {showPassword ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              {form.password && (
                <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', overflow: 'hidden' }}>
                    <Box sx={{
                      width: `${(strength / 4) * 100}%`,
                      height: '100%',
                      backgroundColor: strengthColor,
                      transition: 'all 0.3s ease',
                    }} />
                  </Box>
                  <Typography variant="caption" sx={{ color: strengthColor, fontWeight: 600, minWidth: 40 }}>
                    {strengthLabel}
                  </Typography>
                </Box>
              )}
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Role *</InputLabel>
                <Select value={form.role} label="Role *" onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  {ROLE_OPTIONS.map((r) => (
                    <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>User Type</InputLabel>
                <Select value={form.user_type} label="User Type" onChange={(e) => setForm({ ...form, user_type: e.target.value })}>
                  <MenuItem value="employee">Employee</MenuItem>
                  <MenuItem value="client">Client</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <Autocomplete
                multiple
                size="small"
                options={facilities}
                getOptionLabel={(option: any) => option.name}
                value={facilities.filter((f: any) => form.facility_ids.includes(f.id))}
                onChange={(_, val) => setForm({ ...form, facility_ids: val.map((v: any) => v.id) })}
                renderInput={(params) => <TextField {...params} label="Assign Facilities" />}
                renderTags={(value, getTagProps) =>
                  value.map((option: any, index) => (
                    <Chip {...getTagProps({ index })} key={option.id} label={option.name} size="small" />
                  ))
                }
              />
            </Grid>
          </Grid>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleClose}>Cancel</Button>
          <Button
            type="submit"
            variant="contained"
            disabled={mutation.isPending}
            sx={{ minWidth: 120 }}
          >
            {mutation.isPending ? <CircularProgress size={20} sx={{ color: '#fff' }} /> : 'Create User'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

export default CreateUserModal
