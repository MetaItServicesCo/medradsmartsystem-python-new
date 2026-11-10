import { useDeferredValue, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Dialog, DialogContent, DialogActions, Box, Typography, IconButton,
  Button, Collapse, Chip, Skeleton, Tooltip, TextField, MenuItem,
  CircularProgress, Divider, Menu, ListItemIcon, ListItemText, InputAdornment, Tab, Tabs
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import SearchIcon from '@mui/icons-material/Search'
import CategoryIcon from '@mui/icons-material/Category'
import AddIcon from '@mui/icons-material/Add'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import SubdirectoryArrowRightIcon from '@mui/icons-material/SubdirectoryArrowRight'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import { toast } from 'react-toastify'
import {
  fetchModalities, createModality, updateModality, duplicateModality, deleteModality,
  type Modality, type ModalityCreate, type ModalityUpdate
} from '@/api/modalities'
import { fetchInspectionForms } from '@/api/inspections'
import SearchableSelect from '@/components/SearchableSelect'
import { hasOldList } from '@/utils/modalityList'

const CATEGORIES = [
  { value: 'imaging', label: 'Imaging' },
  { value: 'patient_monitoring', label: 'Patient Monitoring' },
  { value: 'laboratory', label: 'Laboratory' },
  { value: 'treatment', label: 'Treatment' },
]

const CAT_COLORS: Record<string, { bg: string; color: string }> = {
  imaging: { bg: '#EFF6FF', color: '#3B82F6' },
  patient_monitoring: { bg: '#F0FDF4', color: '#10B981' },
  laboratory: { bg: '#FFF7ED', color: '#F59E0B' },
  treatment: { bg: '#FDF2F8', color: '#EC4899' },
}

interface Props {
  open: boolean
  onClose: () => void
}

const ModalitiesModal = ({ open, onClose }: Props) => {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'current' | 'old'>('current')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<Partial<ModalityCreate>>({ name: '', category: 'imaging', description: '', parent_id: null })
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const [menuMod, setMenuMod] = useState<Modality | null>(null)
  const [viewMod, setViewMod] = useState<Modality | null>(null)
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search.trim())

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['modalities', deferredSearch],
    queryFn: () => fetchModalities(true, deferredSearch || undefined),
    enabled: open,
  })
  // Whether the current list is in place (there is an old list), whatever is searched for.
  const { data: allData } = useQuery({
    queryKey: ['modalities'],
    queryFn: () => fetchModalities(),
    enabled: open,
  })
  const listInPlace = hasOldList(allData?.items ?? [])
  // The visible forms a type can give its new assets.
  const { data: formsData } = useQuery({
    queryKey: ['inspection-forms', 'all'],
    queryFn: () => fetchInspectionForms(),
    enabled: open && listInPlace,
  })
  const visibleForms = formsData?.items ?? []

  const createMut = useMutation({
    mutationFn: (d: ModalityCreate) => createModality(d),
    onSuccess: () => { toast.success('Modality created!'); queryClient.invalidateQueries({ queryKey: ['modalities'] }); resetForm() },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: number; d: ModalityUpdate }) => updateModality(id, d),
    onSuccess: () => { toast.success('Modality updated!'); queryClient.invalidateQueries({ queryKey: ['modalities'] }); resetForm() },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed'),
  })

  const dupMut = useMutation({
    mutationFn: (id: number) => duplicateModality(id),
    onSuccess: () => { toast.success('Modality duplicated!'); queryClient.invalidateQueries({ queryKey: ['modalities'] }) },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed'),
  })

  const delMut = useMutation({
    mutationFn: (id: number) => deleteModality(id),
    onSuccess: () => { toast.success('Modality deleted'); queryClient.invalidateQueries({ queryKey: ['modalities'] }) },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed'),
  })

  const everyModality = data?.items ?? []
  // With the current list in place: the current list alphabetically on one tab,
  // the old list (view only) on the other. Before that, every modality as before.
  const viewingOld = listInPlace && tab === 'old'
  const modalities = listInPlace
    ? everyModality
      .filter(m => Boolean(m.is_legacy) === (tab === 'old'))
      .sort((a, b) => (tab === 'old' ? 0 : a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })))
    : everyModality

  const resetForm = () => { setShowForm(false); setEditingId(null); setForm({ name: '', category: 'imaging', description: '', parent_id: null, inspection_form_id: null }) }

  const handleSubmit = () => {
    if (!form.name || !form.category) { toast.error('Name and category are required'); return }
    if (editingId) {
      updateMut.mutate({ id: editingId, d: form as ModalityUpdate })
    } else {
      createMut.mutate(form as ModalityCreate)
    }
  }

  const openMenu = (e: React.MouseEvent<HTMLElement>, mod: Modality) => { setAnchorEl(e.currentTarget); setMenuMod(mod) }
  const closeMenu = () => { setAnchorEl(null); setMenuMod(null) }

  const handleEdit = (mod: Modality) => {
    setEditingId(mod.id)
    setForm({ name: mod.name, category: mod.category, description: mod.description || '', parent_id: mod.parent_id, inspection_form_id: mod.inspection_form_id ?? null })
    setShowForm(true)
    closeMenu()
  }

  const handleAddSub = (parentId: number) => {
    const parent = everyModality.find(m => m.id === parentId)
    setForm({ name: '', category: parent?.category || 'imaging', description: '', parent_id: parentId, inspection_form_id: null })
    setShowForm(true)
    setEditingId(null)
    closeMenu()
  }

  const renderModality = (mod: Modality, depth = 0) => {
    const cc = CAT_COLORS[mod.category] || CAT_COLORS.imaging
    const isExpanded = expandedId === mod.id
    const hasChildren = mod.children && mod.children.length > 0
    const children = listInPlace && !mod.is_legacy
      ? [...(mod.children || [])].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
      : mod.children

    return (
      <Box key={mod.id}>
        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 1.5,
          p: 1.5, pl: 1.5 + depth * 3, borderRadius: '12px',
          backgroundColor: viewMod?.id === mod.id ? '#F5F3FF' : '#FAFAFA',
          mb: 0.75, transition: 'all 0.15s',
          '&:hover': { backgroundColor: '#F5F3FF' },
        }}>
          {depth > 0 && <SubdirectoryArrowRightIcon sx={{ fontSize: '1rem', color: '#C4B5FD', ml: -1 }} />}
          {hasChildren && (
            <IconButton size="small" onClick={() => setExpandedId(isExpanded ? null : mod.id)}
              sx={{ width: 24, height: 24, color: '#7C3AED' }}>
              {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            </IconButton>
          )}
          {!hasChildren && <Box sx={{ width: 24 }} />}

          <Box sx={{
            width: 32, height: 32, borderRadius: '8px',
            background: `linear-gradient(135deg, ${cc.color}20, ${cc.color}10)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <CategoryIcon sx={{ fontSize: '0.9rem', color: cc.color }} />
          </Box>

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: '#1E1B4B' }}>{mod.name}</Typography>
            {mod.description && <Typography variant="caption" sx={{ color: '#9CA3AF' }}>{mod.description}</Typography>}
          </Box>

          <Chip label={mod.category.replace('_', ' ')} size="small"
            sx={{ backgroundColor: cc.bg, color: cc.color, fontWeight: 600, fontSize: '0.65rem', textTransform: 'capitalize' }} />

          {listInPlace && !mod.is_legacy && mod.inspection_form_name && (
            <Tooltip title={mod.inspection_form_hidden ? 'This form is hidden, so new assets of this type get no form. Choose a visible one.' : 'The form new assets of this type get'}>
              <Chip
                icon={<DescriptionOutlinedIcon sx={{ fontSize: '0.9rem !important' }} />}
                label={mod.inspection_form_hidden ? `${mod.inspection_form_name} (hidden)` : mod.inspection_form_name}
                size="small"
                sx={{
                  maxWidth: 220, fontWeight: 700, fontSize: '0.65rem',
                  backgroundColor: mod.inspection_form_hidden ? '#FFF7ED' : '#F5F3FF',
                  color: mod.inspection_form_hidden ? '#C2410C' : '#6D28D9',
                  '& .MuiChip-icon': { color: 'inherit' },
                }}
              />
            </Tooltip>
          )}

          {mod.inspection_frequency_days && (
            <Chip label={`${mod.inspection_frequency_days}d`} size="small"
              sx={{ backgroundColor: '#F3F4F6', color: '#6B7280', fontWeight: 600, fontSize: '0.65rem' }} />
          )}

          <IconButton size="small" onClick={(e) => openMenu(e, mod)}
            sx={{ color: '#7C3AED', backgroundColor: '#F5F3FF', borderRadius: '8px', '&:hover': { backgroundColor: '#EDE9FE' } }}>
            <MoreVertIcon fontSize="small" />
          </IconButton>
        </Box>

        {hasChildren && (
          <Collapse in={isExpanded}>
            {children.map(child => renderModality(child, depth + 1))}
          </Collapse>
        )}
      </Box>
    )
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: '24px', overflow: 'hidden' } }}>
      <Box sx={{
        background: 'linear-gradient(135deg, #7C3AED 0%, #5B21B6 100%)',
        px: 3.5, py: 3, display: 'flex', alignItems: 'center', gap: 2,
      }}>
        <Box sx={{ width: 48, height: 48, borderRadius: '14px', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CategoryIcon sx={{ color: '#fff', fontSize: '1.5rem' }} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" sx={{ color: '#fff', fontWeight: 700 }}>Modalities</Typography>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.75)' }}>Manage modalities and sub-modalities</Typography>
        </Box>
        {!viewingOld && (
          <Button size="small" startIcon={<AddIcon />} onClick={() => { resetForm(); setShowForm(true) }}
            sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.4)', border: '1px solid', borderRadius: '10px', fontSize: '0.75rem' }}>
            Add Modality
          </Button>
        )}
        <IconButton onClick={onClose} sx={{ color: '#fff', '&:hover': { background: 'rgba(255,255,255,0.12)' } }}>
          <CloseIcon />
        </IconButton>
      </Box>

      {listInPlace && (
        <Tabs value={tab} onChange={(_, value) => { setTab(value); resetForm(); setViewMod(null) }} sx={{ px: { xs: 2, sm: 3.5 }, borderBottom: '1px solid #EDE9FE', flexShrink: 0 }}>
          <Tab value="current" label="Modalities" sx={{ textTransform: 'none', fontWeight: 700 }} />
          <Tab value="old" label="Old list" sx={{ textTransform: 'none', fontWeight: 700 }} />
        </Tabs>
      )}

      <DialogContent sx={{ p: { xs: 2, sm: 3.5 } }}>
        {viewingOld && (
          <Typography variant="body2" sx={{ mb: 2, color: '#6B7280' }}>
            The modalities used before the current list. Existing assets keep them; new assets are added with the current list.
          </Typography>
        )}
        {/* Form */}
        {showForm && !viewingOld && (
          <Box sx={{ mb: 3, p: 2.5, borderRadius: '16px', backgroundColor: '#F5F3FF', border: '1px solid rgba(124,58,237,0.12)' }}>
            <Typography variant="overline" sx={{ color: '#7C3AED', fontWeight: 700, mb: 1.5, display: 'block' }}>
              {editingId ? 'Edit Modality' : form.parent_id ? 'Add Sub-Modality' : 'New Modality'}
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 2, mb: 2 }}>
              <TextField size="small" label="Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              <TextField size="small" label="Category *" select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map(c => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
              </TextField>
              <TextField size="small" label="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} fullWidth sx={{ gridColumn: 'span 2' }} />
              <TextField size="small" label="Inspection Freq (days)" type="number"
                value={form.inspection_frequency_days || ''}
                onChange={e => setForm({ ...form, inspection_frequency_days: e.target.value ? Number(e.target.value) : undefined })} />
              {listInPlace && (
                <SearchableSelect<number>
                  label="Inspection Form"
                  value={form.inspection_form_id || ''}
                  options={visibleForms.map(inspectionForm => ({
                    value: inspectionForm.id,
                    label: inspectionForm.name,
                    keywords: inspectionForm.description || '',
                  }))}
                  onChange={value => setForm({ ...form, inspection_form_id: value ? Number(value) : null })}
                  helperText="New assets of this type get this form"
                  placeholder="Search inspection forms..."
                  noOptionsText="No matching inspection forms"
                />
              )}
            </Box>
            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
              <Button size="small" onClick={resetForm} sx={{ color: '#6B7280' }}>Cancel</Button>
              <Button size="small" variant="contained" onClick={handleSubmit}
                disabled={createMut.isPending || updateMut.isPending}
                sx={{ backgroundColor: '#7C3AED', '&:hover': { backgroundColor: '#6D28D9' } }}>
                {(createMut.isPending || updateMut.isPending) ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : editingId ? 'Save' : 'Create'}
              </Button>
            </Box>
          </Box>
        )}

        {/* View detail */}
        {viewMod && (
          <Box sx={{ mb: 3, p: 2.5, borderRadius: '16px', backgroundColor: '#F0FDF4', border: '1px solid rgba(16,185,129,0.12)' }}>
            <Typography variant="overline" sx={{ color: '#10B981', fontWeight: 700, mb: 1, display: 'block' }}>Modality Details</Typography>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>{viewMod.name}</Typography>
            <Typography variant="caption" sx={{ color: '#6B7280' }}>Category: {viewMod.category} | Children: {viewMod.children?.length || 0}{listInPlace && !viewMod.is_legacy ? ` | Form: ${viewMod.inspection_form_name || 'none'}` : ''}</Typography>
            {viewMod.description && <Typography variant="body2" sx={{ mt: 1, color: '#374151' }}>{viewMod.description}</Typography>}
            <Button size="small" onClick={() => setViewMod(null)} sx={{ mt: 1, color: '#6B7280' }}>Close</Button>
          </Box>
        )}

        <Box sx={{ mb: 2 }}>
          <TextField
            size="small"
            fullWidth
            placeholder="Search modalities..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: '#9CA3AF', fontSize: '1.1rem' }} />
                </InputAdornment>
              ),
              endAdornment: isFetching && !isLoading ? (
                <InputAdornment position="end">
                  <CircularProgress size={16} sx={{ color: '#7C3AED' }} />
                </InputAdornment>
              ) : undefined,
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: '14px',
                backgroundColor: '#FAFAFA',
              },
            }}
          />
        </Box>

        {/* List */}
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} variant="rounded" height={50} sx={{ borderRadius: '12px', mb: 0.75 }} />)
        ) : modalities.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 5 }}>
            <CategoryIcon sx={{ fontSize: '3rem', color: '#E5E7EB', mb: 1 }} />
            <Typography variant="body2" color="text.secondary">
              {deferredSearch ? 'No modalities found' : 'No modalities configured'}
            </Typography>
          </Box>
        ) : (
          modalities.map(m => renderModality(m))
        )}
      </DialogContent>

      {/* Actions Menu */}
      <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={closeMenu}
        PaperProps={{ sx: { borderRadius: '14px', boxShadow: '0 4px 24px rgba(124,58,237,0.15)', minWidth: 200 } }}>
        <MenuItem onClick={() => { setViewMod(menuMod); closeMenu() }} sx={{ py: 1.2, mx: 0.75, borderRadius: '8px' }}>
          <ListItemIcon><VisibilityOutlinedIcon sx={{ color: '#7C3AED', fontSize: '1.1rem' }} /></ListItemIcon>
          <ListItemText primary="View" primaryTypographyProps={{ fontSize: '0.85rem', fontWeight: 600 }} />
        </MenuItem>
        {!viewingOld && [
        <MenuItem key="edit" onClick={() => menuMod && handleEdit(menuMod)} sx={{ py: 1.2, mx: 0.75, borderRadius: '8px' }}>
          <ListItemIcon><EditOutlinedIcon sx={{ color: '#6D28D9', fontSize: '1.1rem' }} /></ListItemIcon>
          <ListItemText primary="Edit Modality" primaryTypographyProps={{ fontSize: '0.85rem', fontWeight: 600 }} />
        </MenuItem>,
        <MenuItem key="sub" onClick={() => { menuMod && handleAddSub(menuMod.id) }} sx={{ py: 1.2, mx: 0.75, borderRadius: '8px' }}>
          <ListItemIcon><SubdirectoryArrowRightIcon sx={{ color: '#3B82F6', fontSize: '1.1rem' }} /></ListItemIcon>
          <ListItemText primary="Add Sub-Modality" primaryTypographyProps={{ fontSize: '0.85rem', fontWeight: 600 }} />
        </MenuItem>,
        <MenuItem key="dup" onClick={() => { menuMod && dupMut.mutate(menuMod.id); closeMenu() }} sx={{ py: 1.2, mx: 0.75, borderRadius: '8px' }}>
          <ListItemIcon><ContentCopyIcon sx={{ color: '#10B981', fontSize: '1.1rem' }} /></ListItemIcon>
          <ListItemText primary="Duplicate" primaryTypographyProps={{ fontSize: '0.85rem', fontWeight: 600 }} />
        </MenuItem>,
        <Divider key="divider" sx={{ mx: 2, borderColor: 'rgba(124,58,237,0.08)' }} />,
        <MenuItem key="delete" onClick={() => { menuMod && delMut.mutate(menuMod.id); closeMenu() }} sx={{ py: 1.2, mx: 0.75, borderRadius: '8px', '&:hover': { backgroundColor: '#FEF2F2' } }}>
          <ListItemIcon><DeleteOutlineIcon sx={{ color: '#EF4444', fontSize: '1.1rem' }} /></ListItemIcon>
          <ListItemText primary="Delete" primaryTypographyProps={{ fontSize: '0.85rem', fontWeight: 600, color: '#EF4444' }} />
        </MenuItem>,
        ]}
      </Menu>
    </Dialog>
  )
}

export default ModalitiesModal
