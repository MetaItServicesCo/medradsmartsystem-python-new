import { useEffect, useMemo, useState } from 'react'
import {
  Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControl, IconButton, InputLabel, MenuItem,
  Paper, Select, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import SecurityIcon from '@mui/icons-material/Security'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-toastify'
import {
  fetchPermissionCatalog, fetchUserPermissions, updateUserPermissions,
  type PermissionCatalogModule, type UserData, type UserPermissionMatrix,
  type UserPermissionRule,
} from '@/api/users'

const ACTION_LABELS: Array<keyof Omit<UserPermissionRule, 'scope'>> = ['index', 'view', 'add', 'edit', 'delete']

const SCOPE_OPTIONS = [
  { value: 'all', label: 'All Records' },
  { value: 'facility', label: 'Assigned Facilities' },
  { value: 'assigned', label: 'Assigned Records' },
  { value: 'own', label: 'Own Records' },
  { value: 'none', label: 'No Records' },
]

interface Props {
  open: boolean
  user: UserData | null
  onClose: () => void
}

const emptyRule = (scope = 'own'): UserPermissionRule => ({
  index: false,
  view: false,
  add: false,
  edit: false,
  delete: false,
  scope,
})

const buildDefaultMatrix = (role: string, modules: PermissionCatalogModule[]): UserPermissionMatrix => {
  const fullAccess = role === 'superadmin' || role === 'admin'
  const managerAccess = role === 'facility_admin' || role === 'facility_manager'
  const technicianAccess = role === 'technician'

  return modules.reduce<UserPermissionMatrix>((acc, module) => {
    const scope = fullAccess ? 'all' : managerAccess ? 'facility' : technicianAccess ? 'assigned' : 'own'
    const canWork =
      fullAccess ||
      (managerAccess && !['users', 'audit_logs'].includes(module.key)) ||
      (technicianAccess && ['dashboard', 'facility_inventory', 'service_requests', 'inspections', 'calendar', 'chat', 'notifications'].includes(module.key))

    acc[module.key] = {
      index: canWork,
      view: canWork,
      add: fullAccess || managerAccess || (technicianAccess && ['inspections', 'service_requests', 'chat'].includes(module.key)),
      edit: fullAccess || managerAccess || (technicianAccess && ['inspections', 'service_requests', 'chat'].includes(module.key)),
      delete: fullAccess,
      scope: canWork ? scope : 'none',
    }
    return acc
  }, {})
}

const mergePermissions = (
  defaults: UserPermissionMatrix,
  saved?: UserPermissionMatrix,
): UserPermissionMatrix => {
  const merged: UserPermissionMatrix = { ...defaults }
  Object.entries(saved || {}).forEach(([moduleKey, rule]) => {
    if (!merged[moduleKey]) return
    merged[moduleKey] = { ...merged[moduleKey], ...rule }
  })
  return merged
}

const PermissionEditorModal = ({ open, user, onClose }: Props) => {
  const queryClient = useQueryClient()
  const [matrix, setMatrix] = useState<UserPermissionMatrix>({})

  const { data: catalog, isLoading: catalogLoading } = useQuery({
    queryKey: ['permission-catalog'],
    queryFn: fetchPermissionCatalog,
    enabled: open,
  })

  const { data: userWithPermissions, isLoading: permissionsLoading } = useQuery({
    queryKey: ['user-permissions', user?.id],
    queryFn: () => fetchUserPermissions(user!.id),
    enabled: open && !!user,
  })

  const modules = catalog?.modules ?? []
  const activeUser = userWithPermissions || user
  const isBusy = catalogLoading || permissionsLoading

  const allowedCount = useMemo(() => {
    return Object.values(matrix).reduce((sum, rule) => (
      sum + ACTION_LABELS.filter((action) => rule[action]).length
    ), 0)
  }, [matrix])

  useEffect(() => {
    if (!open || !activeUser || modules.length === 0) return
    const defaults = buildDefaultMatrix(activeUser.role, modules)
    setMatrix(mergePermissions(defaults, activeUser.permissions))
  }, [open, activeUser?.id, activeUser?.role, activeUser?.permissions, modules.length])

  const updateMutation = useMutation({
    mutationFn: () => updateUserPermissions(user!.id, matrix),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['user-permissions', user?.id] })
      toast.success('Permissions updated')
      onClose()
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to update permissions'),
  })

  const setRule = (moduleKey: string, patch: Partial<UserPermissionRule>) => {
    setMatrix((prev) => ({
      ...prev,
      [moduleKey]: { ...(prev[moduleKey] || emptyRule()), ...patch },
    }))
  }

  const toggleAction = (moduleKey: string, action: keyof Omit<UserPermissionRule, 'scope'>) => {
    const current = matrix[moduleKey] || emptyRule()
    setRule(moduleKey, {
      [action]: !current[action],
      scope: !current[action] && current.scope === 'none' ? 'own' : current.scope,
    } as Partial<UserPermissionRule>)
  }

  const selectAllForModule = (moduleKey: string) => {
    const current = matrix[moduleKey] || emptyRule()
    const allSelected = ACTION_LABELS.every((action) => current[action])
    setRule(moduleKey, {
      index: !allSelected,
      view: !allSelected,
      add: !allSelected,
      edit: !allSelected,
      delete: !allSelected,
      scope: allSelected ? 'none' : current.scope === 'none' ? 'own' : current.scope,
    })
  }

  const selectAllEverything = () => {
    const allSelected = modules.every((module) => ACTION_LABELS.every((action) => matrix[module.key]?.[action]))
    setMatrix((prev) => modules.reduce<UserPermissionMatrix>((acc, module) => ({
      ...acc,
      [module.key]: {
        ...(prev[module.key] || emptyRule()),
        index: !allSelected,
        view: !allSelected,
        add: !allSelected,
        edit: !allSelected,
        delete: !allSelected,
        scope: allSelected ? 'none' : 'all',
      },
    }), {}))
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth PaperProps={{ sx: { borderRadius: '22px', overflow: 'hidden' } }}>
      <DialogTitle sx={{ p: 0 }}>
        <Box sx={{ px: 3, py: 2.25, background: 'linear-gradient(135deg, #F8FAFC 0%, #F5F3FF 100%)', display: 'flex', alignItems: 'center', gap: 1.5, borderBottom: '1px solid #E5E7EB' }}>
          <Box sx={{ width: 42, height: 42, borderRadius: '12px', backgroundColor: '#EDE9FE', color: '#7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <SecurityIcon />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 900, color: '#1E1B4B' }}>Permission Matrix</Typography>
            <Typography variant="body2" sx={{ color: '#6B7280' }}>
              {user ? `${user.full_name} · ${user.role.replace('_', ' ')}` : 'Select module access'}
            </Typography>
          </Box>
          <Chip label={`${allowedCount} permissions enabled`} sx={{ backgroundColor: '#EEF2FF', color: '#4F46E5', fontWeight: 800 }} />
          <IconButton onClick={onClose}><CloseIcon /></IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ p: 3, backgroundColor: '#F8FAFC' }}>
        {isBusy ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress sx={{ color: '#7C3AED' }} />
          </Box>
        ) : (
          <Paper sx={{ overflow: 'hidden', borderRadius: '16px', border: '1px solid #E5E7EB' }} elevation={0}>
            <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1, borderBottom: '1px solid #E5E7EB' }}>
              <Button size="small" onClick={selectAllEverything} sx={{ fontWeight: 800 }}>
                Select All
              </Button>
              <Typography variant="caption" sx={{ color: '#94A3B8' }}>
                Scope controls which records this user can see or modify inside each module.
              </Typography>
            </Box>
            <TableContainer className="list-scroll-panel" sx={{ maxHeight: 560 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 56, fontWeight: 900 }}>#</TableCell>
                    <TableCell sx={{ minWidth: 260, fontWeight: 900 }}>Permission</TableCell>
                    {ACTION_LABELS.map((action) => (
                      <TableCell key={action} align="center" sx={{ fontWeight: 900, textTransform: 'uppercase' }}>
                        {action}
                      </TableCell>
                    ))}
                    <TableCell sx={{ minWidth: 210, fontWeight: 900 }}>Scope Of Records</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {modules.map((module, index) => {
                    const rule = matrix[module.key] || emptyRule()
                    return (
                      <TableRow key={module.key} hover>
                        <TableCell sx={{ color: '#94A3B8' }}>{index + 1}</TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography sx={{ fontWeight: 900, color: '#111827' }}>{module.label}</Typography>
                            <Button size="small" onClick={() => selectAllForModule(module.key)} sx={{ minWidth: 0, px: 0.5, fontSize: '0.7rem', fontWeight: 800 }}>
                              Select All
                            </Button>
                          </Box>
                        </TableCell>
                        {ACTION_LABELS.map((action) => (
                          <TableCell key={action} align="center">
                            <Checkbox
                              size="small"
                              checked={Boolean(rule[action])}
                              onChange={() => toggleAction(module.key, action)}
                              sx={{ color: '#7C3AED', '&.Mui-checked': { color: '#4F46E5' } }}
                            />
                          </TableCell>
                        ))}
                        <TableCell>
                          <FormControl fullWidth size="small">
                            <InputLabel>Scope</InputLabel>
                            <Select
                              label="Scope"
                              value={rule.scope || 'own'}
                              onChange={(e) => setRule(module.key, { scope: e.target.value })}
                            >
                              {SCOPE_OPTIONS.map((scope) => (
                                <MenuItem key={scope.value} value={scope.value}>{scope.label}</MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid #E5E7EB' }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={() => updateMutation.mutate()}
          disabled={updateMutation.isPending || !user}
          sx={{ background: 'linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)', fontWeight: 900 }}
        >
          {updateMutation.isPending ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : 'Save Permissions'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default PermissionEditorModal
