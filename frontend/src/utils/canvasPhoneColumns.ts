/**
 * How wide each column of a canvas form's table is at least, on a phone.
 *
 * On a computer a table's columns share the width the form gives the table.
 * On a phone that leaves a note field a few characters wide, so each column
 * gets at least the room what is in it needs to be filled in, and a table
 * wider than the screen scrolls sideways on its own. Columns still share any
 * room left over the way they were laid out.
 */

export interface PhoneColumnCell {
  type: string
  options?: string[]
  label?: string
  hidden?: boolean
  colSpan?: number
}

/** A field to type in: a note, a number, a date, a signature. */
export const FIELD_MIN = 170
/** A choice with its options named, such as Yes / No. */
export const NAMED_CHOICE_MIN = 150
/** An item's name, or a heading, at most; a short word such as Pass needs less. */
export const TEXT_MIN = 110
/** Roughly how wide one character of a name is, with the cell's padding on top. */
const CHAR_WIDTH = 9
const TEXT_PADDING = 16
/** A single circle or tick box, such as a Pass column. */
export const CONTROL_MIN = 56

const FIELD_TYPES = new Set(['input', 'number', 'date', 'textarea', 'signature'])

const cellMin = (cell: PhoneColumnCell): number => {
  if (FIELD_TYPES.has(cell.type)) return FIELD_MIN
  if (cell.type === 'radio' || cell.type === 'checkbox') return cell.options?.length ? NAMED_CHOICE_MIN : CONTROL_MIN
  const text = String(cell.label ?? '').trim()
  if ((cell.type === 'label' || cell.type === 'heading') && text) {
    // Room for the name, up to TEXT_MIN; longer names wrap onto more lines.
    return Math.min(TEXT_MIN, Math.max(CONTROL_MIN, text.length * CHAR_WIDTH + TEXT_PADDING))
  }
  return CONTROL_MIN
}

export function phoneColumnMinWidths(cells: readonly (readonly PhoneColumnCell[])[], cols: number): number[] {
  const mins = Array.from({ length: Math.max(cols, 0) }, () => CONTROL_MIN)
  cells.forEach(row => row.forEach((cell, c) => {
    // A cell spread over several columns does not decide any one of them.
    if (!cell || cell.hidden || (cell.colSpan ?? 1) > 1 || c >= mins.length) return
    mins[c] = Math.max(mins[c], cellMin(cell))
  }))
  return mins
}
