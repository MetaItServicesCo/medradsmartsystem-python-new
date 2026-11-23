/**
 * What the customer said when they answered a sales quotation from their link
 * or account: "Request Changes" or "Decline", with their comments.
 *
 * The answer is kept in the quotation's history (action "changes_requested" or
 * "declined", the comments in details.comments). History carries over when a
 * quotation is revised, so the request is still there while the revision is
 * being prepared; once a revision is sent to the customer, it has been dealt
 * with and is no longer open.
 */

export type CustomerResponseAction = 'changes_requested' | 'declined'

export interface CustomerResponse {
  action: CustomerResponseAction
  by: string
  at: string | null
  comments: string
}

interface HistoryLike {
  action?: string
  by?: string
  at?: string
  details?: Record<string, any> | null
}

const RESPONSE_ACTIONS = new Set<string>(['changes_requested', 'declined'])

const toResponse = (entry: HistoryLike): CustomerResponse => ({
  action: entry.action as CustomerResponseAction,
  by: String(entry.by || '').trim() || 'The customer',
  at: entry.at || null,
  comments: String(entry.details?.comments ?? '').trim(),
})

/** The customer's latest answer, open or not; null when they have never answered. */
export const latestCustomerResponse = (history: unknown): CustomerResponse | null => {
  const entries = Array.isArray(history) ? (history as HistoryLike[]) : []
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (entry && RESPONSE_ACTIONS.has(String(entry.action))) return toResponse(entry)
  }
  return null
}

/** The customer's latest answer while it is still waiting on us: nothing has been sent to them since. */
export const openCustomerResponse = (history: unknown): CustomerResponse | null => {
  const entries = Array.isArray(history) ? (history as HistoryLike[]) : []
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (!entry) continue
    if (entry.action === 'sent') return null
    if (RESPONSE_ACTIONS.has(String(entry.action))) return toResponse(entry)
  }
  return null
}

/** A one-line excerpt of the comments for a list row. */
export const commentExcerpt = (comments: string, length = 90): string => {
  const flat = comments.replace(/\s+/g, ' ').trim()
  return flat.length > length ? `${flat.slice(0, length - 1).trimEnd()}…` : flat
}
