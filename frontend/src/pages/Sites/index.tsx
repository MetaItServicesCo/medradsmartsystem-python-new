/**
 * The hospitals you run, and the way into one.
 *
 * This is the top of the system. You register Hospital A, click it, and land
 * on its dashboard with every other screen now scoped to it — which is the
 * order the work actually happens in, and was not expressed anywhere before.
 * "Facilities" was a management table of customer sites, inherited from a
 * contractor's product; picking a site was something you did again on every
 * screen rather than once at the start.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Box, Button, Chip, CircularProgress, InputAdornment, Stack, TextField,
  Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import ApartmentIcon from '@mui/icons-material/Apartment'
import SearchIcon from '@mui/icons-material/Search'
import { fetchFacilities, type Facility } from '@/api/facilities'
import { hasPermission } from '@/config/permissions'
import { useFacilityStore } from '@/hooks/useActiveFacility'
import { useAuthStore } from '@/stores/authStore'
import { palette } from '@/theme/palette'

export default function SitesPage() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const setFacilityId = useFacilityStore((s) => s.setFacilityId)
  const canAdd = hasPermission(user, 'facilities', 'add')
  const [search, setSearch] = useState('')
  // These roles see only the hospitals they are assigned to, so an empty
  // list means something different for them than for an administrator.
  const scopedToOwnSites = ['facility_admin', 'facility_manager', 'technician', 'client']
    .includes(String(user?.role ?? ''))

  const { data, isLoading } = useQuery({
    queryKey: ['facilities', 'sites'],
    queryFn: () => fetchFacilities({ limit: 200 }),
  })

  const sites = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const items = (data?.items ?? []) as Facility[]
    if (!needle) return items
    return items.filter((f) =>
      [f.name, f.city, f.state].some((v) => String(v ?? '').toLowerCase().includes(needle)))
  }, [data, search])

  /** Choosing a site is choosing the context every other screen works in. */
  const open = (id: number) => {
    setFacilityId(id)
    navigate(`/sites/${id}`)
  }

  return (
    <Box className="page-enter" sx={{ width: '100%', minWidth: 0 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, gap: 1.5, mb: 2.5 }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h4" sx={{ fontWeight: 900, color: palette.ink }}>Sites</Typography>
          <Typography sx={{ color: palette.textMuted, fontWeight: 700 }}>
            The hospitals you run. Open one to work in it.
          </Typography>
        </Box>
        {canAdd && (
          <Button
            variant="contained" startIcon={<AddIcon />}
            onClick={() => navigate('/facilities')}
            sx={{ fontWeight: 900, borderRadius: '12px', px: 2.5,
                  bgcolor: palette.brand, '&:hover': { bgcolor: palette.brandDeep } }}
          >
            Register a site
          </Button>
        )}
      </Stack>

      <TextField
        size="small" placeholder="Find a site…" value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{ mb: 2.5, maxWidth: 360, width: '100%' }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon sx={{ fontSize: 18, color: palette.textFaint }} />
            </InputAdornment>
          ),
        }}
      />

      {isLoading && <Box sx={{ p: 6, textAlign: 'center' }}><CircularProgress size={26} /></Box>}

      {!isLoading && !sites.length && (
        <Box sx={{ p: 6, textAlign: 'center', borderRadius: '18px',
                   border: `1px solid ${palette.borderSoft}`, bgcolor: palette.white }}>
          <Typography sx={{ fontWeight: 800, color: palette.textMuted }}>
            {data?.items?.length
              ? 'Nothing matches'
              : scopedToOwnSites
                ? 'You have not been assigned to a site'
                : 'No sites registered yet'}
          </Typography>
          <Typography sx={{ mt: 0.5, fontSize: 13, color: palette.textFaint, maxWidth: 440, mx: 'auto' }}>
            {data?.items?.length
              ? 'Try a different search.'
              : scopedToOwnSites
                // Without this, an unassigned technician sees an empty list and
                // reads it as "this hospital has no data" rather than "nobody
                // has given me access yet" — and reports the wrong problem.
                ? 'Your account only sees hospitals it is assigned to, and it has none yet. Ask an administrator to add you to a site.'
                : 'Register your first hospital. Everything else — buildings, rooms, fixtures, assets and work orders — hangs off a site.'}
          </Typography>
        </Box>
      )}

      <Box sx={{ display: 'grid', gap: 2,
                 gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' } }}>
        {sites.map((site) => (
          <SiteCard key={site.id} site={site} onOpen={() => open(site.id)} />
        ))}
      </Box>
    </Box>
  )
}

function SiteCard({ site, onOpen }: { site: Facility; onOpen: () => void }) {
  // Each card asks for its own numbers. A handful of small parallel requests
  // beats one endpoint that has to aggregate every site whether or not the
  // page shows them.
  const { data: overview } = useQuery({
    queryKey: ['site-overview', site.id],
    queryFn: async () => {
      const { fetchSiteOverview } = await import('@/api/facilities')
      return fetchSiteOverview(site.id)
    },
    staleTime: 60_000,
  })

  const attention = (overview?.work.critical ?? 0) + (overview?.compliance.overdue ?? 0)

  return (
    <Box
      onClick={onOpen}
      sx={{
        p: 2.25, borderRadius: '18px', cursor: 'pointer', bgcolor: palette.white,
        border: `1px solid ${palette.borderSoft}`, transition: 'all .16s ease',
        '&:hover': { borderColor: palette.brandBorder, transform: 'translateY(-2px)',
                     boxShadow: palette.shadowCard },
      }}
    >
      <Stack direction="row" alignItems="flex-start" spacing={1.25}>
        <Box sx={{ width: 42, height: 42, borderRadius: '13px', flexShrink: 0,
                   display: 'grid', placeItems: 'center',
                   bgcolor: palette.brandTint, color: palette.brand }}>
          <ApartmentIcon />
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography noWrap sx={{ fontWeight: 900, color: palette.ink, fontSize: 16 }}>
            {site.name}
          </Typography>
          <Typography noWrap sx={{ fontSize: 12.5, color: palette.textMuted, fontWeight: 600 }}>
            {[site.city, site.state].filter(Boolean).join(', ') || site.address}
          </Typography>
        </Box>
        {attention > 0 && (
          <Chip
            size="small" label={attention}
            sx={{ height: 22, minWidth: 22, fontWeight: 900, fontSize: 11,
                  bgcolor: palette.dangerTint, color: palette.danger }}
          />
        )}
      </Stack>

      <Box sx={{ mt: 2, display: 'grid', gap: 1, gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {[
          { label: 'Rooms', value: overview?.estate.rooms },
          { label: 'Beds', value: overview?.estate.beds },
          { label: 'Assets', value: overview?.assets.total },
          { label: 'Open jobs', value: overview?.work.open },
        ].map((stat) => (
          <Box key={stat.label}>
            <Typography sx={{ fontSize: 17, fontWeight: 900, color: palette.ink, lineHeight: 1.2 }}>
              {stat.value ?? '—'}
            </Typography>
            <Typography sx={{ fontSize: 10.5, fontWeight: 800, color: palette.textFaint,
                              textTransform: 'uppercase', letterSpacing: 0.3 }}>
              {stat.label}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
