import { useEffect, useState } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  TextField, Grid, FormControl, InputLabel, Select, MenuItem,
  Box, Typography, CircularProgress, InputAdornment, IconButton,
  Chip, Autocomplete,
} from '@mui/material'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import VisibilityIcon from '@mui/icons-material/Visibility'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-toastify'
import { createUser } from '@/api/users'
import { fetchFacilities, type Facility } from '@/api/facilities'
import { formatUSPhoneInput } from '@/utils/formatters'

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

const FACILITY_ASSIGN_PAGE_SIZE = 50

interface Props {
  open: boolean
  onClose: () => void
  facilityContext?: Pick<Facility, 'id' | 'name'> | null
}

const CreateUserModal = ({ open, onClose, facilityContext }: Props) => {
  const queryClient = useQueryClient()
  const [showPassword, setShowPassword] = useState(false)
  const [facilitySearch, setFacilitySearch] = useState('')
  const [selectedFacilities, setSelectedFacilities] = useState<Array<Pick<Facility, 'id' | 'name'> & Partial<Facility>>>([])
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

  const {
    data: facilitiesData,
    fetchNextPage: fetchNextFacilityPage,
    hasNextPage: hasNextFacilityPage,
    isFetchingNextPage: isFetchingNextFacilityPage,
    isLoading: facilitiesLoading,
  } = useInfiniteQuery({
    queryKey: ['facilities-assign-options', facilitySearch],
    queryFn: ({ pageParam }) => fetchFacilities({
      search: facilitySearch || undefined,
      skip: pageParam,
      limit: FACILITY_ASSIGN_PAGE_SIZE,
    }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      const nextSkip = lastPage.skip + lastPage.items.length
      return nextSkip < lastPage.total ? nextSkip : undefined
    },
    enabled: open && !facilityContext,
  })

  const facilities = facilitiesData?.pages.flatMap((page) => page.items) || []
  const facilityOptions = [
    ...selectedFacilities,
    ...facilities.filter((facility) => !selectedFacilities.some((selected) => selected.id === facility.id)),
  ]

  useEffect(() => {
    if (!open || !facilityContext) return

    setSelectedFacilities([facilityContext])
    setFacilitySearch('')
    setForm((current) => ({ ...current, facility_ids: [facilityContext.id] }))
  }, [open, facilityContext?.id, facilityContext?.name])

  const mutation = useMutation({
    mutationFn: () => createUser({
      username: form.username,
      email: form.email,
      full_name: form.full_name,
      password: form.password,
      phone: formatUSPhoneInput(form.phone) || undefined,
      role: form.role,
      user_type: form.user_type,
      facility_ids: facilityContext
        ? [facilityContext.id]
        : (form.facility_ids.length > 0 ? form.facility_ids : undefined),
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
    setSelectedFacilities([])
    setFacilitySearch('')
    onClose()
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.username || !form.email || !form.full_name || !form.password) {
      toast.error('Please fill all required fields')
      return
    }
    if (form.password.length < 12) {
      toast.error('Password must be at least 12 characters')
      return
    }
    mutation.mutate()
  }

  const passwordStrength = (pw: string) => {
    let score = 0
    if (pw.length >= 12) score++
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
                onChange={(e) => setForm({ ...form, phone: formatUSPhoneInput(e.target.value) })}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth size="small" label="Password *"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                inputProps={{ minLength: 12, maxLength: 72 }}
                helperText="Use at least 12 characters"
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
              {facilityContext ? (
                <TextField
                  fullWidth
                  size="small"
                  label="Assigned Facility"
                  value={facilityContext.name}
                  helperText="This user will be assigned to the facility you are currently managing."
                  InputProps={{ readOnly: true }}
                />
              ) : (
                <Autocomplete
                  multiple
                  size="small"
                  options={facilityOptions}
                  inputValue={facilitySearch}
                  onInputChange={(_, value, reason) => {
                    if (reason !== 'reset') setFacilitySearch(value)
                  }}
                  filterOptions={(options) => options}
                  loading={facilitiesLoading || isFetchingNextFacilityPage}
                  ListboxProps={{
                    style: { maxHeight: 320, overflow: 'auto' },
                    onScroll: (event) => {
                      const listbox = event.currentTarget
                      const nearBottom = listbox.scrollTop + listbox.clientHeight >= listbox.scrollHeight - 40
                      if (nearBottom && hasNextFacilityPage && !isFetchingNextFacilityPage) {
                        fetchNextFacilityPage()
                      }
                    },
                  }}
                  getOptionLabel={(option: any) => option.name}
                  isOptionEqualToValue={(option: any, value: any) => option.id === value.id}
                  value={selectedFacilities}
                  onChange={(_, val) => {
                    setSelectedFacilities(val as typeof selectedFacilities)
                    setForm({ ...form, facility_ids: val.map((v: any) => v.id) })
                  }}
                  renderOption={(props, option: any) => (
                    <Box component="li" {...props}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>{option.name}</Typography>
                        {(option.city || option.state || option.country) && (
                          <Typography variant="caption" sx={{ color: '#6B7280' }}>
                            {[option.city, option.state, option.country].filter(Boolean).join(', ')}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  )}
                  renderInput={(params) => <TextField {...params} label="Assign Facilities" />}
                  renderTags={(value, getTagProps) =>
                    value.map((option: any, index) => (
                      <Chip {...getTagProps({ index })} key={option.id} label={option.name} size="small" />
                    ))
                  }
                />
              )}
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
