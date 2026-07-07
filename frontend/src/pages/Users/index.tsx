import { useEffect, useState } from 'react'
import {
  Box, Typography, Button, TextField, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Paper, Chip, IconButton,
  InputAdornment, Select, MenuItem, FormControl, InputLabel,
  Avatar, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions,
  CircularProgress, Alert,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import BlockIcon from '@mui/icons-material/Block'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import PersonAddIcon from '@mui/icons-material/PersonAdd'
import LoginIcon from '@mui/icons-material/Login'
import DeleteIcon from '@mui/icons-material/Delete'
import SecurityIcon from '@mui/icons-material/Security'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-toastify'
import { 
  fetchUsers, deactivateUser, activateUser, updateUserRole, 
  deleteUser, impersonateUser, type UserData 
} from '@/api/users'
import { useAuthStore } from '@/stores/authStore'
import CreateUserModal from './CreateUserModal'
import EditUserModal from './EditUserModal'
import PermissionEditorModal from './PermissionEditorModal'

const ROLE_OPTIONS = [
  { value: '', label: 'All Roles' },
  { value: 'superadmin', label: 'Super Admin' },
  { value: 'admin', label: 'Admin' },
  { value: 'facility_admin', label: 'Facility Admin' },
  { value: 'technician', label: 'Technician' },
  { value: 'hr_manager', label: 'HR Manager' },
  { value: 'facility_manager', label: 'Facility Manager' },
  { value: 'employee', label: 'Employee' },
  { value: 'client', label: 'Client' },
]

const ROLE_COLORS: Record<string, string> = {
  superadmin: '#7C3AED',
  admin: '#6D28D9',
  facility_admin: '#2563EB',
  technician: '#059669',
  hr_manager: '#D97706',
  facility_manager: '#0891B2',
  employee: '#6B7280',
  client: '#9CA3AF',
}

const Users = () => {
  const currentUser = useAuthStore((s) => s.user)
  const isSuperAdmin = currentUser?.role === 'superadmin'
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const login = useAuthStore((s) => s.login)

  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [roleFilter, setRoleFilter] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editUser, setEditUser] = useState<UserData | null>(null)
  const [roleEditUser, setRoleEditUser] = useState<UserData | null>(null)
  const [permissionUser, setPermissionUser] = useState<UserData | null>(null)
  const [selectedRole, setSelectedRole] = useState('')
  const [confirmDeactivate, setConfirmDeactivate] = useState<UserData | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<UserData | null>(null)

  useEffect(() => {
    setSearch(searchParams.get('search') || '')
  }, [searchParams.get('search')])

  const { data, isLoading } = useQuery({
    queryKey: ['users', search, roleFilter],
    queryFn: () => fetchUsers({ search: search || undefined, role: roleFilter || undefined, limit: 200 }),
  })

  const deactivateMutation = useMutation({
    mutationFn: (id: number) => deactivateUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('User deactivated')
      setConfirmDeactivate(null)
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to deactivate'),
  })

  const activateMutation = useMutation({
    mutationFn: (id: number) => activateUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('User activated')
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to activate'),
  })

  const roleUpdateMutation = useMutation({
    mutationFn: ({ id, role }: { id: number; role: string }) => updateUserRole(id, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('Role updated')
      setRoleEditUser(null)
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to update role'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('User permanently deleted')
      setConfirmDelete(null)
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to delete user'),
  })

  const impersonateMutation = useMutation({
    mutationFn: (id: number) => impersonateUser(id),
    onSuccess: (data) => {
      toast.success(`Logging in as ${data.user.full_name}...`)
      login(data.user, data.access_token)
      // Clear all cached data to prevent stale superadmin data rendering
      queryClient.clear()
      // Dashboard is the index route at '/', not '/dashboard'
      navigate('/', { replace: true })
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to impersonate'),
  })

  const users = data?.items || []

  const getRoleLabel = (role: string) => {
    const found = ROLE_OPTIONS.find((r) => r.value === role)
    return found ? found.label : role
  }

  return (
    <Box className="page-enter">
      <Typography variant="body2" sx={{ color: '#9CA3AF', mb: 3 }}>
        Manage system users, credentials, and role assignments.
      </Typography>

      {/* Toolbar */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          size="small"
          placeholder="Search users..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ width: 280 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: '#9CA3AF', fontSize: '1.2rem' }} />
              </InputAdornment>
            ),
          }}
        />
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Role Filter</InputLabel>
          <Select
            value={roleFilter}
            label="Role Filter"
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            {ROLE_OPTIONS.map((r) => (
              <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <Box sx={{ flex: 1 }} />
        {isSuperAdmin && (
          <Button
            variant="contained"
            startIcon={<PersonAddIcon />}
            onClick={() => setCreateOpen(true)}
            sx={{
              background: 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)',
              boxShadow: '0 4px 14px rgba(124,58,237,0.3)',
            }}
          >
            Create User
          </Button>
        )}
      </Box>

      {/* Table */}
      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress sx={{ color: '#7C3AED' }} />
        </Box>
      ) : (
        <TableContainer component={Paper} className="list-scroll-panel" sx={{ borderRadius: '16px' }}>
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>User</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Facilities</TableCell>
                <TableCell>Status</TableCell>
                {isSuperAdmin && <TableCell align="right">Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isSuperAdmin ? 7 : 6} align="center" sx={{ py: 6 }}>
                    <Typography color="text.secondary">No users found</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                users.map((u) => (
                  <TableRow key={u.id} sx={{ '&:hover': { backgroundColor: '#FAFAFF' } }}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Avatar
                          sx={{
                            width: 36, height: 36,
                            backgroundColor: ROLE_COLORS[u.role] || '#7C3AED',
                            fontSize: '0.85rem', fontWeight: 700,
                          }}
                        >
                          {u.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                        </Avatar>
                        <Box>
                          <Typography sx={{ fontWeight: 600, fontSize: '0.875rem', color: '#1E1B4B' }}>
                            {u.full_name}
                          </Typography>
                          <Typography variant="caption" sx={{ color: '#9CA3AF' }}>
                            @{u.username}
                          </Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{u.email}</Typography>
                    </TableCell>
                    <TableCell>
                      {isSuperAdmin ? (
                        <Chip
                          label={getRoleLabel(u.role)}
                          size="small"
                          onClick={() => { setRoleEditUser(u); setSelectedRole(u.role) }}
                          sx={{
                            backgroundColor: `${ROLE_COLORS[u.role] || '#7C3AED'}18`,
                            color: ROLE_COLORS[u.role] || '#7C3AED',
                            fontWeight: 600,
                            cursor: 'pointer',
                            '&:hover': { opacity: 0.8 },
                          }}
                        />
                      ) : (
                        <Chip
                          label={getRoleLabel(u.role)}
                          size="small"
                          sx={{
                            backgroundColor: `${ROLE_COLORS[u.role] || '#7C3AED'}18`,
                            color: ROLE_COLORS[u.role] || '#7C3AED',
                            fontWeight: 600,
                          }}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={u.user_type === 'client' ? 'Client' : 'Employee'}
                        size="small"
                        variant="outlined"
                        sx={{ fontWeight: 500 }}
                      />
                    </TableCell>
                    <TableCell>
                      {u.facilities && u.facilities.length > 0 ? (
                        <Tooltip title={u.facilities.map(f => f.name).join(', ')}>
                          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                            {u.facilities.slice(0, 2).map((f) => (
                              <Chip key={f.id} label={f.name} size="small" variant="outlined"
                                sx={{ fontSize: '0.7rem', height: 22 }}
                              />
                            ))}
                            {u.facilities.length > 2 && (
                              <Chip label={`+${u.facilities.length - 2}`} size="small"
                                sx={{ fontSize: '0.7rem', height: 22, backgroundColor: '#F3F4F6' }}
                              />
                            )}
                          </Box>
                        </Tooltip>
                      ) : (
                        <Typography variant="caption" sx={{ color: '#D1D5DB' }}>—</Typography>
                      )}
                    </TableCell>

                    <TableCell>
                      <Chip
                        label={u.is_active ? 'Active' : 'Inactive'}
                        size="small"
                        sx={{
                          backgroundColor: u.is_active ? '#ECFDF5' : '#FEF2F2',
                          color: u.is_active ? '#059669' : '#DC2626',
                          fontWeight: 600,
                        }}
                      />
                    </TableCell>
                    {isSuperAdmin && (
                      <TableCell align="right">
                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                          <Tooltip title="Edit User">
                            <IconButton size="small" onClick={() => setEditUser(u)}
                              sx={{ color: '#7C3AED' }}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Edit Permissions">
                            <IconButton size="small" onClick={() => setPermissionUser(u)}
                              sx={{ color: '#4F46E5' }}>
                              <SecurityIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Login as User">
                            <IconButton size="small" onClick={() => impersonateMutation.mutate(u.id)}
                              disabled={impersonateMutation.isPending || u.id === currentUser?.id}
                              sx={{ color: '#8B5CF6' }}>
                              {impersonateMutation.isPending ? <CircularProgress size={20} /> : <LoginIcon fontSize="small" />}
                            </IconButton>
                          </Tooltip>
                          {u.is_active ? (
                            <Tooltip title="Deactivate">
                              <IconButton size="small" onClick={() => setConfirmDeactivate(u)}
                                sx={{ color: '#EF4444' }}>
                                <BlockIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          ) : (
                            <Tooltip title="Activate">
                              <IconButton size="small" onClick={() => activateMutation.mutate(u.id)}
                                sx={{ color: '#10B981' }}>
                                <CheckCircleIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          <Tooltip title="Delete Permanently">
                            <IconButton size="small" onClick={() => setConfirmDelete(u)}
                              disabled={u.id === currentUser?.id}
                              sx={{ color: '#EF4444' }}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Total count */}
      {data && (
        <Typography variant="caption" sx={{ mt: 2, display: 'block', color: '#9CA3AF' }}>
          Showing {users.length} of {data.total} users
        </Typography>
      )}

      {/* Create User Modal */}
      <CreateUserModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />

      {/* Edit User Modal */}
      {editUser && (
        <EditUserModal
          open={!!editUser}
          user={editUser}
          onClose={() => setEditUser(null)}
        />
      )}

      <PermissionEditorModal
        open={!!permissionUser}
        user={permissionUser}
        onClose={() => setPermissionUser(null)}
      />

      {/* Quick Role Change Dialog */}
      <Dialog open={!!roleEditUser} onClose={() => setRoleEditUser(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Change Role</DialogTitle>
        <DialogContent>
          {roleEditUser && (
            <Box sx={{ pt: 1 }}>
              <Typography variant="body2" sx={{ mb: 2, color: '#6B7280' }}>
                Changing role for <strong>{roleEditUser.full_name}</strong>
              </Typography>
              <FormControl fullWidth size="small">
                <InputLabel>Role</InputLabel>
                <Select value={selectedRole} label="Role" onChange={(e) => setSelectedRole(e.target.value)}>
                  {ROLE_OPTIONS.filter(r => r.value).map((r) => (
                    <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRoleEditUser(null)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => roleEditUser && roleUpdateMutation.mutate({ id: roleEditUser.id, role: selectedRole })}
            disabled={roleUpdateMutation.isPending}
          >
            {roleUpdateMutation.isPending ? <CircularProgress size={20} /> : 'Update Role'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirm Deactivate Dialog */}
      <Dialog open={!!confirmDeactivate} onClose={() => setConfirmDeactivate(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, color: '#EF4444' }}>Deactivate User</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mt: 1, borderRadius: '12px' }}>
            This will prevent <strong>{confirmDeactivate?.full_name}</strong> from logging in. You can reactivate later.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirmDeactivate(null)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => confirmDeactivate && deactivateMutation.mutate(confirmDeactivate.id)}
            disabled={deactivateMutation.isPending}
          >
            {deactivateMutation.isPending ? <CircularProgress size={20} /> : 'Deactivate'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirm Delete Dialog */}
      <Dialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, color: '#DC2626' }}>Delete User Permanently</DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mt: 1, borderRadius: '12px' }}>
            Are you sure you want to delete <strong>{confirmDelete?.full_name}</strong>? This action is <strong>irreversible</strong> and will remove all their system associations.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => confirmDelete && deleteMutation.mutate(confirmDelete.id)}
            disabled={deleteMutation.isPending}
            sx={{ fontWeight: 700 }}
          >
            {deleteMutation.isPending ? <CircularProgress size={20} /> : 'Delete Permanently'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default Users
