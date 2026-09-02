import { useState, useEffect } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import {
  Box, Typography, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, IconButton, Tooltip,
  Paper, useTheme, alpha
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import VideocamIcon from '@mui/icons-material/Videocam'
import LinkIcon from '@mui/icons-material/Link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchEvents, createEvent, updateEvent, deleteEvent, type CalendarEvent } from '@/api/calendar'
import { parseISO, format } from 'date-fns'
import { toast } from 'react-toastify'
import { useAuthStore } from '@/stores/authStore'

const CalendarPage = () => {
  const theme = useTheme()
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    start: '',
    end: '',
    is_meeting: false,
    color: '#7C3AED'
  })

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['calendar-events'],
    queryFn: fetchEvents,
  })

  const createMutation = useMutation({
    mutationFn: createEvent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] })
      setIsModalOpen(false)
      toast.success('Event created')
    }
  })

  const updateMutation = useMutation({
    mutationFn: (data: { id: number; payload: any }) => updateEvent(data.id, data.payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] })
      setIsModalOpen(false)
      toast.success('Event updated')
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteEvent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] })
      setIsModalOpen(false)
      toast.success('Event deleted')
    }
  })

  const handleDateClick = (arg: any) => {
    setSelectedEvent(null)
    setFormData({
      title: '',
      description: '',
      start: format(arg.date, "yyyy-MM-dd'T'HH:mm"),
      end: format(new Date(arg.date.getTime() + 3600000), "yyyy-MM-dd'T'HH:mm"),
      is_meeting: false,
      color: '#7C3AED'
    })
    setIsModalOpen(true)
  }

  const handleEventClick = (arg: any) => {
    const event = events.find(e => e.id === parseInt(arg.event.id))
    if (!event) return
    setSelectedEvent(event)
    setFormData({
      title: event.title,
      description: event.description || '',
      start: format(parseISO(event.start_time), "yyyy-MM-dd'T'HH:mm"),
      end: format(parseISO(event.end_time), "yyyy-MM-dd'T'HH:mm"),
      is_meeting: event.is_meeting,
      color: event.color || '#7C3AED'
    })
    setIsModalOpen(true)
  }

  const handleSubmit = () => {
    if (!formData.title || !formData.start || !formData.end) {
      toast.error('Please fill in required fields')
      return
    }

    const payload = {
      title: formData.title,
      description: formData.description,
      start_time: new Date(formData.start).toISOString(),
      end_time: new Date(formData.end).toISOString(),
      is_meeting: formData.is_meeting,
      color: formData.color
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

  const formattedEvents = events.map(e => ({
    id: String(e.id),
    title: e.title,
    start: e.start_time,
    end: e.end_time,
    backgroundColor: e.is_meeting ? 'linear-gradient(135deg, #7C3AED 0%, #F472B6 100%)' : (e.color || '#7C3AED'),
    borderColor: 'transparent',
    extendedProps: { ...e }
  }))

  return (
    <Box className="page-enter" sx={{ height: { xs: 'calc(100dvh - 156px)', sm: 'calc(100dvh - 120px)' }, minHeight: 480, display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ mb: { xs: 2, sm: 4 }, display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 900, color: '#1E1B4B', letterSpacing: '-0.5px' }}>Calendar</Typography>
          <Typography variant="body2" sx={{ color: '#6B7280', fontWeight: 500 }}>Your beautifully merged personal & group schedules</Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => {
            setSelectedEvent(null)
            setFormData({
              title: '', description: '', 
              start: format(new Date(), "yyyy-MM-dd'T'HH:mm"), 
              end: format(new Date(Date.now() + 3600000), "yyyy-MM-dd'T'HH:mm"),
              is_meeting: false, color: '#7C3AED'
            })
            setIsModalOpen(true)
          }}
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
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay'
          }}
          events={formattedEvents}
          editable={true}
          selectable={true}
          selectMirror={true}
          dayMaxEvents={true}
          weekends={true}
          dateClick={handleDateClick}
          eventClick={handleEventClick}
          height="100%"
          eventContent={(eventInfo) => (
            <Box sx={{ p: 0.5, overflow: 'hidden' }}>
              <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {eventInfo.event.title}
              </Typography>
              {eventInfo.event.extendedProps.is_meeting && (
                <VideocamIcon sx={{ fontSize: '0.8rem', mt: 0.5 }} />
              )}
            </Box>
          )}
        />
      </Paper>

      <Dialog open={isModalOpen} onClose={() => setIsModalOpen(false)} maxWidth="xs" fullWidth
        PaperProps={{ sx: { borderRadius: '20px', p: 1 } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>
          {selectedEvent ? 'Edit Event' : 'Add New Event'}
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
          <TextField
            label="Title" fullWidth size="small"
            value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          />
          <TextField
            label="Description" fullWidth size="small" multiline rows={3}
            value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="Start" type="datetime-local" fullWidth size="small"
              value={formData.start} onChange={(e) => setFormData({ ...formData, start: e.target.value })}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="End" type="datetime-local" fullWidth size="small"
              value={formData.end} onChange={(e) => setFormData({ ...formData, end: e.target.value })}
              InputLabelProps={{ shrink: true }}
            />
          </Box>
          <TextField
            select label="Color" fullWidth size="small"
            value={formData.color} onChange={(e) => setFormData({ ...formData, color: e.target.value })}
          >
            <MenuItem value="#7C3AED">Purple (Meeting)</MenuItem>
            <MenuItem value="#10B981">Green (Task)</MenuItem>
            <MenuItem value="#F59E0B">Orange (Personal)</MenuItem>
            <MenuItem value="#EF4444">Red (Urgent)</MenuItem>
            <MenuItem value="#3B82F6">Blue (Other)</MenuItem>
          </TextField>
          
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, backgroundColor: '#F9FAFB', borderRadius: '12px' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <VideocamIcon sx={{ color: '#7C3AED' }} />
              <Typography variant="body2" sx={{ fontWeight: 600 }}>Workspace Meeting</Typography>
            </Box>
            <TextField
              select size="small" value={formData.is_meeting ? 'yes' : 'no'}
              onChange={(e) => setFormData({ ...formData, is_meeting: e.target.value === 'yes' })}
              sx={{ width: 80 }}
            >
              <MenuItem value="yes">Yes</MenuItem>
              <MenuItem value="no">No</MenuItem>
            </TextField>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          {selectedEvent && (
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
          <Button onClick={() => setIsModalOpen(false)} sx={{ color: '#9CA3AF' }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={createMutation.isPending || updateMutation.isPending}
            sx={{ borderRadius: '10px', px: 3 }}
          >
            Save
          </Button>
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
      `}</style>
    </Box>
  )
}

export default CalendarPage
