export interface BillingAccountIdentity {
  facilityId?: number | null
  customerEmail?: string | null
  recordKey?: string | number | null
}

const normalizeEmail = (value?: string | null) => value?.trim().toLowerCase() || null

/**
 * Compare unique account identifiers only. Names are display values and are
 * intentionally excluded because unrelated customers can have the same name.
 * Legacy records with no facility or email stay isolated instead of exposing
 * another customer's ledger.
 */
export const isSameBillingAccount = (
  left: BillingAccountIdentity,
  right: BillingAccountIdentity,
) => {
  if (left.facilityId != null || right.facilityId != null) {
    return (
      left.facilityId != null
      && right.facilityId != null
      && left.facilityId === right.facilityId
    )
  }

  const leftEmail = normalizeEmail(left.customerEmail)
  const rightEmail = normalizeEmail(right.customerEmail)
  if (leftEmail || rightEmail) {
    return Boolean(leftEmail && rightEmail && leftEmail === rightEmail)
  }

  return (
    left.recordKey != null
    && right.recordKey != null
    && String(left.recordKey) === String(right.recordKey)
  )
}
