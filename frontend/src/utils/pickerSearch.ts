/**
 * Search and quantity rules for the parts and test equipment pickers on a
 * service request.
 *
 * A search matches when every word typed appears in one of the record's
 * fields, in any order: "philips probe" finds a part made by Philips whose
 * description says probe, and "fluke 1234" finds a Fluke unit with that
 * serial number. Case does not matter. A word made only of punctuation (the
 * " - " in "PN-1 - Probe", copied from a picker label) is ignored.
 */

export const searchWords = (query: string): string[] =>
  String(query || '')
    .toLowerCase()
    .split(/[\s,]+/)
    .filter(word => /[a-z0-9]/i.test(word))

export const matchesEveryWord = (fields: ReadonlyArray<unknown>, query: string): boolean => {
  const words = searchWords(query)
  if (!words.length) return true
  const values = fields
    .filter(field => field !== null && field !== undefined && String(field).trim() !== '')
    .map(field => String(field).toLowerCase())
  return words.every(word => values.some(value => value.includes(word)))
}

/** The longest word typed: the one to send to a server search that matches a single phrase. */
export const longestSearchWord = (query: string): string =>
  searchWords(query).reduce((longest, word) => (word.length > longest.length ? word : longest), '')

/** What is typed into a quantity box, kept to a whole number: digits only, no leading zeros. */
export const wholeQuantityInput = (raw: string): string =>
  String(raw || '').replace(/\D/g, '').replace(/^0+(?=\d)/, '')

/** Why a quantity cannot be used, or '' when it can. */
export const quantityProblem = (raw: string, available: number): string => {
  const text = String(raw ?? '').trim()
  if (!text) return 'Enter a quantity'
  const quantity = Number(text)
  if (!Number.isInteger(quantity) || quantity <= 0) return 'Enter a whole number of at least 1'
  if (quantity > available) return `Only ${available} available`
  return ''
}
