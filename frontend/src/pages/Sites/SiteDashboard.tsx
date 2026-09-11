/**
 * One hospital's dashboard — what needs attention here, right now.
 *
 * Opening a site sets it as the working context, so every other screen is
 * already scoped by the time you leave this page. The ordering is deliberate:
 * things that are wrong come first, totals that only go up come last. A count
 * of rooms is context; three overdue compliance tasks is news.
 */
import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Box, Breadcrumbs, Button, CircularProgress, Link, Stack, Typography,
} from '@mui/material'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import { fetchFacility, fetchSiteOverview } from '@/api/facilities'
import { useFacilityStore } from '@/hooks/useActiveFacility'
import { palette } from '@/theme/palette'

export default function SiteDashboard() {
  const { id } = useParams()
  const siteId = Number(id)
  const navigate = useNavigate()
  const setFacilityId = useFacilityStore((s) => s.setFacilityId)

  // Arriving here by link or refresh has to set the context too, not only
  // arriving by clicking a card.
  useEffect(() => {
    if (siteId) setFacilityId(siteId)
  }, [siteId, setFacilityId])

  const { data: site } = useQuery({
    queryKey: ['facility', siteId],
    queryFn: () => fetchFacility(siteId),
    enabled: !!siteId,
  })
  const { data: overview, isLoading } = useQuery({
    queryKey: ['site-overview', siteId],
    queryFn: () => fetchSiteOverview(siteId),
    enabled: !!siteId,
  })

  if (isLoading || !overview) {
    return <Box sx={{ p: 8, textAlign: 'center' }}><CircularProgress size={28} /></Box>
  }

  const attention = [
    {
      label: 'Critical jobs open', value: overview.work.critical,
      hint: 'Raised against a critical space or asset and not yet closed.',
      to: '/service-requests', tone: 'danger' as const,
    },
    {
      label: 'Compliance overdue', value: overview.compliance.overdue,
      hint: 'Past its due date and grace period. This is what a surveyor asks for.',
      to: '/compliance', tone: 'danger' as const,
    },
    {
      label: 'Spaces unavailable', value: overview.spaces.unavailable,
      hint: 'Beds and theatres out of service or blocked right now.',
      to: '/spaces', tone: 'warning' as const,
    },
    {
      label: 'Fixtures faulty', value: overview.fixtures.faulty,
      hint: 'Sockets, lights and outlets reported broken and not yet fixed.',
      to: '/locations', tone: 'warning' as const,
    },
  ]

  const running = [
    { label: 'Open jobs', value: overview.work.open, to: '/service-requests' },
    { label: 'Due in 30 days', value: overview.compliance.due_within_30_days, to: '/compliance' },
    { label: 'Permits active', value: overview.permits.active, to: '/permits' },
    { label: 'High priority', value: overview.work.high, to: '/service-requests' },
  ]

  const estate = [
    { label: 'Buildings', value: overview.estate.buildings, to: '/locations' },
    { label: 'Floors', value: overview.estate.floors, to: '/locations' },
    { label: 'Rooms', value: overview.estate.rooms, to: '/locations' },
    { label: 'Beds', value: overview.estate.beds, to: '/spaces' },
    { label: 'Assets', value: overview.assets.total, to: '/assets' },
    { label: 'Fixtures', value: overview.fixtures.total, to: '/locations' },
  ]

  return (
    <Box className="page-enter" sx={{ width: '100%', minWidth: 0 }}>
      <Breadcrumbs sx={{ mb: 1 }}>
        <Link
          component="button" onClick={() => navigate('/sites')}
          sx={{ fontWeight: 800, fontSize: 13, color: palette.textMuted, textDecoration: 'none' }}
        >
          Sites
        </Link>
        <Typography sx={{ fontWeight: 800, fontSize: 13, color: palette.ink }}>
          {site?.name ?? '…'}
        </Typography>
      </Breadcrumbs>

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        sx={{ justifyContent: 'space-between', alignItems: { sm: 'flex-end' }, gap: 1.5, mb: 3 }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h4" sx={{ fontWeight: 900, color: palette.ink }}>
            {site?.name ?? 'Site'}
          </Typography>
          <Typography sx={{ color: palette.textMuted, fontWeight: 700 }}>
            {[site?.address, site?.city, site?.state].filter(Boolean).join(', ')}
          </Typography>
        </Box>
        <Typography sx={{ fontSize: 12.5, color: palette.textFaint, fontWeight: 700 }}>
          Everything else is now scoped to this site
        </Typography>
      </Stack>

      <Section title="Needs attention">
        <Box sx={{ display: 'grid', gap: 1.5,
                   gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' } }}>
          {attention.map((card) => (
            <AttentionTile key={card.label} {...card} onClick={() => navigate(card.to)} />
          ))}
        </Box>
      </Section>

      <Section title="In flight">
        <Box sx={{ display: 'grid', gap: 1.5,
                   gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' } }}>
          {running.map((card) => (
            <PlainTile key={card.label} {...card} onClick={() => navigate(card.to)} />
          ))}
        </Box>
      </Section>

      <Section title="The estate">
        <Box sx={{ display: 'grid', gap: 1.5,
                   gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(6, 1fr)' } }}>
          {estate.map((card) => (
            <PlainTile key={card.label} {...card} onClick={() => navigate(card.to)} />
          ))}
        </Box>
      </Section>

      <Stack direction="row" spacing={1.25} sx={{ mt: 3, flexWrap: 'wrap', gap: 1.25 }}>
        {[
          { label: 'Buildings & rooms', to: '/locations' },
          { label: 'Asset register', to: '/assets' },
          { label: 'Work orders', to: '/service-requests' },
          { label: 'Compliance', to: '/compliance' },
        ].map((link) => (
          <Button
            key={link.to} size="small" variant="outlined" endIcon={<ArrowForwardIcon />}
            onClick={() => navigate(link.to)}
            sx={{ fontWeight: 800, borderRadius: '10px', color: palette.brand,
                  borderColor: palette.brandBorder }}
          >
            {link.label}
          </Button>
        ))}
      </Stack>
    </Box>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box sx={{ mb: 3 }}>
      <Typography sx={{ mb: 1.25, fontSize: 12, fontWeight: 900, letterSpacing: 0.5,
                        textTransform: 'uppercase', color: palette.textSubtle }}>
        {title}
      </Typography>
      {children}
    </Box>
  )
}

function AttentionTile({ label, value, hint, tone, onClick }: {
  label: string
  value: number
  hint: string
  tone: 'danger' | 'warning'
  onClick: () => void
}) {
  // Zero is the good answer here, so it is shown calmly rather than in red.
  const quiet = value === 0
  const colour = tone === 'danger' ? palette.danger : palette.warningDeep
  const wash = tone === 'danger' ? palette.dangerWash : palette.warningWash

  return (
    <Box
      onClick={onClick}
      sx={{
        p: 1.75, borderRadius: '16px', cursor: 'pointer',
        bgcolor: quiet ? palette.surfaceFaint : wash,
        border: `1px solid ${quiet ? palette.surfaceMuted : colour}22`,
        '&:hover': { borderColor: quiet ? palette.borderSoft : colour },
      }}
    >
      <Typography sx={{ fontSize: 28, fontWeight: 900, lineHeight: 1.1,
                        color: quiet ? palette.textFaint : colour }}>
        {value}
      </Typography>
      <Typography sx={{ fontSize: 12.5, fontWeight: 800, color: palette.ink }}>
        {label}
      </Typography>
      <Typography sx={{ mt: 0.25, fontSize: 11, color: palette.textFaint, lineHeight: 1.35 }}>
        {hint}
      </Typography>
    </Box>
  )
}

function PlainTile({ label, value, onClick }: {
  label: string
  value: number
  onClick: () => void
}) {
  return (
    <Box
      onClick={onClick}
      sx={{
        p: 1.5, borderRadius: '14px', cursor: 'pointer', bgcolor: palette.white,
        border: `1px solid ${palette.borderSoft}`,
        '&:hover': { borderColor: palette.brandBorder, bgcolor: palette.brandTint },
      }}
    >
      <Typography sx={{ fontSize: 20, fontWeight: 900, color: palette.ink, lineHeight: 1.2 }}>
        {value}
      </Typography>
      <Typography sx={{ fontSize: 10.5, fontWeight: 800, color: palette.textFaint,
                        textTransform: 'uppercase', letterSpacing: 0.3 }}>
        {label}
      </Typography>
    </Box>
  )
}
