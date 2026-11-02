import type { CanvasElement, CanvasFormSchema, CanvasFormValues } from '@/pages/Inspections/CanvasFormBuilder'

/**
 * Turn a grid-built inspection form into a canvas layout, so switching an
 * existing form from Grid to Canvas in the form editor carries its content
 * across instead of starting from a blank canvas.
 *
 * Every grid row becomes a band of the canvas, its cells laid out across the
 * same columns. Each field keeps the grid's answer key as its element id, so
 * answers already recorded against the grid still belong to the same field
 * on the canvas. Heights are generous on purpose: canvas fields sit at fixed
 * positions, so a field that is too short would draw over the one below.
 */

type GridBlock = {
  id?: string
  type?: string
  label?: string
  options?: string[]
  optionLayout?: string
  height?: number
}

type GridCell = {
  id: string
  label?: string
  type?: string
  options?: string[]
  blocks?: GridBlock[]
  colSpan?: number
  hidden?: boolean
  align?: 'left' | 'center' | 'right'
}

type Grid = {
  title?: string
  columns?: number
  cells: GridCell[][]
}

const CANVAS_WIDTH = 1080
const MARGIN = 24
const GAP = 12
const LINE = 20

const fieldId = (cell: GridCell, block: GridBlock, index: number) => `${cell.id}__${block.id || `block_${index + 1}`}`

// Rough width a radio/checkbox option needs, to estimate how many lines wrap.
const optionLines = (options: string[], width: number) => {
  const perLine = Math.max(1, Math.floor((width - 8) / 96))
  return Math.max(1, Math.ceil(Math.max(1, options.length) / perLine))
}

const elementsForCell = (cell: GridCell, x: number, width: number): CanvasElement[] => {
  const out: CanvasElement[] = []
  const align = cell.align || 'left'
  let y = 0
  const push = (element: Omit<CanvasElement, 'x' | 'y' | 'width'>) => {
    out.push({ ...element, x, y, width })
    y += element.height + 6
  }
  const blocks = cell.blocks?.length ? cell.blocks : null
  if (blocks) {
    blocks.forEach((block, index) => {
      const id = fieldId(cell, block, index)
      const label = block.label || ''
      if (block.type === 'label') {
        push({ id, type: 'label', label, height: 28, fontWeight: 'bold', align })
      } else if (block.type === 'radio' || block.type === 'checkbox') {
        const options = block.options?.length ? block.options : ['Pass', 'Fail', 'N/A']
        push({
          id,
          type: block.type,
          label,
          options,
          optionLayout: block.optionLayout === 'vertical' ? 'vertical' : 'horizontal',
          height: (label ? LINE + 6 : 0) + optionLines(options, width) * 30 + 8,
          align,
        })
      } else if (block.type === 'textarea') {
        push({ id, type: 'textarea', label, height: (label ? LINE + 6 : 0) + Math.max(70, Number(block.height) || 90), align })
      } else {
        push({ id, type: 'input', label, height: (label ? LINE + 6 : 0) + 44, align })
      }
    })
  } else if (cell.type === 'radio' || cell.type === 'checkbox') {
    const options = cell.options?.length ? cell.options : ['Pass', 'Fail', 'N/A']
    push({
      id: cell.id,
      type: cell.type,
      label: cell.label || '',
      options,
      optionLayout: 'horizontal',
      height: (cell.label ? LINE + 6 : 0) + optionLines(options, width) * 30 + 8,
      align,
    })
  } else if (cell.type === 'input') {
    push({ id: cell.id, type: 'input', label: cell.label || '', height: (cell.label ? LINE + 6 : 0) + 44, align })
  } else if (cell.label?.trim()) {
    push({ id: cell.id, type: 'label', label: cell.label, height: 28, fontWeight: 'bold', align })
  }
  return out
}

export const gridHasContent = (grid: Grid | null | undefined) =>
  Boolean(grid?.cells?.some(row => row.some(cell => !cell.hidden && (cell.blocks?.length || cell.label?.trim() || (cell.type && cell.type !== 'text')))))

export const gridToCanvas = (grid: Grid): CanvasFormSchema => {
  const columns = Math.max(1, Number(grid.columns) || Math.max(1, ...grid.cells.map(row => row.length)))
  const columnWidth = (CANVAS_WIDTH - MARGIN * 2 - GAP * (columns - 1)) / columns
  const elements: CanvasElement[] = []
  let top = MARGIN

  const title = (grid.title || '').trim()
  if (title && title !== 'Set Title') {
    elements.push({ id: 'grid_title', type: 'heading', label: title, x: MARGIN, y: top, width: CANVAS_WIDTH - MARGIN * 2, height: 36 })
    top += 36 + GAP
  }

  grid.cells.forEach(row => {
    let bandHeight = 0
    row.forEach((cell, column) => {
      if (!cell || cell.hidden) return
      const span = Math.min(columns - column, Math.max(1, Number(cell.colSpan) || 1))
      const x = MARGIN + column * (columnWidth + GAP)
      const width = Math.round(columnWidth * span + GAP * (span - 1))
      const cellElements = elementsForCell(cell, Math.round(x), width)
      cellElements.forEach(element => {
        elements.push({ ...element, y: element.y + top })
        bandHeight = Math.max(bandHeight, element.y + element.height)
      })
    })
    if (bandHeight) top += bandHeight + GAP
  })

  return {
    canvas_width: CANVAS_WIDTH,
    canvas_height: Math.max(600, top + MARGIN),
    elements: elements.map((element, index) => ({ ...element, zIndex: 1, id: element.id || `el_${index + 1}` })),
  }
}

/**
 * Answers for a canvas built by gridToCanvas, taken from the answers recorded
 * against the grid it came from, so a converted form opens with them filled.
 */
export const canvasValuesFromGrid = (canvas: CanvasFormSchema, gridValues: Record<string, any> | undefined): CanvasFormValues => {
  const values: CanvasFormValues = {}
  if (!gridValues) return values
  canvas.elements.forEach(element => {
    if (element.type === 'checkbox') {
      const options = element.options || []
      const chosen = options.filter((_, index) => Boolean(gridValues[`${element.id}__${index}`]))
      if (chosen.length) values[element.id] = chosen
      return
    }
    const value = gridValues[element.id]
    if (typeof value === 'string' && value !== '') values[element.id] = value
  })
  return values
}
