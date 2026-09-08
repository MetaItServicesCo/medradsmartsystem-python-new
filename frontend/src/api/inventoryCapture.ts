import apiClient from './client'

/**
 * Capturing parts by photograph.
 *
 * A capture is not stock. It records that a thing exists and gives it a code;
 * it becomes an inventory part only when someone confirms it, which is why
 * nothing here touches the inventory endpoints.
 */

export interface PartDefinition {
  id: number
  name: string
  part_number: string | null
  part_type: string | null
  description: string | null
  make: string | null
  model: string | null
  unit_price: string | null
  gtin: string | null
  has_reference_photo: boolean
  /** How many physical units of this kind exist. */
  unit_count: number
  created_at: string | null
}

export interface MatchCandidate extends PartDefinition {
  /** Similarity to the photograph just taken, 0 to 1. */
  score: number
}

export interface MatchResult {
  candidates: MatchCandidate[]
  /**
   * Whether the best candidate stands out from the rest. Only ever means the
   * screen may pre-select it; a person still confirms.
   */
  confident: boolean
  /** False when the photograph could not be read at all. */
  readable: boolean
}

export interface CaptureUnit {
  id: number
  code: string
  status: 'draft' | 'confirmed' | 'discarded'
  label: string | null
  has_photo: boolean
  part_id: number | null
  created_at: string | null
}

export interface CaptureResult {
  definition: PartDefinition
  captured: CaptureUnit[]
}

/** Ask what kind of part this looks like. Writes nothing. */
export const matchPhoto = async (photo: Blob): Promise<MatchResult> => {
  const form = new FormData()
  form.append('photo', photo, 'capture.jpg')
  const res = await apiClient.post('/inventory-captures/match', form, {
    // The shared client sends JSON by default, which stops axios generating
    // the multipart boundary and leaves the server unable to read the upload.
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data as MatchResult
}

/**
 * Record a quantity of one kind of part.
 *
 * Pass `definitionId` when the kind is already known — that is what makes the
 * second and fortieth of something take one tap instead of a form.
 */
export const captureParts = async (opts: {
  photo?: Blob | null
  label?: string
  quantity: number
  definitionId?: number | null
  facilityId?: number | null
  notes?: string
}): Promise<CaptureResult> => {
  const form = new FormData()
  if (opts.photo) form.append('photo', opts.photo, 'capture.jpg')
  if (opts.label) form.append('label', opts.label)
  if (opts.notes) form.append('notes', opts.notes)
  if (opts.definitionId) form.append('definition_id', String(opts.definitionId))
  if (opts.facilityId) form.append('facility_id', String(opts.facilityId))
  form.append('quantity', String(opts.quantity))

  const res = await apiClient.post('/inventory-captures', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data as CaptureResult
}

export const listDefinitions = async (search?: string): Promise<PartDefinition[]> => {
  const res = await apiClient.get('/inventory-captures/definitions', {
    params: search ? { search } : undefined,
  })
  return (res.data?.items || []) as PartDefinition[]
}

export const getDefinition = async (id: number): Promise<PartDefinition> => {
  const res = await apiClient.get(`/inventory-captures/definitions/${id}`)
  return res.data as PartDefinition
}

/** Describe the kind once. Every unit of it is described. */
export const updateDefinition = async (
  id: number,
  changes: Partial<Pick<PartDefinition,
    'name' | 'part_number' | 'part_type' | 'description' | 'make' | 'model' | 'gtin'>
  > & { unit_price?: number },
): Promise<PartDefinition> => {
  const res = await apiClient.patch(`/inventory-captures/definitions/${id}`, changes)
  return res.data as PartDefinition
}

export const listCaptures = async (params: {
  status?: string
  mine?: boolean
  search?: string
  limit?: number
} = {}): Promise<{ total: number; items: CaptureUnit[] }> => {
  const res = await apiClient.get('/inventory-captures', { params })
  return res.data as { total: number; items: CaptureUnit[] }
}
