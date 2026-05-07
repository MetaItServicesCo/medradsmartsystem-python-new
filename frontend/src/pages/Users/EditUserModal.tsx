import { useState, useEffect } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  TextField, Grid, FormControl, InputLabel, Select, MenuItem,
  Box, Typography, CircularProgress, Chip, Autocomplete, Switch,
  FormControlLabel,
} from '@mui/material'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-toastify'
import { updateUser, type UserData, type UpdateUserPayload } from '@/api/users'
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
  user: UserData
  onClose: () => void
}

const EditUserModal = ({ open, user, onClose }: Props) => {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    username: '',
    email: '',
    full_name: '',
    phone: '',
    password: '',
    role: '',
    user_type: '',
    is_active: true,
    facility_ids: [] as number[],
  })

  useEffect(() => {
    if (user) {
      setForm({
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        phone: user.phone || '',
        password: '',
        role: user.role,
        user_type: user.user_type,
        is_active: user.is_active,
        facility_ids: user.facilities?.map((f) => f.id) || [],
      })
    }
  }, [user])

  const { data: facilitiesData } = useQuery({
    queryKey: ['facilities-brief'],
    queryFn: () => fetchFacilities(),
    enabled: open,
  })

  const facilities = facilitiesData?.items || []

  const mutation = useMutation({
    mutationFn: (payload: UpdateUserPayload) => updateUser(user.id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('User updated successfully')
      onClose()
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to update user')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload: UpdateUserPayload = {
      username: form.username,
      email: form.email,
      full_name: form.full_name,
      phone: form.phone || undefined,
      role: form.role,
      user_type: form.user_type,
      is_active: form.is_active,
      facility_ids: form.facility_ids,
    }
    if (form.password) {
      payload.password = form.password
    }
    mutation.mutate(payload)
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
          Edit User
          <Typography variant="body2" sx={{ color: '#9CA3AF', fontWeight: 400 }}>
            Update details for {user.full_name}
          </Typography>
        </DialogTitle>

        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth size="small" label="Username"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth size="small" label="Email" type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth size="small" label="Full Name"
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
                fullWidth size="small" label="New Password (leave blank to keep)"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                helperText="Only fill if you want to change the password"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Role</InputLabel>
                <Select value={form.role} label="Role" onChange={(e) => setForm({ ...form, role: e.target.value })}>
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
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    color="primary"
                  />
                }
                label={
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    Account Active
                  </Typography>
                }
              />
            </Grid>
          </Grid>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            variant="contained"
            disabled={mutation.isPending}
            sx={{ minWidth: 120 }}
          >
            {mutation.isPending ? <CircularProgress size={20} sx={{ color: '#fff' }} /> : 'Save Changes'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

export default EditUserModal
