import type { CanvasFormSchema } from '@/pages/Inspections/CanvasFormBuilder'

export const isFailText = (text: unknown) => String(text ?? '').trim().toLowerCase() === 'fail'

// The heading over a canvas table cell: the nearest text cell above it in its column.
export const columnHeading = (rows: any[][], row: number, col: number): string => {
  for (let r = row - 1; r >= 0; r--) {
    const cell = rows[r]?.[col]
    if (!cell || cell.hidden) continue
    if ((cell.type === 'label' || cell.type === 'heading') && String(cell.label || '').trim()) return String(cell.label)
  }
  return ''
}

/**
 * The pass/fail answers of a filled canvas form (the middle custom section).
 *
 * A choice field offering "Fail" counts, whether it sits on the canvas or
 * inside a canvas table: answered Fail it fails the report, left unanswered it
 * keeps it pending. So does a tick box in a table column headed "Fail", the
 * way a paper sheet's Fail column works; ticked, it fails the report.
 */
export const canvasPassFail = (canvas: CanvasFormSchema | null | undefined, values: Record<string, unknown>) => {
  let hasFail = false
  let hasPending = false
  const consider = (value: unknown, options?: string[]) => {
    if (!(options || []).some(isFailText)) return
    const v = String(value ?? '').trim()
    if (!v) { hasPending = true; return }
    if (isFailText(v)) hasFail = true
  }
  ;(canvas?.elements || []).forEach(el => {
    if (el.type === 'radio') consider(values[el.id], el.options)
    if (el.type !== 'table') return
    const rows: any[][] = el.cells || []
    rows.forEach((row, rowIndex) => (row || []).forEach((cell: any, colIndex: number) => {
      if (!cell || cell.hidden) return
      if (cell.type === 'radio' && cell.options?.length) {
        consider(values[cell.id], cell.options)
      } else if ((cell.type === 'radio' || cell.type === 'checkbox') && !cell.options?.length) {
        const ticked = values[cell.id] === true || values[cell.id] === 'true'
        if (ticked && isFailText(columnHeading(rows, rowIndex, colIndex))) hasFail = true
      }
    }))
  })
  return { hasFail, hasPending }
}
