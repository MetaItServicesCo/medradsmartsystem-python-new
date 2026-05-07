import { useState, useEffect } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  TextField, Box, Typography, Chip, List, ListItemButton,
  ListItemAvatar, ListItemText, Avatar, CircularProgress,
} from '@mui/material'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-toastify'
import { createWorkspace } from '@/api/chat'
import { searchUsers, type UserSearchResult } from '@/api/users'

interface Props {
  open: boolean
  onClose: () => void
}

const CreateWorkspaceModal = ({ open, onClose }: Props) => {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [memberSearch, setMemberSearch] = useState('')
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([])
  const [selectedMembers, setSelectedMembers] = useState<UserSearchResult[]>([])

  // Search users
  useEffect(() => {
    if (memberSearch.length < 2) { setSearchResults([]); return }
    const timer = setTimeout(async () => {
      try {
        const results = await searchUsers(memberSearch)
        setSearchResults(results.filter(u => !selectedMembers.some(m => m.id === u.id)))
      } catch { setSearchResults([]) }
    }, 300)
    return () => clearTimeout(timer)
  }, [memberSearch, selectedMembers])

  const mutation = useMutation({
    mutationFn: () => createWorkspace(name, description || undefined, selectedMembers.map(m => m.id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
      toast.success('Workspace created!')
      handleClose()
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to create workspace'),
  })

  const handleClose = () => {
    setName('')
    setDescription('')
    setMemberSearch('')
    setSearchResults([])
    setSelectedMembers([])
    onClose()
  }

  const addMember = (user: UserSearchResult) => {
    setSelectedMembers([...selectedMembers, user])
    setMemberSearch('')
    setSearchResults([])
  }

  const removeMember = (userId: number) => {
    setSelectedMembers(selectedMembers.filter(m => m.id !== userId))
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>
        Create Workspace
        <Typography variant="body2" sx={{ color: '#9CA3AF', fontWeight: 400 }}>
          Create a group chat space with multiple users
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField
            fullWidth size="small" label="Workspace Name *"
            value={name} onChange={(e) => setName(e.target.value)}
          />
          <TextField
            fullWidth size="small" label="Description (optional)"
            value={description} onChange={(e) => setDescription(e.target.value)}
            multiline rows={2}
          />

          {/* Selected members */}
          {selectedMembers.length > 0 && (
            <Box>
              <Typography variant="caption" sx={{ color: '#6B7280', fontWeight: 600, mb: 0.5, display: 'block' }}>
                Members ({selectedMembers.length})
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {selectedMembers.map((m) => (
                  <Chip
                    key={m.id}
                    label={m.full_name}
                    size="small"
                    onDelete={() => removeMember(m.id)}
                    sx={{ backgroundColor: '#F5F3FF', color: '#7C3AED', fontWeight: 500 }}
                  />
                ))}
              </Box>
            </Box>
          )}

          {/* Add members */}
          <TextField
            fullWidth size="small" placeholder="Search users to add..."
            value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)}
          />
          {searchResults.length > 0 && (
            <List disablePadding sx={{ maxHeight: 200, overflowY: 'auto' }}>
              {searchResults.map((u) => (
                <ListItemButton key={u.id} onClick={() => addMember(u)} sx={{ borderRadius: '8px' }}>
                  <ListItemAvatar>
                    <Avatar sx={{ width: 32, height: 32, backgroundColor: '#7C3AED', fontSize: '0.75rem', fontWeight: 700 }}>
                      {u.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={u.full_name}
                    secondary={u.email}
                    primaryTypographyProps={{ fontSize: '0.85rem', fontWeight: 600 }}
                    secondaryTypographyProps={{ fontSize: '0.75rem' }}
                  />
                </ListItemButton>
              ))}
            </List>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          variant="contained" onClick={() => mutation.mutate()}
          disabled={!name.trim() || mutation.isPending}
          sx={{ minWidth: 140 }}
        >
          {mutation.isPending ? <CircularProgress size={20} sx={{ color: '#fff' }} /> : 'Create Workspace'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default CreateWorkspaceModal
