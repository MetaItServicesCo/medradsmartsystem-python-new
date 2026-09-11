/**
 * Vendors, contracts, and the credentials that let them on site.
 *
 * The compliance watchlist leads deliberately. An accreditation survey will ask
 * you to evidence that the contractor who worked on your fire pump was licensed
 * and insured on the day they did it, and a lapsed certificate found a quarter
 * later is a finding rather than a control.
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Avatar, Box, Button, Card, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, InputAdornment, MenuItem, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import BlockIcon from '@mui/icons-material/Block'
import BusinessIcon from '@mui/icons-material/Business'
import GppGoodIcon from '@mui/icons-material/GppGood'
import SearchIcon from '@mui/icons-material/Search'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import { toast } from 'react-toastify'

import {
  createVendor, fetchComplianceWatchlist, fetchVendorMeta, fetchVendors,
  type Vendor,
} from '@/api/vendors'
import { fetchDisciplines } from '@/api/disciplines'
import { hasPermission } from '@/config/permissions'
import { useAuthStore } from '@/stores/authStore'
import { palette } from '@/theme/palette'

const BRAND = palette.brand
const INK = palette.ink

const humanise = (value?: string | null) =>
  value ? value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—'

export default function VendorsPage() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [vendorType, setVendorType] = useState('')
  const [addOpen, setAddOpen] = useState(false)

  const canEdit = hasPermission(user, 'vendors', 'add')

  const { data: meta } = useQuery({ queryKey: ['vendor-meta'], queryFn: fetchVendorMeta })
  const { data: disciplines } = useQuery({ queryKey: ['disciplines'], queryFn: fetchDisciplines })

  const { data: watchlist } = useQuery({
    queryKey: ['vendor-watchlist'],
    queryFn: () => fetchComplianceWatchlist(60),
  })

  const { data: vendors, isLoading } = useQuery({
    queryKey: ['vendors', search, vendorType],
    queryFn: () => fetchVendors({ q: search || undefined, vendor_type: vendorType || undefined, limit: 200 }),
  })

  const disciplineById = new Map((disciplines?.items || []).map((d) => [d.id, d]))

  return (
    <Box className="page-enter" sx={{ width: '100%', minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: { xs: 'stretch', sm: 'center' }, justifyContent: 'space-between', gap: 1.5, mb: 2.5, flexDirection: { xs: 'column', sm: 'row' } }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h4" sx={{ fontWeight: 900, color: INK }}>Vendors</Typography>
          <Typography sx={{ color: palette.textMuted, fontWeight: 700 }}>
            Contractors, their contracts, and whether their papers are in order
          </Typography>
        </Box>
        {canEdit && (
          <Button
            variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}
            sx={{ minHeight: 40, alignSelf: { xs: 'flex-start', sm: 'center' }, background: palette.gradientBrand, borderRadius: '10px', px: 2.25, fontWeight: 900 }}
          >
            Add vendor
          </Button>
        )}
      </Box>

      {/* ── Compliance watchlist ─────────────────────────────────────────── */}
      {!!watchlist && (watchlist.expired.length > 0 || watchlist.blocked_vendor_count > 0) && (
        <Alert
          severity="error" icon={<BlockIcon />}
          sx={{ mb: 2, borderRadius: '14px', fontWeight: 700 }}
        >
          {watchlist.expired.length > 0 && (
            <>
              {watchlist.expired.length} credential{watchlist.expired.length > 1 ? 's have' : ' has'} expired.
              {' '}
            </>
          )}
          {watchlist.blocked_vendor_count > 0 && (
            <>
              {watchlist.blocked_vendor_count} active vendor
              {watchlist.blocked_vendor_count > 1 ? 's are' : ' is'} blocked from dispatch until
              their insurance or licence is updated.
            </>
          )}
        </Alert>
      )}

      {!!watchlist?.expiring_soon.length && (
        <Card sx={{ borderRadius: '18px', border: '1px solid #FDE68A', boxShadow: 'none', mb: 2, overflow: 'hidden' }}>
          <Box sx={{ px: 2, py: 1.25, backgroundColor: palette.warningWash, borderBottom: '1px solid #FDE68A', display: 'flex', alignItems: 'center', gap: 1 }}>
            <WarningAmberIcon sx={{ fontSize: 19, color: palette.warning }} />
            <Typography sx={{ fontWeight: 900, color: palette.warningDeep, fontSize: 14 }}>
              Expiring within {watchlist.horizon_days} days
            </Typography>
          </Box>
          <Stack sx={{ p: 1.25 }} spacing={0.5}>
            {watchlist.expiring_soon.slice(0, 6).map((credential) => (
              <Stack
                key={credential.credential_id} direction="row" alignItems="center" spacing={1}
                sx={{ px: 1, py: 0.6, borderRadius: '9px', '&:hover': { backgroundColor: palette.warningWash } }}
              >
                <Typography sx={{ fontWeight: 800, fontSize: 13, color: INK, minWidth: 0 }} noWrap>
                  {credential.vendor_name}
                </Typography>
                <Typography sx={{ fontSize: 12, color: palette.textMuted }}>
                  {humanise(credential.credential_type)}
                </Typography>
                <Box sx={{ flex: 1 }} />
                <Chip
                  label={`${credential.days_until_expiry} days`} size="small"
                  sx={{ height: 21, fontWeight: 800, fontSize: 11, borderRadius: '7px', backgroundColor: palette.warningTint, color: palette.warning }}
                />
              </Stack>
            ))}
          </Stack>
        </Card>
      )}

      {/* ── Vendor list ──────────────────────────────────────────────────── */}
      <Card sx={{ overflow: 'hidden', borderRadius: '22px', border: `1px solid ${palette.brandBorder}`, boxShadow: palette.shadowCard }}>
        <Box sx={{ p: { xs: 1.5, md: 2 }, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(240px, 1fr) 200px auto' }, gap: 1, alignItems: 'center', borderBottom: `1px solid ${palette.border}` }}>
          <TextField
            size="small" placeholder="Search vendors…" value={search}
            onChange={(e) => setSearch(e.target.value)} fullWidth
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: palette.textDisabled }} /></InputAdornment> }}
          />
          <TextField
            size="small" select label="Type" value={vendorType}
            onChange={(e) => setVendorType(e.target.value)} fullWidth
          >
            <MenuItem value="">All types</MenuItem>
            {(meta?.vendor_types || []).map((option) => (
              <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
            ))}
          </TextField>
          <Chip
            label={`${vendors?.total ?? 0} vendors`}
            sx={{ height: 30, borderRadius: '9px', fontSize: 12, fontWeight: 900, backgroundColor: palette.brandTint, color: palette.brandDeep, justifySelf: { xs: 'start', sm: 'end' } }}
          />
        </Box>

        <TableContainer sx={{ maxHeight: 560 }}>
          <Table stickyHeader size="small" sx={{ '& .MuiTableCell-root': { py: 1.15 } }}>
            <TableHead>
              <TableRow>
                {['Vendor', 'Type', 'Trades', 'Dispatch', 'After hours', 'Earliest expiry'].map((head) => (
                  <TableCell key={head} sx={{ fontWeight: 900, color: palette.textSubtle, fontSize: 12, backgroundColor: '#FCFCFD' }}>
                    {head}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 5 }}>
                    <CircularProgress size={20} thickness={5} sx={{ color: BRAND }} />
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && !(vendors?.items || []).length && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 5, color: palette.textFaint, fontWeight: 700 }}>
                    No vendors yet. Elevators, fire alarm and generators are usually the first three.
                  </TableCell>
                </TableRow>
              )}
              {(vendors?.items || []).map((vendor: Vendor) => (
                <TableRow key={vendor.id} hover>
                  <TableCell>
                    <Stack direction="row" spacing={1.1} alignItems="center">
                      <Avatar sx={{ width: 34, height: 34, bgcolor: palette.brandTint, color: BRAND, borderRadius: '10px' }}>
                        <BusinessIcon sx={{ fontSize: 18 }} />
                      </Avatar>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 900, color: INK, fontSize: 13 }} noWrap>
                          {vendor.name}
                        </Typography>
                        <Typography sx={{ fontSize: 11, color: palette.textFaint }}>{vendor.code}</Typography>
                      </Box>
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ fontSize: 12, color: palette.slate600, fontWeight: 700 }}>
                    {humanise(vendor.vendor_type)}
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                      {(vendor.discipline_ids || []).slice(0, 3).map((id) => {
                        const discipline = disciplineById.get(id)
                        if (!discipline) return null
                        return (
                          <Chip
                            key={id} label={discipline.name} size="small"
                            sx={{
                              height: 20, fontSize: 10, fontWeight: 800, borderRadius: '6px',
                              backgroundColor: `${discipline.color || palette.brand}18`,
                              color: discipline.color || palette.brandDeep,
                            }}
                          />
                        )
                      })}
                    </Stack>
                  </TableCell>
                  <TableCell>
                    {vendor.is_dispatchable ? (
                      <Tooltip title="Active, and credentials in order">
                        <Chip
                          icon={<GppGoodIcon sx={{ fontSize: 14 }} />} label="Clear" size="small"
                          sx={{ height: 22, fontWeight: 800, fontSize: 11, borderRadius: '7px', backgroundColor: palette.successTint, color: palette.success }}
                        />
                      </Tooltip>
                    ) : (
                      <Tooltip title={
                        vendor.credentials_ok
                          ? 'Vendor is not active'
                          : 'A required credential is missing or lapsed — assignment is blocked'
                      }>
                        <Chip
                          label="Blocked" size="small"
                          sx={{ height: 22, fontWeight: 800, fontSize: 11, borderRadius: '7px', backgroundColor: palette.dangerTint, color: palette.danger }}
                        />
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell sx={{ fontSize: 12, color: palette.slate600, fontWeight: 700 }}>
                    {vendor.after_hours_phone || '—'}
                  </TableCell>
                  <TableCell sx={{ fontSize: 12, color: palette.slate600, fontWeight: 700 }}>
                    {vendor.earliest_credential_expiry || '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <AddVendorDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        meta={meta}
        disciplines={disciplines?.items || []}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ['vendors'] })
          queryClient.invalidateQueries({ queryKey: ['vendor-watchlist'] })
          setAddOpen(false)
        }}
      />
    </Box>
  )
}

function AddVendorDialog({ open, onClose, meta, disciplines, onCreated }: {
  open: boolean
  onClose: () => void
  meta: any
  disciplines: any[]
  onCreated: () => void
}) {
  const [form, setForm] = useState({
    code: '', name: '', vendor_type: 'service_contractor',
    phone: '', after_hours_phone: '', email: '', discipline_ids: [] as number[],
  })

  const mutation = useMutation({
    mutationFn: () => createVendor({
      code: form.code.trim(),
      name: form.name.trim(),
      vendor_type: form.vendor_type,
      phone: form.phone || null,
      after_hours_phone: form.after_hours_phone || null,
      email: form.email || null,
      discipline_ids: form.discipline_ids,
    }),
    onSuccess: () => {
      toast.success('Vendor added — add their certificate of insurance to unblock dispatch')
      setForm({ code: '', name: '', vendor_type: 'service_contractor', phone: '', after_hours_phone: '', email: '', discipline_ids: [] })
      onCreated()
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Could not add vendor'),
  })

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" PaperProps={{ sx: { borderRadius: '20px' } }}>
      <DialogTitle sx={{ fontWeight: 900, color: INK }}>Add vendor</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField size="small" label="Code" fullWidth required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          <TextField size="small" label="Name" fullWidth required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <TextField
            select size="small" label="Type" fullWidth value={form.vendor_type}
            onChange={(e) => setForm({ ...form, vendor_type: e.target.value })}
          >
            {(meta?.vendor_types || []).map((option: any) => (
              <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
            ))}
          </TextField>
          <TextField
            select size="small" label="Trades" fullWidth
            SelectProps={{ multiple: true, value: form.discipline_ids }}
            value={form.discipline_ids}
            onChange={(e) => setForm({ ...form, discipline_ids: e.target.value as unknown as number[] })}
          >
            {disciplines.map((discipline) => (
              <MenuItem key={discipline.id} value={discipline.id}>{discipline.name}</MenuItem>
            ))}
          </TextField>
          <TextField size="small" label="Phone" fullWidth value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <TextField
            size="small" label="After-hours phone" fullWidth value={form.after_hours_phone}
            onChange={(e) => setForm({ ...form, after_hours_phone: e.target.value })}
            helperText="At 02:00 the main line is not the useful number"
          />
          <TextField size="small" label="Email" fullWidth value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} sx={{ fontWeight: 800, color: palette.textMuted }}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!form.code.trim() || !form.name.trim() || mutation.isPending}
          onClick={() => mutation.mutate()}
          sx={{ background: palette.gradientBrand, borderRadius: '10px', fontWeight: 900, px: 2.5 }}
        >
          Add
        </Button>
      </DialogActions>
    </Dialog>
  )
}
