import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Dialog, DialogContent, Box, Typography, IconButton,
  Grid, Chip, Divider, Button, Skeleton
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import BusinessIcon from '@mui/icons-material/Business'
import LocationOnIcon from '@mui/icons-material/LocationOn'
import PhoneIcon from '@mui/icons-material/Phone'
import EmailIcon from '@mui/icons-material/Email'
import AccessTimeIcon from '@mui/icons-material/AccessTime'
import PublicIcon from '@mui/icons-material/Public'
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile'
import PaymentsIcon from '@mui/icons-material/Payments'
import SettingsIcon from '@mui/icons-material/Settings'
import PersonIcon from '@mui/icons-material/Person'
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined'
import { type Facility, fetchFacilityDocuments, exportFacilityPdf, fetchFacility } from '@/api/facilities'
import { facilityTimezoneLabel, formatUSPhone } from '@/utils/formatters'

interface Props {
  open: boolean
  onClose: () => void
  facility: Facility | null
  onManageUsers?: (facility: Facility) => void
}

const FacilityViewModal = ({ open, onClose, facility, onManageUsers }: Props) => {
  if (!facility) return null

  // Fetch documents
  const { data: docsData, isLoading: docsLoading } = useQuery({
    queryKey: ['facilityDocuments', facility.id],
    queryFn: () => fetchFacilityDocuments(facility.id),
    enabled: open && facility.id !== 0,
  })

  // Fetch parent name if needed
  const { data: parentFacility } = useQuery({
    queryKey: ['facility', facility.parent_facility_id],
    queryFn: () => fetchFacility(facility.parent_facility_id!),
    enabled: open && !!facility.parent_facility_id,
  })

  const handleExportPDF = () => {
    exportFacilityPdf(facility.id)
  }

  const InfoItem = ({ icon, label, value }: { icon: React.ReactNode, label: string, value: React.ReactNode }) => (
    <Grid item xs={12} sm={6}>
      <Box sx={{
        display: 'flex', alignItems: 'flex-start', gap: 1.5,
        p: 1.5, borderRadius: '12px', backgroundColor: '#FAFAFA',
        transition: 'all 0.15s', '&:hover': { backgroundColor: '#F5F3FF' },
        height: '100%',
      }}>
        <Box sx={{
          width: 32, height: 32, borderRadius: '8px',
          background: 'linear-gradient(135deg, #7C3AED20, #6D28D920)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, '& svg': { fontSize: '1rem', color: '#7C3AED' },
        }}>
          {icon}
        </Box>
        <Box sx={{ wordBreak: 'break-word' }}>
          <Typography variant="caption" sx={{ color: '#9CA3AF', fontWeight: 600, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {label}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#1E1B4B', fontSize: '0.85rem' }}>
            {value || '—'}
          </Typography>
        </Box>
      </Box>
    </Grid>
  )

  const documents = docsData?.items || []

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth
      PaperProps={{ sx: { borderRadius: '24px', overflow: 'hidden' } }}
    >
      <Box sx={{
        background: 'linear-gradient(135deg, #7C3AED 0%, #5B21B6 100%)',
        px: 3.5, py: 3, display: 'flex', alignItems: 'center', gap: 2,
        position: 'relative', overflow: 'hidden',
      }}>
        <Box sx={{ position: 'absolute', right: -20, top: -20, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
        <Box sx={{
          width: 48, height: 48, borderRadius: '14px',
          background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid rgba(255,255,255,0.2)',
        }}>
          <BusinessIcon sx={{ color: '#fff', fontSize: '1.5rem' }} />
        </Box>
        <Box sx={{ flex: 1, zIndex: 1 }}>
          <Typography variant="h6" sx={{ color: '#fff', fontWeight: 700, lineHeight: 1.2 }}>
            {facility.name}
          </Typography>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.75)' }}>
            Facility ID: #{facility.id}
          </Typography>
        </Box>
        <Button size="small" variant="contained" startIcon={<PictureAsPdfIcon />} onClick={handleExportPDF}
          sx={{ zIndex: 1, backgroundColor: 'rgba(255,255,255,0.15)', color: '#fff', '&:hover': { backgroundColor: 'rgba(255,255,255,0.25)' }, border: '1px solid rgba(255,255,255,0.3)', borderRadius: '10px' }}>
          Export PDF
        </Button>
        {onManageUsers && (
          <Button size="small" variant="contained" startIcon={<PeopleOutlinedIcon />} onClick={() => onManageUsers(facility)}
            sx={{ zIndex: 1, backgroundColor: 'rgba(255,255,255,0.15)', color: '#fff', '&:hover': { backgroundColor: 'rgba(255,255,255,0.25)' }, border: '1px solid rgba(255,255,255,0.3)', borderRadius: '10px' }}>
            Facility Managers
          </Button>
        )}
        <IconButton onClick={onClose} sx={{ color: '#fff', zIndex: 1, '&:hover': { background: 'rgba(255,255,255,0.12)' } }}>
          <CloseIcon />
        </IconButton>
      </Box>

      <DialogContent sx={{ p: 3.5 }}>
        <Box sx={{ mb: 2.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Chip label={facility.status || 'Active'} size="small"
            sx={{ backgroundColor: facility.status === 'inactive' ? '#FEF2F2' : '#F0FDF4', color: facility.status === 'inactive' ? '#991B1B' : '#10B981', fontWeight: 600, fontSize: '0.75rem', textTransform: 'capitalize' }}
          />
          <Chip label={facility.tier_id ? `Tier #${facility.tier_id}` : 'No Tier Assigned'} size="small"
            sx={{ backgroundColor: facility.tier_id ? '#F5F3FF' : '#F3F4F6', color: facility.tier_id ? '#7C3AED' : '#9CA3AF', fontWeight: 600, fontSize: '0.75rem' }}
          />
          <Chip label={`Created ${new Date(facility.created_at).toLocaleDateString()}`} size="small"
            sx={{ backgroundColor: '#F3F4F6', color: '#4B5563', fontWeight: 600, fontSize: '0.7rem' }}
          />
        </Box>

        <Divider sx={{ mb: 3, borderColor: 'rgba(124,58,237,0.08)' }} />

        {/* General Info */}
        <Typography variant="overline" sx={{ color: '#7C3AED', fontWeight: 700, letterSpacing: '0.08em', mb: 2, display: 'block' }}>General Information</Typography>
        <Grid container spacing={2} sx={{ mb: 4 }}>
          <InfoItem icon={<LocationOnIcon />} label="Address" value={`${facility.address} ${facility.suite ? `Ste ${facility.suite}` : ''}`} />
          <InfoItem icon={<LocationOnIcon />} label="City / State" value={`${facility.city}, ${facility.state}`} />
          <InfoItem icon={<PublicIcon />} label="Country" value={`${facility.country} · ${facility.zip_code}`} />
          <InfoItem icon={<PhoneIcon />} label="Phone" value={formatUSPhone(facility.phone)} />
          <InfoItem icon={<EmailIcon />} label="Email" value={facility.email} />
          <InfoItem icon={<PublicIcon />} label="Website" value={facility.website} />
          <InfoItem icon={<PersonIcon />} label="Contact Person" value={facility.contact_person} />
          <InfoItem icon={<AccessTimeIcon />} label="Timezone / Hours" value={`${facilityTimezoneLabel(facility.timezone)} · ${facility.operating_hours || 'N/A'}`} />
        </Grid>

        {/* Details & Parent */}
        <Typography variant="overline" sx={{ color: '#7C3AED', fontWeight: 700, letterSpacing: '0.08em', mb: 2, display: 'block' }}>Facility Lineage</Typography>
        <Grid container spacing={2} sx={{ mb: 4 }}>
          <InfoItem icon={<BusinessIcon />} label="Parent Facility" value={parentFacility ? parentFacility.name : (facility.parent_facility_id ? `ID #${facility.parent_facility_id}` : 'None')} />
        </Grid>

        {/* Billing */}
        <Typography variant="overline" sx={{ color: '#7C3AED', fontWeight: 700, letterSpacing: '0.08em', mb: 2, display: 'block' }}>Billing Information</Typography>
        <Grid container spacing={2} sx={{ mb: 4 }}>
          <InfoItem icon={<PersonIcon />} label="Billing Name" value={facility.billing_name} />
          <InfoItem icon={<EmailIcon />} label="Billing Email" value={facility.billing_email} />
          <InfoItem icon={<LocationOnIcon />} label="Billing Address" value={
            facility.billing_street 
              ? `${facility.billing_street} ${facility.billing_suite ? `Ste ${facility.billing_suite}` : ''}, ${facility.billing_city}, ${facility.billing_state} ${facility.billing_zip_code}`
              : 'Same as facility address'
          } />
        </Grid>

        {/* Settings */}
        <Typography variant="overline" sx={{ color: '#7C3AED', fontWeight: 700, letterSpacing: '0.08em', mb: 2, display: 'block' }}>Other Settings</Typography>
        <Grid container spacing={2} sx={{ mb: 4 }}>
          <InfoItem icon={<PaymentsIcon />} label="Payment Method" value={facility.payment_method} />
          <InfoItem icon={<PaymentsIcon />} label="Installment Type" value={facility.installment_type} />
          <InfoItem icon={<PaymentsIcon />} label="Tax Exemption" value={facility.tax_exemption ? 'Yes' : 'No'} />
          <InfoItem icon={<SettingsIcon />} label="Inheritance" value={facility.inheritance} />
          <InfoItem icon={<EmailIcon />} label="Delivery Email" value={facility.delivery_email} />
        </Grid>

        {/* Documents */}
        <Typography variant="overline" sx={{ color: '#7C3AED', fontWeight: 700, letterSpacing: '0.08em', mb: 2, display: 'block' }}>Attached Documents</Typography>
        {docsLoading ? (
          <Skeleton variant="rounded" height={60} sx={{ borderRadius: '12px' }} />
        ) : documents.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 3, backgroundColor: '#FAFAFA', borderRadius: '12px', border: '1px dashed #E5E7EB' }}>
            <Typography variant="body2" sx={{ color: '#9CA3AF' }}>No documents attached.</Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {documents.map(doc => (
              <Box key={doc.id} sx={{
                display: 'flex', alignItems: 'center', gap: 2, p: 2,
                borderRadius: '12px', border: '1px solid #E5E7EB',
                backgroundColor: '#fff',
              }}>
                <InsertDriveFileIcon sx={{ color: '#7C3AED' }} />
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: '#1E1B4B' }}>{doc.filename}</Typography>
                  <Typography variant="caption" sx={{ color: '#6B7280' }}>
                    {new Date(doc.uploaded_at).toLocaleDateString()} · {Math.round((doc.file_size || 0) / 1024)} KB
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default FacilityViewModal
