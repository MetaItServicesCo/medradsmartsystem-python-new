import { Box, Button, TextField, Tooltip } from '@mui/material'
import ClearIcon from '@mui/icons-material/Clear'

interface DateRangeFilterProps {
  dateFrom: string
  dateTo: string
  onDateFromChange: (value: string) => void
  onDateToChange: (value: string) => void
  label?: string
}

const DateRangeFilter = ({
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  label = 'record date',
}: DateRangeFilterProps) => {
  const invalidRange = Boolean(dateFrom && dateTo && dateFrom > dateTo)

  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, flexWrap: 'wrap' }}>
      <Tooltip title={`Filter by ${label}`} arrow>
        <TextField
          size="small"
          type="date"
          label="From"
          value={dateFrom}
          onChange={(event) => onDateFromChange(event.target.value)}
          error={invalidRange}
          InputLabelProps={{ shrink: true }}
          inputProps={{ max: dateTo || undefined }}
          sx={{ width: 150, bgcolor: '#fff' }}
        />
      </Tooltip>
      <Tooltip title={`Filter by ${label}`} arrow>
        <TextField
          size="small"
          type="date"
          label="To"
          value={dateTo}
          onChange={(event) => onDateToChange(event.target.value)}
          error={invalidRange}
          helperText={invalidRange ? 'Before From date' : undefined}
          InputLabelProps={{ shrink: true }}
          inputProps={{ min: dateFrom || undefined }}
          sx={{ width: 150, bgcolor: '#fff' }}
        />
      </Tooltip>
      {(dateFrom || dateTo) && (
        <Button
          size="small"
          startIcon={<ClearIcon />}
          onClick={() => {
            onDateFromChange('')
            onDateToChange('')
          }}
          sx={{ minHeight: 40, px: 1.5, color: '#6B7280', fontWeight: 800, textTransform: 'none' }}
        >
          Clear
        </Button>
      )}
    </Box>
  )
}

export default DateRangeFilter
