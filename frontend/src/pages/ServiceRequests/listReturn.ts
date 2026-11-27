/**
 * Where "Back to Service Requests" returns: the list exactly as it was left
 * (its page, search and filters, which the list keeps in its address).
 * Kept for this browser tab only; with nothing kept, the list's first page.
 */
const KEY = 'medrad.serviceRequests.listSearch'

export const rememberServiceRequestList = (search: string) => {
  try { sessionStorage.setItem(KEY, search) } catch { /* storage unavailable: Back opens the first page */ }
}

export const serviceRequestListPath = (): string => {
  try {
    const search = sessionStorage.getItem(KEY) || ''
    return search.startsWith('?') ? `/service-requests${search}` : '/service-requests'
  } catch {
    return '/service-requests'
  }
}
