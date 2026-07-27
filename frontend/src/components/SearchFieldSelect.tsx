import { FormControl, MenuItem, Select, type SelectChangeEvent } from '@mui/material'

export interface SearchFieldOption {
  value: string
  label: string
}

interface SearchFieldSelectProps {
  value: string
  options: SearchFieldOption[]
  onChange: (value: string) => void
  ariaLabel?: string
  sx?: Record<string, unknown>
}

const SearchFieldSelect = ({
  value,
  options,
  onChange,
  ariaLabel = 'Search field',
  sx,
}: SearchFieldSelectProps) => (
  <FormControl size="small" sx={{ minWidth: 150, ...sx }}>
    <Select
      value={value}
      onChange={(event: SelectChangeEvent<string>) => onChange(event.target.value)}
      inputProps={{ 'aria-label': ariaLabel }}
      sx={{
        borderRadius: '14px',
        bgcolor: '#fff',
        fontSize: '0.84rem',
        fontWeight: 700,
        color: '#374151',
        '& .MuiSelect-select': { py: 1.15 },
      }}
    >
      {options.map((option) => (
        <MenuItem key={option.value} value={option.value}>
          {option.label}
        </MenuItem>
      ))}
    </Select>
  </FormControl>
)

export default SearchFieldSelect
