/**
 * The hospital you are working in, resolved once and then left alone.
 *
 * The system this grew out of was built for a contractor: one company, many
 * client sites, so every screen reasonably began by asking which site you
 * meant. A hospital's own system has one site. Asking on every screen is not a
 * small annoyance there — it makes the building feel like somebody else's.
 *
 * So the facility becomes ambient. It resolves in this order:
 *
 *   1. whatever you last chose, if it still exists
 *   2. the facility your user account belongs to
 *   3. the only one there is
 *
 * and a picker appears at all only when more than one site exists. A
 * single-site install never sees it.
 */
import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { fetchFacilities, type Facility } from '@/api/facilities'
import { useAuthStore } from '@/stores/authStore'

interface FacilityState {
  facilityId: number | null
  setFacilityId: (id: number | null) => void
}

export const useFacilityStore = create<FacilityState>()(
  persist(
    (set) => ({
      facilityId: null,
      setFacilityId: (facilityId) => set({ facilityId }),
    }),
    { name: 'phealth-active-facility' },
  ),
)

export interface ActiveFacility {
  /** Undefined only while the list is still loading. */
  facilityId: number | undefined
  facility: Facility | undefined
  facilities: Facility[]
  /** True when a picker would be pointless — hide it. */
  isSingleSite: boolean
  isLoading: boolean
  setFacility: (id: number) => void
}

export function useActiveFacility(): ActiveFacility {
  const user = useAuthStore((s) => s.user)
  const stored = useFacilityStore((s) => s.facilityId)
  const setFacilityId = useFacilityStore((s) => s.setFacilityId)

  const { data, isLoading } = useQuery({
    queryKey: ['facilities', 'active-context'],
    queryFn: () => fetchFacilities({ limit: 200 }),
    staleTime: 5 * 60_000,
  })

  const facilities = useMemo(() => (data?.items ?? []) as Facility[], [data])

  const resolved = useMemo(() => {
    if (!facilities.length) return undefined
    // A remembered choice only counts while it still exists. A facility can be
    // renamed or removed between sessions, and a stale id silently filters
    // every list to nothing — which reads as "no data" rather than as an error.
    const remembered = facilities.find((f) => f.id === stored)
    if (remembered) return remembered
    const own = facilities.find((f) => f.id === user?.facility_id)
    if (own) return own
    return facilities[0]
  }, [facilities, stored, user?.facility_id])

  // Write the resolution back so the rest of the app reads one value rather
  // than each screen re-deriving it and disagreeing at the edges.
  useEffect(() => {
    if (resolved && resolved.id !== stored) setFacilityId(resolved.id)
  }, [resolved, stored, setFacilityId])

  return {
    facilityId: resolved?.id,
    facility: resolved,
    facilities,
    isSingleSite: facilities.length <= 1,
    isLoading,
    setFacility: setFacilityId,
  }
}
