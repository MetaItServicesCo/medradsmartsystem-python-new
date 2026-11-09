import { columnHeading } from './canvasPassFail'

// Words that name a choice, not an item, when a sheet puts them in cells of their
// own beside each circle: "Door Gasket | Pass | o | Fail | o | N/A | o" is one item.
const CHOICE_WORDS = new Set(['pass', 'fail', 'n/a', 'na', 'yes', 'no'])

const isBareRadio = (cell: any) => cell && !cell.hidden && cell.type === 'radio' && !cell.options?.length

const namesAnItem = (cell: any) => {
  if (cell.type !== 'label' && cell.type !== 'heading') return false
  const text = String(cell.label ?? '').trim().toLowerCase()
  return Boolean(text) && !CHOICE_WORDS.has(text)
}

/**
 * The other circles answering the same item as the circle at this position.
 *
 * A row can hold several items, like "Door Gasket: Pass / Fail / N/A" beside
 * "Defrost: Pass / Fail / N/A", and each item takes one answer of its own. A new
 * item starts at a cell naming one, or where a column heading comes round again
 * in a row with no names.
 */
export const itemChoicePeers = <T extends { id: string }>(rows: T[][], rowIndex: number, colIndex: number): T[] => {
  const row = rows[rowIndex] || []
  const items: number[][] = [[]]
  let headings = new Set<string>()
  const startItem = () => {
    items.push([])
    headings = new Set()
  }
  row.forEach((cell: any, col) => {
    if (!cell || cell.hidden) return
    if (namesAnItem(cell)) {
      startItem()
      return
    }
    if (!isBareRadio(cell)) return
    const heading = columnHeading(rows, rowIndex, col).trim().toLowerCase()
    if (heading && headings.has(heading)) startItem()
    if (heading) headings.add(heading)
    items[items.length - 1].push(col)
  })
  const item = items.find(cols => cols.includes(colIndex)) || []
  return item.filter(col => col !== colIndex).map(col => row[col])
}
