import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Box, Button,
  TextField, FormControl, InputLabel, Select, MenuItem, Typography,
  IconButton, CircularProgress, Divider,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import BuildIcon from '@mui/icons-material/Build'
import { toast } from 'react-toastify'

import { createServiceRequest, type ServiceRequestCreate } from '@/api/serviceRequests'
import { fetchFacilities } from '@/api/facilities'
import { fetchEquipment, type EquipmentItem } from '@/api/equipment'

interface Props {
  open: boolean
  onClose: () => void
}

const CreateServiceRequestModal = ({ open, onClose }: Props) => {
  const queryClient = useQueryClient()

  const [facilityId, setFacilityId] = useState<number | ''>('')
  const [equipmentId, setEquipmentId] = useState<number | ''>('')
  const [priority, setPriority] = useState<string>('medium')
  const [description, setDescription] = useState('')

  // Fetch facilities for dropdown
  const { data: facilitiesData } = useQuery({
    queryKey: ['facilities-brief'],
    queryFn: () => fetchFacilities({ limit: 500 }),
    enabled: open,
  })

  // Fetch equipment filtered by selected facility
  const { data: equipmentData } = useQuery({
    queryKey: ['equipment-for-facility', facilityId],
    queryFn: () => fetchEquipment(facilityId as number),
    enabled: open && !!facilityId,
  })

  const facilities = facilitiesData?.items ?? []
  const equipmentList: EquipmentItem[] = equipmentData?.items ?? []

  // Reset equipment when facility changes
  useEffect(() => {
    setEquipmentId('')
  }, [facilityId])

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setFacilityId('')
      setEquipmentId('')
      setPriority('medium')
      setDescription('')
    }
  }, [open])

  const createMutation = useMutation({
    mutationFn: (data: ServiceRequestCreate) => createServiceRequest(data),
    onSuccess: () => {
      toast.success('Service request created successfully')
      queryClient.invalidateQueries({ queryKey: ['service-requests'] })
      onClose()
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to create service request')
    },
  })

  const handleSubmit = () => {
    if (!facilityId || !equipmentId || !description.trim()) {
      toast.warning('Please fill all required fields')
      return
    }
    createMutation.mutate({
      facility_id: facilityId as number,
      equipment_id: equipmentId as number,
      priority: priority as any,
      problem_description: description.trim(),
    })
  }

  const isValid = !!facilityId && !!equipmentId && !!description.trim()

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: '24px',
          overflow: 'hidden',
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          background: 'linear-gradient(135deg, #7C3AED 0%, #F472B6 100%)',
          px: 3, py: 2.5,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 40, height: 40, borderRadius: '12px',
              backgroundColor: 'rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <BuildIcon sx={{ color: '#fff', fontSize: '1.3rem' }} />
          </Box>
          <Box>
            <Typography sx={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem' }}>
              New Service Request
            </Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem' }}>
              Report an equipment issue
            </Typography>
          </Box>
        </Box>
        <IconButton onClick={onClose} sx={{ color: '#fff' }}>
          <CloseIcon />
        </IconButton>
      </Box>

      <DialogContent sx={{ px: 3, py: 3 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {/* Facility */}
          <FormControl fullWidth required>
            <InputLabel>Facility</InputLabel>
            <Select
              value={facilityId}
              label="Facility"
              onChange={(e) => setFacilityId(e.target.value as number)}
            >
              {facilities.map((f) => (
                <MenuItem key={f.id} value={f.id}>
                  {f.name} — {f.city}, {f.state}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Equipment (filtered by facility) */}
          <FormControl fullWidth required disabled={!facilityId}>
            <InputLabel>Equipment</InputLabel>
            <Select
              value={equipmentId}
              label="Equipment"
              onChange={(e) => setEquipmentId(e.target.value as number)}
            >
              {equipmentList.length === 0 && (
                <MenuItem disabled value="">
                  {facilityId ? 'No equipment found for this facility' : 'Select a facility first'}
                </MenuItem>
              )}
              {equipmentList.map((eq) => (
                <MenuItem key={eq.id} value={eq.id}>
                  {eq.make} {eq.model} — {eq.asset_tag}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Priority */}
          <FormControl fullWidth>
            <InputLabel>Priority</InputLabel>
            <Select
              value={priority}
              label="Priority"
              onChange={(e) => setPriority(e.target.value)}
            >
              <MenuItem value="low">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#0369A1' }} />
                  Low
                </Box>
              </MenuItem>
              <MenuItem value="medium">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#B45309' }} />
                  Medium
                </Box>
              </MenuItem>
              <MenuItem value="high">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#BE123C' }} />
                  High
                </Box>
              </MenuItem>
              <MenuItem value="critical">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#DC2626' }} />
                  Critical
                </Box>
              </MenuItem>
            </Select>
          </FormControl>

          <Divider />

          {/* Description */}
          <TextField
            label="Problem Description"
            placeholder="Describe the issue in detail..."
            multiline
            rows={4}
            fullWidth
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 3, gap: 1.5 }}>
        <Button
          onClick={onClose}
          variant="outlined"
          sx={{
            borderColor: '#E5E7EB', color: '#6B7280',
            borderRadius: '12px', px: 3, fontWeight: 600,
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={!isValid || createMutation.isPending}
          sx={{
            background: 'linear-gradient(135deg, #7C3AED 0%, #F472B6 100%)',
            boxShadow: '0 8px 24px rgba(124,58,237,0.25)',
            borderRadius: '12px', px: 4, fontWeight: 800,
            '&:hover': {
              background: 'linear-gradient(135deg, #6D28D9 0%, #EC4899 100%)',
            },
          }}
        >
          {createMutation.isPending ? (
            <CircularProgress size={22} sx={{ color: '#fff' }} />
          ) : (
            'Submit Request'
          )}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default CreateServiceRequestModal
