/**
 * Permits to work.
 *
 * The screen's job is to make the consequence visible before somebody commits
 * to it. Choosing Type C work in an ICU should show "Class IV, three
 * signatures, anteroom required" while they are still choosing — not a day
 * later when the approvals do not arrive.
 */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Box, Button, Card, Checkbox, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, FormControlLabel, MenuItem, Stack, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip,
  Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn'
import GppMaybeIcon from '@mui/icons-material/GppMaybe'
import LockIcon from '@mui/icons-material/Lock'
import { toast } from 'react-toastify'

import { fetchFacilities } from '@/api/facilities'
import { fetchLocations } from '@/api/locations'
import {
  cancelPermit, closePermit, createPermit, decidePermit, fetchIcraPreview,
  fetchPermitMeta, fetchPermits, submitPermit, type WorkPermitDetail,
} from '@/api/permits'
import { hasPermission } from '@/config/permissions'
import { useAuthStore } from '@/stores/authStore'
import { palette } from '@/theme/palette'

const BRAND = palette.brand
const INK = palette.ink

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  draft: { bg: palette.surfaceMuted, color: palette.slate600 },
  pending_approval: { bg: palette.warningTint, color: palette.warning },
  approved: { bg: palette.infoSoft, color: palette.info },
  active: { bg: palette.successTint, color: palette.success },
  closed: { bg: palette.surfaceMuted, color: palette.slate600 },
  rejected: { bg: palette.dangerTint, color: palette.danger },
  expired: { bg: palette.dangerTint, color: palette.danger },
  cancelled: { bg: palette.surfaceMuted, color: palette.textFaint },
}

const ICRA_STYLE: Record<string, { bg: string; color: string }> = {
  class_i: { bg: palette.successTint, color: palette.success },
  class_ii: { bg: palette.warningTint, color: palette.warning },
  class_iii: { bg: palette.warningPeach, color: '#C2410C' },
  class_iv: { bg: palette.dangerTint, color: palette.danger },
}

const humanise = (v?: string | null) =>
  v ? v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—'

export default function PermitsPage() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()

  const [facilityId, setFacilityId] = useState<number | ''>('')
  const [statusFilter, setStatusFilter] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [selected, setSelected] = useState<WorkPermitDetail | null>(null)

  const canEdit = hasPermission(user, 'permits', 'add')

  const { data: facilities } = useQuery({
    queryKey: ['facilities', 'for-permits'],
    queryFn: () => fetchFacilities({ limit: 200 }),
  })
  const effectiveFacilityId = facilityId || facilities?.items?.[0]?.id || undefined

  const { data: meta } = useQuery({ queryKey: ['permit-meta'], queryFn: fetchPermitMeta })

  const { data: permits, isLoading } = useQuery({
    queryKey: ['permits', effectiveFacilityId, statusFilter],
    queryFn: () => fetchPermits({
      facility_id: effectiveFacilityId,
      status: statusFilter || undefined,
      open_only: !statusFilter,
      limit: 200,
    }),
    enabled: !!effectiveFacilityId,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['permits'] })
    setSelected(null)
  }

  const awaiting = (permits?.items || []).filter((p) => p.status === 'pending_approval')

  return (
    <Box className="page-enter" sx={{ width: '100%', minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: { xs: 'stretch', sm: 'center' }, justifyContent: 'space-between', gap: 1.5, mb: 2.5, flexDirection: { xs: 'column', sm: 'row' } }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h4" sx={{ fontWeight: 900, color: INK }}>Permits to Work</Typography>
          <Typography sx={{ color: palette.textMuted, fontWeight: 700 }}>
            The approvals that must be in place before a tool comes out
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <TextField
            size="small" select label="Facility" value={effectiveFacilityId || ''}
            onChange={(e) => setFacilityId(Number(e.target.value))} sx={{ minWidth: 190 }}
          >
            {(facilities?.items || []).map((f: any) => (
              <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>
            ))}
          </TextField>
          <TextField
            size="small" select label="Status" value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)} sx={{ minWidth: 160 }}
          >
            <MenuItem value="">Open only</MenuItem>
            {(meta?.statuses || []).map((s) => (
              <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
            ))}
          </TextField>
          {canEdit && (
            <Button
              variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}
              disabled={!effectiveFacilityId}
              sx={{ minHeight: 40, background: palette.gradientBrand, borderRadius: '10px', px: 2.25, fontWeight: 900, whiteSpace: 'nowrap' }}
            >
              Raise permit
            </Button>
          )}
        </Stack>
      </Box>

      {!!awaiting.length && (
        <Alert severity="warning" icon={<GppMaybeIcon />} sx={{ mb: 2, borderRadius: '14px', fontWeight: 700 }}>
          {awaiting.length} permit{awaiting.length > 1 ? 's are' : ' is'} awaiting signatures.
          Work on {awaiting.length > 1 ? 'those jobs' : 'that job'} cannot start until they are in.
        </Alert>
      )}

      <Card sx={{ overflow: 'hidden', borderRadius: '22px', border: `1px solid ${palette.brandBorder}`, boxShadow: palette.shadowCard }}>
        <TableContainer sx={{ maxHeight: 620 }}>
          <Table stickyHeader size="small" sx={{ '& .MuiTableCell-root': { py: 1.15 } }}>
            <TableHead>
              <TableRow>
                {['Permit', 'Type', 'Scope', 'Class', 'Status', 'Awaiting', ''].map((h) => (
                  <TableCell key={h} sx={{ fontWeight: 900, color: palette.textSubtle, fontSize: 12, backgroundColor: '#FCFCFD' }}>
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 5 }}>
                    <CircularProgress size={20} thickness={5} sx={{ color: BRAND }} />
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && !(permits?.items || []).length && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 5, color: palette.textFaint, fontWeight: 700 }}>
                    No open permits.
                  </TableCell>
                </TableRow>
              )}
              {(permits?.items || []).map((permit) => {
                const style = STATUS_STYLE[permit.status] || STATUS_STYLE.draft
                const icra = permit.icra_class ? ICRA_STYLE[permit.icra_class] : null
                return (
                  <TableRow key={permit.id} hover>
                    <TableCell>
                      <Typography sx={{ fontWeight: 900, color: INK, fontSize: 13 }}>
                        {permit.permit_number}
                      </Typography>
                      <Typography sx={{ fontSize: 12, color: palette.textFaint }}>{permit.title}</Typography>
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: palette.slate600, fontWeight: 700 }}>
                      {humanise(permit.permit_type)}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: palette.slate600, fontWeight: 700 }}>
                      {permit.location_code || permit.work_order_number || '—'}
                    </TableCell>
                    <TableCell>
                      {icra ? (
                        <Chip
                          label={humanise(permit.icra_class)} size="small"
                          sx={{ height: 22, fontWeight: 800, fontSize: 11, borderRadius: '7px', backgroundColor: icra.bg, color: icra.color }}
                        />
                      ) : '—'}
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Chip
                          label={humanise(permit.status)} size="small"
                          sx={{ height: 22, fontWeight: 800, fontSize: 11, borderRadius: '7px', backgroundColor: style.bg, color: style.color }}
                        />
                        {permit.status === 'approved' && !permit.is_authorising && (
                          <Tooltip title="Approved, but outside its validity window — it authorises nothing right now">
                            <GppMaybeIcon sx={{ fontSize: 16, color: palette.warning }} />
                          </Tooltip>
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell sx={{ fontSize: 11, color: palette.warning, fontWeight: 800 }}>
                      {permit.outstanding_approvals.map(humanise).join(', ') || '—'}
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small" onClick={() => setSelected(permit)}
                        sx={{ fontWeight: 800, color: BRAND, textTransform: 'none' }}
                      >
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <PermitDialog
        permit={selected} meta={meta} canEdit={canEdit}
        onClose={() => setSelected(null)} onChanged={invalidate}
      />

      <RaisePermitDialog
        open={addOpen} onClose={() => setAddOpen(false)}
        facilityId={effectiveFacilityId} meta={meta}
        onCreated={() => { queryClient.invalidateQueries({ queryKey: ['permits'] }); setAddOpen(false) }}
      />
    </Box>
  )
}

function PermitDialog({ permit, meta, canEdit, onClose, onChanged }: {
  permit: WorkPermitDetail | null
  meta: any
  canEdit: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const [role, setRole] = useState('')
  const [conditions, setConditions] = useState('')
  const [reason, setReason] = useState('')
  const [controlsRemoved, setControlsRemoved] = useState(false)

  const submitMutation = useMutation({
    mutationFn: () => submitPermit(permit!.id),
    onSuccess: () => { toast.success('Submitted for approval'); onChanged() },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Could not submit'),
  })

  const decideMutation = useMutation({
    mutationFn: (approved: boolean) => decidePermit(permit!.id, {
      role, approved, conditions: conditions || undefined, reason: reason || undefined,
    }),
    onSuccess: () => { toast.success('Decision recorded'); setRole(''); setConditions(''); setReason(''); onChanged() },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Could not record the decision'),
  })

  const closeMutation = useMutation({
    mutationFn: () => closePermit(permit!.id, { controls_removed: controlsRemoved }),
    onSuccess: () => { toast.success('Permit closed'); onChanged() },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Could not close'),
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelPermit(permit!.id),
    onSuccess: () => { toast.success('Permit cancelled'); onChanged() },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Could not cancel'),
  })

  if (!permit) return null
  const pending = permit.approvals.filter((a) => a.status === 'pending')

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" PaperProps={{ sx: { borderRadius: '20px' } }}>
      <DialogTitle sx={{ fontWeight: 900, color: INK, pb: 1 }}>
        {permit.permit_number}
        <Typography sx={{ fontSize: 13, color: palette.textMuted, fontWeight: 600 }}>
          {permit.title} · {humanise(permit.permit_type)}
        </Typography>
      </DialogTitle>

      <DialogContent>
        {permit.icra_class && (
          <Alert
            severity={permit.icra_class === 'class_iv' ? 'error' : 'info'}
            sx={{ mb: 2, borderRadius: '12px' }}
          >
            <Typography sx={{ fontWeight: 900, mb: 0.5 }}>
              ICRA {humanise(permit.icra_class)}
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.25, fontSize: 13 }}>
              {(permit.required_precautions || []).map((p) => <li key={p}>{p}</li>)}
            </Box>
          </Alert>
        )}

        {!!permit.ilsm_measures?.length && (
          <Alert severity="warning" sx={{ mb: 2, borderRadius: '12px' }}>
            <Typography sx={{ fontWeight: 900, mb: 0.5 }}>Interim life safety measures</Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.25, fontSize: 13 }}>
              {permit.ilsm_measures.map((m) => <li key={m}>{m}</li>)}
            </Box>
          </Alert>
        )}

        {permit.affected_summary && (
          <Alert severity="error" sx={{ mb: 2, borderRadius: '12px', fontWeight: 700 }}>
            {permit.affected_summary}
          </Alert>
        )}

        <Typography sx={{ fontSize: 11, fontWeight: 900, color: palette.textFaint, textTransform: 'uppercase', letterSpacing: 0.4, mb: 1 }}>
          Approvals
        </Typography>
        <Stack spacing={0.75} sx={{ mb: 2 }}>
          {permit.approvals.length === 0 && (
            <Typography sx={{ fontSize: 13, color: palette.textFaint }}>
              Not yet submitted — no approvals requested.
            </Typography>
          )}
          {permit.approvals.map((approval) => (
            <Stack
              key={approval.id} direction="row" alignItems="center" spacing={1}
              sx={{ px: 1.25, py: 0.85, borderRadius: '10px', backgroundColor: '#FAFAFB', border: `1px solid ${palette.surfaceMuted}` }}
            >
              <Typography sx={{ fontWeight: 800, fontSize: 13, color: INK, flex: 1 }}>
                {humanise(approval.approver_role)}
              </Typography>
              {approval.approved_by_name && (
                <Typography sx={{ fontSize: 12, color: palette.textFaint }}>
                  {approval.approved_by_name}
                </Typography>
              )}
              <Chip
                label={humanise(approval.status)} size="small"
                sx={{
                  height: 21, fontWeight: 800, fontSize: 10, borderRadius: '6px',
                  backgroundColor: approval.status === 'approved' ? palette.successTint
                    : approval.status === 'rejected' ? palette.dangerTint : palette.warningTint,
                  color: approval.status === 'approved' ? palette.success
                    : approval.status === 'rejected' ? palette.danger : palette.warning,
                }}
              />
            </Stack>
          ))}
        </Stack>

        {canEdit && permit.status === 'pending_approval' && !!pending.length && (
          <>
            <Divider sx={{ mb: 2 }} />
            <Typography sx={{ fontSize: 11, fontWeight: 900, color: palette.textFaint, textTransform: 'uppercase', letterSpacing: 0.4, mb: 1 }}>
              Record a decision
            </Typography>
            <Stack spacing={1.5}>
              <TextField
                select size="small" label="Signing as" fullWidth value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                {pending.map((a) => (
                  <MenuItem key={a.id} value={a.approver_role}>{humanise(a.approver_role)}</MenuItem>
                ))}
              </TextField>
              <TextField
                size="small" label="Conditions (optional)" fullWidth value={conditions}
                onChange={(e) => setConditions(e.target.value)}
              />
              <TextField
                size="small" label="Reason (required to reject)" fullWidth value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <Stack direction="row" spacing={1}>
                <Button
                  variant="contained" size="small" disabled={!role || decideMutation.isPending}
                  onClick={() => decideMutation.mutate(true)}
                  sx={{ fontWeight: 900, borderRadius: '10px', backgroundColor: palette.successStrong }}
                >
                  Approve
                </Button>
                <Button
                  variant="outlined" color="error" size="small"
                  disabled={!role || !reason || decideMutation.isPending}
                  onClick={() => decideMutation.mutate(false)}
                  sx={{ fontWeight: 900, borderRadius: '10px' }}
                >
                  Reject
                </Button>
              </Stack>
            </Stack>
          </>
        )}

        {canEdit && ['approved', 'active'].includes(permit.status) && (
          <>
            <Divider sx={{ my: 2 }} />
            <FormControlLabel
              control={
                <Checkbox
                  checked={controlsRemoved}
                  onChange={(e) => setControlsRemoved(e.target.checked)}
                  sx={{ color: BRAND, '&.Mui-checked': { color: BRAND } }}
                />
              }
              label={
                <Typography sx={{ fontSize: 13, fontWeight: 700 }}>
                  Barriers down, locks off, impaired systems restored
                </Typography>
              }
            />
            <Button
              fullWidth variant="contained" startIcon={<AssignmentTurnedInIcon />}
              disabled={!controlsRemoved || closeMutation.isPending}
              onClick={() => closeMutation.mutate()}
              sx={{ mt: 1, fontWeight: 900, borderRadius: '10px', background: palette.gradientBrand }}
            >
              Close permit
            </Button>
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        {canEdit && ['draft', 'rejected'].includes(permit.status) && (
          <>
            <Button
              onClick={() => cancelMutation.mutate()}
              sx={{ fontWeight: 800, color: palette.textFaint }}
            >
              Cancel permit
            </Button>
            <Button
              variant="contained" disabled={submitMutation.isPending}
              onClick={() => submitMutation.mutate()}
              sx={{ background: palette.gradientBrand, borderRadius: '10px', fontWeight: 900, px: 2.5 }}
            >
              Submit for approval
            </Button>
          </>
        )}
        <Button onClick={onClose} sx={{ fontWeight: 800, color: palette.textMuted }}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}

function RaisePermitDialog({ open, onClose, facilityId, meta, onCreated }: {
  open: boolean
  onClose: () => void
  facilityId?: number
  meta: any
  onCreated: () => void
}) {
  const [form, setForm] = useState({
    permit_type: 'icra',
    title: '',
    location_id: '' as number | '',
    construction_activity_type: 'type_b',
    impairs_fire_alarm: false,
    impairs_sprinkler: false,
    impairs_egress: false,
  })

  const { data: locations } = useQuery({
    queryKey: ['locations', 'for-permits', facilityId],
    queryFn: () => fetchLocations({ facility_id: facilityId, location_type: 'room', limit: 500 }),
    enabled: !!facilityId && open,
  })

  // The live assessment. Showing "Class IV, three signatures" while they are
  // still choosing is the entire point of this screen.
  const { data: preview } = useQuery({
    queryKey: ['icra-preview', form.construction_activity_type, form.location_id],
    queryFn: () => fetchIcraPreview({
      construction_activity_type: form.construction_activity_type,
      location_id: form.location_id ? Number(form.location_id) : undefined,
    }),
    enabled: open && form.permit_type === 'icra' && !!form.construction_activity_type,
  })

  const mutation = useMutation({
    mutationFn: () => createPermit({
      facility_id: facilityId as number,
      permit_type: form.permit_type,
      title: form.title.trim(),
      location_id: form.location_id ? Number(form.location_id) : null,
      construction_activity_type:
        form.permit_type === 'icra' ? form.construction_activity_type : null,
      impairs_fire_alarm: form.impairs_fire_alarm,
      impairs_sprinkler: form.impairs_sprinkler,
      impairs_egress: form.impairs_egress,
    }),
    onSuccess: () => { toast.success('Permit raised as a draft'); onCreated() },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Could not raise the permit'),
  })

  const icraStyle = preview ? ICRA_STYLE[preview.icra_class] : null

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" PaperProps={{ sx: { borderRadius: '20px' } }}>
      <DialogTitle sx={{ fontWeight: 900, color: INK }}>Raise a permit</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField
            select size="small" label="Permit type" fullWidth value={form.permit_type}
            onChange={(e) => setForm({ ...form, permit_type: e.target.value })}
          >
            {(meta?.permit_types || []).map((t: any) => (
              <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
            ))}
          </TextField>

          <TextField
            size="small" label="Title" fullWidth required value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />

          <TextField
            select size="small" label="Location" fullWidth value={form.location_id}
            onChange={(e) => setForm({ ...form, location_id: Number(e.target.value) })}
            helperText="Sets the patient risk group automatically"
          >
            <MenuItem value="">—</MenuItem>
            {(locations?.items || []).map((l) => (
              <MenuItem key={l.id} value={l.id}>
                {l.code}{l.name ? ` — ${l.name}` : ''}
              </MenuItem>
            ))}
          </TextField>

          {form.permit_type === 'icra' && (
            <>
              <TextField
                select size="small" label="Construction activity" fullWidth
                value={form.construction_activity_type}
                onChange={(e) => setForm({ ...form, construction_activity_type: e.target.value })}
              >
                {(meta?.construction_activity_types || []).map((t: any) => (
                  <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                ))}
              </TextField>

              {preview && icraStyle && (
                <Box sx={{ p: 1.75, borderRadius: '14px', backgroundColor: icraStyle.bg, border: `1px solid ${icraStyle.color}22` }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                    <Typography sx={{ fontWeight: 900, color: icraStyle.color }}>
                      {humanise(preview.icra_class)}
                    </Typography>
                    <Chip
                      label={humanise(preview.patient_risk_group)} size="small"
                      sx={{ height: 20, fontSize: 10, fontWeight: 800, borderRadius: '6px', backgroundColor: palette.white, color: icraStyle.color }}
                    />
                  </Stack>
                  <Typography sx={{ fontSize: 12, fontWeight: 800, color: icraStyle.color, mb: 0.5 }}>
                    Needs: {preview.required_approvals.map(humanise).join(', ')}
                  </Typography>
                  <Box component="ul" sx={{ m: 0, pl: 2.25, fontSize: 12, color: palette.slate600 }}>
                    {preview.required_precautions.slice(0, 4).map((p) => <li key={p}>{p}</li>)}
                    {preview.required_precautions.length > 4 && (
                      <li>…and {preview.required_precautions.length - 4} more</li>
                    )}
                  </Box>
                </Box>
              )}
            </>
          )}

          <Box>
            <Typography sx={{ fontSize: 11, fontWeight: 900, color: palette.textFaint, textTransform: 'uppercase', letterSpacing: 0.4, mb: 0.5 }}>
              Does the work impair
            </Typography>
            <Stack>
              {([
                ['impairs_fire_alarm', 'Fire alarm'],
                ['impairs_sprinkler', 'Sprinkler'],
                ['impairs_egress', 'Egress'],
              ] as const).map(([key, label]) => (
                <FormControlLabel
                  key={key}
                  control={
                    <Checkbox
                      size="small" checked={form[key]}
                      onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                      sx={{ color: BRAND, '&.Mui-checked': { color: BRAND } }}
                    />
                  }
                  label={<Typography sx={{ fontSize: 13 }}>{label}</Typography>}
                />
              ))}
            </Stack>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} sx={{ fontWeight: 800, color: palette.textMuted }}>Cancel</Button>
        <Button
          variant="contained" disabled={!form.title.trim() || !facilityId || mutation.isPending}
          onClick={() => mutation.mutate()}
          sx={{ background: palette.gradientBrand, borderRadius: '10px', fontWeight: 900, px: 2.5 }}
        >
          Raise
        </Button>
      </DialogActions>
    </Dialog>
  )
}
