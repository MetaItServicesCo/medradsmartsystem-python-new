import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Autocomplete, Avatar, Box, CircularProgress, TextField, Typography } from '@mui/material'
import { useQuery } from '@tanstack/react-query'
import { resolveUploadUrl } from '@/api/users'

// Minimal shape the picker needs. Both SalesPart and RentalPart satisfy this.
export interface PickerPart {
  id: number
  part_number: string
  description: string
  default_picture_url: string | null
  quantity_on_hand: number
  unit_price: number
}

interface PartSearchAutocompleteProps<T extends PickerPart> {
  label: string
  value: T | null
  onChange: (part: T | null) => void
  // Backend-backed search. Returns a bounded result set; the picker never holds
  // or renders the full parts catalog, so it stays fast at any inventory size.
  fetchParts: (search?: string, limit?: number) => Promise<{ items: T[] }>
  queryKey: string
  icon: ReactNode
  avatarBg?: string
  avatarColor?: string
  getOptionDisabled?: (part: T) => boolean
  required?: boolean
  disabled?: boolean
}

const PICKER_LIMIT = 50

const fmtMoney = (value: number | string | null | undefined) => `$${Number(value || 0).toFixed(2)}`

export default function PartSearchAutocomplete<T extends PickerPart>({
  label,
  value,
  onChange,
  fetchParts,
  queryKey,
  icon,
  avatarBg = '#F5F3FF',
  avatarColor = '#7C3AED',
  getOptionDisabled,
  required,
  disabled,
}: PartSearchAutocompleteProps<T>) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [debounced, setDebounced] = useState('')

  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(input.trim()), 300)
    return () => window.clearTimeout(handle)
  }, [input])

  // Only queries while the dropdown is open, so nothing loads until the user needs it.
  const partsQ = useQuery({
    queryKey: [queryKey, debounced],
    queryFn: () => fetchParts(debounced || undefined, PICKER_LIMIT),
    enabled: open,
    placeholderData: previousData => previousData,
    staleTime: 30_000,
  })

  // Keep the selected option visible even when it is not part of the current results.
  const options = useMemo(() => {
    const items = partsQ.data?.items ?? []
    if (value && !items.some(item => item.id === value.id)) return [value, ...items]
    return items
  }, [partsQ.data, value])

  return (
    <Autocomplete<T>
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      disabled={disabled}
      value={value}
      onChange={(_, next) => onChange(next)}
      onInputChange={(_, next) => setInput(next)}
      options={options}
      loading={partsQ.isFetching}
      filterOptions={x => x}
      isOptionEqualToValue={(option, current) => option.id === current.id}
      getOptionLabel={option => `${option.part_number} - ${option.description}`}
      getOptionDisabled={getOptionDisabled}
      noOptionsText={partsQ.isFetching ? 'Searching…' : debounced ? 'No matching parts' : 'Start typing to search parts'}
      renderOption={(props, option) => (
        <Box component="li" {...props} key={option.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Avatar
            src={resolveUploadUrl(option.default_picture_url)}
            variant="rounded"
            imgProps={{ loading: 'lazy' }}
            sx={{ width: 32, height: 32, bgcolor: avatarBg, color: avatarColor }}
          >
            {icon}
          </Avatar>
          <Typography component="span" sx={{ fontSize: 14 }}>
            {option.part_number} - {option.description} ({option.quantity_on_hand} available, {fmtMoney(option.unit_price)})
          </Typography>
        </Box>
      )}
      renderInput={params => (
        <TextField
          {...params}
          label={label}
          required={required}
          placeholder="Type to search part number, description, make, model, serial..."
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {partsQ.isFetching ? <CircularProgress color="inherit" size={16} /> : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
    />
  )
}
