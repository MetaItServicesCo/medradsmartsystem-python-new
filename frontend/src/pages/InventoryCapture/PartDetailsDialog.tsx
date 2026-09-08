import { useEffect, useState } from 'react'
import {
  Avatar, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, IconButton, MenuItem, TextField, Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import InventoryIcon from '@mui/icons-material/Inventory'
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined'
import { toast } from 'react-toastify'

import { formatUSPhoneInput } from '@/utils/formatters'
import {
  fetchDefinitionPhoto,
  getDefinition,
  type DefinitionDetails,
  type PartDefinition,
} from '@/api/inventoryCapture'

/**
 * The details of a captured part, asked for exactly the way Add Part asks.
 *
 * Same sections in the same order, same labels, same required four, same
 * layout. Deliberately, not incidentally: someone who registers a part by hand
 * and someone who photographs it are describing the same object, and a second
 * form with its own vocabulary would produce a second, quietly different, idea
 * of what a part is.
 *
 * The one thing here that Add Part has no equivalent for is the name, which is
 * what recognition and the capture list show, so it is asked for first.
 *
 * What is typed lands on the definition, so it reaches every unit of that kind
 * at once -- the ten items photographed together are described once.
 */

type Props = {
  definition: PartDefinition | null
  onClose: () => void
  onSave: (changes: DefinitionDetails) => void
  saving: boolean
}

type FormState = {
  name: string
  part_number: string
  part_type: string
  description: string
  make: string
  model: string
  unit_price: number
  condition: string
  supplier_name: string
  supplier_contact: string
  supplier_email: string
  supplier_phone: string
  supplier_address: string
  vendor_name: string
  purchase_location: string
  shipping_method: string
  acquisition_date: string
  warehouse_arrival_date: string
  default_picture_url: string
}

const blank: FormState = {
  name: '', part_number: '', part_type: '', description: '', make: '', model: '',
  unit_price: 0, condition: 'new', supplier_name: '', supplier_contact: '',
  supplier_email: '', supplier_phone: '', supplier_address: '', vendor_name: '',
  purchase_location: '', shipping_method: '', acquisition_date: '',
  warehouse_arrival_date: '', default_picture_url: '',
}

const fromDefinition = (definition: PartDefinition): FormState => ({
  name: definition.name || '',
  part_number: definition.part_number || '',
  part_type: definition.part_type || '',
  description: definition.description || '',
  make: definition.make || '',
  model: definition.model || '',
  unit_price: Number(definition.unit_price || 0),
  // New until told otherwise, which is what the register form assumes too.
  condition: definition.condition || 'new',
  supplier_name: definition.supplier_name || '',
  supplier_contact: definition.supplier_contact || '',
  supplier_email: definition.supplier_email || '',
  supplier_phone: formatUSPhoneInput(definition.supplier_phone || ''),
  supplier_address: definition.supplier_address || '',
  vendor_name: definition.vendor_name || '',
  purchase_location: definition.purchase_location || '',
  shipping_method: definition.shipping_method || '',
  acquisition_date: definition.acquisition_date || '',
  warehouse_arrival_date: definition.warehouse_arrival_date || '',
  default_picture_url: definition.default_picture_url || '',
})

const PartDetailsDialog = ({ definition, onClose, onSave, saving }: Props) => {
  const [form, setForm] = useState<FormState>(blank)
  // The photograph this part was captured from. Shown when nobody has
  // chosen a picture, which is the usual case: somebody already
  // photographed the thing, and asking them for a second picture of it
  // is asking twice for the same answer.
  const [capturedPhoto, setCapturedPhoto] = useState("")
  // Whether the label reader is still working, and what it concluded.
  const [reading, setReading] = useState(false)
  const [identifiedFrom, setIdentifiedFrom] = useState<string | null>(null)

  // Reload whenever a different part is opened, so the dialog never shows a
  // half-typed draft of something else.
  useEffect(() => {
    setForm(definition ? fromDefinition(definition) : blank)
    setIdentifiedFrom(definition?.identified_from ?? null)
  }, [definition?.id])

  useEffect(() => {
    if (!definition?.id || !definition.has_reference_photo) {
      setCapturedPhoto("")
      return
    }
    let url = ""
    let dropped = false
    fetchDefinitionPhoto(definition.id)
      .then((next) => {
        // The dialog may have moved on while this was in flight.
        if (dropped) { URL.revokeObjectURL(next); return }
        url = next
        setCapturedPhoto(next)
      })
      // A missing photograph is not worth an error: the panel simply
      // shows that no image is selected, which is true.
      .catch(() => setCapturedPhoto(""))
    return () => {
      dropped = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [definition?.id, definition?.has_reference_photo])

  // Reading the label runs after the capture is saved, so the answer
  // usually lands a second or two after this form is already open. Rather
  // than make somebody close and reopen it, the form asks a few times and
  // fills in the blanks as they arrive.
  useEffect(() => {
    const id = definition?.id
    if (!id || definition?.identified_from) return
    let stopped = false
    let attempts = 0

    const poll = async () => {
      attempts += 1
      try {
        const fresh = await getDefinition(id)
        if (stopped) return
        if (fresh.identified_from) {
          setIdentifiedFrom(fresh.identified_from)
          // Only the blanks. Anything already on screen was either
          // typed by the person or read a moment ago, and a reader that
          // overwrote either would be doing the one thing it must not.
          setForm((prev) => {
            const merged = { ...prev }
            const incoming: Array<[keyof FormState, string | null]> = [
              ['name', fresh.name],
              ['part_number', fresh.part_number],
              ['make', fresh.make],
              ['model', fresh.model],
              ['description', fresh.description],
            ]
            for (const [field, value] of incoming) {
              const current = String(merged[field] ?? '').trim()
              const next = String(value ?? '').trim()
              const placeholder = field === 'name' && current === 'Unnamed part'
              if (next && (!current || placeholder)) {
                (merged as any)[field] = next
              }
            }
            return merged
          })
          setReading(false)
          return
        }
      } catch {
        // A failed poll is not worth telling anyone about: the form is
        // perfectly usable, it just has to be filled in by hand.
      }
      if (!stopped && attempts < 5) {
        timer = window.setTimeout(poll, 1500)
      } else {
        setReading(false)
      }
    }

    setReading(true)
    let timer = window.setTimeout(poll, 1200)
    return () => {
      stopped = true
      window.clearTimeout(timer)
      setReading(false)
    }
  }, [definition?.id, definition?.identified_from])

  const set = (changes: Partial<FormState>) => setForm((prev) => ({ ...prev, ...changes }))

  const handleImage = (file?: File) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => set({ default_picture_url: String(reader.result || '') })
    reader.readAsDataURL(file)
  }

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error('Give this part a name')
      return
    }
    // The same four the register form insists on, refused in the same words.
    if (!form.part_number || !form.part_type || !form.description || !form.condition) {
      toast.error('Part number, type, description, and condition are required')
      return
    }
    onSave({
      name: form.name.trim(),
      part_number: form.part_number,
      part_type: form.part_type,
      description: form.description,
      make: form.make,
      model: form.model,
      unit_price: Number(form.unit_price) || 0,
      condition: form.condition,
      supplier_name: form.supplier_name,
      supplier_contact: form.supplier_contact,
      supplier_email: form.supplier_email,
      supplier_phone: form.supplier_phone,
      supplier_address: form.supplier_address,
      vendor_name: form.vendor_name,
      purchase_location: form.purchase_location,
      shipping_method: form.shipping_method,
      // Empty is no date, not the epoch.
      acquisition_date: form.acquisition_date || null,
      warehouse_arrival_date: form.warehouse_arrival_date || null,
      default_picture_url: form.default_picture_url || null,
    })
  }

  const units = definition?.unit_count ?? 0
  const forAll = units === 1 ? 'this item' : `all ${units} items`
  const shownImage = form.default_picture_url || capturedPhoto
  const showingCapture = !form.default_picture_url && Boolean(capturedPhoto)

  return (
    <Dialog
      open={Boolean(definition)}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      scroll="paper"
      PaperProps={{
        sx: {
          borderRadius: { xs: 0, sm: '22px' },
          overflow: 'hidden',
          maxHeight: { xs: '100dvh', sm: 'calc(100dvh - 48px)' },
          backgroundColor: '#F8FAFC',
          boxShadow: '0 28px 80px rgba(30, 27, 75, 0.22)',
        },
      }}
    >
      <DialogTitle sx={{ p: { xs: 2, sm: 2.5 }, borderBottom: '1px solid #E5E7EB', bgcolor: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 900, color: '#1E1B4B', fontSize: { xs: 20, sm: 24 }, lineHeight: 1.2 }}>
            Part Details
          </Typography>
          <Typography sx={{ mt: 0.4, color: '#64748B', fontSize: 13, fontWeight: 600 }}>
            Product details, supplier information, acquisition history, and imagery. Saved once and carried by {forAll}.
          </Typography>
          {/* Where these details came from. A decoded barcode is the
              manufacturer's own answer; printed text is a reading of it,
              and is worth checking before it becomes stock. */}
          {reading && (
            <Box sx={{ mt: 0.9, display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={13} />
              <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: '#64748B' }}>
                Reading the label…
              </Typography>
            </Box>
          )}
          {!reading && identifiedFrom && (
            <Chip
              size="small"
              label={identifiedFrom === 'udi'
                ? 'Identified from the barcode — confirmed against the UDI database'
                : 'Read off the label — please check these'}
              sx={{
                mt: 0.9, fontWeight: 800, fontSize: 11.5, maxWidth: '100%',
                bgcolor: identifiedFrom === 'udi' ? '#DCFCE7' : '#FEF3C7',
                color: identifiedFrom === 'udi' ? '#15803D' : '#92400E',
              }}
            />
          )}
        </Box>
        <IconButton aria-label="Close part details dialog" onClick={onClose} sx={{ flexShrink: 0, width: 42, height: 42, color: '#4F46E5', bgcolor: '#EEF2FF', '&:hover': { bgcolor: '#E0E7FF' } }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ p: { xs: 1.5, sm: 2.5 }, bgcolor: '#F8FAFC' }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 260px' }, gap: 2, alignItems: 'start', '& .MuiInputBase-root:not(.MuiInputBase-multiline)': { minHeight: 44 }, '& .MuiOutlinedInput-input:not(textarea)': { py: 1.25 } }}>
          <Box sx={{ display: 'grid', gap: 2, minWidth: 0 }}>
            <Box sx={{ p: { xs: 1.5, sm: 2 }, border: '1px solid #E5E7EB', borderRadius: '16px', bgcolor: '#FFFFFF' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.75 }}>
                <Avatar sx={{ width: 34, height: 34, bgcolor: '#EEF2FF', color: '#4F46E5' }}><InventoryIcon fontSize="small" /></Avatar>
                <Box>
                  <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>Part Information</Typography>
                  <Typography sx={{ color: '#64748B', fontSize: 12 }}>Core product identity, classification, condition, and pricing.</Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1.25 }}>
              <TextField label="Part Name *" placeholder="What this part is called" value={form.name} onChange={(e) => set({ name: e.target.value })} />
              <TextField label="Part Number *" placeholder="Part number" value={form.part_number} onChange={(e) => set({ part_number: e.target.value })} />
              <TextField select label="Part Type *" value={form.part_type} onChange={(e) => set({ part_type: e.target.value })}>
                <MenuItem value="">Select part type</MenuItem>
                <MenuItem value="sales">Sales</MenuItem>
                <MenuItem value="rental">Rental</MenuItem>
              </TextField>
              <TextField label="Part Description *" placeholder="Part description" value={form.description} onChange={(e) => set({ description: e.target.value })} sx={{ gridColumn: { sm: '1 / -1', md: 'auto' } }} />
              <TextField label="Make" placeholder="Make" value={form.make} onChange={(e) => set({ make: e.target.value })} />
              <TextField label="Model" placeholder="Model" value={form.model} onChange={(e) => set({ model: e.target.value })} />
              <TextField type="number" label="Amount" placeholder="Amount" value={form.unit_price} onChange={(e) => set({ unit_price: Number(e.target.value) })} />
              <TextField select label="Part Condition *" value={form.condition} onChange={(e) => set({ condition: e.target.value })}>
                <MenuItem value="">Select Condition</MenuItem>
                <MenuItem value="new">New</MenuItem>
                <MenuItem value="refurbished">Refurbished</MenuItem>
                <MenuItem value="used">Used</MenuItem>
                <MenuItem value="damaged">Damaged</MenuItem>
              </TextField>
              </Box>
            </Box>

            <Box sx={{ p: { xs: 1.5, sm: 2 }, border: '1px solid #E5E7EB', borderRadius: '16px', bgcolor: '#FFFFFF' }}>
              <Typography sx={{ fontWeight: 900, color: '#1E1B4B', mb: 0.35 }}>Supplier &amp; Contact</Typography>
              <Typography sx={{ color: '#64748B', fontSize: 12, mb: 1.75 }}>Company and primary sales contact for this part.</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25 }}>
              <TextField label="Company" placeholder="Company Name" value={form.supplier_name} onChange={(e) => set({ supplier_name: e.target.value })} />
              <TextField label="Sales Person Name" placeholder="Contact Name" value={form.supplier_contact} onChange={(e) => set({ supplier_contact: e.target.value })} />
              <TextField label="Phone" placeholder="Phone number" value={form.supplier_phone} onChange={(e) => set({ supplier_phone: formatUSPhoneInput(e.target.value) })} />
              <TextField label="Email" placeholder="Email" value={form.supplier_email} onChange={(e) => set({ supplier_email: e.target.value })} />
              <TextField label="Address" placeholder="Address" value={form.supplier_address} onChange={(e) => set({ supplier_address: e.target.value })} sx={{ gridColumn: '1 / -1' }} />
              </Box>
            </Box>

            <Box sx={{ p: { xs: 1.5, sm: 2 }, border: '1px solid #E5E7EB', borderRadius: '16px', bgcolor: '#FFFFFF' }}>
              <Typography sx={{ fontWeight: 900, color: '#1E1B4B', mb: 0.35 }}>Acquired From <Box component="span" sx={{ color: '#94A3B8', fontWeight: 700 }}>(Optional)</Box></Typography>
              <Typography sx={{ color: '#64748B', fontSize: 12, mb: 1.75 }}>Purchase source, shipment method, and receiving dates.</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1.25 }}>
              <TextField label="Vendor Name" placeholder="Vendor Name" value={form.vendor_name} onChange={(e) => set({ vendor_name: e.target.value })} />
              <TextField label="Purchase Location" placeholder="Purchase Location" value={form.purchase_location} onChange={(e) => set({ purchase_location: e.target.value })} />
              <TextField label="Shipping Method" placeholder="Shipping Method" value={form.shipping_method} onChange={(e) => set({ shipping_method: e.target.value })} />
              <TextField type="date" label="Purchase Date" InputLabelProps={{ shrink: true }} value={form.acquisition_date} onChange={(e) => set({ acquisition_date: e.target.value })} />
              <TextField type="date" label="Warehouse Arrival Date" InputLabelProps={{ shrink: true }} value={form.warehouse_arrival_date} onChange={(e) => set({ warehouse_arrival_date: e.target.value })} />
              </Box>
            </Box>
          </Box>

          <Box sx={{ p: 1.5, border: '1px solid #E5E7EB', borderRadius: '16px', bgcolor: '#FFFFFF', position: { lg: 'sticky' }, top: { lg: 0 } }}>
            <Typography sx={{ fontWeight: 900, color: '#1E1B4B', mb: 1 }}>Part Image</Typography>
            <Box sx={{ height: { xs: 220, lg: 250 }, borderRadius: '12px', border: '1px dashed #C7D2FE', backgroundColor: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {shownImage ? (
                <Box component="img" src={shownImage} alt="Part preview" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <Box sx={{ textAlign: 'center', color: '#94A3B8' }}>
                  <ImageOutlinedIcon sx={{ fontSize: 54 }} />
                  <Typography sx={{ mt: 0.5, fontSize: 12, fontWeight: 700 }}>No image selected</Typography>
                </Box>
              )}
            </Box>
            <Button fullWidth component="label" variant="outlined" startIcon={<ImageOutlinedIcon />} sx={{ mt: 1.25, minHeight: 42, borderRadius: '10px', textTransform: 'none', fontWeight: 800, color: '#4F46E5', borderColor: '#C7D2FE' }}>
              {shownImage ? 'Replace Image' : 'Choose Image'}
              <input hidden type="file" accept="image/*" onChange={(e) => handleImage(e.target.files?.[0])} />
            </Button>
            <Typography sx={{ mt: 1, color: '#94A3B8', fontSize: 11, textAlign: 'center' }}>
              {showingCapture
                ? 'The photograph taken when this part was captured. Replace it with a clearer product photo if you have one.'
                : 'Use a clear product photo for Sales and Rental lists.'}
            </Typography>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: { xs: 2, md: 3 }, py: 1.75, justifyContent: 'flex-end', gap: 1, borderTop: '1px solid #E5E7EB', bgcolor: '#FFFFFF' }}>
        <Button onClick={onClose} sx={{ color: '#64748B', fontWeight: 800, borderRadius: '10px' }}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving} sx={{ minHeight: 42, background: 'linear-gradient(135deg, #4F46E5 0%, #9333EA 100%)', borderRadius: '10px', px: 3, fontWeight: 900 }}>
          {saving ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : `Save for ${forAll}`}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default PartDetailsDialog
