import { useMemo, useState } from 'react'
import { Alert, Box, Chip, Collapse, IconButton, InputAdornment, TextField, Typography } from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import CategoryIcon from '@mui/icons-material/Category'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import SubdirectoryArrowRightIcon from '@mui/icons-material/SubdirectoryArrowRight'
import { NEW_MODALITIES } from './newModalities'

const COLOR = '#7C3AED'

// Ignoring case, and with numbers in order: Or Monitor_1 before Or Monitor_2.
const alphabetical = new Intl.Collator('en', { sensitivity: 'base', numeric: true }).compare
const SORTED_MODALITIES = [...NEW_MODALITIES]
  .sort((a, b) => alphabetical(a.name, b.name))
  .map(modality => ({ ...modality, subModalities: [...modality.subModalities].sort(alphabetical) }))

/** The proposed list, read only: nothing here changes any asset or modality. */
const NewModalitiesTab = () => {
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const term = search.trim().toLowerCase()

  const visible = useMemo(() => {
    if (!term) return SORTED_MODALITIES
    return SORTED_MODALITIES.flatMap(modality => {
      if (modality.name.toLowerCase().includes(term)) return [modality]
      const subModalities = modality.subModalities.filter(name => name.toLowerCase().includes(term))
      return subModalities.length ? [{ ...modality, subModalities }] : []
    })
  }, [term])

  const subCount = NEW_MODALITIES.reduce((total, modality) => total + modality.subModalities.length, 0)

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2, borderRadius: '12px' }}>
        {NEW_MODALITIES.length} modalities and {subCount} sub-modalities, for review. These are not in use yet: assets and inspections still use the Modalities tab.
      </Alert>
      <TextField
        size="small"
        fullWidth
        placeholder="Search new modalities..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon sx={{ color: '#9CA3AF', fontSize: '1.1rem' }} />
            </InputAdornment>
          ),
        }}
        sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: '14px', backgroundColor: '#FAFAFA' } }}
      />
      {visible.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 5 }}>
          <CategoryIcon sx={{ fontSize: '3rem', color: '#E5E7EB', mb: 1 }} />
          <Typography variant="body2" color="text.secondary">No modalities found</Typography>
        </Box>
      ) : visible.map(modality => {
        // A search shows its matches without another click.
        const isOpen = Boolean(term) || expanded === modality.name
        return (
          <Box key={modality.name}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, borderRadius: '12px', backgroundColor: '#FAFAFA', mb: 0.75, '&:hover': { backgroundColor: '#F5F3FF' } }}>
              <IconButton
                size="small"
                aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${modality.name}`}
                aria-expanded={isOpen}
                onClick={() => setExpanded(isOpen ? null : modality.name)}
                disabled={Boolean(term)}
                sx={{ width: 24, height: 24, color: COLOR }}
              >
                {isOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
              </IconButton>
              <Box sx={{ width: 32, height: 32, borderRadius: '8px', background: `linear-gradient(135deg, ${COLOR}20, ${COLOR}10)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <CategoryIcon sx={{ fontSize: '0.9rem', color: COLOR }} />
              </Box>
              <Typography variant="body2" sx={{ flex: 1, minWidth: 0, fontWeight: 600, color: '#1E1B4B' }}>{modality.name}</Typography>
              <Chip
                label={`${modality.subModalities.length} sub-modalit${modality.subModalities.length === 1 ? 'y' : 'ies'}`}
                size="small"
                sx={{ backgroundColor: '#F5F3FF', color: COLOR, fontWeight: 600, fontSize: '0.65rem' }}
              />
            </Box>
            <Collapse in={isOpen} unmountOnExit>
              {modality.subModalities.map(name => (
                <Box key={name} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.25, pl: 4.5, borderRadius: '12px', backgroundColor: '#FAFAFA', mb: 0.75 }}>
                  <SubdirectoryArrowRightIcon sx={{ fontSize: '1rem', color: '#C4B5FD' }} />
                  <Typography variant="body2" sx={{ color: '#1E1B4B', minWidth: 0, overflowWrap: 'anywhere' }}>{name}</Typography>
                </Box>
              ))}
            </Collapse>
          </Box>
        )
      })}
    </Box>
  )
}

export default NewModalitiesTab
