import type { LeadSource, LeadStatus } from '@/api/leads'

// The choices the server accepts (backend/app/models/lead.py), as people read them.
export const LEAD_SOURCES: { value: LeadSource; label: string }[] = [
  { value: 'website', label: 'Website' },
  { value: 'referral', label: 'Referral' },
  { value: 'phone_call', label: 'Phone call' },
  { value: 'email', label: 'Email' },
  { value: 'social_media', label: 'Social media' },
  { value: 'trade_show', label: 'Trade show' },
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'advertisement', label: 'Advertisement' },
  { value: 'other', label: 'Other' },
]

// The pipeline, in order. Each stage has its own colour, and always its label
// beside it, so the status never rests on colour alone.
export const LEAD_STATUSES: { value: LeadStatus; label: string; dot: string; bg: string; ink: string }[] = [
  { value: 'new', label: 'New', dot: '#3B82F6', bg: '#EFF6FF', ink: '#1D4ED8' },
  { value: 'contacted', label: 'Contacted', dot: '#8B5CF6', bg: '#F5F3FF', ink: '#6D28D9' },
  { value: 'qualified', label: 'Qualified', dot: '#0EA5E9', bg: '#F0F9FF', ink: '#0369A1' },
  { value: 'proposal_sent', label: 'Proposal sent', dot: '#F59E0B', bg: '#FFFBEB', ink: '#B45309' },
  { value: 'won', label: 'Won', dot: '#10B981', bg: '#ECFDF5', ink: '#047857' },
  { value: 'lost', label: 'Lost', dot: '#94A3B8', bg: '#F1F5F9', ink: '#475569' },
]

export const LEAD_SEARCH_FIELDS = [
  { value: 'all', label: 'All fields' },
  { value: 'name', label: 'Lead name' },
  { value: 'company', label: 'Company' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'notes', label: 'Notes' },
  { value: 'source_url', label: 'Website URL' },
]

export const LEAD_SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'updated', label: 'Recently updated' },
] as const

export const sourceLabel = (value?: string | null) => LEAD_SOURCES.find(item => item.value === value)?.label || value || '—'
export const statusOption = (value?: string | null) => LEAD_STATUSES.find(item => item.value === value) || LEAD_STATUSES[0]
export const isLeadStatus = (value: string | null): value is LeadStatus => LEAD_STATUSES.some(item => item.value === value)
export const isLeadSource = (value: string | null): value is LeadSource => LEAD_SOURCES.some(item => item.value === value)

/**
 * A web address as the server keeps it ("acme.com/contact" becomes
 * "https://acme.com/contact"), or null when it is not one. Only http and https
 * pass, the same rule as backend/app/schemas/lead.py, so a link never runs a script.
 */
export const normalizeLeadUrl = (value: string): string | null => {
  const raw = value.trim()
  if (!raw) return null
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw) ? raw : `https://${raw}`
  if (/\s/.test(withScheme) || withScheme.length > 500) return null
  try {
    const url = new URL(withScheme)
    const host = url.hostname.replace(/^\.+|\.+$/g, '')
    if (!['http:', 'https:'].includes(url.protocol.toLowerCase()) || !host.includes('.')) return null
    return withScheme
  } catch {
    return null
  }
}

/** A stored address safe to open: http or https only. */
export const safeLeadHref = (value?: string | null) => (value && /^https?:\/\//i.test(value) ? value : null)

/** The address without its scheme or trailing slash, for reading. */
export const displayLeadUrl = (value: string) => value.replace(/^https?:\/\//i, '').replace(/\/$/, '')

/** The server keeps times in UTC without a zone mark; read them as UTC, show them local. */
export const formatLeadDate = (value?: string | null) => {
  if (!value) return '—'
  const date = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
