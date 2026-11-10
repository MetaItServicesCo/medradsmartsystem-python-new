/**
 * The order a canvas form is read in on a phone, where it is shown as one
 * column instead of the sheet it was laid out as.
 *
 * Fields are read row by row, top to bottom, and left to right within a row,
 * the way the sheet is read on paper. Fields whose tops are within a few
 * pixels of each other are on the same row, so a label placed a little higher
 * than the field beside it does not come after it.
 *
 * Text boxes with no text, used on the sheet only as shaded backgrounds behind
 * other fields, are left out: on their own, in one column, they are empty bars.
 */

export interface PositionedElement {
  id: string
  type: string
  x: number
  y: number
  label?: string
  description?: string
}

/** How far apart, in pixels, two tops can be and still be on the same row. */
export const SAME_ROW_TOLERANCE = 12

const isEmptyText = (element: PositionedElement) =>
  (element.type === 'label' || element.type === 'heading')
  && !String(element.label ?? '').trim()
  && !String(element.description ?? '').trim()

export function canvasReadingOrder<T extends PositionedElement>(elements: readonly T[]): T[] {
  const shown = elements.filter(element => !isEmptyText(element))
  const byTop = [...shown].sort((a, b) => a.y - b.y || a.x - b.x)
  const rows: T[][] = []
  let rowTop = Number.NEGATIVE_INFINITY
  for (const element of byTop) {
    if (rows.length && element.y - rowTop <= SAME_ROW_TOLERANCE) {
      rows[rows.length - 1].push(element)
    } else {
      rows.push([element])
      rowTop = element.y
    }
  }
  return rows.flatMap(row => [...row].sort((a, b) => a.x - b.x))
}
