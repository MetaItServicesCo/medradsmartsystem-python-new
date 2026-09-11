import apiClient from './client'

export interface MetaOption { value: string; label: string }

export interface LedgerMeta {
  entry_types: MetaOption[]
  depreciation_methods: MetaOption[]
  // Served rather than hardcoded here so the two cannot disagree about how
  // long a lift lasts.
  default_useful_life_years: Record<string, number>
}

export interface PeriodRow {
  year: number
  opening_book_value: string
  depreciation: string
  accumulated: string
  closing_book_value: string
  // Non-zero where an improvement or impairment landed in this year, which is
  // why the curve bends.
  basis_change: string
  note: string
}

export interface Depreciation {
  method: string
  cost: string
  salvage_value: string
  useful_life_years: string
  in_service_date: string | null
  as_of: string
  depreciable_amount: string
  accumulated_depreciation: string
  net_book_value: string
  annual_depreciation: string
  monthly_depreciation: string
  months_elapsed: number
  months_remaining: number
  percent_depreciated: number
  is_fully_depreciated: boolean
  schedule: PeriodRow[]
  // Present when a figure could not be computed. Distinguishes "no cost on
  // record" from "worth nothing", which look identical as a zero.
  message: string | null
}

export interface ServiceSpend {
  completed_work_orders: number
  corrective_count: number
  preventive_count: number
  total_service_cost: string
  total_labour_hours: string
}

export interface TimelineEvent {
  kind: string
  occurred_on: string | null
  title: string
  detail: string | null
  amount: string | null
  reference: string | null
  source: string | null
  source_id: number | null
  outcome: string | null
}

export interface LedgerEntry {
  id: number
  facility_id: number
  equipment_id: number
  entry_type: string
  effective_date: string
  description: string
  amount: string | null
  proceeds: string | null
  gain_loss: string | null
  from_location_id: number | null
  to_location_id: number | null
  extends_useful_life_years: string | null
  reference: string | null
  vendor_id: number | null
  work_order_id: number | null
  reverses_entry_id: number | null
  is_reversed: boolean
  notes: string | null
  created_at: string
}

export interface AssetLedgerSummary {
  equipment_id: number
  asset_tag: string | null
  in_service_date: string | null
  disposed_on: string | null
  age_months: number | null
  depreciation: Depreciation
  service: ServiceSpend
  // Repair cost approaching replacement cost says something the depreciation
  // schedule cannot.
  service_cost_as_percent_of_cost: number | null
  ledger_entry_count: number
}

export interface AssetLedger {
  summary: AssetLedgerSummary
  timeline: TimelineEvent[]
  entries: LedgerEntry[]
}

export interface DisciplineValuation {
  asset_count: number
  cost: string
  accumulated_depreciation: string
  net_book_value: string
}

export interface FleetValuation {
  as_of: string
  asset_count: number
  total_cost: string
  accumulated_depreciation: string
  net_book_value: string
  // Kit still in service with no book value left is a replacement nobody has
  // budgeted for.
  fully_depreciated_count: number
  by_discipline: Record<string, DisciplineValuation>
}

export const fetchLedgerMeta = async (): Promise<LedgerMeta> => {
  const res = await apiClient.get('/asset-ledger/meta')
  return res.data
}

export const fetchAssetLedger = async (
  equipmentId: number,
  asOf?: string,
): Promise<AssetLedger> => {
  const res = await apiClient.get(`/asset-ledger/equipment/${equipmentId}`, {
    params: asOf ? { as_of: asOf } : undefined,
  })
  return res.data
}

/**
 * The schedule on its own, with optional what-if overrides. Finance asks
 * "what would fifteen years look like instead of twenty" often enough that
 * answering without writing anything is worth two query parameters.
 */
export const fetchDepreciation = async (
  equipmentId: number,
  params: { as_of?: string; method?: string; useful_life_years?: number } = {},
): Promise<Depreciation> => {
  const res = await apiClient.get(`/asset-ledger/equipment/${equipmentId}/depreciation`, { params })
  return res.data
}

export const fetchFleetValuation = async (params: {
  facility_id?: number
  as_of?: string
} = {}): Promise<FleetValuation> => {
  const res = await apiClient.get('/asset-ledger/valuation', { params })
  return res.data
}

export const fetchLedgerEntries = async (params: {
  equipment_id?: number
  facility_id?: number
  entry_type?: string
  since?: string
  limit?: number
}): Promise<{ items: LedgerEntry[]; total: number }> => {
  const res = await apiClient.get('/asset-ledger/entries', { params })
  return res.data
}

export const createLedgerEntry = async (payload: {
  equipment_id: number
  entry_type: string
  effective_date: string
  description: string
  amount?: number | null
  proceeds?: number | null
  from_location_id?: number | null
  to_location_id?: number | null
  extends_useful_life_years?: number | null
  reference?: string | null
  vendor_id?: number | null
  work_order_id?: number | null
  notes?: string | null
}): Promise<LedgerEntry> => {
  const res = await apiClient.post('/asset-ledger/entries', payload)
  return res.data
}

/**
 * Corrections are posted, not edited. A financial row somebody can see was
 * rewritten is a row an auditor cannot rely on.
 */
export const reverseLedgerEntry = async (
  entryId: number,
  reason: string,
): Promise<LedgerEntry> => {
  const res = await apiClient.post(`/asset-ledger/entries/${entryId}/reverse`, { reason })
  return res.data
}
