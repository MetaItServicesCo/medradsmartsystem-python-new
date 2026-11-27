/*
  Leads: people and businesses that may become customers, where they came from
  and where they stand. A module of its own; it reads and changes nothing else.

  Design: the module's one system (title row, a card to find leads, a card
  holding the list), the pipeline as counted status pills that filter, flat
  status chips with a dot and a label (never colour alone), a table that drops
  secondary columns as space runs out and turns into cards on phones, so
  nothing scrolls sideways. The list's state (page, search, filters, sort)
  lives in the address, so Back and shared links return to the same list.
*/
import { type MouseEvent, type ReactNode, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, IconButton, ListItemIcon, Menu, MenuItem, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, Typography, useMediaQuery,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import FilterAltOffOutlinedIcon from '@mui/icons-material/FilterAltOffOutlined'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import { toast } from 'react-toastify'

import { createLead, deleteLead, fetchLeads, updateLead, type Lead, type LeadPayload, type LeadSource, type LeadStatus } from '@/api/leads'
import ClippedTooltipText from '@/components/ClippedTooltipText'
import ContextTableRow from '@/components/ContextTableRow'
import DebouncedSearchField from '@/components/DebouncedSearchField'
import SearchFieldSelect from '@/components/SearchFieldSelect'
import { hasPermission } from '@/config/permissions'
import { useAuthStore } from '@/stores/authStore'
import {
  COMPACT_LIST_QUERY, EmptyState, EmptyStateButton, FilterCard, ListCard, ListPagination, ListSkeleton, PageHeader,
  RecordCard, RecordCardList, StatTiles, StatusChip as BaseStatusChip, hideBelow, listHeadCellSx, listTableSx,
  primaryActionSx, rowIconButtonSx,
} from '@/components/ui'
import {
  LEAD_SEARCH_FIELDS, LEAD_SORTS, LEAD_SOURCES, LEAD_STATUSES, displayLeadUrl, formatLeadDate, isLeadSource, isLeadStatus,
  normalizeLeadUrl, safeLeadHref, sourceLabel, statusOption,
} from './leadOptions'

const PAGE_SIZE = 25
const headCell = listHeadCellSx
const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** The server's answer as one readable sentence (a rejected field comes back as a list). */
const errorText = (error: any, fallback: string): string => {
  const detail = error?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const text = detail.map((item: any) => String(item?.msg || '').replace(/^Value error,\s*/i, '')).filter(Boolean).join(' ')
    return text || fallback
  }
  return fallback
}

const StatusChip = ({ status }: { status: string }) => {
  const option = statusOption(status)
  return <BaseStatusChip label={option.label} dot={option.dot} bg={option.bg} ink={option.ink} />
}

/** The source, and for a website lead the website it came from, as a link that opens in a new tab. */
const SourceCell = ({ lead }: { lead: Lead }) => {
  const href = lead.source === 'website' ? safeLeadHref(lead.source_url) : null
  return (
    <Box sx={{ minWidth: 0 }}>
      <ClippedTooltipText value={sourceLabel(lead.source)} fontWeight={700} />
      {href && (
        <Box
          component="a"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          title={href}
          aria-label={`Open ${displayLeadUrl(href)} in a new tab`}
          onClick={(event: MouseEvent) => event.stopPropagation()}
          sx={{
            display: 'flex', alignItems: 'center', gap: 0.4, maxWidth: '100%', fontSize: 12, fontWeight: 700, color: '#6D28D9',
            textDecoration: 'none', '&:hover': { textDecoration: 'underline' }, '&:focus-visible': { outline: '2px solid #C4B5FD', outlineOffset: 2, borderRadius: '4px' },
          }}
        >
          <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{displayLeadUrl(href)}</Box>
          <OpenInNewIcon aria-hidden="true" sx={{ fontSize: 13, flexShrink: 0 }} />
        </Box>
      )}
    </Box>
  )
}

// ─── The add / edit form ─────────────────────────────────────────────────────

type FormState = { name: string; company: string; email: string; phone: string; source: LeadSource | ''; source_url: string; status: LeadStatus; notes: string }
const emptyForm = (): FormState => ({ name: '', company: '', email: '', phone: '', source: '', source_url: '', status: 'new', notes: '' })
const formFromLead = (lead: Lead): FormState => ({
  name: lead.name, company: lead.company || '', email: lead.email || '', phone: lead.phone || '',
  source: lead.source, source_url: lead.source_url || '', status: lead.status, notes: lead.notes || '',
})

/** A one-line field as the server keeps it: spaces collapsed, blank as empty. */
const oneLine = (value: string) => value.split(/\s+/).filter(Boolean).join(' ')

const fieldErrors = (form: FormState): Partial<Record<keyof FormState, string>> => {
  const errors: Partial<Record<keyof FormState, string>> = {}
  if (!oneLine(form.name)) errors.name = 'Lead name is required'
  else if (oneLine(form.name).length > 200) errors.name = 'Lead name must be 200 characters or fewer'
  if (!form.source) errors.source = 'Choose where the lead came from'
  if (form.source === 'website') {
    if (!form.source_url.trim()) errors.source_url = 'Enter the website the lead came from'
    else if (!normalizeLeadUrl(form.source_url)) errors.source_url = 'Enter a valid website address, such as https://example.com'
  }
  if (form.email.trim() && !EMAIL_SHAPE.test(form.email.trim())) errors.email = 'Enter a valid email address'
  if (form.company.trim().length > 200) errors.company = 'Company must be 200 characters or fewer'
  if (form.phone.trim().length > 40) errors.phone = 'Phone must be 40 characters or fewer'
  if (form.notes.length > 5000) errors.notes = 'Notes must be 5,000 characters or fewer'
  return errors
}

const payloadFrom = (form: FormState): LeadPayload => ({
  name: oneLine(form.name),
  company: oneLine(form.company) || null,
  email: form.email.trim() || null,
  phone: oneLine(form.phone) || null,
  source: form.source as LeadSource,
  // Kept only for a website lead; any other source keeps no URL.
  source_url: form.source === 'website' ? normalizeLeadUrl(form.source_url) : null,
  status: form.status,
  notes: form.notes.trim() || null,
})

interface LeadDialogProps {
  open: boolean
  lead: Lead | null
  readOnly: boolean
  onClose: () => void
  onSaved: (lead: Lead, created: boolean) => void
}

const LeadDialog = ({ open, lead, readOnly, onClose, onSaved }: LeadDialogProps) => {
  const [form, setForm] = useState<FormState>(emptyForm)
  // A field shows its error once it was changed and left, or after Save.
  const [touched, setTouched] = useState<Partial<Record<keyof FormState, boolean>>>({})
  const [dirty, setDirty] = useState<Partial<Record<keyof FormState, boolean>>>({})
  const [submitted, setSubmitted] = useState(false)
  const [serverError, setServerError] = useState('')

  useEffect(() => {
    if (!open) return
    setForm(lead ? formFromLead(lead) : emptyForm())
    setTouched({})
    setDirty({})
    setSubmitted(false)
    setServerError('')
  }, [open, lead])

  const errors = fieldErrors(form)
  const shown = (key: keyof FormState) => (submitted || touched[key]) && !readOnly ? errors[key] : undefined
  const set = (key: keyof FormState) => (event: { target: { value: string } }) => {
    setForm(current => ({ ...current, [key]: event.target.value }))
    setDirty(current => ({ ...current, [key]: true }))
  }
  const blur = (key: keyof FormState) => () => { if (dirty[key]) setTouched(current => ({ ...current, [key]: true })) }

  const save = useMutation({
    mutationFn: async () => {
      const payload = payloadFrom(form)
      if (!lead) return { saved: await createLead(payload), created: true }
      // Only what changed is sent.
      const original = payloadFrom(formFromLead(lead))
      const changes = Object.fromEntries(
        (Object.keys(payload) as (keyof LeadPayload)[]).filter(key => payload[key] !== original[key]).map(key => [key, payload[key]]),
      ) as Partial<LeadPayload>
      return { saved: Object.keys(changes).length ? await updateLead(lead.id, changes) : lead, created: false }
    },
    onSuccess: ({ saved, created }) => onSaved(saved, created),
    // The form stays as it was typed; only the reason is shown.
    onError: (error: any) => setServerError(errorText(error, 'Could not save the lead. Try again.')),
  })

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (readOnly) return
    setSubmitted(true)
    setServerError('')
    if (Object.keys(errors).length) {
      const first = (['name', 'source', 'source_url', 'email', 'company', 'phone', 'notes'] as const).find(key => errors[key])
      if (first) document.getElementById(`lead-${first}`)?.focus()
      return
    }
    save.mutate()
  }

  const title = readOnly ? 'Lead' : lead ? 'Edit lead' : 'Add lead'
  const busy = save.isPending
  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      fullWidth
      maxWidth="sm"
      PaperProps={{ component: 'form', onSubmit: submit, noValidate: true, sx: { borderRadius: '20px' } } as any}
      aria-labelledby="lead-dialog-title"
    >
      <DialogTitle id="lead-dialog-title" sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 900, color: '#1E1B4B', pr: 1.5 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {title}
          {lead && (
            <Typography sx={{ color: '#6B7280', fontSize: 13, fontWeight: 700 }}>
              Added {formatLeadDate(lead.created_at)}{lead.created_by_name ? ` by ${lead.created_by_name}` : ''}
            </Typography>
          )}
        </Box>
        <IconButton aria-label="Close" onClick={onClose} disabled={busy}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ display: 'grid', gap: 2, pt: '20px !important' }}>
        {serverError && <Alert severity="error" role="alert" sx={{ borderRadius: '12px' }}>{serverError}</Alert>}
        <TextField id="lead-name" label="Lead name" required fullWidth autoFocus={!readOnly} value={form.name}
          onChange={set('name')} onBlur={blur('name')} error={Boolean(shown('name'))}
          helperText={shown('name') || 'A person or a business'} InputProps={{ readOnly }} inputProps={{ maxLength: 200 }} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
          <TextField id="lead-source" select label="Lead source" required fullWidth value={form.source}
            onChange={event => { set('source')(event); setTouched(current => ({ ...current, source: true })) }} error={Boolean(shown('source'))}
            helperText={shown('source') || 'Where the lead came from'} InputProps={{ readOnly }}>
            {LEAD_SOURCES.map(option => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
          </TextField>
          <TextField id="lead-status" select label="Status" required fullWidth value={form.status}
            onChange={set('status')} helperText="Where the lead stands" InputProps={{ readOnly }}>
            {LEAD_STATUSES.map(option => (
              <MenuItem key={option.value} value={option.value}>
                <Box component="span" aria-hidden="true" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: option.dot, mr: 1, display: 'inline-block' }} />
                {option.label}
              </MenuItem>
            ))}
          </TextField>
        </Box>
        {form.source === 'website' && (
          <TextField id="lead-source_url" label="Website URL" required fullWidth value={form.source_url}
            onChange={set('source_url')} onBlur={blur('source_url')} error={Boolean(shown('source_url'))}
            placeholder="https://example.com/page" type="url" autoComplete="off"
            helperText={shown('source_url') || 'Which website the lead came from'}
            inputProps={{ maxLength: 500, inputMode: 'url' }}
            InputProps={{
              readOnly,
              endAdornment: safeLeadHref(normalizeLeadUrl(form.source_url)) ? (
                <IconButton
                  component="a"
                  href={safeLeadHref(normalizeLeadUrl(form.source_url)) || undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  size="small"
                  edge="end"
                  aria-label="Open the website in a new tab"
                >
                  <OpenInNewIcon fontSize="small" />
                </IconButton>
              ) : undefined,
            }}
          />
        )}
        <Divider textAlign="left" sx={{ color: '#8B95A7', fontSize: 12, fontWeight: 800 }}>Contact (optional)</Divider>
        <TextField id="lead-company" label="Company" fullWidth value={form.company} onChange={set('company')} onBlur={blur('company')}
          error={Boolean(shown('company'))} helperText={shown('company')} InputProps={{ readOnly }} inputProps={{ maxLength: 200 }} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
          <TextField id="lead-email" label="Email" type="email" fullWidth value={form.email} onChange={set('email')} onBlur={blur('email')}
            error={Boolean(shown('email'))} helperText={shown('email')} InputProps={{ readOnly }} inputProps={{ maxLength: 320 }} autoComplete="off" />
          <TextField id="lead-phone" label="Phone" type="tel" fullWidth value={form.phone} onChange={set('phone')} onBlur={blur('phone')}
            error={Boolean(shown('phone'))} helperText={shown('phone')} InputProps={{ readOnly }} inputProps={{ maxLength: 40 }} autoComplete="off" />
        </Box>
        <TextField id="lead-notes" label="Notes" fullWidth multiline minRows={3} maxRows={10} value={form.notes} onChange={set('notes')} onBlur={blur('notes')}
          error={Boolean(shown('notes'))} helperText={shown('notes') || (readOnly ? undefined : `${form.notes.length.toLocaleString()} / 5,000`)}
          InputProps={{ readOnly }} />
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={busy} sx={{ fontWeight: 800, textTransform: 'none' }}>{readOnly ? 'Close' : 'Cancel'}</Button>
        {!readOnly && (
          <Button type="submit" variant="contained" disabled={busy} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
            sx={{ fontWeight: 900, textTransform: 'none', borderRadius: '12px', minHeight: 44, px: 3 }}>
            {busy ? 'Saving…' : lead ? 'Save changes' : 'Add lead'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}

// ─── The page ────────────────────────────────────────────────────────────────

const Leads = () => {
  const queryClient = useQueryClient()
  const user = useAuthStore(state => state.user)
  const canAdd = hasPermission(user, 'leads', 'add')
  const canEdit = hasPermission(user, 'leads', 'edit')
  const canDelete = hasPermission(user, 'leads', 'delete')
  const compact = useMediaQuery(COMPACT_LIST_QUERY)

  // The list as the address says it is.
  const [params, setParams] = useSearchParams()
  const search = params.get('search') || ''
  const field = params.get('field') || 'all'
  const rawStatus = params.get('status')
  const status: LeadStatus | '' = isLeadStatus(rawStatus) ? rawStatus : ''
  const rawSource = params.get('source')
  const source: LeadSource | '' = isLeadSource(rawSource) ? rawSource : ''
  const sort = (LEAD_SORTS.find(option => option.value === params.get('sort'))?.value || 'newest') as (typeof LEAD_SORTS)[number]['value']
  const page = Math.max(0, (Number.parseInt(params.get('page') || '1', 10) || 1) - 1)
  const [searchSeed, setSearchSeed] = useState(0)

  /** Change the list; any change but the page itself starts again at page 1. */
  const change = (updates: Record<string, string | null>, keepPage = false) => {
    setParams(current => {
      const next = new URLSearchParams(current)
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === '' || (key === 'field' && value === 'all') || (key === 'sort' && value === 'newest')) next.delete(key)
        else next.set(key, value)
      })
      if (!keepPage) next.delete('page')
      return next
    }, { replace: true })
  }
  const setPage = (next: number) => change({ page: next > 0 ? String(next + 1) : null }, true)

  const leadsQ = useQuery({
    queryKey: ['leads', search, field, status, source, sort, page],
    queryFn: () => fetchLeads({
      search: search || undefined,
      search_field: field === 'all' ? undefined : field,
      status: status || undefined,
      source: source || undefined,
      sort,
      skip: page * PAGE_SIZE,
      limit: PAGE_SIZE,
    }),
    placeholderData: previous => previous,
    staleTime: 15_000,
  })
  const items = leadsQ.data?.items || []
  const total = leadsQ.data?.total || 0
  const counts = leadsQ.data?.status_counts
  const allCount = counts ? Object.values(counts).reduce((sum, value) => sum + value, 0) : 0
  const filtersActive = Boolean(search || field !== 'all' || status || source || sort !== 'newest')

  // A page that no longer exists (its last lead deleted, an old link) shows the last one there is.
  useEffect(() => {
    if (leadsQ.isFetching || !leadsQ.data) return
    const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1)
    if (page > lastPage) setPage(lastPage)
  }, [leadsQ.isFetching, leadsQ.data, total, page])

  const clearFilters = () => {
    setParams(new URLSearchParams(), { replace: true })
    setSearchSeed(seed => seed + 1)
  }

  // Dialogs and the row menu
  const [dialog, setDialog] = useState<{ open: boolean; lead: Lead | null; readOnly: boolean }>({ open: false, lead: null, readOnly: false })
  const [menu, setMenu] = useState<{ anchor: HTMLElement; lead: Lead } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Lead | null>(null)
  const openLead = (lead: Lead) => setDialog({ open: true, lead, readOnly: !canEdit })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['leads'] })

  const statusMut = useMutation({
    mutationFn: ({ lead, next }: { lead: Lead; next: LeadStatus }) => updateLead(lead.id, { status: next }),
    onSuccess: (saved) => { toast.success(`${saved.name} is now ${statusOption(saved.status).label}`); refresh() },
    onError: (error: any) => toast.error(errorText(error, 'Could not change the status')),
  })
  const deleteMut = useMutation({
    mutationFn: (lead: Lead) => deleteLead(lead.id),
    onSuccess: (_, lead) => { toast.success(`${lead.name} deleted`); setDeleteTarget(null); refresh() },
    onError: (error: any) => toast.error(errorText(error, 'Could not delete the lead')),
  })

  const rowMenuButton = (lead: Lead) => (canEdit || canDelete) ? (
    <IconButton
      size="small"
      aria-label={`Actions for ${lead.name}`}
      onClick={(event: MouseEvent<HTMLElement>) => { event.stopPropagation(); setMenu({ anchor: event.currentTarget, lead }) }}
      sx={rowIconButtonSx}
    >
      <MoreVertIcon fontSize="small" />
    </IconButton>
  ) : (
    <Button size="small" onClick={() => openLead(lead)} sx={{ fontWeight: 900, textTransform: 'none' }}>View</Button>
  )

  const contactLine = (lead: Lead) => [lead.email, lead.phone].filter(Boolean).join(' · ') || '—'

  const statusTiles = useMemo(() => ([
    { value: '', label: 'All', color: '#7C3AED', count: allCount },
    ...LEAD_STATUSES.map(option => ({ value: option.value, label: option.label, color: option.dot, count: counts?.[option.value] ?? 0 })),
  ]), [counts, allCount])
  const addLead = () => setDialog({ open: true, lead: null, readOnly: false })

  const renderList = (): ReactNode => {
    if (leadsQ.isLoading) return <ListSkeleton />
    if (leadsQ.isError) {
      return <EmptyState failed title="The leads could not be loaded." action={<EmptyStateButton onClick={() => leadsQ.refetch()}>Try again</EmptyStateButton>} />
    }
    if (!items.length) {
      return (
        <EmptyState
          title={filtersActive ? 'No leads match.' : 'No leads yet.'}
          detail={filtersActive ? 'Try other words, or clear the filters.' : 'Add the first lead to start the list.'}
          action={filtersActive
            ? <EmptyStateButton icon={<FilterAltOffOutlinedIcon />} onClick={clearFilters}>Clear filters</EmptyStateButton>
            : canAdd ? <EmptyStateButton primary icon={<AddIcon />} onClick={addLead}>Add lead</EmptyStateButton> : null}
        />
      )
    }
    if (compact) {
      return (
        <RecordCardList ariaLabel="Leads">
          {items.map(lead => (
            <RecordCard
              key={lead.id}
              recordKey={`lead-${lead.id}`}
              label={lead.name}
              title={<ClippedTooltipText value={lead.name} fontWeight={900} color="#1E1B4B" onClick={() => openLead(lead)} />}
              lines={[
                lead.company ? <ClippedTooltipText key="company" value={lead.company} variant="caption" color="#475467" fontWeight={700} /> : null,
                <Box key="status" sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
                  <StatusChip status={lead.status} />
                  <Box sx={{ minWidth: 0, flex: '1 1 120px' }}><SourceCell lead={lead} /></Box>
                </Box>,
                <ClippedTooltipText key="contact" value={contactLine(lead)} variant="caption" color="#6B7280" fontWeight={600} />,
                <Typography key="added" sx={{ fontSize: 12, color: '#8B95A7', fontWeight: 700 }}>Added {formatLeadDate(lead.created_at)}</Typography>,
              ]}
              actions={rowMenuButton(lead)}
            />
          ))}
        </RecordCardList>
      )
    }
    return (
      <TableContainer className="list-scroll-panel" sx={{ overflowX: 'hidden' }}>
        <Table stickyHeader aria-label="Leads" sx={listTableSx}>
          <TableHead>
            <TableRow>
              <TableCell sx={headCell}>Lead</TableCell>
              <TableCell sx={{ ...headCell, width: '26%', ...hideBelow('lg') }}>Contact</TableCell>
              <TableCell sx={{ ...headCell, width: '15%' }}>Source</TableCell>
              <TableCell sx={{ ...headCell, width: 150 }}>Status</TableCell>
              <TableCell sx={{ ...headCell, width: '13%', ...hideBelow('md') }}>Added</TableCell>
              <TableCell align="right" sx={{ ...headCell, width: 80 }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map(lead => (
              <ContextTableRow key={lead.id} recordKey={`lead-${lead.id}`} recordLabel={lead.name} hover>
                <TableCell>
                  <ClippedTooltipText value={lead.name} fontWeight={900} color="#1E1B4B" onClick={() => openLead(lead)} />
                  <ClippedTooltipText value={lead.company || '—'} variant="caption" color="#6B7280" fontWeight={600} />
                </TableCell>
                <TableCell sx={hideBelow('lg')}>
                  <ClippedTooltipText value={lead.email || (lead.phone ? '' : '—')} fontWeight={600} />
                  {lead.phone && <ClippedTooltipText value={lead.phone} variant="caption" color="#6B7280" fontWeight={600} />}
                </TableCell>
                <TableCell><SourceCell lead={lead} /></TableCell>
                <TableCell sx={{ overflow: 'hidden' }}><StatusChip status={lead.status} /></TableCell>
                <TableCell sx={hideBelow('md')}>
                  <Typography sx={{ fontSize: 13, fontWeight: 800, color: '#344054', whiteSpace: 'nowrap' }}>{formatLeadDate(lead.created_at)}</Typography>
                  {lead.created_by_name && <ClippedTooltipText value={`by ${lead.created_by_name}`} variant="caption" color="#8B95A7" fontWeight={600} />}
                </TableCell>
                <TableCell align="right">{rowMenuButton(lead)}</TableCell>
              </ContextTableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    )
  }

  return (
    <Box className="page-enter" sx={{ maxWidth: 1440, mx: 'auto', minWidth: 0 }}>
      <PageHeader
        title="Leads"
        subtitle="Who may become a customer, where they came from, and where they stand."
        icon={<TrendingUpIcon />}
        actions={canAdd ? <Button startIcon={<AddIcon />} variant="contained" onClick={addLead} sx={primaryActionSx}>Add lead</Button> : undefined}
      />

      {/* The pipeline: counted status tiles that filter the list */}
      <StatTiles
        ariaLabel="Lead status"
        tiles={statusTiles}
        selected={status}
        onSelect={value => change({ status: value || null })}
        loading={leadsQ.isLoading}
      />

      <FilterCard ariaLabel="Find leads">
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '160px minmax(0, 1fr)', lg: '160px minmax(0, 1fr) 190px 180px auto' }, gap: 1.5, alignItems: 'center' }}>
          <SearchFieldSelect value={field} options={LEAD_SEARCH_FIELDS} onChange={value => change({ field: value })} ariaLabel="Lead search field" sx={{ minWidth: 0 }} />
          <DebouncedSearchField
            key={`lead-search-${searchSeed}`}
            defaultValue={search}
            onDebouncedChange={value => { if (value !== search) change({ search: value || null }) }}
            label="Search leads"
            placeholder={field === 'all' ? 'Name, company, email, phone or notes' : `Search ${LEAD_SEARCH_FIELDS.find(item => item.value === field)?.label.toLowerCase()}`}
            fullWidth
            size="small"
          />
          <TextField select label="Source" value={source} onChange={event => change({ source: event.target.value || null })} fullWidth size="small"
            InputLabelProps={{ shrink: true }} SelectProps={{ displayEmpty: true }}>
            <MenuItem value="">All sources</MenuItem>
            {LEAD_SOURCES.map(option => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
          </TextField>
          <TextField select label="Sort" value={sort} onChange={event => change({ sort: event.target.value })} fullWidth size="small">
            {LEAD_SORTS.map(option => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
          </TextField>
          <Button startIcon={<FilterAltOffOutlinedIcon />} onClick={clearFilters} disabled={!filtersActive}
            sx={{ fontWeight: 900, textTransform: 'none', borderRadius: '12px', minHeight: 40, justifySelf: { xs: 'start', lg: 'end' }, whiteSpace: 'nowrap' }}>
            Clear filters
          </Button>
        </Box>
      </FilterCard>

      <ListCard
        ariaLabel="Lead list"
        title={status ? statusOption(status).label : 'All leads'}
        count={total}
        loading={leadsQ.isLoading}
        busy={leadsQ.isFetching}
        footer={<ListPagination page={page + 1} pageSize={PAGE_SIZE} total={total} onChange={next => setPage(next - 1)} />}
      >
        {renderList()}
      </ListCard>

      {/* Row actions: edit, move along the pipeline, delete */}
      <Menu anchorEl={menu?.anchor} open={Boolean(menu)} onClose={() => setMenu(null)}
        PaperProps={{ sx: { borderRadius: '14px', minWidth: 210, boxShadow: '0 18px 45px rgba(30,27,75,0.16)' } }}>
        {canEdit && (
          <MenuItem onClick={() => { const lead = menu?.lead; setMenu(null); if (lead) setDialog({ open: true, lead, readOnly: false }) }} sx={{ fontWeight: 800 }}>
            <ListItemIcon><EditOutlinedIcon fontSize="small" sx={{ color: '#7C3AED' }} /></ListItemIcon>
            Edit
          </MenuItem>
        )}
        {canEdit && <Divider sx={{ my: 0.5 }} />}
        {canEdit && <Typography sx={{ px: 2, pt: 0.5, pb: 0.25, fontSize: 11.5, fontWeight: 900, color: '#8B95A7', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Move to</Typography>}
        {canEdit && LEAD_STATUSES.filter(option => option.value !== menu?.lead.status).map(option => (
          <MenuItem key={option.value} disabled={statusMut.isPending}
            onClick={() => { const lead = menu?.lead; setMenu(null); if (lead) statusMut.mutate({ lead, next: option.value }) }} sx={{ fontWeight: 700 }}>
            <ListItemIcon><Box component="span" aria-hidden="true" sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: option.dot, ml: 0.5 }} /></ListItemIcon>
            {option.label}
          </MenuItem>
        ))}
        {canDelete && canEdit && <Divider sx={{ my: 0.5 }} />}
        {canDelete && (
          <MenuItem onClick={() => { const lead = menu?.lead; setMenu(null); if (lead) setDeleteTarget(lead) }} sx={{ fontWeight: 800, color: '#DC2626' }}>
            <ListItemIcon><DeleteOutlineIcon fontSize="small" sx={{ color: '#DC2626' }} /></ListItemIcon>
            Delete
          </MenuItem>
        )}
      </Menu>

      <LeadDialog
        open={dialog.open}
        lead={dialog.lead}
        readOnly={dialog.readOnly}
        onClose={() => setDialog(current => ({ ...current, open: false }))}
        onSaved={(saved, created) => {
          setDialog(current => ({ ...current, open: false }))
          toast.success(created ? `${saved.name} added` : `${saved.name} saved`)
          refresh()
        }}
      />

      <Dialog open={Boolean(deleteTarget)} onClose={deleteMut.isPending ? undefined : () => setDeleteTarget(null)} maxWidth="xs" fullWidth
        PaperProps={{ sx: { borderRadius: '20px' } }} aria-labelledby="lead-delete-title">
        <DialogTitle id="lead-delete-title" sx={{ fontWeight: 900, color: '#1E1B4B' }}>Delete this lead?</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#475467' }}>
            <strong>{deleteTarget?.name}</strong>{deleteTarget?.company ? ` (${deleteTarget.company})` : ''} will be removed. This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleteMut.isPending} sx={{ fontWeight: 800, textTransform: 'none' }}>Cancel</Button>
          <Button color="error" variant="contained" disabled={deleteMut.isPending} onClick={() => deleteTarget && deleteMut.mutate(deleteTarget)}
            sx={{ fontWeight: 900, textTransform: 'none', borderRadius: '12px' }}>
            {deleteMut.isPending ? 'Deleting…' : 'Delete lead'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default Leads
