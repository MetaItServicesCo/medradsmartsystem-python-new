import { useState } from 'react'
import {
  Box,
  Chip,
  Collapse,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline'
import EditNoteIcon from '@mui/icons-material/EditNote'
import SendIcon from '@mui/icons-material/Send'
import AutorenewIcon from '@mui/icons-material/Autorenew'
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'

import type { SalesHistoryItem } from '@/api/sales'

interface QuotationHistoryTimelineProps {
  history: SalesHistoryItem[]
}

const money = (value: number | string | null | undefined) => `$${Number(value || 0).toFixed(2)}`

const fmtDateTime = (iso?: string | null) => (iso
  ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  : '—')

const ACTION_META: Record<string, { label: string; icon: JSX.Element; color: string; bg: string }> = {
  created: { label: 'Created', icon: <AddCircleOutlineIcon fontSize="small" />, color: '#15803D', bg: '#DCFCE7' },
  updated: { label: 'Updated', icon: <EditNoteIcon fontSize="small" />, color: '#1D4ED8', bg: '#DBEAFE' },
  sent: { label: 'Sent', icon: <SendIcon fontSize="small" />, color: '#6D28D9', bg: '#EDE9FE' },
  revision_created: { label: 'Revision created', icon: <AutorenewIcon fontSize="small" />, color: '#B45309', bg: '#FEF3C7' },
}

const FIELD_LABELS: Record<string, string> = {
  notes: 'Notes',
  discount_amount: 'Discount',
  customer_email: 'Customer email',
  customer_name: 'Customer name',
  customer_phone: 'Phone',
  customer_address: 'Address',
  quotation_type: 'Quotation type',
  requested_date: 'Requested date',
  expires_at: 'Expiry',
  facility_id: 'Facility',
  work_order: 'Work order',
  status: 'Status',
}

const kindLabel = (kind?: string) => (
  kind === 'refund' ? 'Refund' : kind === 'trade_in' ? 'Trade-In' : 'Product'
)

// Renders the frozen prior-version snapshot captured when a revision was created.
const PreviousVersionSnapshot = ({ snapshot }: { snapshot: any }) => {
  const lines: any[] = Array.isArray(snapshot?.line_items) ? snapshot.line_items : []
  const pricing = snapshot?.pricing || {}
  return (
    <Box sx={{ mt: 1.2, p: 1.6, borderRadius: '12px', bgcolor: '#FFFDF7', border: '1px solid #FDE68A' }}>
      <Typography sx={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.5, color: '#B45309', mb: 1 }}>
        Revision {snapshot?.revision ?? '—'} snapshot
      </Typography>
      {lines.length > 0 && (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 520, '& td, & th': { borderColor: '#FDE68A', py: 0.7 } }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 800, fontSize: 11, color: '#92400E' }}>Item</TableCell>
                <TableCell sx={{ fontWeight: 800, fontSize: 11, color: '#92400E' }}>Description</TableCell>
                <TableCell align="right" sx={{ fontWeight: 800, fontSize: 11, color: '#92400E' }}>Qty</TableCell>
                <TableCell align="right" sx={{ fontWeight: 800, fontSize: 11, color: '#92400E' }}>Unit</TableCell>
                <TableCell align="right" sx={{ fontWeight: 800, fontSize: 11, color: '#92400E' }}>Total</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {lines.map((line, index) => (
                <TableRow key={line.line_item_id ?? index}>
                  <TableCell sx={{ fontSize: 12.5, fontWeight: 700 }}>
                    {line.part_number || kindLabel(line.item_kind)}
                  </TableCell>
                  <TableCell sx={{ fontSize: 12.5, color: '#475569' }}>{line.description || '—'}</TableCell>
                  <TableCell align="right" sx={{ fontSize: 12.5 }}>{line.quantity}</TableCell>
                  <TableCell align="right" sx={{ fontSize: 12.5 }}>{money(line.unit_price)}</TableCell>
                  <TableCell align="right" sx={{ fontSize: 12.5, fontWeight: 800 }}>{money(line.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
        <Chip size="small" variant="outlined" label={`Subtotal ${money(pricing.subtotal)}`} sx={{ fontWeight: 700 }} />
        <Chip size="small" variant="outlined" label={`Tax ${money(pricing.tax_amount)}`} sx={{ fontWeight: 700 }} />
        {Number(pricing.discount_amount || 0) > 0 && (
          <Chip size="small" variant="outlined" label={`Discount ${money(pricing.discount_amount)}`} sx={{ fontWeight: 700 }} />
        )}
        <Chip size="small" label={`Total ${money(pricing.total_amount)}`} sx={{ fontWeight: 900, bgcolor: '#FEF3C7', color: '#92400E' }} />
      </Box>
    </Box>
  )
}

// Human-readable one-line summary for a single history entry.
const entrySummary = (entry: SalesHistoryItem) => {
  const details = entry.details || {}
  if (entry.action === 'sent') {
    const recipients: any[] = Array.isArray(details.recipients) ? details.recipients : []
    const names = recipients.map(item => item?.name).filter(Boolean)
    if (names.length) return `Secure link emailed to ${names.join(', ')}`
    return 'Secure link emailed to the customer'
  }
  if (entry.action === 'revision_created') {
    return `Revised from Rev ${details.previous_revision ?? '?'} to Rev ${details.revision ?? '?'}`
  }
  if (entry.action === 'updated') {
    const fields = Object.keys(details).map(key => FIELD_LABELS[key] || key.replace(/_/g, ' '))
    if (fields.length) return `Changed: ${fields.join(', ')}`
    return 'Details updated'
  }
  if (entry.action === 'created') return 'Quotation created'
  return entry.action.replace(/_/g, ' ')
}

const QuotationHistoryTimeline = ({ history }: QuotationHistoryTimelineProps) => {
  // Newest first; the stored trail is appended chronologically.
  const entries = [...(history || [])].reverse()
  const [expanded, setExpanded] = useState<number | null>(null)

  if (entries.length === 0) return null

  return (
    <Box>
      {entries.map((entry, index) => {
        const meta = ACTION_META[entry.action] ?? {
          label: entry.action.replace(/_/g, ' '),
          icon: <FiberManualRecordIcon fontSize="small" />,
          color: '#475569',
          bg: '#F1F5F9',
        }
        const revision = entry.details?.revision
        const isLast = index === entries.length - 1
        const snapshot = entry.action === 'revision_created' ? entry.details?.previous_revision_snapshot : null
        const isOpen = expanded === index
        return (
          <Box key={index} sx={{ display: 'flex', gap: 1.5, pb: isLast ? 0 : 2.4, position: 'relative' }}>
            {!isLast && (
              <Box sx={{ position: 'absolute', left: 15, top: 34, bottom: 0, width: 2, bgcolor: '#EEF0F6' }} />
            )}
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                bgcolor: meta.bg,
                color: meta.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                zIndex: 1,
              }}
            >
              {meta.icon}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0, pt: 0.2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, flexWrap: 'wrap' }}>
                <Typography sx={{ fontWeight: 900, color: '#1E1B4B', fontSize: 14 }}>{meta.label}</Typography>
                {revision != null && (
                  <Chip size="small" label={`Rev ${revision}`} sx={{ height: 20, fontWeight: 800, bgcolor: '#EDE9FE', color: '#6D28D9' }} />
                )}
                {entry.action === 'revision_created' && entry.details?.previous_links_invalidated && (
                  <Chip size="small" variant="outlined" color="warning" label="Old link invalidated" sx={{ height: 20, fontWeight: 800 }} />
                )}
              </Box>
              <Typography sx={{ color: '#475569', fontSize: 13, mt: 0.2 }}>{entrySummary(entry)}</Typography>
              <Typography sx={{ color: '#94A3B8', fontSize: 12, fontWeight: 700, mt: 0.2 }}>
                {entry.by || 'System'} · {fmtDateTime(entry.at)}
              </Typography>
              {snapshot && (
                <>
                  <Box
                    role="button"
                    tabIndex={0}
                    onClick={() => setExpanded(isOpen ? null : index)}
                    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') setExpanded(isOpen ? null : index) }}
                    sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.3, mt: 0.6, cursor: 'pointer', color: '#7C3AED', fontWeight: 800, fontSize: 12.5, userSelect: 'none' }}
                  >
                    {isOpen ? 'Hide previous version' : 'View previous version'}
                    <ExpandMoreIcon fontSize="small" sx={{ transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'none' }} />
                  </Box>
                  <Collapse in={isOpen} unmountOnExit>
                    <PreviousVersionSnapshot snapshot={snapshot} />
                  </Collapse>
                </>
              )}
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}

export default QuotationHistoryTimeline
