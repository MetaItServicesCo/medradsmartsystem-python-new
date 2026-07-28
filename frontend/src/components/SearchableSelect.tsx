import { Autocomplete, Box, CircularProgress, TextField, Typography, type SxProps, type Theme } from '@mui/material'

export type SearchableSelectValue = string | number

export interface SearchableSelectOption<T extends SearchableSelectValue = SearchableSelectValue> {
  value: T
  label: string
  secondary?: string
  keywords?: string
  disabled?: boolean
}

interface SearchableSelectProps<T extends SearchableSelectValue = SearchableSelectValue> {
  label: string
  value: T | '' | null
  options: SearchableSelectOption<T>[]
  onChange: (value: T | '') => void
  placeholder?: string
  noOptionsText?: string
  helperText?: string
  required?: boolean
  disabled?: boolean
  loading?: boolean
  allowClear?: boolean
  size?: 'small' | 'medium'
  sx?: SxProps<Theme>
}

const normalize = (value: unknown) => String(value ?? '').trim().toLocaleLowerCase()

const SearchableSelect = <T extends SearchableSelectValue = SearchableSelectValue>({
  label,
  value,
  options,
  onChange,
  placeholder,
  noOptionsText = 'No matching options',
  helperText,
  required = false,
  disabled = false,
  loading = false,
  allowClear = true,
  size = 'small',
  sx,
}: SearchableSelectProps<T>) => {
  const selected = options.find(option => String(option.value) === String(value)) || null

  return (
    <Autocomplete
      value={selected}
      options={options}
      size={size}
      fullWidth
      disabled={disabled}
      loading={loading}
      disableClearable={!allowClear}
      autoHighlight
      openOnFocus
      selectOnFocus
      clearOnBlur={false}
      handleHomeEndKeys
      noOptionsText={noOptionsText}
      isOptionEqualToValue={(option, current) => String(option.value) === String(current.value)}
      getOptionDisabled={option => Boolean(option.disabled)}
      getOptionLabel={option => option.label}
      filterOptions={(available, state) => {
        const query = normalize(state.inputValue)
        if (!query) return available
        return available.filter(option => normalize(
          `${option.label} ${option.secondary || ''} ${option.keywords || ''}`,
        ).includes(query))
      }}
      onChange={(_, option) => onChange(option?.value ?? '')}
      ListboxProps={{ style: { maxHeight: 320, overflow: 'auto' } }}
      renderOption={(props, option) => (
        <Box component="li" {...props} key={String(option.value)} sx={{ display: 'grid', gap: 0.15 }}>
          <Typography noWrap variant="body2" sx={{ fontWeight: 750, color: '#1E1B4B' }}>
            {option.label}
          </Typography>
          {option.secondary && (
            <Typography noWrap variant="caption" sx={{ color: '#64748B' }}>
              {option.secondary}
            </Typography>
          )}
        </Box>
      )}
      renderInput={params => (
        <TextField
          {...params}
          label={label}
          placeholder={placeholder || `Search ${label.toLocaleLowerCase()}...`}
          required={required}
          helperText={helperText}
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {loading && <CircularProgress color="inherit" size={17} />}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
      sx={sx}
    />
  )
}

export default SearchableSelect
