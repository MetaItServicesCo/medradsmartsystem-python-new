import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import listPlugin from '@fullcalendar/list'
import {
  Box, Typography, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, Paper, useTheme, useMediaQuery,
  Autocomplete, Chip, Alert, FormControlLabel, Switch,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import VideocamIcon from '@mui/icons-material/Videocam'
import EngineeringIcon from '@mui/icons-material/Engineering'
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchEvents, createEvent, updateEvent, deleteEvent, fetchScheduleTechnicians, checkScheduleClashes,
  type CalendarEvent, type CalendarTechnician, type ScheduleClash,
} from '@/api/calendar'
import { parseISO, format, addDays } from 'date-fns'
import { toast } from 'react-toastify'
import { useAuthStore } from '@/stores/authStore'

const DEFAULT_COLOR = '#7C3AED'
const COLOR_OPTIONS = [
  { value: '#7C3AED', label: 'Purple (Meeting)' },
  { value: '#10B981', label: 'Green (Task)' },
  { value: '#F59E0B', label: 'Orange (Personal)' },
  { value: '#EF4444', label: 'Red (Urgent)' },
  { value: '#3B82F6', label: 'Blue (Other)' },
]
// Each technician's own colour, so an Admin can tell everyone's schedules apart.
const TECHNICIAN_PALETTE = ['#2563EB', '#059669', '#D97706', '#DB2777', '#7C3AED', '#0891B2', '#DC2626', '#65A30D', '#9333EA', '#EA580C']

type FormState = {
  title: string
  description: string
  start: string
  end: string
  is_meeting: boolean
  color: string
  all_day: boolean
  location: string
  technicians: CalendarTechnician[]
}

const blankForm = (start: Date, end: Date): FormState => ({
  title: '',
  description: '',
  start: format(start, "yyyy-MM-dd'T'HH:mm"),
  end: format(end, "yyyy-MM-dd'T'HH:mm"),
  is_meeting: false,
  color: DEFAULT_COLOR,
  all_day: false,
  location: '',
  technicians: [],
})

const errorText = (error: any, fallback: string) => error?.response?.data?.detail || fallback

const CalendarPage = () => {
  const theme = useTheme()
  const onPhone = useMediaQuery(theme.breakpoints.down('sm'))
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  const [searchParams, setSearchParams] = useSearchParams()

  // Super Admins, Admins and technicians (by role, or any role flagged as one) schedule technicians.
  const role = currentUser?.role || ''
  const canSchedule = role === 'superadmin' || role === 'admin' || role === 'technician'
    || (Boolean(currentUser?.is_technician) && role !== 'client')

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [formData, setFormData] = useState<FormState>(blankForm(new Date(), new Date(Date.now() + 3600000)))
  const [colorChosen, setColorChosen] = useState(false)
  const [technicianFilter, setTechnicianFilter] = useState<number | 'all'>('all')
  const [clashes, setClashes] = useState<ScheduleClash[]>([])

  const { data: events = [] } = useQuery({
    queryKey: ['calendar-events'],
    queryFn: fetchEvents,
  })

  const { data: technicianData } = useQuery({
    queryKey: ['calendar-technicians'],
    queryFn: fetchScheduleTechnicians,
    enabled: canSchedule,
    staleTime: 5 * 60_000,
  })
  const technicians: CalendarTechnician[] = useMemo(() => (Array.isArray(technicianData) ? technicianData : []), [technicianData])

  const technicianColor = useMemo(() => {
    const colors = new Map<number, string>()
    technicians.forEach((tech, index) => colors.set(tech.id, TECHNICIAN_PALETTE[index % TECHNICIAN_PALETTE.length]))
    return colors
  }, [technicians])

  const closeModal = () => {
    setIsModalOpen(false)
    setClashes([])
  }

  const createMutation = useMutation({
    mutationFn: createEvent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] })
      closeModal()
      toast.success('Event created')
    },
    onError: (error: any) => toast.error(errorText(error, 'Could not create the event')),
  })

  const updateMutation = useMutation({
    mutationFn: (data: { id: number; payload: any }) => updateEvent(data.id, data.payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] })
      closeModal()
      toast.success('Event updated')
    },
    onError: (error: any) => toast.error(errorText(error, 'Could not update the event')),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteEvent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] })
      closeModal()
      toast.success('Event deleted')
    },
    onError: (error: any) => toast.error(errorText(error, 'Could not delete the event')),
  })

  const openNew = (start: Date, end: Date) => {
    setSelectedEvent(null)
    setFormData(blankForm(start, end))
    setColorChosen(false)
    setClashes([])
    setIsModalOpen(true)
  }

  const handleDateClick = (arg: any) => {
    openNew(arg.date, new Date(arg.date.getTime() + 3600000))
  }

  const openEvent = (event: CalendarEvent) => {
    const allDay = Boolean(event.all_day)
    const start = parseISO(event.start_time)
    const end = parseISO(event.end_time)
    setSelectedEvent(event)
    setFormData({
      title: event.title,
      description: event.description || '',
      start: format(start, "yyyy-MM-dd'T'HH:mm"),
      // An all-day event ends at the start of the day after its last day.
      end: format(allDay ? addDays(end, -1) : end, "yyyy-MM-dd'T'HH:mm"),
      is_meeting: event.is_meeting,
      color: event.color || DEFAULT_COLOR,
      all_day: allDay,
      location: event.location || '',
      technicians: event.technicians || [],
    })
    setColorChosen(true)
    setClashes([])
    setIsModalOpen(true)
  }

  const handleEventClick = (arg: any) => {
    const event = events.find(e => e.id === parseInt(arg.event.id))
    if (event) openEvent(event)
  }

  // A bell notification links to /calendar?event=<id>: open that event.
  useEffect(() => {
    const wanted = Number(searchParams.get('event'))
    if (!wanted || !events.length) return
    const event = events.find(e => e.id === wanted)
    const next = new URLSearchParams(searchParams)
    next.delete('event')
    setSearchParams(next, { replace: true })
    if (event) openEvent(event)
    else toast.info('That schedule is no longer in your calendar')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, searchParams])

  const isSchedule = formData.technicians.length > 0
  const readOnly = Boolean(selectedEvent) && selectedEvent!.can_edit === false
  // Technicians can be tagged on a new event, on a schedule, or on one's own plain event.
  const canTag = canSchedule && !readOnly && (!selectedEvent || selectedEvent.is_schedule || (!selectedEvent.workspace_id && selectedEvent.user_id === currentUser?.id))

  // The times as they will be saved: an all-day event runs from the start of its
  // first day to the start of the day after its last.
  const times = () => {
    if (formData.all_day) {
      const startDay = parseISO(formData.start.slice(0, 10))
      const endDay = parseISO(formData.end.slice(0, 10))
      return { start: startDay, end: addDays(endDay, 1) }
    }
    return { start: new Date(formData.start), end: new Date(formData.end) }
  }

  // Warn, without blocking, when a tagged technician is already booked then.
  useEffect(() => {
    if (!isModalOpen || readOnly || !isSchedule || !formData.start || !formData.end) {
      setClashes([])
      return
    }
    const { start, end } = times()
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      setClashes([])
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      checkScheduleClashes({
        technician_ids: formData.technicians.map(t => t.id),
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        exclude_event_id: selectedEvent?.id,
      }).then(found => { if (!cancelled) setClashes(found) }).catch(() => { if (!cancelled) setClashes([]) })
    }, 400)
    return () => { cancelled = true; window.clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModalOpen, readOnly, formData.technicians, formData.start, formData.end, formData.all_day, selectedEvent?.id])

  const setTechnicians = (picked: CalendarTechnician[]) => {
    setFormData(previous => ({
      ...previous,
      technicians: picked,
      is_meeting: picked.length ? false : previous.is_meeting,
      // Until a colour is chosen, a schedule takes its first technician's colour.
      color: !colorChosen && picked.length ? (technicianColor.get(picked[0].id) || previous.color) : (!colorChosen ? DEFAULT_COLOR : previous.color),
    }))
  }

  const handleSubmit = () => {
    if (!formData.title || !formData.start || !formData.end) {
      toast.error('Please fill in required fields')
      return
    }
    const { start, end } = times()
    if (isSchedule && end < start) {
      toast.error('The end must not be before the start')
      return
    }

    const payload: any = {
      title: formData.title,
      description: formData.description,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      is_meeting: isSchedule ? false : formData.is_meeting,
      color: formData.color,
      all_day: formData.all_day,
      location: formData.location.trim() || null,
    }
    if (isSchedule || selectedEvent?.is_schedule) {
      payload.technician_ids = formData.technicians.map(t => t.id)
    }

    if (selectedEvent) {
      updateMutation.mutate({ id: selectedEvent.id, payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const handleJoinMeeting = () => {
    if (selectedEvent?.workspace_id) {
      // Navigate to chat and the specific workspace would be ideal,
      // but for now we'll just go to chat.
      window.location.href = `/chat?workspaceId=${selectedEvent.workspace_id}`
    }
  }

  const visibleEvents = technicianFilter === 'all'
    ? events
    : events.filter(e => e.is_schedule && (e.technicians || []).some(t => t.id === technicianFilter))

  const formattedEvents = visibleEvents.map(e => ({
    id: String(e.id),
    title: e.title,
    start: e.start_time,
    end: e.end_time,
    allDay: Boolean(e.all_day),
    backgroundColor: e.is_meeting ? 'linear-gradient(135deg, #7C3AED 0%, #F472B6 100%)' : (e.color || DEFAULT_COLOR),
    borderColor: 'transparent',
    // Schedules change through their window, never by dragging.
    ...(e.is_schedule ? { editable: false } : {}),
    extendedProps: { ...e }
  }))

  const colorOptions = COLOR_OPTIONS.some(option => option.value === formData.color)
    ? COLOR_OPTIONS
    : [...COLOR_OPTIONS, { value: formData.color, label: 'Technician colour' }]

  const scheduledTechnicians = useMemo(() => {
    const seen = new Map<number, CalendarTechnician>()
    events.forEach(e => (e.technicians || []).forEach(t => seen.set(t.id, t)))
    return [...seen.values()].sort((a, b) => a.full_name.localeCompare(b.full_name))
  }, [events])

  const dateValue = (value: string) => value.slice(0, 10)

  return (
    <Box className="page-enter" sx={{ height: { xs: 'calc(100dvh - 156px)', sm: 'calc(100dvh - 120px)' }, minHeight: 480, display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ mb: { xs: 2, sm: 3 }, display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 900, color: '#1E1B4B', letterSpacing: '-0.5px' }}>Calendar</Typography>
          <Typography variant="body2" sx={{ color: '#6B7280', fontWeight: 500 }}>
            {canSchedule ? 'Your events, workspace meetings and technician schedules' : 'Your beautifully merged personal & group schedules'}
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => openNew(new Date(), new Date(Date.now() + 3600000))}
          sx={{
            borderRadius: '14px',
            textTransform: 'none',
            px: { xs: 2, sm: 4 }, py: 1.2,
            fontWeight: 800,
            background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
            boxShadow: '0 8px 20px rgba(79,70,229,0.25)',
            '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 12px 28px rgba(79,70,229,0.35)' }
          }}
        >
          New Event
        </Button>
      </Box>

      {canSchedule && scheduledTechnicians.length > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, overflowX: 'auto', pb: 0.5 }}>
          <EngineeringIcon sx={{ color: '#6B7280', flexShrink: 0 }} />
          <Chip
            label="Everything"
            onClick={() => setTechnicianFilter('all')}
            variant={technicianFilter === 'all' ? 'filled' : 'outlined'}
            color={technicianFilter === 'all' ? 'primary' : 'default'}
            sx={{ fontWeight: 800, flexShrink: 0 }}
          />
          {scheduledTechnicians.map(tech => {
            const active = technicianFilter === tech.id
            const color = technicianColor.get(tech.id) || '#6B7280'
            return (
              <Chip
                key={tech.id}
                label={tech.full_name}
                onClick={() => setTechnicianFilter(active ? 'all' : tech.id)}
                sx={{
                  fontWeight: 800,
                  flexShrink: 0,
                  bgcolor: active ? color : 'transparent',
                  color: active ? '#fff' : '#1E1B4B',
                  border: `1px solid ${color}`,
                  '&:hover': { bgcolor: active ? color : `${color}1A` },
                }}
                avatar={<Box component="span" sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: active ? '#fff' : color, ml: '10px !important' }} />}
              />
            )
          })}
        </Box>
      )}

      <Paper sx={{
        p: { xs: 1, sm: 2, md: 4 },
        borderRadius: '32px',
        flex: 1,
        overflow: 'hidden',
        boxShadow: '0 20px 60px -15px rgba(124,58,237,0.1)',
        border: '1px solid rgba(124,58,237,0.05)',
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        backdropFilter: 'blur(20px)',
      }}>
        <FullCalendar
          key={onPhone ? 'phone' : 'screen'}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
          initialView={onPhone ? 'listWeek' : 'dayGridMonth'}
          headerToolbar={onPhone ? {
            left: 'prev,next',
            center: 'title',
            right: 'listDay,listWeek,dayGridMonth'
          } : {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay'
          }}
          buttonText={{ listDay: 'Day', listWeek: 'Week', dayGridMonth: 'Month' }}
          noEventsContent="Nothing scheduled"
          events={formattedEvents}
          editable={true}
          selectable={true}
          selectMirror={true}
          dayMaxEvents={true}
          weekends={true}
          dateClick={handleDateClick}
          eventClick={handleEventClick}
          height="100%"
          eventContent={(eventInfo) => {
            const event = eventInfo.event.extendedProps as CalendarEvent
            const names = (event.technicians || []).map(t => t.full_name).join(', ')
            // A month's days hold one line per event, so there a schedule is its
            // title with a technician mark; week, day and list views name them.
            const oneLine = eventInfo.view.type.startsWith('dayGrid')
            return (
              <Box sx={{ p: oneLine ? '1px 4px' : 0.5, overflow: 'hidden' }} title={event.is_schedule && names ? `${eventInfo.event.title} · ${names}` : undefined}>
                <Typography variant="caption" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: oneLine ? 1.5 : undefined }}>
                  {oneLine && event.is_schedule && <EngineeringIcon sx={{ fontSize: '0.85rem', flexShrink: 0 }} />}
                  <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{eventInfo.event.title}</Box>
                </Typography>
                {!oneLine && event.is_schedule && names && (
                  <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: 0.85 }}>
                    <EngineeringIcon sx={{ fontSize: '0.8rem' }} />{names}
                  </Typography>
                )}
                {eventInfo.event.extendedProps.is_meeting && (
                  <VideocamIcon sx={{ fontSize: '0.8rem', mt: 0.5 }} />
                )}
              </Box>
            )
          }}
        />
      </Paper>

      <Dialog open={isModalOpen} onClose={closeModal} maxWidth="xs" fullWidth
        PaperProps={{ sx: { borderRadius: '20px', p: 1 } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>
          {readOnly ? (selectedEvent?.is_schedule ? 'Technician Schedule' : 'Event') : selectedEvent ? 'Edit Event' : 'Add New Event'}
          {selectedEvent?.is_schedule && selectedEvent.created_by_name && (
            <Typography variant="body2" sx={{ color: '#6B7280', fontWeight: 600 }}>Scheduled by {selectedEvent.created_by_name}</Typography>
          )}
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
          <TextField
            label="Title" fullWidth size="small" disabled={readOnly}
            inputProps={{ maxLength: 100 }}
            value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          />
          {(canTag || isSchedule) && (
            <Autocomplete
              multiple
              disabled={!canTag}
              options={technicians}
              value={formData.technicians}
              onChange={(_, picked) => setTechnicians(picked)}
              getOptionLabel={(tech) => tech.full_name}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              renderTags={(value, getTagProps) => value.map((tech, index) => (
                <Chip
                  {...getTagProps({ index })}
                  key={tech.id}
                  label={tech.full_name}
                  size="small"
                  sx={{ fontWeight: 700, borderLeft: `4px solid ${technicianColor.get(tech.id) || '#6B7280'}` }}
                />
              ))}
              renderInput={(params) => (
                <TextField
                  {...params}
                  size="small"
                  label="Technicians"
                  placeholder={formData.technicians.length ? '' : 'Tag technicians to schedule them'}
                  helperText={isSchedule && !readOnly ? 'They will see this in their calendar and get a notification. Admins see it too.' : undefined}
                />
              )}
            />
          )}
          {clashes.length > 0 && (
            <Alert severity="warning" sx={{ borderRadius: '12px' }}>
              <Typography variant="body2" sx={{ fontWeight: 800, mb: 0.5 }}>Already booked at this time:</Typography>
              {clashes.map(clash => (
                <Typography key={`${clash.event_id}-${clash.technician_id}`} variant="body2">
                  {clash.technician_name}: {clash.title}, {format(parseISO(clash.start_time), 'MMM d, HH:mm')} to {format(parseISO(clash.end_time), 'HH:mm')}
                </Typography>
              ))}
              <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>You can still save.</Typography>
            </Alert>
          )}
          <FormControlLabel
            control={<Switch checked={formData.all_day} disabled={readOnly} onChange={(e) => setFormData({ ...formData, all_day: e.target.checked })} />}
            label="All day"
            sx={{ mt: -1, mb: -1 }}
          />
          <Box sx={{ display: 'flex', gap: 2 }}>
            {formData.all_day ? (
              <>
                <TextField
                  label="From" type="date" fullWidth size="small" disabled={readOnly}
                  value={dateValue(formData.start)}
                  onChange={(e) => setFormData({ ...formData, start: `${e.target.value}T00:00` })}
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  label="To" type="date" fullWidth size="small" disabled={readOnly}
                  value={dateValue(formData.end)}
                  onChange={(e) => setFormData({ ...formData, end: `${e.target.value}T00:00` })}
                  InputLabelProps={{ shrink: true }}
                />
              </>
            ) : (
              <>
                <TextField
                  label="Start" type="datetime-local" fullWidth size="small" disabled={readOnly}
                  value={formData.start} onChange={(e) => setFormData({ ...formData, start: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  label="End" type="datetime-local" fullWidth size="small" disabled={readOnly}
                  value={formData.end} onChange={(e) => setFormData({ ...formData, end: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                />
              </>
            )}
          </Box>
          <TextField
            label="Location" fullWidth size="small" disabled={readOnly}
            inputProps={{ maxLength: 200 }}
            InputProps={{ startAdornment: <PlaceOutlinedIcon sx={{ color: '#9CA3AF', mr: 1, fontSize: 20 }} /> }}
            value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })}
          />
          <TextField
            label={isSchedule ? 'Notes' : 'Description'} fullWidth size="small" multiline rows={3} disabled={readOnly}
            value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />
          <TextField
            select label="Color" fullWidth size="small" disabled={readOnly}
            value={formData.color} onChange={(e) => { setColorChosen(true); setFormData({ ...formData, color: e.target.value }) }}
          >
            {colorOptions.map(option => (
              <MenuItem key={option.value} value={option.value}>
                <Box component="span" sx={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', bgcolor: option.value, mr: 1 }} />
                {option.label}
              </MenuItem>
            ))}
          </TextField>

          {!isSchedule && !selectedEvent?.is_schedule && (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, backgroundColor: '#F9FAFB', borderRadius: '12px' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <VideocamIcon sx={{ color: '#7C3AED' }} />
                <Typography variant="body2" sx={{ fontWeight: 600 }}>Workspace Meeting</Typography>
              </Box>
              <TextField
                select size="small" value={formData.is_meeting ? 'yes' : 'no'} disabled={readOnly}
                onChange={(e) => setFormData({ ...formData, is_meeting: e.target.value === 'yes' })}
                sx={{ width: 80 }}
              >
                <MenuItem value="yes">Yes</MenuItem>
                <MenuItem value="no">No</MenuItem>
              </TextField>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          {selectedEvent && !readOnly && (
            <Button color="error" onClick={() => deleteMutation.mutate(selectedEvent.id)} disabled={deleteMutation.isPending}>
              Delete
            </Button>
          )}
          <Box sx={{ flex: 1 }} />
          {selectedEvent?.is_meeting && (
            <Button
              startIcon={<VideocamIcon />}
              onClick={handleJoinMeeting}
              sx={{ color: '#7C3AED', fontWeight: 700 }}
            >
              Join Meeting
            </Button>
          )}
          <Button onClick={closeModal} sx={{ color: '#9CA3AF' }}>{readOnly ? 'Close' : 'Cancel'}</Button>
          {!readOnly && (
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              sx={{ borderRadius: '10px', px: 3 }}
            >
              Save
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Add global styles for FullCalendar */}
      <style>{`
        .fc { --fc-border-color: #F3F4F6; --fc-button-bg-color: #7C3AED; --fc-button-border-color: #7C3AED; --fc-button-hover-bg-color: #6D28D9; --fc-button-active-bg-color: #5B21B6; font-family: inherit; }
        .fc .fc-toolbar-title { font-size: 1.25rem; font-weight: 800; color: #1E1B4B; }
        .fc .fc-button { text-transform: capitalize; font-weight: 600; border-radius: 8px; font-size: 0.875rem; }
        .fc .fc-daygrid-day-number { color: #4B5563; font-weight: 600; font-size: 0.875rem; padding: 4px 8px; }
        .fc .fc-col-header-cell-cushion { color: #9CA3AF; text-transform: uppercase; font-size: 0.75rem; font-weight: 700; padding: 12px 0; }
        .fc-event { border-radius: 6px; cursor: pointer; transition: transform 0.1s ease; }
        .fc-event:hover { transform: scale(1.02); }
        @media (max-width: 600px) {
          .fc .fc-toolbar { flex-wrap: wrap; gap: 8px; }
          .fc .fc-toolbar-title { font-size: 1rem; }
          .fc .fc-button { padding: 6px 10px; }
          .fc .fc-list-event-title { white-space: normal; }
        }
      `}</style>
    </Box>
  )
}

export default CalendarPage
