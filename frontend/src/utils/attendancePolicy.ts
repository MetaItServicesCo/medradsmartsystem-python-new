/**
 * Which attendance policy applies to whom.
 *
 * A policy is what turns a pile of scans into a verdict: how long a working
 * day is, how late is late, and what a run of late arrivals costs. Resolving
 * it is its own small problem, kept away from the classifier that uses it.
 *
 * Resolution order, most specific first:
 *   1. an explicit assignment for that employee
 *   2. a policy whose applicable_roles names their role
 *   3. the policy flagged is_default
 *   4. the fallback below
 *
 * Inactive policies are never used. The fallback exists because this install
 * can have employees before anyone has configured a policy, and an
 * unconfigured system should still be able to say someone turned up.
 */

export interface AttendancePolicyRules {
  id: number | null
  name: string
  /** Hours that make a full day. */
  workHoursPerDay: number
  /** 'HH:MM' local to the employee, or null when the shift is not pinned. */
  shiftStart: string | null
  shiftEnd: string | null
  lateGraceMinutes: number
  earlyDepartureGraceMinutes: number
  lateStrikeAction: 'none' | 'half_day' | 'full_day'
  consecutiveLateLimit: number
}

export const FALLBACK_POLICY: AttendancePolicyRules = {
  id: null,
  name: 'Default (no policy configured)',
  workHoursPerDay: 8,
  shiftStart: null,
  shiftEnd: null,
  lateGraceMinutes: 15,
  earlyDepartureGraceMinutes: 15,
  lateStrikeAction: 'none',
  consecutiveLateLimit: 3,
}

const asNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

const asTime = (value: unknown): string | null => {
  const text = String(value ?? '').trim()
  return /^\d{2}:\d{2}$/.test(text) ? text : null
}

const asStrikeAction = (value: unknown): AttendancePolicyRules['lateStrikeAction'] => (
  value === 'half_day' || value === 'full_day' ? value : 'none'
)

/** Normalise one policy record from the API into the rules the UI applies. */
export const toPolicyRules = (policy: any): AttendancePolicyRules => ({
  id: policy?.id ?? null,
  name: policy?.name ?? FALLBACK_POLICY.name,
  // A zero-hour working day would make every present day a half day, so a
  // nonsensical value falls back rather than propagating.
  workHoursPerDay: asNumber(policy?.work_hours_per_day, FALLBACK_POLICY.workHoursPerDay)
    || FALLBACK_POLICY.workHoursPerDay,
  shiftStart: asTime(policy?.shift_start_time),
  shiftEnd: asTime(policy?.shift_end_time),
  lateGraceMinutes: asNumber(policy?.late_arrival_grace_minutes, FALLBACK_POLICY.lateGraceMinutes),
  earlyDepartureGraceMinutes: asNumber(
    policy?.early_departure_grace_minutes, FALLBACK_POLICY.earlyDepartureGraceMinutes),
  lateStrikeAction: asStrikeAction(policy?.late_strike_action),
  consecutiveLateLimit: Math.max(1, asNumber(policy?.consecutive_late_limit,
    FALLBACK_POLICY.consecutiveLateLimit)),
})

/**
 * Build a lookup from employee id to the rules that govern them.
 *
 * Returns a function rather than a map so a caller can ask about anyone,
 * including employees who have no assignment at all.
 */
export const buildPolicyResolver = (
  policies: any[],
  assignments: any[],
): ((userId: number, role?: string | null) => AttendancePolicyRules) => {
  const active = (policies || []).filter((p: any) => p?.is_active !== false)
  const byId = new Map<number, any>(active.map((p: any) => [p.id, p]))

  const assignedPolicyId = new Map<number, number>()
  for (const assignment of assignments || []) {
    if (assignment?.user_id != null && assignment?.policy_id != null) {
      assignedPolicyId.set(Number(assignment.user_id), Number(assignment.policy_id))
    }
  }

  const byRole = new Map<string, any>()
  for (const policy of active) {
    for (const role of policy?.applicable_roles || []) {
      // First policy to claim a role keeps it; a later one does not silently
      // take over a role somebody already configured.
      if (!byRole.has(String(role))) byRole.set(String(role), policy)
    }
  }

  const fallback = active.find((p: any) => p?.is_default) ?? null
  const cache = new Map<string, AttendancePolicyRules>()

  return (userId: number, role?: string | null) => {
    const key = `${userId}|${role ?? ''}`
    const hit = cache.get(key)
    if (hit) return hit

    const assigned = assignedPolicyId.get(Number(userId))
    const policy = (assigned != null ? byId.get(assigned) : undefined)
      ?? (role ? byRole.get(String(role)) : undefined)
      ?? fallback

    const rules = policy ? toPolicyRules(policy) : FALLBACK_POLICY
    cache.set(key, rules)
    return rules
  }
}

/** Minutes past midnight for 'HH:MM', or null if it is not a time. */
export const minutesOfDay = (time: string | null | undefined): number | null => {
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return null
  const [hours, minutes] = time.split(':').map(Number)
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}
