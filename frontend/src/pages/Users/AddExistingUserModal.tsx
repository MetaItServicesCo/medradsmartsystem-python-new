import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Autocomplete,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material'
import GroupAddOutlinedIcon from '@mui/icons-material/GroupAddOutlined'
import { toast } from 'react-toastify'
import {
  bulkAssignUsersToFacility,
  fetchFacilityAssignmentCandidates,
  type FacilityUser,
} from '@/api/facilityUsers'

interface Props {
  open: boolean
  onClose: () => void
  facility: { id: number; name: string }
}

const initials = (name: string) => name
  .split(/\s+/)
  .filter(Boolean)
  .map((part) => part[0])
  .join('')
  .slice(0, 2)
  .toUpperCase()

const AddExistingUserModal = ({ open, onClose, facility }: Props) => {
  const queryClient = useQueryClient()
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [selectedUsers, setSelectedUsers] = useState<FacilityUser[]>([])

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    if (!open) return
    setSearchInput('')
    setSearch('')
    setSelectedUsers([])
  }, [facility.id, open])

  const candidatesQuery = useQuery({
    queryKey: ['facility-assignment-candidates', facility.id, search],
    queryFn: () => fetchFacilityAssignmentCandidates(facility.id, search || undefined),
    enabled: open,
    staleTime: 15_000,
  })

  const options = useMemo(() => {
    const byId = new Map<number, FacilityUser>()
    selectedUsers.forEach((user) => byId.set(user.id, user))
    ;(candidatesQuery.data?.items || []).forEach((user) => byId.set(user.id, user))
    return Array.from(byId.values())
  }, [candidatesQuery.data?.items, selectedUsers])

  const assignMutation = useMutation({
    mutationFn: () => bulkAssignUsersToFacility(facility.id, selectedUsers.map((user) => user.id)),
    onSuccess: (result) => {
      toast.success(result.detail)
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['facility-assignment-candidates', facility.id] })
      queryClient.invalidateQueries({ queryKey: ['facility-managers', facility.id] })
      queryClient.invalidateQueries({ queryKey: ['facility-users', facility.id] })
      queryClient.invalidateQueries({ queryKey: ['facilities'] })
      onClose()
    },
    onError: (error: any) => toast.error(error.response?.data?.detail || 'Could not attach the selected users'),
  })

  return (
    <Dialog
      open={open}
      onClose={() => !assignMutation.isPending && onClose()}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: '22px', overflow: 'hidden' } }}
    >
      <DialogTitle sx={{ px: 3, pt: 3, pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Box sx={{ width: 42, height: 42, borderRadius: '12px', display: 'grid', placeItems: 'center', color: '#7C3AED', bgcolor: '#F5F3FF' }}>
            <GroupAddOutlinedIcon />
          </Box>
          <Box>
            <Typography variant="h6" sx={{ color: '#1E1B4B', fontWeight: 900 }}>Add Existing Users</Typography>
            <Typography variant="body2" sx={{ color: '#64748B' }}>{facility.name}</Typography>
          </Box>
        </Box>
      </DialogTitle>
      <DialogContent sx={{ px: 3, py: 2.5 }}>
        <Typography variant="body2" sx={{ color: '#64748B', mb: 2 }}>
          Search for existing active users and attach them to this facility. Their roles, permissions, and other facility assignments will remain unchanged.
        </Typography>
        <Autocomplete
          multiple
          filterSelectedOptions
          options={options}
          value={selectedUsers}
          loading={candidatesQuery.isLoading || candidatesQuery.isFetching}
          filterOptions={(items) => items}
          onChange={(_, users) => setSelectedUsers(users)}
          inputValue={searchInput}
          onInputChange={(_, value, reason) => {
            if (reason === 'input' || reason === 'clear') setSearchInput(value)
          }}
          getOptionLabel={(user) => `${user.full_name} (${user.email})`}
          isOptionEqualToValue={(option, value) => option.id === value.id}
          noOptionsText={search ? 'No eligible users match this search' : 'No eligible users available'}
          renderTags={(users, getTagProps) => users.map((user, index) => (
            <Chip {...getTagProps({ index })} key={user.id} label={user.full_name} size="small" />
          ))}
          renderOption={(props, user) => (
            <Box component="li" {...props} sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
              <Avatar sx={{ width: 34, height: 34, bgcolor: '#7C3AED', fontSize: 12, fontWeight: 900 }}>
                {initials(user.full_name)}
              </Avatar>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography noWrap sx={{ color: '#1E1B4B', fontWeight: 800 }}>{user.full_name}</Typography>
                <Typography noWrap variant="caption" sx={{ color: '#64748B' }}>
                  {user.email} · {user.role.replace(/_/g, ' ')}
                </Typography>
              </Box>
            </Box>
          )}
          renderInput={(params) => (
            <TextField
              {...params}
              autoFocus
              label="Existing users"
              placeholder={selectedUsers.length ? 'Search for another user' : 'Search by name, username, or email'}
              InputProps={{
                ...params.InputProps,
                endAdornment: (
                  <>
                    {(candidatesQuery.isLoading || candidatesQuery.isFetching) && <CircularProgress color="inherit" size={18} />}
                    {params.InputProps.endAdornment}
                  </>
                ),
              }}
            />
          )}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
        <Button onClick={onClose} disabled={assignMutation.isPending}>Cancel</Button>
        <Button
          variant="contained"
          startIcon={assignMutation.isPending ? <CircularProgress size={17} color="inherit" /> : <GroupAddOutlinedIcon />}
          disabled={selectedUsers.length === 0 || assignMutation.isPending}
          onClick={() => assignMutation.mutate()}
          sx={{ minWidth: 150, borderRadius: '12px', fontWeight: 900 }}
        >
          Add {selectedUsers.length || ''} User{selectedUsers.length === 1 ? '' : 's'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default AddExistingUserModal
