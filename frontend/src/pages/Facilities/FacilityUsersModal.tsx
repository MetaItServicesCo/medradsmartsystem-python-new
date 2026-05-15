import { useQuery } from '@tanstack/react-query'
import {
  Avatar,
  Box,
  Chip,
  Dialog,
  DialogContent,
  IconButton,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import PeopleIcon from '@mui/icons-material/People'
import { fetchFacilityUsers } from '@/api/facilityUsers'
import { type Facility } from '@/api/facilities'

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
  const { data, isLoading } = useQuery({
    queryKey: ['facility-managers', facility?.id],
    queryFn: () => fetchFacilityUsers(facility?.id, MANAGER_ROLES),
    enabled: open && !!facility,
  })

  const users = data?.items ?? []

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
