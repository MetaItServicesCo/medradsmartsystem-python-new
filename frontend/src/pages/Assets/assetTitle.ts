import type { EquipmentItem } from '@/api/equipment'

/**
 * How an asset is named in a list: "Chair", "Chair · Herman Miller Aeron",
 * "Otis Gen2". A room item has a type and often no make or model yet; plant
 * has a make and model and no type.
 */
export function assetTitle(a: Partial<EquipmentItem>): string {
  const makeModel = [a.make, a.model].filter(Boolean).join(' ')
  return [a.type_label, makeModel].filter(Boolean).join(' · ') || '—'
}
