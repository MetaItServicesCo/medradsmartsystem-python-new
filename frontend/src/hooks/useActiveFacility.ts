/**
 * Which hospital you are working in.
 *
 * Every site is its own world: you choose one at login and everything from
 * that point — buildings, rooms, fixtures, assets, work orders — is that
 * site's. So this deliberately does not guess.
 *
 * An earlier version fell back to the user's own facility and then to the only
 * one that existed, which made the Sites screen unreachable: something was
 * always selected, so the page whose whole purpose is choosing could never be
 * the page you landed on.
 *
 * `facilityId` is therefore undefined until somebody picks, and that is a real
 * state — `RequireSite` in App.tsx checks for it and sends you to Sites.
 */
import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { fetchFacilities, type Facility } from '@/api/facilities'

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
  const stored = useFacilityStore((s) => s.facilityId)
  const setFacilityId = useFacilityStore((s) => s.setFacilityId)

  const { data, isLoading } = useQuery({
    queryKey: ['facilities', 'active-context'],
    queryFn: () => fetchFacilities({ limit: 200 }),
    staleTime: 5 * 60_000,
  })

  const facilities = useMemo(() => (data?.items ?? []) as Facility[], [data])

  const resolved = useMemo(() => {
    if (!facilities.length || stored == null) return undefined
    // A remembered choice only counts while it still exists. A facility can be
    // renamed or removed between sessions, and a stale id silently filters
    // every list to nothing — which reads as "no data" rather than as an error.
    return facilities.find((f) => f.id === stored)
  }, [facilities, stored])

  // Drop a remembered id that no longer resolves, so the guard sends the user
  // back to Sites rather than leaving every screen mysteriously empty.
  useEffect(() => {
    if (stored != null && facilities.length && !resolved) setFacilityId(null)
  }, [stored, facilities.length, resolved, setFacilityId])

  return {
    facilityId: resolved?.id,
    facility: resolved,
    facilities,
    isSingleSite: facilities.length <= 1,
    isLoading,
    setFacility: setFacilityId,
  }
}
