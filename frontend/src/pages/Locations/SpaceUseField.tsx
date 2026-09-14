/**
 * What a space is used for: pick a listed use or type your own.
 *
 * The listed uses are what carry the building rules — an operating room's air
 * changes, an isolation room's negative pressure. A use typed in, "Conference
 * room", is kept; it simply matches none of those rules, and the helper text
 * says so rather than letting somebody assume their chapel has the pressure
 * regime of an isolation suite.
 *
 * The server stores a typed use in the same shape as the listed ones, so
 * typing "Operating Room" in words still lands on operating_room and its rules.
 */
import { Autocomplete, TextField } from '@mui/material'

const humanise = (v: string) => v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

export default function SpaceUseField({ value, onChange, uses, label = 'What it is used for' }: {
  value: string
  onChange: (value: string) => void
  uses: Array<{ value: string; label: string }>
  label?: string
}) {
  const known = uses.find((u) => u.value === value)
  const display = known ? known.label : (value ? humanise(value) : '')

  return (
    <Autocomplete
      freeSolo size="small"
      options={uses.map((u) => u.label)}
      value={display}
      onChange={(_, v) => {
        const match = uses.find((u) => u.label === v)
        onChange(match ? match.value : (v ?? ''))
      }}
      onInputChange={(_, v, reason) => { if (reason === 'input') onChange(v) }}
      renderInput={(params) => (
        <TextField
          {...params} label={label}
          helperText={!value || known
            ? 'Listed uses carry air, pressure and power rules'
            : 'Your own use is kept, but carries no building rules'}
        />
      )}
    />
  )
}
