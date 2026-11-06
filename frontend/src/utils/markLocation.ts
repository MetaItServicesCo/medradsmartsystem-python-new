/**
 * How far to trust where an attendance mark was made.
 *
 * A phone's GPS is usually good to a few metres; a laptop's browser estimates
 * from Wi-Fi or the network and can be off by kilometres. The label comes from
 * the accuracy actually reported, never from the device alone, so a rough
 * position is not mistaken for an exact one. The limit matches the backend's
 * ROUGH_ACCURACY_METRES, which names rough positions by area instead of street.
 */
export const ROUGH_ACCURACY_METRES = 500

export const isRoughLocation = (accuracy?: number | null) =>
  accuracy != null && accuracy > ROUGH_ACCURACY_METRES

const distance = (metres: number) => {
  if (metres < 1000) return `${Math.max(1, Math.round(metres))} m`
  const km = metres / 1000
  return `${km < 10 ? km.toFixed(1).replace(/\.0$/, '') : Math.round(km)} km`
}

export const accuracyLabel = (accuracy?: number | null) => {
  if (accuracy == null) return 'Accuracy not known'
  return isRoughLocation(accuracy) ? `Approximate, within about ${distance(accuracy)}` : `Precise, within ${distance(accuracy)}`
}

/** What the mark was made on, from the label the page recorded with it. */
export const markDevice = (deviceLabel?: string | null) => {
  if (!deviceLabel) return null
  if (/phone/i.test(deviceLabel)) return 'Phone'
  if (/\(web\)/i.test(deviceLabel)) return 'Desktop'
  if (/camera/i.test(deviceLabel)) return 'Attendance station'
  return null
}
