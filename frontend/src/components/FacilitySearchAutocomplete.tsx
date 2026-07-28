import { useEffect, useMemo, useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Autocomplete, Box, CircularProgress, TextField, Typography, type SxProps, type Theme } from '@mui/material'
import { fetchFacilities, fetchFacility, type Facility } from '@/api/facilities'

interface FacilitySearchAutocompleteProps {
  label?: string
  value: number | '' | null
  onChange: (facilityId: number | '') => void
  onFacilityChange?: (facility: Facility | null) => void
  selectedFacility?: Partial<Facility> | null
  required?: boolean
  disabled?: boolean
  allowClear?: boolean
  helperText?: string
  placeholder?: string
  size?: 'small' | 'medium'
  enabled?: boolean
  excludeIds?: number[]
  sx?: SxProps<Theme>
}

const PAGE_SIZE = 50

const FacilitySearchAutocomplete = ({
  label = 'Facility',
  value,
  onChange,
  onFacilityChange,
  selectedFacility,
  required = false,
  disabled = false,
  allowClear = true,
  helperText,
  placeholder = 'Search by facility name, city, state, or ID',
  size = 'small',
  enabled = true,
  excludeIds = [],
  sx,
}: FacilitySearchAutocompleteProps) => {
  const [inputValue, setInputValue] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(inputValue.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [inputValue])

  useEffect(() => {
    if (!enabled) {
      setInputValue('')
      setSearch('')
    }
  }, [enabled])

  const facilitiesQuery = useInfiniteQuery({
    queryKey: ['facility-search-options', search],
    queryFn: ({ pageParam }) => fetchFacilities({
      search: search || undefined,
      skip: pageParam,
      limit: PAGE_SIZE,
    }),
    initialPageParam: 0,
    getNextPageParam: lastPage => {
      const nextSkip = lastPage.skip + lastPage.items.length
      return nextSkip < lastPage.total ? nextSkip : undefined
    },
    enabled,
    staleTime: 60_000,
  })

  const loadedFacilities = facilitiesQuery.data?.pages.flatMap(page => page.items) || []
  const selectedLoaded = loadedFacilities.find(facility => facility.id === Number(value))
  const selectedQuery = useQuery({
    queryKey: ['facility-search-selected', value],
    queryFn: () => fetchFacility(Number(value)),
    enabled: enabled && Boolean(value) && !selectedLoaded && !selectedFacility?.id,
    staleTime: 5 * 60_000,
  })

  const options = useMemo(() => {
    const byId = new Map<number, Facility>()
    if (selectedFacility?.id) byId.set(selectedFacility.id, selectedFacility as Facility)
    if (selectedQuery.data) byId.set(selectedQuery.data.id, selectedQuery.data)
    loadedFacilities.forEach(facility => byId.set(facility.id, facility))
    return Array.from(byId.values()).filter(facility => !excludeIds.includes(facility.id))
  }, [excludeIds, loadedFacilities, selectedFacility, selectedQuery.data])

  const selected = options.find(facility => facility.id === Number(value)) || null
  const loading = facilitiesQuery.isLoading || facilitiesQuery.isFetchingNextPage || selectedQuery.isLoading

  return (
    <Autocomplete
      value={selected}
      options={options}
      inputValue={inputValue}
      onInputChange={(_, nextInput) => setInputValue(nextInput)}
      onChange={(_, facility) => {
        onChange(facility?.id || '')
        onFacilityChange?.(facility || null)
      }}
      filterOptions={available => available}
      getOptionLabel={facility => facility.name || `Facility #${facility.id}`}
      isOptionEqualToValue={(option, current) => option.id === current.id}
      loading={loading}
      disabled={disabled}
      disableClearable={!allowClear}
      autoHighlight
      openOnFocus
      selectOnFocus
      clearOnBlur={false}
      noOptionsText={search ? 'No facilities match this search' : 'No facilities available'}
      size={size}
      fullWidth
      ListboxProps={{
        style: { maxHeight: 320, overflow: 'auto' },
        onScroll: event => {
          const list = event.currentTarget
          const nearBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 48
          if (nearBottom && facilitiesQuery.hasNextPage && !facilitiesQuery.isFetchingNextPage) {
            facilitiesQuery.fetchNextPage()
          }
        },
      }}
      renderOption={(props, facility) => (
        <Box component="li" {...props} key={facility.id} sx={{ display: 'grid', gap: 0.15 }}>
          <Typography noWrap variant="body2" sx={{ color: '#1E1B4B', fontWeight: 800 }}>
            {facility.name}
          </Typography>
          <Typography noWrap variant="caption" sx={{ color: '#64748B' }}>
            #{facility.id} · {[facility.city, facility.state, facility.country].filter(Boolean).join(', ') || 'Location unavailable'}
          </Typography>
        </Box>
      )}
      renderInput={params => (
        <TextField
          {...params}
          label={label}
          required={required}
          helperText={helperText}
          placeholder={placeholder}
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

export default FacilitySearchAutocomplete
