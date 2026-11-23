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
 * zip and country. Only what is nothing but those is taken off the end, so the
 * street itself always stays as typed. Placeholders ("Not provided", "Nill")
 * print as nothing. A suite goes on the street line, unless the street already
 * has it.
 * Nothing about the facility record changes; this is how it prints.
 */

export interface FacilityAddressLike {
  address?: string | null
  suite?: string | null
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

// Values that stand for "nothing entered" in the facility records.
const PLACEHOLDERS = new Set(['not provided', 'not available', 'nill', 'nil', 'null', 'none', 'n/a', 'na', 'unknown', 'tbd', '-', '--', '—'])

/** A field as printed: trimmed, stray commas at its ends removed, a placeholder ("Not provided", "Nill") empty. */
const field = (value: unknown) => {
  const cleaned = String(value ?? '').trim().replace(/^[\s,;]+|[\s,;]+$/g, '')
  return PLACEHOLDERS.has(cleaned.toLowerCase()) ? '' : cleaned
}
const words = (value: string) => value.toLowerCase().replace(/[.;:()]/g, '').split(/[\s,]+/).filter(Boolean)

/** "cleburne" -> "Cleburne"; a city typed with any capitals is left as typed. */
const cityLabel = (city: string) => (city && city === city.toLowerCase()
  ? city.replace(/(^|[\s-])([a-z])/g, (_, lead: string, letter: string) => `${lead}${letter.toUpperCase()}`)
  : city)

/** "tx" -> "TX"; a state written out is left as typed. */
const stateLabel = (state: string) => (/^[a-z]{2}$/i.test(state) ? state.toUpperCase() : state)

const ZIP = /^\d{5}(?:-\d{4})?$/

/**
 * The street: the address with the city, state, zip and country taken off its
 * end, whether they follow commas or not ("500 W Main St Ste A Lewisville, TX
 * 75057"). Taken off, from the end: any zip; the facility's own city, state
 * and country; a "United States"; and any state right before a zip. It stops
 * at the first word that is none of these, so the street is kept as typed.
 */
const streetOf = (address: string, facility: FacilityAddressLike) => {
  const tokens = Array.from(address.matchAll(/[^\s,]+/g)).map(match => ({
    at: match.index ?? 0,
    key: match[0].toLowerCase().replace(/[.;:()]/g, ''),
  }))
  const ownState = field(facility.state)
  const ownStateWords = [ownState, US_STATES[ownState.toUpperCase()] || '',
    Object.keys(US_STATES).find(code => US_STATES[code].toLowerCase() === ownState.toLowerCase()) || '']
  // [words, only right before a zip]
  const phrases: Array<[string[], boolean]> = [
    ...[field(facility.city), field(facility.country), ...ownStateWords, ...US_NAMES.filter(name => name !== 'us')]
      .filter(Boolean).map((phrase): [string[], boolean] => [words(phrase), false]),
    ...[...Object.keys(US_STATES), ...Object.values(US_STATES), 'us'].map((phrase): [string[], boolean] => [words(phrase), true]),
  ].filter(([list]) => list.length > 0)
  phrases.sort((a, b) => b[0].length - a[0].length)

  let end = tokens.length
  let afterZip = false
  while (end > 0) {
    const last = tokens[end - 1].key
    if (!last || ZIP.test(last)) { end -= 1; afterZip = Boolean(last); continue }
    const hit = phrases.find(([list, beforeZipOnly]) => (
      list.length <= end
      && (!beforeZipOnly || afterZip)
      && tokens.slice(end - list.length, end).map(token => token.key).join(' ') === list.join(' ')
    ))
    if (!hit) break
    end -= hit[0].length
    afterZip = false
  }
  if (end === tokens.length) return address
  if (end === 0) return ''
  const street = address.slice(0, tokens[end].at).replace(/[\s,;:–—-]+$/, '')
  // Nothing of a street left (only a number): print the address as it is.
  return /[a-z]/i.test(street) ? street : address
}

/** The street with the suite after it, unless the street already ends with or contains it. */
const withSuite = (street: string, suite: string) => {
  if (!suite) return street
  const have = ` ${words(street).join(' ')} `
  if (have.includes(` ${words(suite).join(' ')} `)) return street
  return street ? `${street}, ${suite}` : suite
}

export const facilityAddressLines = (facility: FacilityAddressLike | null | undefined): { street: string; line2: string } => {
  if (!facility) return { street: '', line2: '' }
  const city = cityLabel(field(facility.city))
  const state = stateLabel(field(facility.state))
  const cityState = [city, state].filter(Boolean).join(', ')
  const place = [cityState, field(facility.zip_code)].filter(Boolean).join(' ')
  return {
    street: withSuite(streetOf(field(facility.address), facility), field(facility.suite)),
    line2: [place, field(facility.country)].filter(Boolean).join(', '),
  }
}
