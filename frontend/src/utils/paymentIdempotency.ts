const inFlightKeys = new Map<string, string>()

const storageKey = (fingerprint: string) =>
  `medrad:payment-operation:${encodeURIComponent(fingerprint)}`

const newKey = () => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}

export const paymentRequestKey = (fingerprint: string) => {
  const existing = inFlightKeys.get(fingerprint)
  if (existing) return existing

  if (typeof window !== 'undefined') {
    const stored = window.sessionStorage.getItem(storageKey(fingerprint))
    if (stored) {
      inFlightKeys.set(fingerprint, stored)
      return stored
    }
  }

  const key = newKey()
  inFlightKeys.set(fingerprint, key)
  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(storageKey(fingerprint), key)
  }
  return key
}

export const completePaymentRequest = (fingerprint: string) => {
  inFlightKeys.delete(fingerprint)
  if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem(storageKey(fingerprint))
  }
}
