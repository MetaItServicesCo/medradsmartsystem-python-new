import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Dialog, DialogContent, DialogActions, Box, Button, Chip, TextField, FormControl,
  InputLabel, Select, MenuItem, Typography, IconButton, CircularProgress,
  Divider,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import BuildIcon from '@mui/icons-material/Build'
import AddIcon from '@mui/icons-material/Add'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import { toast } from 'react-toastify'

import { createServiceRequest, uploadServiceRequestImage, type ServiceRequestCreate, type ServiceRequestPriority } from '@/api/serviceRequests'
import { fetchEquipment, type EquipmentItem } from '@/api/equipment'
import FacilitySearchAutocomplete from '@/components/FacilitySearchAutocomplete'
import SearchableSelect from '@/components/SearchableSelect'
import { useListContext } from '@/contexts/ListContext'

interface Props {
  open: boolean
  onClose: () => void
  initialFacilityId?: number
  initialEquipmentId?: number
}

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))

const CreateServiceRequestModal = ({ open, onClose, initialFacilityId, initialEquipmentId }: Props) => {
  const queryClient = useQueryClient()
  const { focusRecord } = useListContext()

  const [facilityId, setFacilityId] = useState<number | ''>('')
  const [equipmentId, setEquipmentId] = useState<number | ''>('')
  const [priority, setPriority] = useState<ServiceRequestPriority>('medium')
  const [preferredDate, setPreferredDate] = useState('')
  const [hour, setHour] = useState('09')
  const [minute, setMinute] = useState('00')
  const [ampm, setAmpm] = useState<'am' | 'pm'>('am')
  const [requestedBy, setRequestedBy] = useState('')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [references, setReferences] = useState<string[]>([])
  const [serviceRequired, setServiceRequired] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [imageName, setImageName] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)

  const { data: equipmentData, isLoading: equipmentLoading } = useQuery({
    queryKey: ['equipment-for-facility', facilityId],
    queryFn: () => fetchEquipment(facilityId as number),
    enabled: open && !!facilityId,
  })

  const equipmentList: EquipmentItem[] = equipmentData?.items ?? []

  useEffect(() => {
    if (!open) return
    if (initialFacilityId && initialEquipmentId && facilityId === initialFacilityId) {
      setEquipmentId(initialEquipmentId)
      return
    }
    setEquipmentId('')
  }, [facilityId, initialEquipmentId, initialFacilityId, open])

  useEffect(() => {
    if (!open) return
    setFacilityId(initialFacilityId || '')
    setEquipmentId(initialEquipmentId || '')
    setPriority('medium')
    setPreferredDate('')
    setHour('09')
    setMinute('00')
    setAmpm('am')
    setRequestedBy('')
    setReferenceNumber('')
    setReferences([])
    setServiceRequired('')
    setImageUrl('')
    setImageName('')
    setImageFile(null)
    setUploadingImage(false)
  }, [initialEquipmentId, initialFacilityId, open])

  const createMutation = useMutation({
    mutationFn: (data: ServiceRequestCreate) => createServiceRequest(data),
    onSuccess: (request) => {
      toast.success('Service request created successfully')
      focusRecord(`service-request-${request.id}`, request.request_number, {
        message: 'Service request created',
        pathname: '/service-requests',
        query: { search: request.request_number },
      })
      queryClient.invalidateQueries({ queryKey: ['service-requests'] })
      onClose()
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to create service request')
    },
  })

  const preferredDateTime = () => {
    if (!preferredDate) return null
    let numericHour = Number(hour)
    if (ampm === 'am' && numericHour === 12) numericHour = 0
    if (ampm === 'pm' && numericHour !== 12) numericHour += 12
    const localDate = new Date(`${preferredDate}T${String(numericHour).padStart(2, '0')}:${minute}:00`)
    return localDate.toISOString()
  }

  const handleImage = (file?: File) => {
    if (!file) return
    setImageName(file.name)
    setImageFile(file)
    setImageUrl('')
  }

  const handleSubmit = async () => {
    if (!facilityId || !equipmentId || !serviceRequired.trim()) {
      toast.warning('Facility, equipment, and service required are required')
      return
    }
    let uploadedImageUrl = imageUrl
    if (imageFile && !uploadedImageUrl) {
      try {
        setUploadingImage(true)
        const uploaded = await uploadServiceRequestImage(imageFile)
        uploadedImageUrl = uploaded.file_url
        setImageUrl(uploaded.file_url)
      } catch (err: any) {
        toast.error(err.response?.data?.detail || 'Failed to upload image')
        return
      } finally {
        setUploadingImage(false)
      }
    }
    createMutation.mutate({
      facility_id: facilityId as number,
      equipment_id: equipmentId as number,
      priority,
      problem_description: serviceRequired.trim(),
      service_required: serviceRequired.trim(),
      preferred_datetime: preferredDateTime(),
      requested_by_name: requestedBy.trim() || undefined,
      reference_number: [...references, referenceNumber.trim()].filter(Boolean).join(', ') || undefined,
      request_image_url: uploadedImageUrl || undefined,
    })
  }

  const isValid = !!facilityId && !!equipmentId && !!serviceRequired.trim()

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{ sx: { borderRadius: '22px', overflow: 'hidden' } }}
    >
      <Box sx={{ px: 3, py: 2.25, display: 'flex', alignItems: 'center', gap: 1.5, borderBottom: '1px solid #E5E7EB', backgroundColor: '#fff' }}>
        <Box sx={{ width: 42, height: 42, borderRadius: '12px', backgroundColor: '#EDE9FE', color: '#7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <BuildIcon />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 900, color: '#1E1B4B', fontSize: '1.05rem' }}>
            Create Service Request
          </Typography>
          <Typography sx={{ color: '#64748B', fontSize: '0.82rem' }}>
            Capture facility, equipment, preferred visit time, image, and requested service.
          </Typography>
        </Box>
        <IconButton onClick={onClose}><CloseIcon /></IconButton>
      </Box>

      <DialogContent sx={{ p: 3, backgroundColor: '#F8FAFC' }}>
        <Box sx={{ display: 'grid', gap: 2.25 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
            <FacilitySearchAutocomplete
              label="Facility"
              value={facilityId}
              onChange={nextFacilityId => {
                setFacilityId(nextFacilityId)
                setEquipmentId('')
              }}
              required
              enabled={open}
              placeholder="Search facility name, city, state, or ID"
            />

            <SearchableSelect<number>
              label="Select Equipment"
              value={equipmentId}
              onChange={setEquipmentId}
              required
              disabled={!facilityId}
              loading={equipmentLoading}
              options={equipmentList.map(eq => ({
                value: eq.id,
                label: [eq.asset_tag, eq.make, eq.model].filter(Boolean).join(' - '),
                secondary: [eq.serial_number, eq.description].filter(Boolean).join(' - ') || `Equipment #${eq.id}`,
                keywords: `${eq.id} ${eq.asset_tag || ''} ${eq.make || ''} ${eq.model || ''} ${eq.serial_number || ''}`,
              }))}
              noOptionsText={facilityId ? 'No matching equipment for this facility' : 'Select a facility first'}
              placeholder="Search asset tag, make, model, or serial number"
            />
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr 1fr' }, gap: 2 }}>
            <TextField type="date" label="Preferred Date" InputLabelProps={{ shrink: true }} value={preferredDate} onChange={(e) => setPreferredDate(e.target.value)} />
            <FormControl>
              <InputLabel>Hour</InputLabel>
              <Select value={hour} label="Hour" onChange={(e) => setHour(e.target.value)}>
                {HOURS.map((h) => <MenuItem key={h} value={h}>{h}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl>
              <InputLabel>Minute</InputLabel>
              <Select value={minute} label="Minute" onChange={(e) => setMinute(e.target.value)}>
                {MINUTES.map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl>
              <InputLabel>AM / PM</InputLabel>
              <Select value={ampm} label="AM / PM" onChange={(e) => setAmpm(e.target.value as 'am' | 'pm')}>
                <MenuItem value="am">AM</MenuItem>
                <MenuItem value="pm">PM</MenuItem>
              </Select>
            </FormControl>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
            <TextField label="Request By" placeholder="Person name" value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} />
            <Button component="label" variant="outlined" startIcon={<UploadFileIcon />} sx={{ justifyContent: 'flex-start', borderRadius: '12px', minHeight: 56, color: '#475569', borderColor: '#CBD5E1' }}>
              {imageName || 'Choose Image'}
              <input hidden type="file" accept="image/*" onChange={(e) => handleImage(e.target.files?.[0])} />
            </Button>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr auto' }, gap: 1 }}>
            <TextField label="Reference Number / PO Number" placeholder="Enter reference or PO number" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />
            <Button
              variant="contained"
              disabled={!referenceNumber.trim()}
              onClick={() => {
                setReferences((prev) => [...prev, referenceNumber.trim()])
                setReferenceNumber('')
              }}
              sx={{ minWidth: 54, borderRadius: '12px', backgroundColor: '#10B981' }}
            >
              <AddIcon />
            </Button>
          </Box>
          {references.length > 0 && (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {references.map((reference, index) => (
                <Chip
                  key={`${reference}-${index}`}
                  label={reference}
                  onDelete={() => setReferences((prev) => prev.filter((_, i) => i !== index))}
                  sx={{ backgroundColor: '#ECFDF5', color: '#047857', fontWeight: 700 }}
                />
              ))}
            </Box>
          )}

          <FormControl fullWidth>
            <InputLabel>Priority</InputLabel>
            <Select value={priority} label="Priority" onChange={(e) => setPriority(e.target.value as ServiceRequestPriority)}>
              <MenuItem value="low">Low</MenuItem>
              <MenuItem value="medium">Medium</MenuItem>
              <MenuItem value="high">High</MenuItem>
              <MenuItem value="critical">Critical</MenuItem>
            </Select>
          </FormControl>

          <Divider />

          <TextField
            label="Service Required"
            placeholder="Describe the service required..."
            multiline
            rows={5}
            fullWidth
            required
            value={serviceRequired}
            onChange={(e) => setServiceRequired(e.target.value)}
          />
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2.5, gap: 1.5, borderTop: '1px solid #E5E7EB' }}>
        <Button onClick={onClose} variant="outlined" sx={{ borderColor: '#E5E7EB', color: '#6B7280', borderRadius: '12px', px: 3, fontWeight: 700 }}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={!isValid || uploadingImage || createMutation.isPending}
          sx={{ background: 'linear-gradient(135deg, #4F46E5 0%, #EC4899 100%)', borderRadius: '12px', px: 4, fontWeight: 900 }}
        >
          {uploadingImage || createMutation.isPending ? <CircularProgress size={22} sx={{ color: '#fff' }} /> : 'Create Service Request'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default CreateServiceRequestModal
