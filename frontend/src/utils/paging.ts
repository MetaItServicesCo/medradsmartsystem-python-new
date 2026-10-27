/**
 * Walking a paged list endpoint.
 *
 * Every list endpoint in this API caps `limit`, and asking for more is not
 * clamped -- it is a 422 before the handler runs. A caller that wants
 * everything has to page for it. Doing that by hand is where the mistakes
 * live: an off-by-one on `skip`, a loop that never ends because the server
 * ignored `skip`, or a cap raised on one side only.
 */

export interface Page<T> {
  items: T[]
  total: number
}

/**
 * Collect every item by requesting one page at a time.
 *
 * `maxItems` is a stop, not a target: it keeps a bad filter from walking an
 * entire table. Reaching it returns what was collected rather than throwing,
 * and `total` still reports what the server said exists, so a caller can see
 * it is holding a partial answer.
 *
 * The loop ends on a short page as well as on the count, because a server
 * that quietly ignores `skip` would otherwise return the same first page for
 * ever. Page requests are sequential on purpose: a fan-out of parallel
 * requests against a shared list endpoint is how one HR screen becomes a load
 * problem for everyone else.
 */
export const pageThrough = async <T>(
  fetchPage: (skip: number, limit: number) => Promise<Page<T> | undefined | null>,
  pageLimit: number,
  maxItems: number,
): Promise<Page<T>> => {
  if (pageLimit < 1) throw new Error('pageThrough: pageLimit must be at least 1')

  const items: T[] = []
  let total = 0
  let previousFirst: string | null = null

  for (let skip = 0; skip < maxItems; skip += pageLimit) {
    const page = await fetchPage(skip, pageLimit)
    const batch = page?.items ?? []
    items.push(...batch)
    total = typeof page?.total === 'number' ? page.total : items.length

    if (batch.length < pageLimit) break
    if (items.length >= total) break

    // A server that ignores skip hands back the same page every time. Stop
    // rather than spin until maxItems.
    const first = JSON.stringify(batch[0] ?? null)
    if (first === previousFirst) break
    previousFirst = first
  }

  return { items, total: total || items.length }
}
