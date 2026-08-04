import type { ReactNode } from 'react'
import {
  Box,
  Card,
  Chip,
  Typography,
} from '@mui/material'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'

export const customerDocumentColors = {
  primary: '#1E3A8A',
  accent: '#2563EB',
  purple: '#7C3AED',
  pink: '#EC4899',
  text: '#1E1B4B',
  muted: '#64748B',
  border: '#E2E8F0',
  canvas: '#F5F3FF',
}

export const customerConsentLabelSx = {
  m: 0,
  alignItems: 'flex-start',
  '& .MuiCheckbox-root': {
    p: 0.25,
    mr: 1.25,
  },
  '& .MuiFormControlLabel-label': {
    lineHeight: 1.5,
  },
}

export const customerPortalSx = {
  height: '100dvh',
  overflowY: 'auto',
  overflowX: 'hidden',
  overscrollBehavior: 'contain',
  scrollBehavior: 'smooth',
  scrollbarGutter: 'stable',
  WebkitOverflowScrolling: 'touch',
  bgcolor: customerDocumentColors.canvas,
  py: { xs: 2, md: 5 },
  px: 2,
  '&::-webkit-scrollbar': { width: 10 },
  '&::-webkit-scrollbar-track': { bgcolor: '#EEEAFE' },
  '&::-webkit-scrollbar-thumb': {
    bgcolor: '#B9A8F5',
    borderRadius: 999,
    border: '2px solid #EEEAFE',
  },
  '&::-webkit-scrollbar-thumb:hover': { bgcolor: '#8B6FE8' },
}

export const customerDocumentCardSx = {
  width: 'min(980px, 100%)',
  mx: 'auto',
  p: { xs: 2, md: 4 },
  borderRadius: '24px',
  boxShadow: '0 24px 70px rgba(30,58,138,0.14)',
  '@media print': { width: '100%', p: 2, borderRadius: 0, boxShadow: 'none' },
}

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  accepted: { bg: '#DCFCE7', color: '#15803D' },
  active: { bg: '#DBEAFE', color: '#1D4ED8' },
  completed: { bg: '#DCFCE7', color: '#15803D' },
  paid: { bg: '#DCFCE7', color: '#15803D' },
  sent: { bg: '#EDE9FE', color: '#6D28D9' },
  viewed: { bg: '#DBEAFE', color: '#1D4ED8' },
  changes_requested: { bg: '#FEF3C7', color: '#B45309' },
  declined: { bg: '#FEE2E2', color: '#B91C1C' },
  cancelled: { bg: '#FEE2E2', color: '#B91C1C' },
  overdue: { bg: '#FEE2E2', color: '#B91C1C' },
  pending: { bg: '#F1F5F9', color: '#475569' },
}

export const customerDocumentStatusStyle = (status: string) => (
  STATUS_STYLES[status.toLowerCase()] || STATUS_STYLES.pending
)

interface CustomerDocumentHeaderProps {
  label: string
  number: string
  companyName: string
  meta?: string | null
  status: string
  actions?: ReactNode
}

export const CustomerDocumentHeader = ({
  label,
  number,
  companyName,
  meta,
  status,
  actions,
}: CustomerDocumentHeaderProps) => {
  const statusStyle = customerDocumentStatusStyle(status)
  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box component="img" src="/mr-biomed-logo.jpeg" alt="Mr. BioMed Tech Services" sx={{ width: 90, height: 58, objectFit: 'contain' }} />
          <Box>
            <Typography sx={{ color: customerDocumentColors.accent, fontWeight: 900, fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase' }}>{label}</Typography>
            <Typography variant="h4" sx={{ fontWeight: 950, color: customerDocumentColors.primary, letterSpacing: '-0.5px', lineHeight: 1.08 }}>{number}</Typography>
            <Typography sx={{ color: '#6B7280', fontWeight: 700 }}>{companyName}{meta ? ` · ${meta}` : ''}</Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Chip label={status.replace(/_/g, ' ')} sx={{ fontWeight: 900, textTransform: 'uppercase', bgcolor: statusStyle.bg, color: statusStyle.color }} />
          {actions}
        </Box>
      </Box>
      <Box sx={{ height: 4, borderRadius: 999, my: 3, background: 'linear-gradient(90deg, #2563EB 0%, #7C3AED 60%, #EC4899 100%)' }} />
    </>
  )
}

interface WorkflowStep {
  label: string
  complete: boolean
}

export const CustomerDocumentProgress = ({ steps }: { steps: WorkflowStep[] }) => (
  <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`, mb: 3, border: '1px solid #DDD6FE', borderRadius: '14px', overflow: 'hidden' }}>
    {steps.map((step, index) => (
      <Box key={`${index}-${step.label}`} sx={{ px: { xs: 1, md: 2 }, py: 1.5, textAlign: 'center', bgcolor: step.complete ? '#F0FDF4' : '#FAF9FF', borderLeft: index ? '1px solid #DDD6FE' : 0 }}>
        <Typography sx={{ fontWeight: 950, color: step.complete ? '#15803D' : customerDocumentColors.purple, fontSize: { xs: 12, md: 14 } }}>
          {step.complete ? '✓' : index + 1} {step.label}
        </Typography>
      </Box>
    ))}
  </Box>
)

interface CustomerRecipientCardProps {
  name: string
  email?: string | null
  organization?: string | null
  address?: string | null
}

export const CustomerRecipientCard = ({ name, email, organization, address }: CustomerRecipientCardProps) => (
  <Box sx={{ p: 2.2, borderRadius: '16px', bgcolor: '#EFF6FF', border: '1px solid #BFDBFE' }}>
    <Typography sx={{ color: customerDocumentColors.accent, fontWeight: 900, fontSize: 11, textTransform: 'uppercase', letterSpacing: '1px' }}>Prepared for</Typography>
    <Typography sx={{ color: customerDocumentColors.primary, fontWeight: 900, fontSize: 20, mt: 0.4 }}>{name}</Typography>
    {email && <Typography sx={{ color: '#4B5563' }}>{email}</Typography>}
    {organization && organization !== name && <Typography sx={{ color: '#4B5563' }}>{organization}</Typography>}
    {address && <Typography sx={{ color: '#4B5563' }}>{address}</Typography>}
  </Box>
)

export const CustomerDetailsCard = ({ rows }: { rows: Array<{ label: string; value: ReactNode }> }) => (
  <Box sx={{ p: 2.2, borderRadius: '16px', bgcolor: '#F8FAFC', border: '1px solid #E2E8F0', display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 2, rowGap: 0.8, alignContent: 'start' }}>
    {rows.map((row, index) => (
      <Box key={`${row.label}-${index}`} sx={{ display: 'contents' }}>
        <Typography sx={{ fontWeight: 900, color: '#64748B' }}>{row.label}</Typography>
        <Typography component="div" sx={{ textAlign: 'right', color: '#1E1B4B' }}>{row.value}</Typography>
      </Box>
    ))}
  </Box>
)

export const CustomerSignaturePreview = ({ name }: { name: string }) => (
  <Box role="img" aria-label={name.trim() ? `Electronic signature: ${name.trim()}` : 'Electronic signature preview'} sx={{ minHeight: 112, mb: 2, px: { xs: 2, md: 3 }, py: 2, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', borderRadius: '14px', bgcolor: '#FFFFFF', border: '1px solid #E5E7EB' }}>
    <Typography sx={{ color: '#8B95A7', fontWeight: 800, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 }}>Electronic signature preview</Typography>
    <Typography sx={{ minHeight: 54, display: 'flex', alignItems: 'center', color: name.trim() ? customerDocumentColors.text : '#A1A1AA', fontFamily: '"Segoe Script", "Bradley Hand", "Brush Script MT", cursive', fontSize: { xs: 30, md: 40 }, fontWeight: 500, fontStyle: 'italic', lineHeight: 1.25, overflowWrap: 'anywhere' }}>
      {name.trim() || 'Your signature will appear here'}
    </Typography>
    <Box sx={{ borderBottom: '1px solid #9CA3AF' }} />
  </Box>
)

interface CustomerSignatureRecordProps {
  context: string
  acceptedBy: string
  acceptedAt: string
  signature: string
  detail?: string | null
}

export const CustomerSignatureRecord = ({ context, acceptedBy, acceptedAt, signature, detail }: CustomerSignatureRecordProps) => (
  <Card variant="outlined" sx={{ mb: 3, p: 2.2, borderRadius: '16px', borderColor: '#A7F3D0', bgcolor: '#ECFDF5' }}>
    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
      <CheckCircleOutlineIcon sx={{ color: '#10B981' }} />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>{context} signed by {acceptedBy}</Typography>
        <Typography sx={{ fontSize: 13, color: '#475569' }}>Accepted {acceptedAt}{detail ? ` · ${detail}` : ''}</Typography>
        <Typography sx={{ mt: 0.5, fontFamily: '"Segoe Script", "Bradley Hand", "Brush Script MT", cursive', fontSize: { xs: 25, md: 30 }, color: '#1E1B4B', fontStyle: 'italic', overflowWrap: 'anywhere' }}>{signature}</Typography>
      </Box>
    </Box>
  </Card>
)
