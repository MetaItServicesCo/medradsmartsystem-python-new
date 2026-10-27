/**
 * An employee's own attendance record.
 *
 * Reads /attendance/me/register, which is scoped on the authenticated user
 * rather than on their role, so no permission change can ever widen it. The
 * verdicts shown here are the same ones the timesheet generator writes to
 * payroll -- same rules engine, same answers -- which is the whole point of
 * showing this to the person being paid.
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Box, Card, CardContent, Chip, CircularProgress, Grid, Paper, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material'

import { fetchMyAttendanceRegister, type RegisterDay } from '@/api/attendance'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const STATUS_LOOK: Record<string, { label: string; color: string; icon: string }> = {
  full_day:    { label: 'Full day',    color: '#2e7d32', icon: '✓' },
  early_leave: { label: 'Left early',  color: '#0288d1', icon: '◑' },
  half_day:    { label: 'Half day',    color: '#ed6c02', icon: '½' },
  absent:      { label: 'Absent',      color: '#d32f2f', icon: '✗' },
  on_leave:    { label: 'On leave',    color: '#7b1fa2', icon: '⚑' },
  holiday:     { label: 'Holiday',     color: '#2e7d32', icon: '★' },
}

const hoursLabel = (hours: number) => {
  if (!hours || hours <= 0) return '—'
  const whole = Math.floor(hours)
  const minutes = Math.round((hours - whole) * 60)
  if (minutes === 60) return `${whole + 1}h`
  return minutes ? `${whole}h ${minutes}m` : `${whole}h`
}

/** Day of week for YYYY-MM-DD, read in UTC so it means the same everywhere. */
const dayOfWeek = (dateStr: string) => new Date(`${dateStr}T00:00:00Z`).getUTCDay()

const MyAttendance = () => {
  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  const [from, setFrom] = useState(monthStart)
  const [to, setTo] = useState(todayStr)
  const rangeValid = Boolean(from && to && from <= to)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['my-attendance-register', from, to],
    queryFn: () => fetchMyAttendanceRegister(from, to),
    enabled: rangeValid,
  })

  const entry = data?.items?.[0]
  const days: RegisterDay[] = useMemo(() => entry?.days ?? [], [entry])
  const totals = entry?.totals
  const policy = entry?.policy

  const cards = totals ? [
    { label: 'Days present', value: String(totals.present), color: '#2e7d32' },
    { label: 'Half days', value: String(totals.half_days), color: '#ed6c02' },
    { label: 'Absent', value: String(totals.absent), color: '#d32f2f' },
    { label: 'On leave', value: String(totals.on_leave), color: '#7b1fa2' },
    { label: 'Late arrivals', value: String(totals.late), color: totals.late ? '#ed6c02' : '#9e9e9e' },
    { label: 'Hours worked', value: hoursLabel(totals.hours_worked), color: '#1E1B4B' },
  ] : []

  return (
    <Box>
      <Typography variant="h5" fontWeight={800} gutterBottom>My Attendance</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Your own check-ins and check-outs. These are the same records your timesheet is built from.
      </Typography>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2} alignItems="flex-start">
          <Grid item xs={6} sm={3}>
            <TextField
              label="From" type="date" size="small" fullWidth
              value={from} onChange={e => setFrom(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={6} sm={3}>
            <TextField
              label="To" type="date" size="small" fullWidth
              value={to} onChange={e => setTo(e.target.value)}
              error={Boolean(from && to && from > to)}
              helperText={from && to && from > to ? 'Ends before it starts' : ' '}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          {policy && (
            <Grid item xs={12} sm={6}>
              <Typography variant="caption" color="text.secondary">Your working hours</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {policy.shift_start && policy.shift_end
                  ? `${policy.shift_start} – ${policy.shift_end}`
                  : 'No fixed shift'}
                {' · '}{policy.work_hours_per_day}h a day
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {policy.name} · {policy.late_grace_minutes} min grace on arrival
              </Typography>
            </Grid>
          )}
        </Grid>
      </Paper>

      {isError && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2, borderColor: '#DC2626', bgcolor: '#FEF2F2' }}>
          <Typography sx={{ fontWeight: 800, color: '#991B1B' }}>
            Your attendance could not be loaded.
          </Typography>
          <Typography variant="body2" sx={{ color: '#991B1B', mt: 0.5 }}>
            {(error as any)?.message || 'The request failed.'} Nothing below should be read as a record.
          </Typography>
        </Paper>
      )}

      {isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
      )}

      {!isLoading && !isError && (
        <>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            {cards.map(card => (
              <Grid item xs={6} sm={4} md={2} key={card.label}>
                <Card variant="outlined">
                  <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Typography variant="caption" color="text.secondary">{card.label}</Typography>
                    <Typography variant="h6" fontWeight={800} sx={{ color: card.color }}>
                      {card.value}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          <TableContainer component={Paper} sx={{ maxHeight: 560 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Day</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Check in</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Check out</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Worked</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {days.map(day => {
                  const look = STATUS_LOOK[day.status] ?? STATUS_LOOK.absent
                  return (
                    <TableRow key={day.date} hover>
                      <TableCell>{day.date}</TableCell>
                      <TableCell sx={{ color: 'text.secondary' }}>{DAY_NAMES[dayOfWeek(day.date)]}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                          <Typography sx={{ color: look.color, fontWeight: 700, fontSize: 14, lineHeight: 1 }}>
                            {look.icon}
                          </Typography>
                          <Typography variant="body2">{look.label}</Typography>
                          {day.is_late && (
                            <Tooltip title={`${day.late_minutes} minutes past the grace period`}>
                              <Chip label="late" size="small" color="warning" variant="outlined" />
                            </Tooltip>
                          )}
                          {day.note && (
                            <Tooltip title={day.note}>
                              <Chip label="check this" size="small" color="info" variant="outlined" />
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>{day.check_in || '—'}</TableCell>
                      <TableCell>
                        {day.check_out || '—'}
                        {day.check_out_next_day && (
                          <Tooltip title="Your shift ran past midnight, so this is on the next calendar day">
                            <Typography component="span" variant="caption" sx={{ ml: 0.5, color: 'text.secondary' }}>
                              +1d
                            </Typography>
                          </Tooltip>
                        )}
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{hoursLabel(day.hours_worked)}</TableCell>
                    </TableRow>
                  )
                })}
                {!days.length && (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      Nothing recorded in this range.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Times are shown where they were recorded. Weekends and days before you were enrolled
            are not listed. If something here looks wrong, raise it with HR.
          </Typography>
        </>
      )}
    </Box>
  )
}

export default MyAttendance
