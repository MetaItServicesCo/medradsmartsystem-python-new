/**
 * Regulatory schedules, their occurrences, and the certificates they produce.
 *
 * The header numbers are ordered by what somebody can still do something
 * about. "Past grace" leads because a monthly generator test missed by three
 * weeks is a gap in the record that cannot be filled retroactively, whereas
 * "overdue by two days" is a phone call.
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Box, Button, Card, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, MenuItem, Stack, Tab, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Tabs, TextField, Tooltip, Typography,
} from '@mui/material'
import AutorenewIcon from '@mui/icons-material/Autorenew'
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck'
import VerifiedIcon from '@mui/icons-material/Verified'
import { toast } from 'react-toastify'

import {
  completeTask, fetchComplianceMeta, fetchComplianceSummary, fetchExpiringCertificates,
  fetchPrograms, fetchTasks, generateTasks, seedPrograms, type ComplianceTask,
} from '@/api/compliance'
import { fetchFacilities } from '@/api/facilities'
import { hasPermission } from '@/config/permissions'
import { useAuthStore } from '@/stores/authStore'
import { palette } from '@/theme/palette'

const BRAND = palette.brand
const INK = palette.ink

const humanise = (v?: string | null) =>
  v ? v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—'

export default function CompliancePage() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()

  const [facilityId, setFacilityId] = useState<number | ''>('')
  const [tab, setTab] = useState(0)
  const [completing, setCompleting] = useState<ComplianceTask | null>(null)

  const canEdit = hasPermission(user, 'compliance', 'edit')
  const canAdmin = hasPermission(user, 'compliance', 'add')

  const { data: facilities } = useQuery({
    queryKey: ['facilities', 'for-compliance'],
    queryFn: () => fetchFacilities({ limit: 200 }),
  })
  const effectiveFacilityId = facilityId || facilities?.items?.[0]?.id || undefined

  const { data: meta } = useQuery({ queryKey: ['compliance-meta'], queryFn: fetchComplianceMeta })

  const { data: summary } = useQuery({
    queryKey: ['compliance-summary', effectiveFacilityId],
    queryFn: () => fetchComplianceSummary(effectiveFacilityId),
    enabled: !!effectiveFacilityId,
  })

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['compliance-tasks', effectiveFacilityId, tab],
    queryFn: () => fetchTasks({
      facility_id: effectiveFacilityId,
      overdue_only: tab === 1,
      due_within_days: tab === 0 ? 30 : undefined,
      limit: 300,
    }),
    enabled: !!effectiveFacilityId && tab < 2,
  })

  const { data: programs } = useQuery({
    queryKey: ['compliance-programs', effectiveFacilityId],
    queryFn: () => fetchPrograms({ facility_id: effectiveFacilityId }),
    enabled: !!effectiveFacilityId && tab === 2,
  })

  const { data: certificates } = useQuery({
    queryKey: ['expiring-certificates', effectiveFacilityId],
    queryFn: () => fetchExpiringCertificates({ facility_id: effectiveFacilityId, horizon_days: 90 }),
    enabled: !!effectiveFacilityId && tab === 3,
  })

  const seedMutation = useMutation({
    mutationFn: () => seedPrograms(effectiveFacilityId as number),
    onSuccess: (res) => {
      toast.success(
        res.created
          ? `${res.created} standard programs added`
          : 'All standard programs are already present',
      )
      queryClient.invalidateQueries({ queryKey: ['compliance-programs'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Could not seed programs'),
  })

  const generateMutation = useMutation({
    mutationFn: () => generateTasks({ facility_id: effectiveFacilityId, horizon_days: 30 }),
    onSuccess: (res) => {
      toast.success(
        res.created
          ? `${res.created} tasks scheduled`
          : 'Nothing new to schedule — everything due is already open',
      )
      queryClient.invalidateQueries({ queryKey: ['compliance-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['compliance-summary'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Could not generate tasks'),
  })

  const stats = [
    { label: 'Past grace', value: summary?.past_grace ?? 0, accent: palette.danger,
      hint: 'Too late to satisfy — a gap in the record that cannot be filled retroactively' },
    { label: 'Overdue', value: summary?.overdue ?? 0, accent: '#C2410C',
      hint: 'Late, but still inside tolerance' },
    { label: 'Due in 14 days', value: summary?.due_within_14_days ?? 0, accent: palette.info, hint: '' },
    { label: 'Expired certificates', value: summary?.expired_certificates ?? 0, accent: palette.danger,
      hint: 'A certificate can lapse while the next inspection is already booked' },
    { label: 'Failures (12 mo)', value: summary?.failures_last_12_months ?? 0, accent: palette.brandDeep, hint: '' },
  ]

  return (
    <Box className="page-enter" sx={{ width: '100%', minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: { xs: 'stretch', sm: 'center' }, justifyContent: 'space-between', gap: 1.5, mb: 2.5, flexDirection: { xs: 'column', sm: 'row' } }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h4" sx={{ fontWeight: 900, color: INK }}>Compliance</Typography>
          <Typography sx={{ color: palette.textMuted, fontWeight: 700 }}>
            Regulatory schedules and the certificates that prove they were met
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
          {canEdit && (
            <Button
              variant="contained" startIcon={<AutorenewIcon />}
              disabled={!effectiveFacilityId || generateMutation.isPending}
              onClick={() => generateMutation.mutate()}
              sx={{ minHeight: 40, background: palette.gradientBrand, borderRadius: '10px', px: 2.25, fontWeight: 900, whiteSpace: 'nowrap' }}
            >
              Generate due tasks
            </Button>
          )}
        </Stack>
      </Box>

      <Card sx={{ borderRadius: '22px', border: `1px solid ${palette.brandBorder}`, boxShadow: palette.shadowCard, mb: 2, overflow: 'hidden' }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, 1fr)' } }}>
          {stats.map((stat, index) => (
            <Tooltip key={stat.label} title={stat.hint} placement="bottom">
              <Box sx={{ p: 2, borderRight: { md: index < 4 ? `1px solid ${palette.surfaceMuted}` : 'none' }, borderBottom: { xs: `1px solid ${palette.surfaceMuted}`, md: 'none' } }}>
                <Typography sx={{ fontSize: 11, fontWeight: 800, color: palette.textFaint, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  {stat.label}
                </Typography>
                <Typography sx={{ fontWeight: 900, fontSize: 27, color: stat.accent, lineHeight: 1.2 }}>
                  {stat.value}
                </Typography>
              </Box>
            </Tooltip>
          ))}
        </Box>
      </Card>

      {!!summary?.past_grace && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: '14px', fontWeight: 700 }}>
          {summary.past_grace} task{summary.past_grace > 1 ? 's are' : ' is'} past the point where
          doing them late still counts. These cannot be satisfied retroactively — record what
          happened and treat them as findings.
        </Alert>
      )}

      <Card sx={{ overflow: 'hidden', borderRadius: '22px', border: `1px solid ${palette.brandBorder}`, boxShadow: palette.shadowCard }}>
        <Tabs
          value={tab} onChange={(_, v) => setTab(v)}
          sx={{ px: 2, borderBottom: `1px solid ${palette.borderSoft}`, '& .MuiTab-root': { fontWeight: 800, textTransform: 'none' }, '& .Mui-selected': { color: `${BRAND} !important` }, '& .MuiTabs-indicator': { backgroundColor: BRAND } }}
        >
          <Tab label="Due soon" />
          <Tab label="Overdue" />
          <Tab label="Programs" />
          <Tab label="Certificates" />
        </Tabs>

        {tab < 2 && (
          <TableContainer sx={{ maxHeight: 560 }}>
            <Table stickyHeader size="small" sx={{ '& .MuiTableCell-root': { py: 1.15 } }}>
              <TableHead>
                <TableRow>
                  {['Program', 'Authority', 'Subject', 'Due', 'Status', ''].map((h) => (
                    <TableCell key={h} sx={{ fontWeight: 900, color: palette.textSubtle, fontSize: 12, backgroundColor: '#FCFCFD' }}>
                      {h}
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
                {!isLoading && !(tasks?.items || []).length && (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 5, color: palette.textFaint, fontWeight: 700 }}>
                      {tab === 1 ? 'Nothing overdue.' : 'Nothing due in the next 30 days.'}
                    </TableCell>
                  </TableRow>
                )}
                {(tasks?.items || []).map((task) => (
                  <TableRow key={task.id} hover>
                    <TableCell>
                      <Typography sx={{ fontWeight: 900, color: INK, fontSize: 13 }}>
                        {task.program_name}
                      </Typography>
                      {task.citation && (
                        <Typography sx={{ fontSize: 11, color: palette.textFaint }}>{task.citation}</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={(task.authority || '').toUpperCase()} size="small"
                        sx={{ height: 21, fontWeight: 800, fontSize: 10, borderRadius: '6px', backgroundColor: palette.brandTint, color: palette.brandDeep }}
                      />
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: palette.slate600, fontWeight: 700 }}>
                      {task.equipment_tag || task.location_code || '—'}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: palette.slate600, fontWeight: 800 }}>
                      {task.due_date}
                    </TableCell>
                    <TableCell>
                      {task.is_past_grace ? (
                        <Tooltip title="Past the point where doing it late still counts">
                          <Chip
                            label={`${task.days_overdue}d past grace`} size="small"
                            sx={{ height: 22, fontWeight: 800, fontSize: 10, borderRadius: '7px', backgroundColor: palette.dangerTint, color: palette.danger }}
                          />
                        </Tooltip>
                      ) : task.is_overdue ? (
                        <Chip
                          label={`${task.days_overdue}d late`} size="small"
                          sx={{ height: 22, fontWeight: 800, fontSize: 10, borderRadius: '7px', backgroundColor: palette.warningTint, color: palette.warning }}
                        />
                      ) : (
                        <Chip
                          label="Scheduled" size="small"
                          sx={{ height: 22, fontWeight: 800, fontSize: 10, borderRadius: '7px', backgroundColor: palette.infoTint, color: palette.info }}
                        />
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {canEdit && (
                        <Button
                          size="small" startIcon={<PlaylistAddCheckIcon sx={{ fontSize: 16 }} />}
                          onClick={() => setCompleting(task)}
                          sx={{ fontWeight: 800, color: BRAND, textTransform: 'none' }}
                        >
                          Record
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {tab === 2 && (
          <Box>
            {!(programs?.items || []).length && (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <Typography sx={{ fontWeight: 900, color: INK, mb: 0.5 }}>No programs yet</Typography>
                <Typography sx={{ fontSize: 13, color: palette.textMuted, mb: 2, maxWidth: 520, mx: 'auto' }}>
                  Seed the standard set — generator testing, fire pump, elevator inspection,
                  backflow, medical gas, ventilation. Every field stays editable, and the
                  authority having jurisdiction is always the authority.
                </Typography>
                {canAdmin && (
                  <Button
                    variant="contained" onClick={() => seedMutation.mutate()}
                    disabled={!effectiveFacilityId || seedMutation.isPending}
                    sx={{ background: palette.gradientBrand, borderRadius: '10px', fontWeight: 900, px: 2.5 }}
                  >
                    Seed standard programs
                  </Button>
                )}
              </Box>
            )}
            {!!(programs?.items || []).length && (
              <TableContainer sx={{ maxHeight: 560 }}>
                <Table stickyHeader size="small" sx={{ '& .MuiTableCell-root': { py: 1.15 } }}>
                  <TableHead>
                    <TableRow>
                      {['Program', 'Authority', 'Frequency', 'Applies to', 'Open', 'Overdue'].map((h) => (
                        <TableCell key={h} sx={{ fontWeight: 900, color: palette.textSubtle, fontSize: 12, backgroundColor: '#FCFCFD' }}>
                          {h}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(programs?.items || []).map((program) => (
                      <TableRow key={program.id} hover>
                        <TableCell>
                          <Stack direction="row" spacing={0.75} alignItems="center">
                            <Typography sx={{ fontWeight: 900, color: INK, fontSize: 13 }}>
                              {program.name}
                            </Typography>
                            {program.requires_certificate && (
                              <Tooltip title="Produces a certificate — cannot be ticked off">
                                <VerifiedIcon sx={{ fontSize: 15, color: palette.success }} />
                              </Tooltip>
                            )}
                          </Stack>
                          {program.citation && (
                            <Typography sx={{ fontSize: 11, color: palette.textFaint }}>{program.citation}</Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={program.authority.toUpperCase()} size="small"
                            sx={{ height: 21, fontWeight: 800, fontSize: 10, borderRadius: '6px', backgroundColor: palette.brandTint, color: palette.brandDeep }}
                          />
                        </TableCell>
                        <TableCell sx={{ fontSize: 12, fontWeight: 700, color: palette.slate600 }}>
                          {humanise(program.frequency)}
                        </TableCell>
                        <TableCell sx={{ fontSize: 12, fontWeight: 700, color: palette.slate600 }}>
                          {program.subject_count} item{program.subject_count === 1 ? '' : 's'}
                        </TableCell>
                        <TableCell sx={{ fontSize: 13, fontWeight: 900, color: INK }}>
                          {program.open_tasks}
                        </TableCell>
                        <TableCell sx={{ fontSize: 13, fontWeight: 900, color: program.overdue_tasks ? palette.danger : palette.textFaint }}>
                          {program.overdue_tasks}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        )}

        {tab === 3 && (
          <TableContainer sx={{ maxHeight: 560 }}>
            <Table stickyHeader size="small" sx={{ '& .MuiTableCell-root': { py: 1.15 } }}>
              <TableHead>
                <TableRow>
                  {['Certificate', 'Program', 'Subject', 'Issued by', 'Expires'].map((h) => (
                    <TableCell key={h} sx={{ fontWeight: 900, color: palette.textSubtle, fontSize: 12, backgroundColor: '#FCFCFD' }}>
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {!(certificates?.items || []).length && (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 5, color: palette.textFaint, fontWeight: 700 }}>
                      No certificates expiring in the next 90 days.
                    </TableCell>
                  </TableRow>
                )}
                {(certificates?.items || []).map((task) => (
                  <TableRow key={task.id} hover>
                    <TableCell sx={{ fontWeight: 900, color: INK, fontSize: 13 }}>
                      {task.certificate_number || '—'}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: palette.slate600, fontWeight: 700 }}>
                      {task.program_name}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: palette.slate600, fontWeight: 700 }}>
                      {task.equipment_tag || task.location_code || '—'}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: palette.slate600 }}>
                      {task.certificate_issued_by || '—'}
                      {task.inspector_license && (
                        <Typography sx={{ fontSize: 11, color: palette.textFaint }}>
                          Lic. {task.inspector_license}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, fontWeight: 800, color: palette.warning }}>
                      {task.certificate_expires_on}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>

      <CompleteTaskDialog
        task={completing} meta={meta}
        onClose={() => setCompleting(null)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['compliance-tasks'] })
          queryClient.invalidateQueries({ queryKey: ['compliance-summary'] })
          setCompleting(null)
        }}
      />
    </Box>
  )
}

function CompleteTaskDialog({ task, meta, onClose, onSaved }: {
  task: ComplianceTask | null
  meta: any
  onClose: () => void
  onSaved: () => void
}) {
  const [result, setResult] = useState('pass')
  const [findings, setFindings] = useState('')
  const [certificate, setCertificate] = useState({
    certificate_number: '', certificate_issued_by: '',
    inspector_license: '', certificate_expires_on: '',
  })

  const mutation = useMutation({
    mutationFn: () => completeTask(task!.id, {
      result,
      findings: findings || undefined,
      certificate: task?.requires_certificate ? {
        certificate_number: certificate.certificate_number || undefined,
        certificate_issued_by: certificate.certificate_issued_by || undefined,
        inspector_license: certificate.inspector_license || undefined,
        certificate_expires_on: certificate.certificate_expires_on || undefined,
      } : undefined,
    }),
    onSuccess: () => { toast.success('Recorded'); onSaved() },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Could not record the result'),
  })

  if (!task) return null
  // A failed inspection does not produce a certificate, so demanding one would
  // block recording the failure — which is the last thing you want.
  const needsCertificate = task.requires_certificate && result !== 'fail'

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" PaperProps={{ sx: { borderRadius: '20px' } }}>
      <DialogTitle sx={{ fontWeight: 900, color: INK }}>
        {task.program_name}
        <Typography sx={{ fontSize: 13, color: palette.textMuted, fontWeight: 600 }}>
          {task.equipment_tag || task.location_code} · due {task.due_date}
        </Typography>
      </DialogTitle>
      <DialogContent>
        {task.procedure && (
          <Alert severity="info" sx={{ mb: 2, borderRadius: '12px', fontSize: 13 }}>
            {task.procedure}
          </Alert>
        )}
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField
            select size="small" label="Result" fullWidth value={result}
            onChange={(e) => setResult(e.target.value)}
          >
            {(meta?.results || []).map((r: any) => (
              <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>
            ))}
          </TextField>

          <TextField
            size="small" label="Findings" fullWidth multiline rows={2}
            value={findings} onChange={(e) => setFindings(e.target.value)}
          />

          {needsCertificate && (
            <>
              <TextField
                size="small" label="Certificate number" fullWidth required
                value={certificate.certificate_number}
                onChange={(e) => setCertificate({ ...certificate, certificate_number: e.target.value })}
              />
              <TextField
                size="small" label="Issued by" fullWidth
                value={certificate.certificate_issued_by}
                onChange={(e) => setCertificate({ ...certificate, certificate_issued_by: e.target.value })}
              />
              {task.requires_licensed_provider && (
                <TextField
                  size="small" label="Inspector licence number" fullWidth required
                  value={certificate.inspector_license}
                  onChange={(e) => setCertificate({ ...certificate, inspector_license: e.target.value })}
                  helperText="A surveyor asks who signed and whether they were licensed that day"
                />
              )}
              <TextField
                size="small" label="Expires on" type="date" fullWidth
                InputLabelProps={{ shrink: true }}
                value={certificate.certificate_expires_on}
                onChange={(e) => setCertificate({ ...certificate, certificate_expires_on: e.target.value })}
              />
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} sx={{ fontWeight: 800, color: palette.textMuted }}>Cancel</Button>
        <Button
          variant="contained" disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
          sx={{ background: palette.gradientBrand, borderRadius: '10px', fontWeight: 900, px: 2.5 }}
        >
          Record
        </Button>
      </DialogActions>
    </Dialog>
  )
}
