/**
 * Putting a bulk invoice together: a full-screen workspace.
 *
 * Left, the open invoices of every facility, found by facility or invoice
 * number. Each invoice -- or a whole facility -- is dragged into the box on the
 * right, or added with +. One that cannot go in is shown, locked, with why.
 * The box groups what is in it by facility, with subtotals and the total, and
 * says who it is for. Saving creates the bulk invoice (or saves the changes).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  Alert, Box, Button, Chip, CircularProgress, Collapse, Dialog, IconButton, InputAdornment, TextField, Tooltip, Typography,
} from '@mui/material'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import DragIndicatorRoundedIcon from '@mui/icons-material/DragIndicatorRounded'
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import MoveToInboxRoundedIcon from '@mui/icons-material/MoveToInboxRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import { toast } from 'react-toastify'
import {
  createBulkInvoice,
  fetchBulkCandidates,
  updateBulkInvoice,
  type BulkBillTo,
  type BulkCandidate,
  type BulkCandidateGroup,
  type BulkInvoiceDetail,
  type BulkInvoiceLine,
} from '@/api/bulkInvoices'
import { facilityAddressLines } from '@/utils/facilityAddress'

const TYPE_COLOR: Record<string, string> = {
  service: '#7C3AED',
  inspection: '#2563EB',
  sales: '#059669',
  rental: '#D97706',
}
const GRADIENT = 'linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)'

const money = (value: string | number | null | undefined) =>
  `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const shortDate = (value?: string | null) => {
  if (!value) return '-'
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  const parsed = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date(value)
  return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** A facility's billing contact as the Bill To address: the street, then city, state zip and country. */
const billToAddress = (billTo: BulkBillTo | null | undefined) => {
  if (!billTo) return ''
  const { street, line2 } = facilityAddressLines(billTo)
  return [street, line2].filter(Boolean).join('\n')
}

type Line = BulkInvoiceLine

interface Props {
  open: boolean
  /** Editing this bulk invoice; a new one when not given. */
  bulk?: BulkInvoiceDetail | null
  onClose: () => void
  onSaved: (bulk: BulkInvoiceDetail) => void
}

const DRAG_TYPE = 'application/x-medrad-bulk'

const BulkInvoiceWorkspace = ({ open, bulk, onClose, onSaved }: Props) => {
  const editing = Boolean(bulk)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [box, setBox] = useState<Map<number, Line>>(new Map())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [dragOver, setDragOver] = useState(false)
  const [billTo, setBillTo] = useState({ facility_id: null as number | null, name: '', email: '', address: '' })
  const [billToTouched, setBillToTouched] = useState(false)
  const [note, setNote] = useState('')
  const dragDepth = useRef(0)

  // Start fresh each time it opens: from the bulk invoice being edited, or empty.
  useEffect(() => {
    if (!open) return
    setSearchInput('')
    setSearch('')
    setDragOver(false)
    dragDepth.current = 0
    setBox(new Map((bulk?.invoices || []).map(line => [line.id, line])))
    setBillTo({
      facility_id: bulk?.bill_to_facility_id ?? null,
      name: bulk?.bill_to_name || '',
      email: bulk?.bill_to_email || '',
      address: bulk?.bill_to_address || '',
    })
    setBillToTouched(Boolean(bulk))
    setNote(bulk?.note || '')
    setExpanded(new Set())
  }, [open, bulk])

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const candidatesQ = useQuery({
    queryKey: ['bulk-invoice-candidates', search, bulk?.id ?? null],
    queryFn: () => fetchBulkCandidates(search, bulk?.id ?? null),
    enabled: open,
    staleTime: 0,
  })
  const groups = candidatesQ.data?.groups || []

  // A search opens every facility it found; otherwise a facility is opened by hand.
  const isOpen = (key: string) => Boolean(search) || expanded.has(key)
  const toggle = (key: string) => setExpanded((current) => {
    const next = new Set(current)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  const groupOf = useMemo(() => {
    const map = new Map<number, BulkCandidateGroup>()
    groups.forEach(group => group.invoices.forEach(invoice => map.set(invoice.id, group)))
    return map
  }, [groups])

  const canAdd = (invoice: BulkCandidate) => invoice.eligible || invoice.in_this_bulk

  const add = (invoices: BulkCandidate[]) => {
    const adding = invoices.filter(invoice => canAdd(invoice) && !box.has(invoice.id))
    if (!adding.length) return
    setBox((current) => {
      const next = new Map(current)
      adding.forEach(invoice => next.set(invoice.id, { ...invoice, amount: invoice.balance_due }))
      return next
    })
    // The first facility added is, by default, who it is for.
    if (!billToTouched && box.size === 0) {
      const group = groupOf.get(adding[0].id)
      if (group) {
        setBillTo({
          facility_id: group.bill_to.facility_id,
          name: group.bill_to.name || group.facility_name,
          email: group.bill_to.email || '',
          address: billToAddress(group.bill_to),
        })
      }
    }
  }

  const remove = (id: number) => setBox((current) => {
    const next = new Map(current)
    next.delete(id)
    return next
  })

  const boxed = useMemo(() => Array.from(box.values()), [box])
  const boxedGroups = useMemo(() => {
    const byFacility = new Map<string, { name: string; lines: Line[]; subtotal: number }>()
    boxed.forEach((line) => {
      const key = line.facility_name || 'No facility'
      const entry = byFacility.get(key) || { name: key, lines: [], subtotal: 0 }
      entry.lines.push(line)
      entry.subtotal += Number(line.amount || line.balance_due || 0)
      byFacility.set(key, entry)
    })
    return Array.from(byFacility.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [boxed])
  const total = boxed.reduce((sum, line) => sum + Number(line.amount || line.balance_due || 0), 0)

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        invoice_ids: boxed.map(line => line.id),
        bill_to_facility_id: billTo.facility_id,
        bill_to_name: billTo.name.trim(),
        bill_to_email: billTo.email.trim() || null,
        bill_to_address: billTo.address.trim() || null,
        note: note.trim() || null,
      }
      return bulk ? updateBulkInvoice(bulk.id, payload) : createBulkInvoice(payload)
    },
    onSuccess: (saved) => {
      toast.success(bulk ? `${saved.bulk_number} saved` : `${saved.bulk_number} created`)
      onSaved(saved)
    },
    onError: (error: any) => {
      const detail = error.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : 'The bulk invoice could not be saved')
      void candidatesQ.refetch()
    },
  })

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault()
    dragDepth.current = 0
    setDragOver(false)
    const raw = event.dataTransfer.getData(DRAG_TYPE)
    if (!raw) return
    try {
      const ids = JSON.parse(raw) as number[]
      const invoices = ids
        .map(id => groupOf.get(id)?.invoices.find(invoice => invoice.id === id))
        .filter((invoice): invoice is BulkCandidate => Boolean(invoice))
      add(invoices)
    } catch {
      /* not one of ours */
    }
  }

  const dragStart = (event: React.DragEvent, invoices: BulkCandidate[]) => {
    const ids = invoices.filter(canAdd).map(invoice => invoice.id)
    if (!ids.length) {
      event.preventDefault()
      return
    }
    event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(ids))
    event.dataTransfer.effectAllowed = 'copy'
  }

  const emailProblem = billTo.email.trim() && !/^[^@\s,;:<>()[\]"\\]+@[^@\s,;:<>()[\]"\\]+\.[^@\s,;:<>()[\]"\\]+$/.test(billTo.email.trim())
  const ready = boxed.length > 0 && billTo.name.trim().length > 0 && !emailProblem

  return (
    <Dialog open={open} onClose={() => !save.isPending && onClose()} fullScreen PaperProps={{ sx: { bgcolor: '#F4F2FB' } }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header */}
        <Box sx={{ px: { xs: 2, md: 3 }, py: 2, background: GRADIENT, color: '#fff', display: 'flex', alignItems: 'center', gap: 2 }}>
          <MoveToInboxRoundedIcon sx={{ fontSize: 34 }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 950, fontSize: { xs: 18, md: 22 } }}>
              {editing ? `Edit ${bulk?.bulk_number}` : 'New Bulk Invoice'}
            </Typography>
            <Typography sx={{ opacity: 0.9, fontWeight: 700, fontSize: 13 }}>
              Drag invoices from any facility into the box. The customer gets one invoice, one link, one payment.
            </Typography>
          </Box>
          <IconButton onClick={onClose} disabled={save.isPending} sx={{ color: '#fff' }} aria-label="Close"><CloseRoundedIcon /></IconButton>
        </Box>

        <Box sx={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.1fr 0.9fr' }, gap: 2, p: { xs: 1.5, md: 2.5 }, overflow: { xs: 'auto', md: 'hidden' } }}>
          {/* Left: open invoices, by facility */}
          <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, gap: 1.5 }}>
            <TextField
              value={searchInput}
              onChange={event => setSearchInput(event.target.value)}
              placeholder="Search facility or invoice number…"
              size="small"
              fullWidth
              InputProps={{
                startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ color: '#7C3AED' }} /></InputAdornment>,
                endAdornment: candidatesQ.isFetching ? <CircularProgress size={18} /> : null,
              }}
              sx={{ bgcolor: '#fff', borderRadius: '14px', '& fieldset': { borderRadius: '14px' } }}
            />
            <Typography sx={{ color: '#64748B', fontSize: 12.5, fontWeight: 700, px: 0.5 }}>
              Open invoices, by facility. Drag an invoice (or a whole facility) into the box, or press +.
            </Typography>
            <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'grid', alignContent: 'start', gap: 1.25, pr: 0.5 }} data-bulk-facilities>
              {candidatesQ.isLoading && <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>}
              {candidatesQ.isError && <Alert severity="error">The open invoices could not be loaded.</Alert>}
              {!candidatesQ.isLoading && !groups.length && !candidatesQ.isError && (
                <Alert severity="info" sx={{ borderRadius: '14px' }}>{search ? 'Nothing matches that search.' : 'There are no open invoices.'}</Alert>
              )}
              {groups.map((group) => {
                const addable = group.invoices.filter(invoice => canAdd(invoice) && !box.has(invoice.id))
                const openBalance = group.invoices.filter(canAdd).reduce((sum, invoice) => sum + Number(invoice.balance_due || 0), 0)
                const groupOpen = isOpen(group.key)
                return (
                  <Box key={group.key} sx={{ bgcolor: '#fff', borderRadius: '18px', border: '1px solid #E9E5F5', boxShadow: '0 8px 22px rgba(49,46,129,0.06)', overflow: 'hidden' }}>
                    <Box
                      draggable={addable.length > 0}
                      onDragStart={event => dragStart(event, addable)}
                      onClick={() => toggle(group.key)}
                      sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1.25, cursor: 'pointer', '&:hover': { bgcolor: '#FAF8FF' } }}
                      data-bulk-facility={group.facility_name}
                    >
                      <ExpandMoreRoundedIcon sx={{ color: '#7C3AED', transition: 'transform .2s', transform: groupOpen ? 'rotate(180deg)' : 'none' }} />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 900, color: '#1E1B4B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.facility_name}</Typography>
                        <Typography sx={{ color: '#64748B', fontSize: 12, fontWeight: 700 }}>
                          {group.invoices.length} open · {money(openBalance)} can go in
                        </Typography>
                      </Box>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<AddRoundedIcon />}
                        disabled={!addable.length}
                        onClick={(event) => { event.stopPropagation(); add(addable) }}
                        sx={{ borderRadius: '10px', fontWeight: 800, textTransform: 'none', whiteSpace: 'nowrap' }}
                      >
                        Add all ({addable.length})
                      </Button>
                    </Box>
                    <Collapse in={groupOpen} unmountOnExit>
                      <Box sx={{ display: 'grid', gap: 0.75, px: 1.25, pb: 1.25 }}>
                        {group.invoices.map((invoice) => {
                          const inBox = box.has(invoice.id)
                          const allowed = canAdd(invoice)
                          return (
                            <Box
                              key={invoice.id}
                              draggable={allowed && !inBox}
                              onDragStart={event => dragStart(event, [invoice])}
                              data-bulk-candidate={invoice.invoice_number}
                              sx={{
                                display: 'grid',
                                gridTemplateColumns: 'auto 1fr auto auto',
                                alignItems: 'center',
                                gap: 1,
                                p: 1,
                                borderRadius: '12px',
                                border: '1px solid',
                                borderColor: inBox ? '#C4B5FD' : '#EEF0F6',
                                bgcolor: inBox ? '#F5F3FF' : allowed ? '#fff' : '#F8FAFC',
                                opacity: allowed ? 1 : 0.7,
                                cursor: allowed && !inBox ? 'grab' : 'default',
                                transition: 'background-color .15s, border-color .15s',
                                '&:hover': allowed && !inBox ? { borderColor: '#C4B5FD' } : undefined,
                              }}
                            >
                              {allowed ? <DragIndicatorRoundedIcon sx={{ color: inBox ? '#C4B5FD' : '#A5B4FC', fontSize: 20 }} /> : <LockOutlinedIcon sx={{ color: '#94A3B8', fontSize: 18 }} />}
                              <Box sx={{ minWidth: 0 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                                  <Typography sx={{ fontFamily: 'monospace', fontWeight: 800, color: '#1E1B4B', fontSize: 13 }}>{invoice.invoice_number}</Typography>
                                  <Chip label={invoice.type_label} size="small" sx={{ height: 20, fontSize: 11, fontWeight: 800, bgcolor: `${TYPE_COLOR[invoice.invoice_type] || '#64748B'}18`, color: TYPE_COLOR[invoice.invoice_type] || '#64748B' }} />
                                </Box>
                                <Typography sx={{ color: allowed ? '#64748B' : '#B45309', fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {allowed ? `${invoice.related_number ? `${invoice.related_number} · ` : ''}Due ${shortDate(invoice.due_date)}` : invoice.reason}
                                </Typography>
                              </Box>
                              <Typography sx={{ fontWeight: 900, color: '#1E1B4B', fontSize: 13.5, whiteSpace: 'nowrap' }}>{money(invoice.balance_due)}</Typography>
                              {inBox ? (
                                <Tooltip title="In the box (click to take it out)">
                                  <IconButton size="small" onClick={() => remove(invoice.id)} aria-label={`Take ${invoice.invoice_number} out`}>
                                    <CheckCircleRoundedIcon sx={{ color: '#7C3AED' }} />
                                  </IconButton>
                                </Tooltip>
                              ) : (
                                <Tooltip title={allowed ? 'Add to the box' : (invoice.reason || 'Cannot go in a bulk invoice')}>
                                  <span>
                                    <IconButton size="small" disabled={!allowed} onClick={() => add([invoice])} aria-label={`Add ${invoice.invoice_number}`}
                                      sx={{ bgcolor: allowed ? '#EDE9FE' : 'transparent', '&:hover': { bgcolor: '#DDD6FE' } }}>
                                      <AddRoundedIcon sx={{ color: allowed ? '#7C3AED' : '#CBD5E1' }} />
                                    </IconButton>
                                  </span>
                                </Tooltip>
                              )}
                            </Box>
                          )
                        })}
                      </Box>
                    </Collapse>
                  </Box>
                )
              })}
              {candidatesQ.data?.truncated && (
                <Alert severity="info" sx={{ borderRadius: '14px' }}>Showing the first 1,500 open invoices. Search to find others.</Alert>
              )}
            </Box>
          </Box>

          {/* Right: the box */}
          <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, gap: 1.5 }}>
            <Box
              onDragEnter={(event) => { event.preventDefault(); dragDepth.current += 1; setDragOver(true) }}
              onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' }}
              onDragLeave={() => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragOver(false) }}
              onDrop={onDrop}
              data-bulk-box
              sx={{
                flex: 1,
                minHeight: 260,
                overflowY: 'auto',
                borderRadius: '22px',
                border: '2px dashed',
                borderColor: dragOver ? '#7C3AED' : '#C4B5FD',
                bgcolor: dragOver ? '#EDE9FE' : '#FBFAFF',
                transition: 'background-color .15s, border-color .15s, box-shadow .15s',
                boxShadow: dragOver ? '0 0 0 6px rgba(124,58,237,0.12)' : 'none',
                p: 1.5,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, px: 0.5 }}>
                <Typography sx={{ fontWeight: 950, color: '#4C1D95', letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: 12 }}>The Box</Typography>
                <Chip size="small" label={`${boxed.length} invoice${boxed.length === 1 ? '' : 's'}`} sx={{ fontWeight: 800, bgcolor: '#EDE9FE', color: '#5B21B6' }} />
              </Box>
              {!boxed.length ? (
                <Box sx={{ height: 'calc(100% - 36px)', minHeight: 200, display: 'grid', placeItems: 'center', textAlign: 'center', color: '#7C3AED' }}>
                  <Box>
                    <MoveToInboxRoundedIcon sx={{ fontSize: 64, opacity: dragOver ? 1 : 0.55 }} />
                    <Typography sx={{ fontWeight: 900, mt: 1 }}>{dragOver ? 'Drop to add' : 'Drag invoices here'}</Typography>
                    <Typography sx={{ color: '#64748B', fontSize: 13, fontWeight: 700 }}>or press + next to an invoice</Typography>
                  </Box>
                </Box>
              ) : (
                <Box sx={{ display: 'grid', gap: 1.25 }}>
                  {boxedGroups.map(group => (
                    <Box key={group.name} sx={{ bgcolor: '#fff', borderRadius: '14px', border: '1px solid #EDE9FE', p: 1.25 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.75 }}>
                        <Typography sx={{ fontWeight: 900, color: '#1E1B4B', fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.name}</Typography>
                        <Typography sx={{ fontWeight: 900, color: '#5B21B6', fontSize: 13.5, whiteSpace: 'nowrap' }}>{money(group.subtotal)}</Typography>
                      </Box>
                      {group.lines.map(line => (
                        <Box key={line.id} data-bulk-boxed={line.invoice_number} sx={{ display: 'grid', gridTemplateColumns: '1fr auto auto', alignItems: 'center', gap: 1, py: 0.5, borderTop: '1px dashed #EEF0F6' }}>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography sx={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 12.5, color: '#334155' }}>{line.invoice_number}</Typography>
                            <Typography sx={{ color: '#94A3B8', fontSize: 11.5, fontWeight: 700 }}>{line.type_label}{line.related_number ? ` · ${line.related_number}` : ''}</Typography>
                          </Box>
                          <Typography sx={{ fontWeight: 800, fontSize: 13, color: '#1E1B4B', whiteSpace: 'nowrap' }}>{money(line.amount || line.balance_due)}</Typography>
                          <Tooltip title="Take it out">
                            <IconButton size="small" onClick={() => remove(line.id)} aria-label={`Remove ${line.invoice_number}`}><CloseRoundedIcon fontSize="small" /></IconButton>
                          </Tooltip>
                        </Box>
                      ))}
                    </Box>
                  ))}
                </Box>
              )}
            </Box>

            <Box sx={{ bgcolor: '#fff', borderRadius: '18px', border: '1px solid #E9E5F5', p: 1.5, display: 'grid', gap: 1.25 }}>
              <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <Typography sx={{ color: '#64748B', fontWeight: 800, fontSize: 13 }}>
                  {boxed.length} invoice{boxed.length === 1 ? '' : 's'} · {boxedGroups.length} facilit{boxedGroups.length === 1 ? 'y' : 'ies'}
                </Typography>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography sx={{ color: '#64748B', fontWeight: 800, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total</Typography>
                  <Typography sx={{ fontWeight: 950, fontSize: 24, color: '#4C1D95' }} data-bulk-total>{money(total)}</Typography>
                </Box>
              </Box>
              {editing && Number(bulk?.amount_paid || 0) > 0 && (
                <Alert severity="info" sx={{ borderRadius: '12px', py: 0 }}>
                  {money(bulk?.amount_paid)} has been paid on it, so it cannot come to owe less than that.
                </Alert>
              )}
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.25 }}>
                <TextField label="Bill To" size="small" required value={billTo.name}
                  onChange={(event) => { setBillToTouched(true); setBillTo(current => ({ ...current, name: event.target.value })) }}
                  inputProps={{ maxLength: 200 }} />
                <TextField label="Email" size="small" value={billTo.email} error={Boolean(emailProblem)} helperText={emailProblem ? 'Enter a valid email address' : undefined}
                  onChange={(event) => { setBillToTouched(true); setBillTo(current => ({ ...current, email: event.target.value })) }}
                  inputProps={{ maxLength: 320 }} />
              </Box>
              <TextField label="Address" size="small" multiline minRows={2} value={billTo.address}
                onChange={(event) => { setBillToTouched(true); setBillTo(current => ({ ...current, address: event.target.value })) }}
                inputProps={{ maxLength: 1000 }} />
              <TextField label="Note to the customer (optional)" size="small" multiline minRows={1} value={note}
                onChange={event => setNote(event.target.value)} inputProps={{ maxLength: 2000 }} />
            </Box>
          </Box>
        </Box>

        {/* Bottom bar */}
        <Box sx={{ px: { xs: 2, md: 3 }, py: 1.5, bgcolor: '#fff', borderTop: '1px solid #E9E5F5', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1.5 }}>
          <Button onClick={onClose} disabled={save.isPending} sx={{ fontWeight: 800 }}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!ready || save.isPending}
            onClick={() => save.mutate()}
            startIcon={save.isPending ? <CircularProgress size={18} color="inherit" /> : <MoveToInboxRoundedIcon />}
            sx={{ borderRadius: '12px', fontWeight: 900, textTransform: 'none', px: 3, background: GRADIENT }}
            data-bulk-save
          >
            {editing ? 'Save Changes' : `Create Bulk Invoice · ${money(total)}`}
          </Button>
        </Box>
      </Box>
    </Dialog>
  )
}

export default BulkInvoiceWorkspace
