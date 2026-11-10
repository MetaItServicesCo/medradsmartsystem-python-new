/**
 * Choosing an asset's type from the modality list.
 *
 * Once the current list is in place, the modalities there before are the old
 * list: kept on the assets that use them, not offered for new assets. A new
 * asset is given a modality and, where it has them, a sub-modality from the
 * current list, in alphabetical order, and gets the inspection form its
 * sub-modality (or else modality) gives. An asset being edited that is on an
 * old modality keeps that modality on offer, marked "(old list)".
 *
 * Until the current list is in place nothing is marked old, and every choice
 * is offered exactly as before.
 */

export interface ListModality {
  id: number
  name: string
  parent_id?: number | null
  description?: string | null
  is_legacy?: boolean
  inspection_form_id?: number | null
  inspection_form_name?: string | null
  inspection_form_hidden?: boolean
  children?: ListModality[]
}

export const OLD_LIST_LABEL = '(old list)'

/** Whether the current list is in place, i.e. there is an old list. */
export const hasOldList = (roots: readonly ListModality[]): boolean =>
  roots.some(root => root.is_legacy || (root.children || []).some(child => child.is_legacy))

/** Whether choosing this modality gives a form: it is on the current list. */
export const onCurrentList = (roots: readonly ListModality[], modality: ListModality | null | undefined): boolean =>
  Boolean(modality) && hasOldList(roots) && !modality!.is_legacy

const byName = (a: ListModality, b: ListModality) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })

/**
 * The modalities offered for an asset. With the current list in place: the
 * current list, alphabetically, and the old modality of the asset being
 * edited, if it has one. Otherwise everything, as before.
 */
export function modalityChoices(roots: readonly ListModality[], keepId?: number | null): ListModality[] {
  if (!hasOldList(roots)) return [...roots]
  const current = roots.filter(root => !root.is_legacy).sort(byName)
  const kept = keepId ? roots.find(root => root.id === keepId && root.is_legacy) : undefined
  return kept ? [...current, kept] : current
}

/** The label a modality is offered with: an old one says so. */
export const choiceLabel = (roots: readonly ListModality[], modality: ListModality): string =>
  hasOldList(roots) && modality.is_legacy ? `${modality.name} ${OLD_LIST_LABEL}` : modality.name

/** A modality's sub-modalities: alphabetically on the current list, as before on the old one. */
export function subModalityChoices(roots: readonly ListModality[], parent: ListModality | null | undefined): ListModality[] {
  const children = [...(parent?.children || [])]
  return onCurrentList(roots, parent) ? children.sort(byName) : children
}

export interface DefaultForm {
  id: number
  name: string
  /** The type it comes from, for "Default for Patient Beds". */
  from: string
}

/**
 * The form a new asset of this type gets: the sub-modality's, or else its
 * modality's; never a hidden one. Only the current list gives forms.
 */
export function defaultFormFor(
  roots: readonly ListModality[],
  parent: ListModality | null | undefined,
  sub: ListModality | null | undefined,
): DefaultForm | null {
  if (!onCurrentList(roots, parent)) return null
  for (const type of [sub, parent]) {
    if (type && type.inspection_form_id && !type.inspection_form_hidden) {
      return { id: type.inspection_form_id, name: type.inspection_form_name || 'Inspection form', from: type.name }
    }
  }
  return null
}

/** The modality an asset's type is under: itself when it is a modality, or its parent. */
export function parentOf(roots: readonly ListModality[], modalityId: number | null | undefined): ListModality | undefined {
  if (!modalityId) return undefined
  return roots.find(root => root.id === modalityId)
    || roots.find(root => (root.children || []).some(child => child.id === modalityId))
}
