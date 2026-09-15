import type { EquipmentItem } from '@/api/equipment'

/**
 * How an asset is named in a list: "Chair", "Chair · Herman Miller Aeron",
 * "Otis Gen2". A room item has a type and often no make or model yet; plant
 * has a make and model and no type.
 */
export function assetTitle(a: Partial<EquipmentItem>): string {
  const makeModel = [a.make, a.model].filter(Boolean).join(' ')
  // Equipment in the Facility Categories has a name people gave it.
  if (a.name) return [a.name, a.equipment_type, makeModel].filter(Boolean).join(' · ')
  return [a.type_label, makeModel].filter(Boolean).join(' · ') || '—'
}

/** Building · floor · spot, for equipment placed by typing rather than on the building tree. */
export function typedPlace(a: Partial<EquipmentItem>): string {
  return [a.building, a.floor, a.name ? a.location : null].filter(Boolean).join(' · ')
}
