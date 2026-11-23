/**
 * A facility's address as two lines on a printed report:
 *
 *   2010 W Katherine P Raines Rd #400
 *   Cleburne, TX 76033, United States
 *
 * The first line is the street. Many facilities have the whole address in
 * their address field ("2010 W Katherine P Raines Rd #400, Cleburne, TX 76033,
 * United States"), so the city, state, zip and country at its end are taken off
 * there; the second line is always built from the facility's own city, state,
 * zip and country. Only trailing comma-separated parts that are nothing but
 * those are taken off: a part with anything of the street in it always stays.
 * Nothing about the facility record changes; this is how it prints.
 */

export interface FacilityAddressLike {
  address?: string | null
  city?: string | null
  state?: string | null
  zip_code?: string | null
  country?: string | null
}

const US_STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  PR: 'Puerto Rico',
}
const US_NAMES = ['united states of america', 'united states', 'usa', 'us']

const text = (value: unknown) => String(value ?? '').trim()
const norm = (value: string) => value.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim()

/** "cleburne" -> "Cleburne"; a city typed with any capitals is left as typed. */
const cityLabel = (city: string) => (city && city === city.toLowerCase()
  ? city.replace(/(^|[\s-])([a-z])/g, (_, lead: string, letter: string) => `${lead}${letter.toUpperCase()}`)
  : city)

/** "tx" -> "TX"; a state written out is left as typed. */
const stateLabel = (state: string) => (/^[a-z]{2}$/i.test(state) ? state.toUpperCase() : state)

// Whether one comma-separated part of the address is only the city, state,
// zip and/or country -- nothing of the street.
const onlyLocation = (part: string, facility: FacilityAddressLike) => {
  const city = text(facility.city)
  const state = text(facility.state)
  const country = text(facility.country)
  const phrases = new Set<string>(
    [
      city,
      country,
      ...US_NAMES,
      ...Object.keys(US_STATES),
      ...Object.values(US_STATES),
      state,
    ].map(norm).filter(Boolean),
  )
  let rest = ` ${norm(part)} `
  // Longest first, so "new york" goes before "york" and "united states" before "us".
  Array.from(phrases).sort((a, b) => b.length - a.length).forEach(phrase => {
    rest = rest.split(` ${phrase} `).join(' ')
  })
  rest = rest.replace(/\b\d{5}(?:-\d{4})?\b/g, ' ')
  return rest.trim() === ''
}

export const facilityAddressLines = (facility: FacilityAddressLike | null | undefined): { street: string; line2: string } => {
  if (!facility) return { street: '', line2: '' }
  const parts = text(facility.address).split(',').map(part => part.trim()).filter(Boolean)
  while (parts.length > 0 && onlyLocation(parts[parts.length - 1], facility)) parts.pop()
  const city = cityLabel(text(facility.city))
  const state = stateLabel(text(facility.state))
  const cityState = [city, state].filter(Boolean).join(', ')
  const place = [cityState, text(facility.zip_code)].filter(Boolean).join(' ')
  return {
    street: parts.join(', '),
    line2: [place, text(facility.country)].filter(Boolean).join(', '),
  }
}
