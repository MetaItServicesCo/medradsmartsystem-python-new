/**
 * Policies and notices, as an employee sees them.
 *
 * HR could publish announcements before this page existed, but the only
 * screen that rendered them was the HR module, which employees have no
 * permission for -- so a notice was written to a table only its author could
 * read. This is the other end of that.
 *
 * Reads /hr/company/notices, which is gated on the company-policies module
 * rather than on hr, and which honours published_at and target_audience.
 */
import { useQuery } from '@tanstack/react-query'
import {
  Box, Chip, CircularProgress, Divider, Paper, Stack, Typography,
} from '@mui/material'
import PushPinIcon from '@mui/icons-material/PushPin'
import CampaignIcon from '@mui/icons-material/Campaign'

import { fetchCompanyNotices } from '@/api/hr'

const PRIORITY: Record<string, { label: string; color: 'default' | 'info' | 'warning' | 'error' }> = {
  low:    { label: 'Low',    color: 'default' },
  normal: { label: 'Notice', color: 'info' },
  high:   { label: 'High',   color: 'warning' },
  urgent: { label: 'Urgent', color: 'error' },
}

/** Timestamps arrive as naive UTC; mark them so the browser localises them. */
const asUtc = (value: string) =>
  /[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`

const published = (value?: string | null) => {
  if (!value) return ''
  return new Date(asUtc(value)).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

const CompanyNotices = () => {
  const { data = [], isLoading, isError, error } = useQuery({
    queryKey: ['company-notices'],
    queryFn: () => fetchCompanyNotices(),
  })

  const notices: any[] = Array.isArray(data) ? data : (data as any)?.items ?? []

  return (
    <Box>
      <Typography variant="h5" fontWeight={800} gutterBottom>Policies &amp; Notices</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Announcements published by HR. Pinned items stay at the top.
      </Typography>

      {isError && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2, borderColor: '#DC2626', bgcolor: '#FEF2F2' }}>
          <Typography sx={{ fontWeight: 800, color: '#991B1B' }}>
            Notices could not be loaded.
          </Typography>
          <Typography variant="body2" sx={{ color: '#991B1B', mt: 0.5 }}>
            {(error as any)?.message || 'The request failed.'}
          </Typography>
        </Paper>
      )}

      {isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
      )}

      {!isLoading && !isError && !notices.length && (
        <Paper variant="outlined" sx={{ p: 5, textAlign: 'center' }}>
          <CampaignIcon sx={{ fontSize: 42, color: 'text.disabled' }} />
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            Nothing has been published for you yet.
          </Typography>
        </Paper>
      )}

      <Stack spacing={2}>
        {notices.map((notice: any) => {
          const priority = PRIORITY[notice.priority] ?? PRIORITY.normal
          return (
            <Paper
              key={notice.id}
              variant="outlined"
              sx={{
                p: 2.5,
                borderLeft: '4px solid',
                borderLeftColor: notice.is_pinned ? '#6366F1' : 'divider',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
                {notice.is_pinned && <PushPinIcon sx={{ fontSize: 16, color: '#6366F1' }} />}
                <Typography variant="h6" fontWeight={800} sx={{ flexGrow: 1 }}>
                  {notice.title}
                </Typography>
                <Chip label={priority.label} size="small" color={priority.color} variant="outlined" />
              </Box>

              <Typography variant="caption" color="text.secondary">
                {notice.author?.full_name ? `${notice.author.full_name} · ` : ''}
                {published(notice.published_at || notice.created_at)}
              </Typography>

              <Divider sx={{ my: 1.5 }} />

              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                {notice.content}
              </Typography>

              {notice.expires_at && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
                  Applies until {published(notice.expires_at)}
                </Typography>
              )}
            </Paper>
          )
        })}
      </Stack>
    </Box>
  )
}

export default CompanyNotices
