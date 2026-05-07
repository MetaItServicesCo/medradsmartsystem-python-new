import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Dialog, DialogContent, Box, Typography, IconButton,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Chip, Skeleton, Tooltip, Select, MenuItem, FormControl, InputLabel,
  Autocomplete, TextField, Button, CircularProgress, Avatar
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import PeopleIcon from '@mui/icons-material/People'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1'
import { toast } from 'react-toastify'
import { fetchFacilityUsers, assignUserToFacility, removeUserFromFacility, bulkAssignUsersToFacility } from '@/api/facilityUsers'
import { fetchFacilities, type Facility } from '@/api/facilities'
import { fetchUsers } from '@/api/users'

interface Props {
  open: boolean
  onClose: () => void
  facility?: Facility | null
}

const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  superadmin: { bg: '#FEF2F2', color: '#EF4444' },
  admin: { bg: '#FFF7ED', color: '#F59E0B' },
  facility_admin: { bg: '#F5F3FF', color: '#7C3AED' },
  technician: { bg: '#F0FDF4', color: '#10B981' },
  facility_manager: { bg: '#EFF6FF', color: '#3B82F6' },
  employee: { bg: '#F3F4F6', color: '#6B7280' },
  client: { bg: '#FDF2F8', color: '#EC4899' },
  hr_manager: { bg: '#FFFBEB', color: '#D97706' },
}

const FacilityUsersModal = ({ open, onClose, facility }: Props) => {
  const queryClient = useQueryClient()
  const [editingUser, setEditingUser] = useState<number | null>(null)
  const [editFacilityId, setEditFacilityId] = useState<number | null>(null)
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([])

  const { data: usersData, isLoading } = useQuery({
    queryKey: ['facility-users', facility?.id],
    queryFn: () => fetchFacilityUsers(facility?.id),
    enabled: open,
  })

  const { data: allUsersData } = useQuery({
    queryKey: ['all-users-brief'],
    queryFn: () => fetchUsers({ limit: 1000 }),
    enabled: open && !!facility,
  })

  const { data: facilitiesData } = useQuery({
    queryKey: ['facilities-dropdown'],
    queryFn: () => fetchFacilities({ limit: 500 }),
    enabled: open,
  })

  const assignMut = useMutation({
    mutationFn: ({ userId, facilityId }: { userId: number; facilityId: number | null }) =>
      assignUserToFacility(userId, facilityId),
    onSuccess: () => {
      toast.success('User assignment updated')
      queryClient.invalidateQueries({ queryKey: ['facility-users'] })
      queryClient.invalidateQueries({ queryKey: ['facilities'] })
      setEditingUser(null)
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed'),
  })

  const bulkAssignMut = useMutation({
    mutationFn: () => bulkAssignUsersToFacility(facility!.id, selectedUserIds),
    onSuccess: () => {
      toast.success('Users assigned successfully')
      setSelectedUserIds([])
      queryClient.invalidateQueries({ queryKey: ['facility-users', facility?.id] })
      queryClient.invalidateQueries({ queryKey: ['facilities'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed bulk assignment'),
  })

  const removeMut = useMutation({
    mutationFn: (userId: number) => removeUserFromFacility(userId),
    onSuccess: () => {
      toast.success('User removed from facility')
      queryClient.invalidateQueries({ queryKey: ['facility-users'] })
      queryClient.invalidateQueries({ queryKey: ['facilities'] })
    },
  })

  const users = usersData?.items ?? []
  const facilities = facilitiesData?.items ?? []
  const allUsers = allUsersData?.items ?? []

  // Filter out users already in this facility
  const assignableUsers = allUsers.filter(u => !users.some(fu => fu.id === u.id))

  const getFacilityName = (fid: number | null) => {
    if (!fid) return '—'
    return facilities.find(f => f.id === fid)?.name || `#${fid}`
  }

  const getInitials = (name: string) =>
    name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)

  const avatarColors = ['#7C3AED', '#EC4899', '#3B82F6', '#10B981', '#F59E0B', '#EF4444']
  const getAvatarColor = (name: string) => avatarColors[name.charCodeAt(0) % avatarColors.length]

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: '24px', overflow: 'hidden' } }}>
      <Box sx={{
        background: 'linear-gradient(135deg, #7C3AED 0%, #5B21B6 100%)',
        px: 3.5, py: 3, display: 'flex', alignItems: 'center', gap: 2,
      }}>
        <Box sx={{ width: 48, height: 48, borderRadius: '14px', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <PeopleIcon sx={{ color: '#fff', fontSize: '1.5rem' }} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" sx={{ color: '#fff', fontWeight: 700 }}>
            {facility ? `Users in ${facility.name}` : 'Global Facility User Management'}
          </Typography>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.75)' }}>
            {facility ? 'Assign or remove users from this facility' : 'Manage all user-facility assignments'}
          </Typography>
        </Box>
        <IconButton onClick={onClose} sx={{ color: '#fff', '&:hover': { background: 'rgba(255,255,255,0.12)' } }}>
          <CloseIcon />
        </IconButton>
      </Box>

      <DialogContent sx={{ p: 3.5, pt: 2.5 }}>
        {facility && (
          <Box sx={{ mb: 4, p: 2, backgroundColor: '#F9FAFB', borderRadius: '16px', border: '1px solid #E5E7EB' }}>
            <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 700, color: '#374151', display: 'flex', alignItems: 'center', gap: 1 }}>
              <PersonAddAlt1Icon sx={{ fontSize: '1.2rem', color: '#7C3AED' }} />
              Bulk Assign Users
            </Typography>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Autocomplete
                multiple
                size="small"
                options={assignableUsers}
                getOptionLabel={(option) => option.full_name}
                value={allUsers.filter(u => selectedUserIds.includes(u.id))}
                onChange={(_, val) => setSelectedUserIds(val.map(v => v.id))}
                renderInput={(params) => <TextField {...params} placeholder="Search users to add..." sx={{ backgroundColor: '#fff' }} />}
                sx={{ flex: 1 }}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip {...getTagProps({ index })} key={option.id} label={option.full_name} size="small" />
                  ))
                }
              />
              <Button
                variant="contained"
                disabled={selectedUserIds.length === 0 || bulkAssignMut.isPending}
                onClick={() => bulkAssignMut.mutate()}
                sx={{ borderRadius: '10px', px: 3, boxShadow: 'none' }}
              >
                {bulkAssignMut.isPending ? <CircularProgress size={20} color="inherit" /> : 'Assign'}
              </Button>
            </Box>
          </Box>
        )}

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>User</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>{facility ? 'Is Primary' : 'Facility'}</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) => <TableCell key={j}><Skeleton /></TableCell>)}</TableRow>
                ))
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 5 }}>
                    <PeopleIcon sx={{ fontSize: '2.5rem', color: '#E5E7EB', mb: 1, display: 'block', mx: 'auto' }} />
                    <Typography variant="body2" color="text.secondary">No users found</Typography>
                  </TableCell>
                </TableRow>
              ) : users.map((user) => {
                const rc = ROLE_COLORS[user.role] || ROLE_COLORS.employee
                const isEditing = editingUser === user.id
                const isPrimaryHere = user.facility_id === facility?.id

                return (
                  <TableRow key={user.id} sx={{ '&:hover': { backgroundColor: '#FAFAFF' } }}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Avatar sx={{ width: 32, height: 32, backgroundColor: getAvatarColor(user.full_name), color: '#fff', fontSize: '0.8rem', fontWeight: 700 }}>
                          {getInitials(user.full_name)}
                        </Avatar>
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600, color: '#1E1B4B' }}>{user.full_name}</Typography>
                          <Typography variant="caption" sx={{ color: '#9CA3AF' }}>{user.email}</Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip label={user.role.replace('_', ' ')} size="small"
                        sx={{ backgroundColor: rc.bg, color: rc.color, fontWeight: 600, fontSize: '0.7rem', textTransform: 'capitalize' }} />
                    </TableCell>
                    <TableCell>
                      {facility ? (
                        isPrimaryHere ? (
                          <Chip label="Primary" size="small" sx={{ color: '#059669', backgroundColor: '#ECFDF5', fontSize: '0.65rem', fontWeight: 700 }} />
                        ) : (
                          <Chip label="Secondary" size="small" variant="outlined" sx={{ color: '#6B7280', fontSize: '0.65rem' }} />
                        )
                      ) : (
                        isEditing ? (
                          <FormControl size="small" sx={{ minWidth: 150 }}>
                            <Select
                              value={editFacilityId ?? ''}
                              onChange={(e) => {
                                const val = e.target.value
                                const fid = val === '' ? null : Number(val)
                                setEditFacilityId(fid)
                                assignMut.mutate({ userId: user.id, facilityId: fid })
                              }}
                              displayEmpty
                            >
                              <MenuItem value="">No Facility</MenuItem>
                              {facilities.map(f => <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>)}
                            </Select>
                          </FormControl>
                        ) : (
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {getFacilityName(user.facility_id)}
                          </Typography>
                        )
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={user.is_active ? 'Active' : 'Inactive'}
                        size="small"
                        sx={{
                          backgroundColor: user.is_active ? '#F0FDF4' : '#FEF2F2',
                          color: user.is_active ? '#10B981' : '#EF4444',
                          fontWeight: 600, fontSize: '0.7rem',
                        }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                        {!facility && (
                          <Tooltip title="Edit Facility Assignment">
                            <IconButton size="small"
                              onClick={() => { setEditingUser(isEditing ? null : user.id); setEditFacilityId(user.facility_id) }}
                              sx={{ color: '#7C3AED', backgroundColor: '#F5F3FF', borderRadius: '8px', '&:hover': { backgroundColor: '#EDE9FE' } }}>
                              <EditOutlinedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title={facility ? "Unassign User" : "Remove from Facility"}>
                          <IconButton size="small"
                            onClick={() => (user.facility_id || facility) && removeMut.mutate(user.id)}
                            disabled={!user.facility_id && !facility}
                            sx={{ color: '#EF4444', backgroundColor: '#FEF2F2', borderRadius: '8px', '&:hover': { backgroundColor: '#FEE2E2' } }}>
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
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
