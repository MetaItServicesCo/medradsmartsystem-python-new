/**
 * The four categories and two kinds of maintenance job, as navigation knows
 * them. Names and counts come from the server; this is only what a menu needs
 * before any data has loaded.
 */
import ElectricBoltIcon from '@mui/icons-material/ElectricBolt'
import PlumbingIcon from '@mui/icons-material/Plumbing'
import PrecisionManufacturingIcon from '@mui/icons-material/PrecisionManufacturing'
import AcUnitIcon from '@mui/icons-material/AcUnit'
import HomeRepairServiceIcon from '@mui/icons-material/HomeRepairService'
import FactCheckIcon from '@mui/icons-material/FactCheck'
import type { CategoryCode, Condition, JobKind } from '@/api/siteCategories'

export interface CategoryMeta {
  code: CategoryCode
  name: string
  colour: string
  icon: JSX.Element
  path: string
}

export const CATEGORIES: CategoryMeta[] = [
  { code: 'electrical', name: 'Electrical', colour: '#D97706', icon: <ElectricBoltIcon />, path: '/categories/electrical' },
  { code: 'plumbing', name: 'Plumbing', colour: '#2563EB', icon: <PlumbingIcon />, path: '/categories/plumbing' },
  { code: 'mechanical', name: 'Mechanical', colour: '#0369A1', icon: <PrecisionManufacturingIcon />, path: '/categories/mechanical' },
  { code: 'hvac', name: 'HVAC', colour: '#0F766E', icon: <AcUnitIcon />, path: '/categories/hvac' },
]

export const CATEGORY_BY_CODE = Object.fromEntries(CATEGORIES.map((c) => [c.code, c])) as Record<CategoryCode, CategoryMeta>

export interface JobKindMeta {
  kind: JobKind
  name: string
  singular: string
  icon: JSX.Element
  path: string
}

export const JOB_KINDS: JobKindMeta[] = [
  { kind: 'service', name: 'Service', singular: 'service', icon: <HomeRepairServiceIcon />, path: '/equipment-maintenance/service' },
  { kind: 'inspection', name: 'Inspection', singular: 'inspection', icon: <FactCheckIcon />, path: '/equipment-maintenance/inspection' },
]

export const CONDITION_STYLE: Record<Condition, { label: string; color: string; bg: string }> = {
  working: { label: 'Working', color: '#15803D', bg: '#F0FDF4' },
  needs_attention: { label: 'Needs attention', color: '#92400E', bg: '#FEF3C7' },
  out_of_service: { label: 'Out of service', color: '#B91C1C', bg: '#FEE2E2' },
}
