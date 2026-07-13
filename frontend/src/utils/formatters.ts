export const digitsOnly = (value: string | number | null | undefined) => String(value ?? '').replace(/\D/g, '')

export const formatUSPhone = (value: string | number | null | undefined) => {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const digits = digitsOnly(raw)
  const normalized = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  if (normalized.length === 10) {
    return `(${normalized.slice(0, 3)}) ${normalized.slice(3, 6)}-${normalized.slice(6)}`
  }
  if (normalized.length === 7) {
    return `${normalized.slice(0, 3)}-${normalized.slice(3)}`
  }
  return raw
}

export const formatUSPhoneInput = (value: string | number | null | undefined) => {
  const digits = digitsOnly(value).slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

export const FACILITY_TIMEZONE_OPTIONS = [
  { value: 'America/Los_Angeles', label: 'West Coast' },
  { value: 'America/Chicago', label: 'Central' },
  { value: 'America/New_York', label: 'East Coast' },
] as const

export const normalizeFacilityTimezone = (value: string | null | undefined) => {
  if (!value) return 'America/Chicago'
  const normalized = String(value).trim().toLowerCase()
  if (['west coast', 'pacific', 'pt', 'pst', 'pdt', 'america/los_angeles', 'america/denver'].includes(normalized)) {
    return 'America/Los_Angeles'
  }
  if (['east coast', 'eastern', 'et', 'est', 'edt', 'america/new_york'].includes(normalized)) {
    return 'America/New_York'
  }
  if (['central', 'ct', 'cst', 'cdt', 'america/chicago', 'utc'].includes(normalized)) {
    return 'America/Chicago'
  }
  return FACILITY_TIMEZONE_OPTIONS.some(option => option.value === value) ? value : 'America/Chicago'
}

export const facilityTimezoneLabel = (value: string | null | undefined) => (
  FACILITY_TIMEZONE_OPTIONS.find(option => option.value === normalizeFacilityTimezone(value))?.label || 'Central'
)
