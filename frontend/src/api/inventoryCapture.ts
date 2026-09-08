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
  // The rest of what the Add Part form asks for. Same names as an
  // inventory part uses, because a definition describes the part it will
  // become and describing it twice in two vocabularies is how the two
  // stop agreeing.
  condition: string | null
  supplier_name: string | null
  supplier_contact: string | null
  supplier_email: string | null
  supplier_phone: string | null
  supplier_address: string | null
  vendor_name: string | null
  purchase_location: string | null
  shipping_method: string | null
  acquisition_date: string | null
  warehouse_arrival_date: string | null
  default_picture_url: string | null
  gtin: string | null
  has_reference_photo: boolean
  /**
   * The inventory part this kind became, once it has been described.
   * Null while it is still only photographs.
   */
  part_id: number | null
  /**
   * Which reader produced these details: 'udi' when a barcode was decoded and
   * confirmed against the UDI database, 'label' when it was read off the
   * printed plate, null when a person typed them. A decoded model number and a
   * guessed one are not the same claim, and the form says which it is holding.
   */
  identified_from: 'udi' | 'label' | null
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

/** Everything the details form can set on a kind of part. */
export type DefinitionDetails = Partial<
  Omit<PartDefinition, 'id' | 'unit_price' | 'has_reference_photo' | 'unit_count' | 'created_at'>
> & { unit_price?: number }

/** Describe the kind once. Every unit of it is described. */
export const updateDefinition = async (
  id: number,
  changes: DefinitionDetails,
): Promise<PartDefinition> => {
  const res = await apiClient.patch(`/inventory-captures/definitions/${id}`, changes)
  return res.data as PartDefinition
}

/**
 * The photograph this kind was captured from, as a blob URL.
 *
 * Fetched through the client rather than pointed at by an <img src>,
 * because the endpoint needs the auth header an image tag cannot send.
 * The caller owns the URL and must revoke it.
 */
export const fetchDefinitionPhoto = async (id: number): Promise<string> => {
  const res = await apiClient.get(`/inventory-captures/definitions/${id}/photo`, {
    responseType: 'blob',
  })
  return URL.createObjectURL(res.data as Blob)
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
