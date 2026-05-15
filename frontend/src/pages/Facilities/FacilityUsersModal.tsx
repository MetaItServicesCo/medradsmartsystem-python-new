import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Avatar,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import PeopleIcon from '@mui/icons-material/People'
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1'
import { toast } from 'react-toastify'
import { assignFacilityManagerRole, fetchFacilityUsers, type FacilityUser } from '@/api/facilityUsers'
import { type Facility } from '@/api/facilities'
import { useAuthStore } from '@/stores/authStore'

interface Props {
  open: boolean
  onClose: () => void
  facility?: Facility | null
}

const MANAGER_ROLES = ['facility_manager', 'facility_admin']

const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  facility_admin: { bg: '#F5F3FF', color: '#7C3AED' },
  facility_manager: { bg: '#EFF6FF', color: '#3B82F6' },
}

const avatarColors = ['#7C3AED', '#EC4899', '#3B82F6', '#10B981', '#F59E0B', '#EF4444']

const getInitials = (name: string) =>
  name.split(' ').map((part) => part[0]).join('').toUpperCase().slice(0, 2)

const getAvatarColor = (name: string) =>
  avatarColors[name.charCodeAt(0) % avatarColors.length]

const FacilityUsersModal = ({ open, onClose, facility }: Props) => {
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((state) => state.user)
  const isSuperAdmin = currentUser?.role === 'superadmin'
  const [selectedUser, setSelectedUser] = useState<FacilityUser | null>(null)
  const [selectedRole, setSelectedRole] = useState<'facility_admin' | 'facility_manager'>('facility_manager')

  useEffect(() => {
    if (!open) return
    setSelectedUser(null)
    setSelectedRole('facility_manager')
  }, [facility?.id, open])

  const { data, isLoading } = useQuery({
    queryKey: ['facility-managers', facility?.id],
    queryFn: () => fetchFacilityUsers(facility?.id, MANAGER_ROLES),
    enabled: open && !!facility,
  })

  const { data: attachedUsersData, isLoading: attachedUsersLoading } = useQuery({
    queryKey: ['facility-attached-users', facility?.id],
    queryFn: () => fetchFacilityUsers(facility?.id),
    enabled: open && !!facility && isSuperAdmin,
  })

  const assignMutation = useMutation({
    mutationFn: () => assignFacilityManagerRole(facility!.id, selectedUser!.id, selectedRole),
    onSuccess: () => {
      toast.success('Facility role updated')
      setSelectedUser(null)
      queryClient.invalidateQueries({ queryKey: ['facility-managers', facility?.id] })
      queryClient.invalidateQueries({ queryKey: ['facility-attached-users', facility?.id] })
      queryClient.invalidateQueries({ queryKey: ['facilities'] })
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to assign facility role'),
  })

  const users = data?.items ?? []
  const attachedUsers = attachedUsersData?.items ?? []

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: '24px', overflow: 'hidden' } }}>
      <Box sx={{
        background: 'linear-gradient(135deg, #7C3AED 0%, #5B21B6 100%)',
        px: 3.5,
        py: 3,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
      }}>
        <Box sx={{ width: 48, height: 48, borderRadius: '14px', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <PeopleIcon sx={{ color: '#fff', fontSize: '1.5rem' }} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" sx={{ color: '#fff', fontWeight: 700 }}>
            Facility Managers
          </Typography>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.75)' }}>
            {facility ? `Facility admins and managers attached to ${facility.name}` : 'Select a facility to view its managers'}
          </Typography>
        </Box>
        <IconButton onClick={onClose} sx={{ color: '#fff', '&:hover': { background: 'rgba(255,255,255,0.12)' } }}>
          <CloseIcon />
        </IconButton>
      </Box>

      <DialogContent sx={{ p: 3.5, pt: 2.5 }}>
        {isSuperAdmin && (
          <Box sx={{ mb: 3, p: 2, backgroundColor: '#F8FAFC', borderRadius: '16px', border: '1px solid #E5E7EB' }}>
            <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 700, color: '#374151', display: 'flex', alignItems: 'center', gap: 1 }}>
              <PersonAddAlt1Icon sx={{ fontSize: '1.2rem', color: '#7C3AED' }} />
              Assign Facility Role
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 220px auto' }, gap: 1.5 }}>
              <Autocomplete
                options={attachedUsers}
                loading={attachedUsersLoading}
                value={selectedUser}
                onChange={(_, value) => setSelectedUser(value)}
                getOptionLabel={(option) => `${option.full_name} (${option.role.replace('_', ' ')})`}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Attached User"
                    placeholder="Choose an attached user"
                  />
                )}
              />
              <FormControl fullWidth>
                <InputLabel>Facility Role</InputLabel>
                <Select
                  value={selectedRole}
                  label="Facility Role"
                  onChange={(event) => setSelectedRole(event.target.value as 'facility_admin' | 'facility_manager')}
                >
                  <MenuItem value="facility_manager">Facility Manager</MenuItem>
                  <MenuItem value="facility_admin">Facility Admin</MenuItem>
                </Select>
              </FormControl>
              <Button
                variant="contained"
                disabled={!selectedUser || assignMutation.isPending}
                onClick={() => assignMutation.mutate()}
                sx={{ minWidth: 132, borderRadius: '12px', fontWeight: 800 }}
              >
                {assignMutation.isPending ? <CircularProgress size={20} color="inherit" /> : 'Assign'}
              </Button>
            </Box>
            <Typography variant="caption" sx={{ display: 'block', mt: 1.25, color: '#64748B' }}>
              Only users already attached to this facility can be promoted here.
            </Typography>
          </Box>
        )}

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>User</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Assignment</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, index) => (
                  <TableRow key={index}>
                    {Array.from({ length: 4 }).map((__, cellIndex) => (
                      <TableCell key={cellIndex}><Skeleton /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 5 }}>
                    <PeopleIcon sx={{ fontSize: '2.5rem', color: '#E5E7EB', mb: 1, display: 'block', mx: 'auto' }} />
                    <Typography variant="body2" color="text.secondary">
                      No facility managers or facility admins attached yet
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : users.map((user) => {
                const roleColor = ROLE_COLORS[user.role] || ROLE_COLORS.facility_manager
                const isPrimary = user.facility_id === facility?.id
                return (
                  <TableRow key={user.id} sx={{ '&:hover': { backgroundColor: '#FAFAFF' } }}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Avatar sx={{ width: 32, height: 32, backgroundColor: getAvatarColor(user.full_name), color: '#fff', fontSize: '0.8rem', fontWeight: 700 }}>
                          {getInitials(user.full_name)}
                        </Avatar>
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600, color: '#1E1B4B' }}>
                            {user.full_name}
                          </Typography>
                          <Typography variant="caption" sx={{ color: '#9CA3AF' }}>
                            {user.email}
                          </Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={user.role.replace('_', ' ')}
                        size="small"
                        sx={{ backgroundColor: roleColor.bg, color: roleColor.color, fontWeight: 600, fontSize: '0.7rem', textTransform: 'capitalize' }}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={isPrimary ? 'Primary' : 'Additional'}
                        size="small"
                        variant={isPrimary ? 'filled' : 'outlined'}
                        sx={isPrimary
                          ? { color: '#059669', backgroundColor: '#ECFDF5', fontSize: '0.65rem', fontWeight: 700 }
                          : { color: '#6B7280', fontSize: '0.65rem' }}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={user.is_active ? 'Active' : 'Inactive'}
                        size="small"
                        sx={{
                          backgroundColor: user.is_active ? '#F0FDF4' : '#FEF2F2',
                          color: user.is_active ? '#10B981' : '#EF4444',
                          fontWeight: 600,
                          fontSize: '0.7rem',
                        }}
                      />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </DialogContent>
    </Dialog>
  )
}

export default FacilityUsersModal
