import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Radio,
  RadioGroup,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import CalendarTodayIcon from '@mui/icons-material/CalendarToday'
import DeleteIcon from '@mui/icons-material/Delete'
import DrawIcon from '@mui/icons-material/Draw'
import FormatAlignCenterIcon from '@mui/icons-material/FormatAlignCenter'
import FormatAlignLeftIcon from '@mui/icons-material/FormatAlignLeft'
import FormatAlignRightIcon from '@mui/icons-material/FormatAlignRight'
import FormatBoldIcon from '@mui/icons-material/FormatBold'
import GridOnIcon from '@mui/icons-material/GridOn'
import InputIcon from '@mui/icons-material/Input'
import NotesIcon from '@mui/icons-material/Notes'
import NumbersIcon from '@mui/icons-material/Numbers'
import RadioButtonCheckedIcon from '@mui/icons-material/RadioButtonChecked'
import CheckBoxOutlinedIcon from '@mui/icons-material/CheckBoxOutlined'
import TextFieldsIcon from '@mui/icons-material/TextFields'
import TitleIcon from '@mui/icons-material/Title'

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type CanvasElementType =
  | 'heading'
  | 'label'
  | 'input'
  | 'textarea'
  | 'number'
  | 'date'
  | 'radio'
  | 'checkbox'
  | 'signature'
  | 'table'

// A single cell inside a table element. A cell holds one of the existing field
// types — 'label' means static text, everything else is a fillable control.
export interface TableCell {
  id: string
  type: CanvasElementType
  label?: string
  placeholder?: string
  options?: string[]
  optionLayout?: 'horizontal' | 'vertical'
  align?: 'left' | 'center' | 'right'
  fontWeight?: 'normal' | 'bold'
  bgColor?: 'white' | 'grey'
}

export interface CanvasElement {
  id: string
  type: CanvasElementType
  x: number
  y: number
  width: number
  height: number
  label?: string
  placeholder?: string
  required?: boolean
  options?: string[]
  optionLayout?: 'horizontal' | 'vertical'
  fontSize?: number
  fontWeight?: 'normal' | 'bold'
  align?: 'left' | 'center' | 'right'
  zIndex?: number
  description?: string
  bgColor?: 'white' | 'grey'
  // Table-only fields
  rows?: number
  cols?: number
  colWidths?: number[]
  headerRow?: boolean
  cells?: TableCell[][]
}

export interface CanvasFormSchema {
  canvas_width: number
  canvas_height: number
  elements: CanvasElement[]
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const CANVAS_W = 1080
const GRID = 10
const MIN_W = 80
const MIN_H = 28

type ResizeHandle = 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se'

const HANDLE_CURSORS: Record<ResizeHandle, string> = {
  nw: 'nw-resize', n: 'n-resize', ne: 'ne-resize',
  w: 'w-resize', e: 'e-resize',
  sw: 'sw-resize', s: 's-resize', se: 'se-resize',
}

type ActiveOp =
  | { kind: 'move'; id: string; startX: number; startY: number; origX: number; origY: number }
  | { kind: 'resize'; id: string; handle: ResizeHandle; startX: number; startY: number; origX: number; origY: number; origW: number; origH: number }

const snap = (v: number) => Math.round(v / GRID) * GRID
let _seq = 0
const uid = () => `cv_${Date.now()}_${++_seq}`

const TABLE_ROW_H = 44
const TABLE_COL_W = 170

const DEFAULT_SIZES: Record<CanvasElementType, { width: number; height: number }> = {
  heading:   { width: 460, height: 44 },
  label:     { width: 220, height: 36 },
  input:     { width: 280, height: 74 },
  textarea:  { width: 340, height: 120 },
  number:    { width: 200, height: 74 },
  date:      { width: 220, height: 74 },
  radio:     { width: 360, height: 90 },
  checkbox:  { width: 380, height: 90 },
  signature: { width: 280, height: 110 },
  table:     { width: TABLE_COL_W * 3, height: TABLE_ROW_H * 3 },
}

const DEFAULT_LABEL: Record<CanvasElementType, string> = {
  heading: 'Section Heading',
  label: 'Label text',
  input: 'Field label',
  textarea: 'Notes',
  number: 'Quantity',
  date: 'Date',
  radio: 'Select one',
  checkbox: 'Select all that apply',
  signature: 'Technician Signature',
  table: 'Table',
}

// Cell types offered inside a table cell (a subset of element types).
const CELL_TYPES: { value: CanvasElementType; label: string }[] = [
  { value: 'label',     label: 'Text' },
  { value: 'input',     label: 'Text Input' },
  { value: 'textarea',  label: 'Text Area' },
  { value: 'number',    label: 'Number' },
  { value: 'date',      label: 'Date' },
  { value: 'radio',     label: 'Radio' },
  { value: 'checkbox',  label: 'Checkbox' },
  { value: 'signature', label: 'Signature' },
]

function makeTableCell(type: CanvasElementType = 'label'): TableCell {
  const cell: TableCell = { id: uid(), type }
  if (type === 'radio')    { cell.options = ['Yes', 'No'];   cell.optionLayout = 'horizontal' }
  if (type === 'checkbox') { cell.options = ['Option 1'];    cell.optionLayout = 'horizontal' }
  return cell
}

function makeTableCells(rows: number, cols: number): TableCell[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => makeTableCell()))
}

function makeElement(type: CanvasElementType, x: number, y: number): CanvasElement {
  const sizes = DEFAULT_SIZES[type]
  return {
    id: uid(),
    type,
    x: snap(x),
    y: snap(y),
    width: sizes.width,
    height: sizes.height,
    label: DEFAULT_LABEL[type],
    ...(type === 'heading' ? { fontSize: 18, fontWeight: 'bold' as const } : {}),
    ...(type === 'radio'    ? { options: ['Yes', 'No', 'N/A'], optionLayout: 'horizontal' as const } : {}),
    ...(type === 'checkbox' ? { options: ['Option 1', 'Option 2', 'Option 3'], optionLayout: 'horizontal' as const } : {}),
    ...(type === 'input' || type === 'textarea' ? { placeholder: 'Enter value' } : {}),
    ...(type === 'table' ? { rows: 3, cols: 3, colWidths: [1, 1, 1], headerRow: false, cells: makeTableCells(3, 3), label: undefined } : {}),
  }
}

const PALETTE: { type: CanvasElementType; label: string; icon: React.ReactNode }[] = [
  { type: 'heading',   label: 'Heading',    icon: <TitleIcon /> },
  { type: 'label',     label: 'Label',      icon: <TextFieldsIcon /> },
  { type: 'input',     label: 'Text Input', icon: <InputIcon /> },
  { type: 'textarea',  label: 'Text Area',  icon: <NotesIcon /> },
  { type: 'number',    label: 'Number',     icon: <NumbersIcon /> },
  { type: 'date',      label: 'Date',       icon: <CalendarTodayIcon /> },
  { type: 'radio',     label: 'Radio',      icon: <RadioButtonCheckedIcon /> },
  { type: 'checkbox',  label: 'Checkbox',   icon: <CheckBoxOutlinedIcon /> },
  { type: 'signature', label: 'Signature',  icon: <DrawIcon /> },
  { type: 'table',     label: 'Table',      icon: <GridOnIcon /> },
]

const cellColWidths = (el: CanvasElement, cols: number): number[] =>
  el.colWidths?.length === cols ? el.colWidths : Array.from({ length: cols }, () => 1)

// ─────────────────────────────────────────────
// Builder component
// ─────────────────────────────────────────────

interface BuilderProps {
  schema: CanvasFormSchema | null
  onChange: (schema: CanvasFormSchema) => void
}

export function CanvasFormBuilder({ schema, onChange }: BuilderProps) {
  const [elements, setElements] = useState<CanvasElement[]>(() => schema?.elements ?? [])
  const [canvasHeight, setCanvasHeight] = useState(schema?.canvas_height ?? 900)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null)

  // Refs prevent stale closures inside document listeners
  const activeOpRef = useRef<ActiveOp | null>(null)
  const elementsRef  = useRef(elements)
  const onChangeRef  = useRef(onChange)
  const heightRef    = useRef(canvasHeight)
  const canvasRef    = useRef<HTMLDivElement>(null)

  useEffect(() => { elementsRef.current = elements },  [elements])
  useEffect(() => { onChangeRef.current = onChange },   [onChange])
  useEffect(() => { heightRef.current = canvasHeight }, [canvasHeight])

  // Sync in when schema changes externally (e.g. loading a form)
  useEffect(() => {
    if (schema) {
      setElements(schema.elements)
      setCanvasHeight(schema.canvas_height)
    }
  }, [schema])

  const commit = useCallback((elems: CanvasElement[], h?: number) => {
    onChangeRef.current({
      canvas_width: CANVAS_W,
      canvas_height: h ?? heightRef.current,
      elements: elems,
    })
  }, [])

  const growHeight = (elems: CanvasElement[]): number => {
    const needed = snap(elems.reduce((m, el) => Math.max(m, el.y + el.height + 100), 600))
    if (needed > heightRef.current) {
      setCanvasHeight(needed)
      heightRef.current = needed
      return needed
    }
    return heightRef.current
  }

  // Global mouse move / up during drag or resize
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const op = activeOpRef.current
      if (!op) return

      if (op.kind === 'move') {
        const dx = snap(e.clientX - op.startX)
        const dy = snap(e.clientY - op.startY)
        setElements(prev => prev.map(el =>
          el.id !== op.id ? el : {
            ...el,
            x: Math.max(0, Math.min(CANVAS_W - el.width, op.origX + dx)),
            y: Math.max(0, op.origY + dy),
          },
        ))
      }

      if (op.kind === 'resize') {
        const dx = e.clientX - op.startX
        const dy = e.clientY - op.startY
        setElements(prev => prev.map(el => {
          if (el.id !== op.id) return el
          let { x, y, width, height } = { x: op.origX, y: op.origY, width: op.origW, height: op.origH }
          const h = op.handle
          if (h.includes('e')) width  = snap(Math.max(MIN_W, op.origW + dx))
          if (h.includes('s')) height = snap(Math.max(MIN_H, op.origH + dy))
          if (h.includes('w')) {
            const nw = snap(Math.max(MIN_W, op.origW - dx))
            x     = snap(op.origX + op.origW - nw)
            width = nw
          }
          if (h.includes('n')) {
            const nh = snap(Math.max(MIN_H, op.origH - dy))
            y      = snap(op.origY + op.origH - nh)
            height = nh
          }
          return { ...el, x, y, width, height }
        }))
      }
    }

    const onUp = () => {
      if (!activeOpRef.current) return
      activeOpRef.current = null
      document.body.style.cursor    = ''
      document.body.style.userSelect = ''
      const elems = elementsRef.current
      const h = growHeight(elems)
      commit(elems, h)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',   onUp)
    }
  }, [commit])

  // Delete key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const active = document.activeElement
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return
      if (!selectedId) return
      setElements(prev => {
        const next = prev.filter(el => el.id !== selectedId)
        commit(next)
        return next
      })
      setSelectedId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, commit])

  const startMove = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    const el = elements.find(x => x.id === id)
    if (!el) return
    setSelectedId(id)
    activeOpRef.current = { kind: 'move', id, startX: e.clientX, startY: e.clientY, origX: el.x, origY: el.y }
    document.body.style.cursor     = 'move'
    document.body.style.userSelect = 'none'
  }

  const startResize = (e: React.MouseEvent, id: string, handle: ResizeHandle) => {
    e.stopPropagation()
    e.preventDefault()
    const el = elements.find(x => x.id === id)
    if (!el) return
    activeOpRef.current = { kind: 'resize', id, handle, startX: e.clientX, startY: e.clientY, origX: el.x, origY: el.y, origW: el.width, origH: el.height }
    document.body.style.cursor     = HANDLE_CURSORS[handle]
    document.body.style.userSelect = 'none'
  }

  const addElement = (type: CanvasElementType, x = 60, y = 60) => {
    const offset = elements.length * 20 % 180
    const el = makeElement(type, x + offset, y + offset)
    const next = [...elements, el]
    setElements(next)
    const h = growHeight(next)
    commit(next, h)
    setSelectedId(el.id)
  }

  const handleCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const type = e.dataTransfer.getData('application/x-canvas-element') as CanvasElementType
    if (!type) return
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    addElement(type, snap(e.clientX - rect.left), snap(e.clientY - rect.top))
  }

  const updateEl = (patch: Partial<CanvasElement>) => {
    if (!selectedId) return
    setElements(prev => {
      const next = prev.map(el => el.id === selectedId ? { ...el, ...patch } : el)
      commit(next)
      return next
    })
  }

  const deleteSelected = () => {
    if (!selectedId) return
    setElements(prev => {
      const next = prev.filter(el => el.id !== selectedId)
      commit(next)
      return next
    })
    setSelectedId(null)
  }

  const selected = elements.find(el => el.id === selectedId) ?? null
  const selectedCell =
    selected?.type === 'table'
      ? selected.cells?.flat().find(c => c.id === selectedCellId) ?? null
      : null

  // Cell selection only applies while a table is selected
  useEffect(() => {
    if (!selected || selected.type !== 'table') setSelectedCellId(null)
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── table mutations ────────────────────────

  const tableColCount = (el: CanvasElement) => el.cols ?? el.cells?.[0]?.length ?? 0

  const addTableRow = () => {
    if (!selected?.cells) return
    const cols = tableColCount(selected)
    const cells = [...selected.cells.map(r => [...r]), Array.from({ length: cols }, () => makeTableCell())]
    updateEl({ cells, rows: cells.length, height: (selected.height ?? 0) + TABLE_ROW_H })
  }

  const removeTableRow = () => {
    if (!selected?.cells || selected.cells.length <= 1) return
    const cells = selected.cells.slice(0, -1).map(r => [...r])
    updateEl({ cells, rows: cells.length, height: Math.max(TABLE_ROW_H, (selected.height ?? 0) - TABLE_ROW_H) })
    setSelectedCellId(null)
  }

  const addTableCol = () => {
    if (!selected?.cells) return
    const cells = selected.cells.map(r => [...r, makeTableCell()])
    const colWidths = [...cellColWidths(selected, tableColCount(selected)), 1]
    updateEl({ cells, cols: cells[0].length, colWidths, width: (selected.width ?? 0) + TABLE_COL_W })
  }

  const removeTableCol = () => {
    if (!selected?.cells || tableColCount(selected) <= 1) return
    const cells = selected.cells.map(r => r.slice(0, -1))
    const colWidths = cellColWidths(selected, tableColCount(selected)).slice(0, cells[0].length)
    updateEl({ cells, cols: cells[0].length, colWidths, width: Math.max(TABLE_COL_W, (selected.width ?? 0) - TABLE_COL_W) })
    setSelectedCellId(null)
  }

  const updateTableCell = (cellId: string, patch: Partial<TableCell>) => {
    if (!selected?.cells) return
    const cells = selected.cells.map(row => row.map(c => (c.id === cellId ? { ...c, ...patch } : c)))
    updateEl({ cells })
  }

  const changeCellType = (cellId: string, type: CanvasElementType) => {
    const patch: Partial<TableCell> = { type }
    if ((type === 'radio' || type === 'checkbox') && !selectedCell?.options?.length) {
      patch.options = type === 'radio' ? ['Yes', 'No'] : ['Option 1']
      patch.optionLayout = 'horizontal'
    }
    updateTableCell(cellId, patch)
  }

  // ── element rendering ──────────────────────

  const renderContent = (el: CanvasElement) => {
    const labelSx = {
      display: 'block',
      fontSize: el.fontSize ?? (el.type === 'heading' ? 18 : 13),
      fontWeight: el.fontWeight ?? (el.type === 'heading' ? 'bold' : 'normal'),
      color: el.type === 'heading' ? '#1E1B4B' : '#374151',
      textAlign: (el.align ?? 'left') as 'left' | 'center' | 'right',
      lineHeight: 1.4,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      userSelect: 'none',
    } as const

    const fieldBoxSx = {
      flex: 1,
      border: '1px solid #D1D5DB',
      borderRadius: '6px',
      bgcolor: '#F9FAFB',
      display: 'flex',
      alignItems: 'center',
      px: 1,
    }

    const wrapSx = {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: 0.5,
      height: '100%',
      overflow: 'hidden',
    }

    const descLine = el.description ? (
      <Typography sx={{ fontSize: 11, color: '#6B7280', fontStyle: 'italic', userSelect: 'none' as const, mt: -0.25, lineHeight: 1.3 }}>
        {el.description}
      </Typography>
    ) : null

    switch (el.type) {
      case 'heading':
      case 'label':
        return (
          <Box sx={{ height: '100%', overflow: 'hidden' }}>
            <Typography sx={{ ...labelSx, whiteSpace: 'pre-wrap' }}>{el.label || 'Label'}</Typography>
            {descLine}
          </Box>
        )

      case 'input':
        return (
          <Box sx={wrapSx}>
            {el.label && <Typography sx={labelSx}>{el.label}</Typography>}
            {descLine}
            <Box sx={fieldBoxSx}>
              <Typography sx={{ fontSize: 12, color: '#9CA3AF', userSelect: 'none' }}>{el.placeholder || ''}</Typography>
            </Box>
          </Box>
        )

      case 'textarea':
        return (
          <Box sx={wrapSx}>
            {el.label && <Typography sx={labelSx}>{el.label}</Typography>}
            {descLine}
            <Box sx={{ ...fieldBoxSx, alignItems: 'flex-start', pt: 0.75, pb: 0.5 }}>
              <Typography sx={{ fontSize: 12, color: '#9CA3AF', userSelect: 'none' }}>{el.placeholder || ''}</Typography>
            </Box>
          </Box>
        )

      case 'number':
        return (
          <Box sx={wrapSx}>
            {el.label && <Typography sx={labelSx}>{el.label}</Typography>}
            {descLine}
            <Box sx={fieldBoxSx}>
              <Typography sx={{ fontSize: 12, color: '#9CA3AF', userSelect: 'none' }}>0</Typography>
            </Box>
          </Box>
        )

      case 'date':
        return (
          <Box sx={wrapSx}>
            {el.label && <Typography sx={labelSx}>{el.label}</Typography>}
            {descLine}
            <Box sx={fieldBoxSx}>
              <Typography sx={{ fontSize: 12, color: '#9CA3AF', userSelect: 'none' }}>MM / DD / YYYY</Typography>
            </Box>
          </Box>
        )

      case 'radio': {
        const opts = el.options?.length ? el.options : ['Yes', 'No']
        return (
          <Box sx={wrapSx}>
            {el.label && <Typography sx={labelSx}>{el.label}</Typography>}
            {descLine}
            <Box sx={{ display: 'flex', flexDirection: el.optionLayout === 'vertical' ? 'column' : 'row', flexWrap: 'wrap', gap: 1, mt: 0.25 }}>
              {opts.map(opt => (
                <Box key={opt} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box sx={{ width: 13, height: 13, borderRadius: '50%', border: '1.5px solid #6B7280', flexShrink: 0 }} />
                  <Typography sx={{ fontSize: 12, color: '#374151', userSelect: 'none' }}>{opt}</Typography>
                </Box>
              ))}
            </Box>
          </Box>
        )
      }

      case 'checkbox': {
        const opts = el.options?.length ? el.options : ['Option']
        return (
          <Box sx={wrapSx}>
            {el.label && <Typography sx={labelSx}>{el.label}</Typography>}
            {descLine}
            <Box sx={{ display: 'flex', flexDirection: el.optionLayout === 'vertical' ? 'column' : 'row', flexWrap: 'wrap', gap: 1, mt: 0.25 }}>
              {opts.map(opt => (
                <Box key={opt} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box sx={{ width: 13, height: 13, borderRadius: '3px', border: '1.5px solid #6B7280', flexShrink: 0 }} />
                  <Typography sx={{ fontSize: 12, color: '#374151', userSelect: 'none' }}>{opt}</Typography>
                </Box>
              ))}
            </Box>
          </Box>
        )
      }

      case 'signature':
        return (
          <Box sx={wrapSx}>
            {el.label && <Typography sx={labelSx}>{el.label}</Typography>}
            {descLine}
            <Box sx={{
              flex: 1,
              border: '1px dashed #9CA3AF',
              borderRadius: '6px',
              bgcolor: '#FAFAFA',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Typography sx={{ fontSize: 11, color: '#9CA3AF', fontStyle: 'italic', userSelect: 'none' }}>Sign here</Typography>
            </Box>
          </Box>
        )

      case 'table': {
        const cells = el.cells ?? []
        const cols = tableColCount(el) || 1
        const widths = cellColWidths(el, cols)
        return (
          <Box sx={{
            display: 'grid',
            gridTemplateColumns: widths.map(w => `${w}fr`).join(' '),
            gridAutoRows: '1fr',
            height: '100%',
            width: '100%',
            border: '1px solid #94A3B8',
            borderRadius: '4px',
            overflow: 'hidden',
          }}>
            {cells.map((row, r) => row.map((cell, c) => {
              const isHeader = Boolean(el.headerRow) && r === 0
              const isCellSel = cell.id === selectedCellId
              return (
                <Box
                  key={cell.id}
                  onMouseDown={e => e.stopPropagation()}
                  onClick={e => { e.stopPropagation(); setSelectedId(el.id); setSelectedCellId(cell.id) }}
                  sx={{
                    borderRight: c < cols - 1 ? '1px solid #CBD5E1' : 'none',
                    borderBottom: r < cells.length - 1 ? '1px solid #CBD5E1' : 'none',
                    bgcolor: isCellSel ? '#EDE9FE' : (cell.bgColor === 'grey' || isHeader) ? '#E5E7EB' : '#ffffff',
                    boxShadow: isCellSel ? 'inset 0 0 0 2px #7C3AED' : 'none',
                    p: 0.5,
                    overflow: 'hidden',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    minWidth: 0,
                  }}
                >
                  {renderTableCellPreview(cell, isHeader)}
                </Box>
              )
            }))}
          </Box>
        )
      }

      default:
        return null
    }
  }

  const renderElement = (el: CanvasElement) => {
    const isSelected = el.id === selectedId
    return (
      <Box
        key={el.id}
        onMouseDown={e => startMove(e, el.id)}
        onClick={e => { e.stopPropagation(); setSelectedId(el.id) }}
        sx={{
          position: 'absolute',
          left: el.x,
          top: el.y,
          width: el.width,
          height: el.height,
          zIndex: el.zIndex ?? 1,
          cursor: 'move',
          boxSizing: 'border-box',
          p: 1,
          bgcolor: el.bgColor === 'grey' ? '#E5E7EB' : '#ffffff',
          border: isSelected ? '2px solid #7C3AED' : '1px solid transparent',
          borderRadius: '8px',
          outline: isSelected ? '3px solid rgba(124,58,237,0.12)' : 'none',
          outlineOffset: 1,
          transition: 'border-color 0.1s',
          '&:hover': {
            border: isSelected ? '2px solid #7C3AED' : '1px solid #C4B5FD',
          },
          overflow: 'hidden',
        }}
      >
        {renderContent(el)}
        {isSelected && (
          <>
            {(Object.keys(HANDLE_CURSORS) as ResizeHandle[]).map(h => {
              const style: Record<string, number | string> = {
                position: 'absolute',
                width: 10,
                height: 10,
                bgcolor: '#7C3AED',
                border: '2px solid #fff',
                borderRadius: '2px',
                cursor: HANDLE_CURSORS[h],
                zIndex: 10,
              }
              if (h.includes('n')) style.top    = -5
              if (h.includes('s')) style.bottom = -5
              if (!h.includes('n') && !h.includes('s')) style.top = 'calc(50% - 5px)'
              if (h.includes('w')) style.left   = -5
              if (h.includes('e')) style.right  = -5
              if (!h.includes('w') && !h.includes('e')) style.left = 'calc(50% - 5px)'
              return (
                <Box
                  key={h}
                  onMouseDown={e => startResize(e, el.id, h)}
                  sx={style}
                />
              )
            })}
          </>
        )}
      </Box>
    )
  }

  // ── properties panel ──────────────────────

  const renderProperties = () => {
    if (!selected) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 1, color: '#94A3B8', p: 2 }}>
          <TextFieldsIcon sx={{ fontSize: 32, opacity: 0.4 }} />
          <Typography sx={{ fontSize: 12, fontWeight: 700, textAlign: 'center', color: '#94A3B8' }}>
            Click an element to edit its properties
          </Typography>
        </Box>
      )
    }

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Chip
            size="small"
            label={selected.type}
            sx={{ textTransform: 'capitalize', bgcolor: '#EDE9FE', color: '#5B21B6', fontWeight: 800 }}
          />
          <Tooltip title="Delete element (Del)">
            <IconButton size="small" color="error" onClick={deleteSelected}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        {selected.type === 'table' && renderTableProps()}

        {selected.type !== 'table' && (<>

        {/* Label */}
        {selected.type !== 'signature' && (
          <TextField
            label="Label"
            size="small"
            fullWidth
            value={selected.label ?? ''}
            onChange={e => updateEl({ label: e.target.value })}
          />
        )}

        {/* Description */}
        <TextField
          label="Description"
          size="small"
          fullWidth
          multiline
          minRows={2}
          maxRows={4}
          placeholder="Optional hint or instructions shown below the label"
          value={selected.description ?? ''}
          onChange={e => updateEl({ description: e.target.value })}
          inputProps={{ sx: { fontSize: 12 } }}
        />

        {/* Cell color */}
        <Box>
          <Typography sx={{ fontSize: 11, color: '#64748B', mb: 0.5, fontWeight: 700 }}>Cell color</Typography>
          <Box sx={{ display: 'flex', gap: 0.75 }}>
            {([
              { value: 'white' as const, color: '#ffffff', label: 'White' },
              { value: 'grey'  as const, color: '#E5E7EB', label: 'Grey' },
            ]).map(sw => {
              const isActive = (selected.bgColor ?? 'white') === sw.value
              return (
                <Tooltip key={sw.value} title={sw.label}>
                  <Box
                    onClick={() => updateEl({ bgColor: sw.value })}
                    sx={{
                      width: 34,
                      height: 26,
                      borderRadius: '6px',
                      bgcolor: sw.color,
                      cursor: 'pointer',
                      border: isActive ? '2px solid #7C3AED' : '1px solid #CBD5E1',
                      outline: isActive ? '2px solid rgba(124,58,237,0.15)' : 'none',
                      outlineOffset: 1,
                    }}
                  />
                </Tooltip>
              )
            })}
          </Box>
        </Box>

        {/* Placeholder */}
        {(['input', 'textarea'] as CanvasElementType[]).includes(selected.type) && (
          <TextField
            label="Placeholder"
            size="small"
            fullWidth
            value={selected.placeholder ?? ''}
            onChange={e => updateEl({ placeholder: e.target.value })}
          />
        )}

        {/* Font size */}
        {(['heading', 'label'] as CanvasElementType[]).includes(selected.type) && (
          <TextField
            label="Font size (px)"
            size="small"
            type="number"
            fullWidth
            value={selected.fontSize ?? (selected.type === 'heading' ? 18 : 13)}
            inputProps={{ min: 8, max: 72 }}
            onChange={e => updateEl({ fontSize: Math.max(8, Math.min(72, Number(e.target.value))) })}
          />
        )}

        {/* Bold */}
        {(['heading', 'label'] as CanvasElementType[]).includes(selected.type) && (
          <Box>
            <Typography sx={{ fontSize: 11, color: '#64748B', mb: 0.5, fontWeight: 700 }}>Weight</Typography>
            <ToggleButtonGroup
              size="small"
              value={selected.fontWeight ?? 'normal'}
              exclusive
              onChange={(_, v) => v && updateEl({ fontWeight: v })}
            >
              <ToggleButton value="normal" sx={{ px: 2, fontSize: 12 }}>Normal</ToggleButton>
              <ToggleButton value="bold"><FormatBoldIcon fontSize="small" /></ToggleButton>
            </ToggleButtonGroup>
          </Box>
        )}

        {/* Align */}
        <Box>
          <Typography sx={{ fontSize: 11, color: '#64748B', mb: 0.5, fontWeight: 700 }}>Alignment</Typography>
          <ToggleButtonGroup
            size="small"
            value={selected.align ?? 'left'}
            exclusive
            onChange={(_, v) => v && updateEl({ align: v })}
          >
            <ToggleButton value="left"><FormatAlignLeftIcon fontSize="small" /></ToggleButton>
            <ToggleButton value="center"><FormatAlignCenterIcon fontSize="small" /></ToggleButton>
            <ToggleButton value="right"><FormatAlignRightIcon fontSize="small" /></ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {/* Options for radio/checkbox */}
        {(['radio', 'checkbox'] as CanvasElementType[]).includes(selected.type) && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography sx={{ fontSize: 11, color: '#64748B', fontWeight: 700 }}>Options</Typography>
              <ToggleButtonGroup
                size="small"
                value={selected.optionLayout ?? 'horizontal'}
                exclusive
                onChange={(_, v) => v && updateEl({ optionLayout: v })}
              >
                <ToggleButton value="horizontal" sx={{ px: 1.5, fontSize: 10 }}>H</ToggleButton>
                <ToggleButton value="vertical"   sx={{ px: 1.5, fontSize: 10 }}>V</ToggleButton>
              </ToggleButtonGroup>
            </Box>
            {(selected.options ?? []).map((opt, i) => (
              <Box key={i} sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                <TextField
                  size="small"
                  value={opt}
                  onChange={e => {
                    const options = [...(selected.options ?? [])]
                    options[i] = e.target.value
                    updateEl({ options })
                  }}
                  sx={{ flex: 1 }}
                  inputProps={{ sx: { fontSize: 12 } }}
                />
                <IconButton
                  size="small"
                  onClick={() => updateEl({ options: (selected.options ?? []).filter((_, idx) => idx !== i) })}
                  disabled={selected.type === 'radio' && (selected.options?.length ?? 0) <= 1}
                  sx={{ color: '#DC2626', p: 0.5 }}
                >
                  <DeleteIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Box>
            ))}
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={() => updateEl({ options: [...(selected.options ?? []), `Option ${(selected.options?.length ?? 0) + 1}`] })}
              sx={{ alignSelf: 'flex-start', textTransform: 'none', fontWeight: 700, fontSize: 12 }}
            >
              Add option
            </Button>
          </Box>
        )}

        </>)}

        <Divider />

        {/* Position & size */}
        <Typography sx={{ fontSize: 11, fontWeight: 900, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Position & Size
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
          {(['x', 'y', 'width', 'height'] as const).map(prop => (
            <TextField
              key={prop}
              label={prop.toUpperCase()}
              size="small"
              type="number"
              value={selected[prop]}
              inputProps={{ min: prop === 'width' ? MIN_W : prop === 'height' ? MIN_H : 0 }}
              onChange={e => updateEl({ [prop]: snap(Math.max(prop === 'width' ? MIN_W : prop === 'height' ? MIN_H : 0, Number(e.target.value))) })}
            />
          ))}
        </Box>

        <Divider />

        {/* Z-order */}
        <Box sx={{ display: 'flex', gap: 0.75 }}>
          <Button
            size="small"
            fullWidth
            variant="outlined"
            onClick={() => updateEl({ zIndex: (selected.zIndex ?? 1) + 1 })}
            sx={{ textTransform: 'none', fontWeight: 700, fontSize: 11, borderRadius: '8px' }}
          >
            Bring Forward
          </Button>
          <Button
            size="small"
            fullWidth
            variant="outlined"
            onClick={() => updateEl({ zIndex: Math.max(0, (selected.zIndex ?? 1) - 1) })}
            sx={{ textTransform: 'none', fontWeight: 700, fontSize: 11, borderRadius: '8px' }}
          >
            Send Back
          </Button>
        </Box>
      </Box>
    )
  }

  // ── table properties (structure + selected-cell editor) ──
  const renderTableProps = () => {
    if (!selected || selected.type !== 'table') return null
    const rows = selected.cells?.length ?? 0
    const cols = tableColCount(selected)
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, p: 1, bgcolor: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
          <Typography sx={{ fontSize: 11, fontWeight: 900, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Table
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography sx={{ fontSize: 12, color: '#374151', fontWeight: 700 }}>Rows: {rows}</Typography>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <IconButton size="small" onClick={removeTableRow} disabled={rows <= 1} sx={{ border: '1px solid #E2E8F0', borderRadius: '6px' }}>
                <Typography sx={{ fontSize: 16, fontWeight: 900, lineHeight: 1 }}>−</Typography>
              </IconButton>
              <IconButton size="small" onClick={addTableRow} sx={{ border: '1px solid #E2E8F0', borderRadius: '6px' }}>
                <AddIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography sx={{ fontSize: 12, color: '#374151', fontWeight: 700 }}>Columns: {cols}</Typography>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <IconButton size="small" onClick={removeTableCol} disabled={cols <= 1} sx={{ border: '1px solid #E2E8F0', borderRadius: '6px' }}>
                <Typography sx={{ fontSize: 16, fontWeight: 900, lineHeight: 1 }}>−</Typography>
              </IconButton>
              <IconButton size="small" onClick={addTableCol} sx={{ border: '1px solid #E2E8F0', borderRadius: '6px' }}>
                <AddIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Box>
          </Box>
          <FormControlLabel
            control={<Checkbox size="small" checked={Boolean(selected.headerRow)} onChange={e => updateEl({ headerRow: e.target.checked })} />}
            label={<Typography sx={{ fontSize: 12, fontWeight: 700 }}>Shaded header row</Typography>}
          />
        </Box>

        {!selectedCell ? (
          <Typography sx={{ fontSize: 11, color: '#94A3B8', fontWeight: 600, textAlign: 'center', py: 1 }}>
            Click a cell in the table to edit its content
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography sx={{ fontSize: 11, fontWeight: 900, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Selected cell
            </Typography>
            <TextField
              select
              label="Cell type"
              size="small"
              fullWidth
              value={selectedCell.type}
              onChange={e => changeCellType(selectedCell.id, e.target.value as CanvasElementType)}
            >
              {CELL_TYPES.map(ct => (
                <MenuItem key={ct.value} value={ct.value} sx={{ fontSize: 13 }}>{ct.label}</MenuItem>
              ))}
            </TextField>

            {selectedCell.type !== 'signature' && (
              <TextField
                label={selectedCell.type === 'label' ? 'Text' : 'Label'}
                size="small"
                fullWidth
                value={selectedCell.label ?? ''}
                onChange={e => updateTableCell(selectedCell.id, { label: e.target.value })}
              />
            )}

            {(selectedCell.type === 'input' || selectedCell.type === 'textarea') && (
              <TextField
                label="Placeholder"
                size="small"
                fullWidth
                value={selectedCell.placeholder ?? ''}
                onChange={e => updateTableCell(selectedCell.id, { placeholder: e.target.value })}
              />
            )}

            {(selectedCell.type === 'radio' || selectedCell.type === 'checkbox') && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography sx={{ fontSize: 11, color: '#64748B', fontWeight: 700 }}>Options</Typography>
                  <ToggleButtonGroup
                    size="small"
                    value={selectedCell.optionLayout ?? 'horizontal'}
                    exclusive
                    onChange={(_, v) => v && updateTableCell(selectedCell.id, { optionLayout: v })}
                  >
                    <ToggleButton value="horizontal" sx={{ px: 1.5, fontSize: 10 }}>H</ToggleButton>
                    <ToggleButton value="vertical"   sx={{ px: 1.5, fontSize: 10 }}>V</ToggleButton>
                  </ToggleButtonGroup>
                </Box>
                {(selectedCell.options ?? []).map((opt, i) => (
                  <Box key={i} sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                    <TextField
                      size="small"
                      value={opt}
                      onChange={e => {
                        const options = [...(selectedCell.options ?? [])]
                        options[i] = e.target.value
                        updateTableCell(selectedCell.id, { options })
                      }}
                      sx={{ flex: 1 }}
                      inputProps={{ sx: { fontSize: 12 } }}
                    />
                    <IconButton
                      size="small"
                      onClick={() => updateTableCell(selectedCell.id, { options: (selectedCell.options ?? []).filter((_, idx) => idx !== i) })}
                      disabled={selectedCell.type === 'radio' && (selectedCell.options?.length ?? 0) <= 1}
                      sx={{ color: '#DC2626', p: 0.5 }}
                    >
                      <DeleteIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Box>
                ))}
                <Button
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={() => updateTableCell(selectedCell.id, { options: [...(selectedCell.options ?? []), `Option ${(selectedCell.options?.length ?? 0) + 1}`] })}
                  sx={{ alignSelf: 'flex-start', textTransform: 'none', fontWeight: 700, fontSize: 12 }}
                >
                  Add option
                </Button>
              </Box>
            )}

            <Box>
              <Typography sx={{ fontSize: 11, color: '#64748B', mb: 0.5, fontWeight: 700 }}>Alignment</Typography>
              <ToggleButtonGroup
                size="small"
                value={selectedCell.align ?? 'left'}
                exclusive
                onChange={(_, v) => v && updateTableCell(selectedCell.id, { align: v })}
              >
                <ToggleButton value="left"><FormatAlignLeftIcon fontSize="small" /></ToggleButton>
                <ToggleButton value="center"><FormatAlignCenterIcon fontSize="small" /></ToggleButton>
                <ToggleButton value="right"><FormatAlignRightIcon fontSize="small" /></ToggleButton>
              </ToggleButtonGroup>
            </Box>

            <Box>
              <Typography sx={{ fontSize: 11, color: '#64748B', mb: 0.5, fontWeight: 700 }}>Cell color</Typography>
              <Box sx={{ display: 'flex', gap: 0.75 }}>
                {([
                  { value: 'white' as const, color: '#ffffff', label: 'White' },
                  { value: 'grey'  as const, color: '#E5E7EB', label: 'Grey' },
                ]).map(sw => {
                  const isActive = (selectedCell.bgColor ?? 'white') === sw.value
                  return (
                    <Tooltip key={sw.value} title={sw.label}>
                      <Box
                        onClick={() => updateTableCell(selectedCell.id, { bgColor: sw.value })}
                        sx={{
                          width: 34,
                          height: 26,
                          borderRadius: '6px',
                          bgcolor: sw.color,
                          cursor: 'pointer',
                          border: isActive ? '2px solid #7C3AED' : '1px solid #CBD5E1',
                          outline: isActive ? '2px solid rgba(124,58,237,0.15)' : 'none',
                          outlineOffset: 1,
                        }}
                      />
                    </Tooltip>
                  )
                })}
              </Box>
            </Box>
          </Box>
        )}
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '148px minmax(760px, 1fr) 230px', md: '168px 1fr 260px' }, minWidth: { xs: 1138, md: 0 }, height: '100%', bgcolor: '#F1F5F9' }}>

      {/* ── Left palette ── */}
      <Box sx={{
        bgcolor: '#ffffff',
        borderRight: '1px solid #E2E8F0',
        p: 1.5,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.25,
        overflowY: 'auto',
      }}>
        <Typography sx={{ fontSize: 10, fontWeight: 900, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.6px', mb: 0.75 }}>
          Elements
        </Typography>
        {PALETTE.map(item => (
          <Box
            key={item.type}
            draggable
            onDragStart={e => {
              e.dataTransfer.setData('application/x-canvas-element', item.type)
              e.dataTransfer.effectAllowed = 'copy'
            }}
            onClick={() => addElement(item.type)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 1.25,
              py: 0.75,
              borderRadius: '8px',
              cursor: 'grab',
              color: '#374151',
              fontSize: 13,
              fontWeight: 700,
              '&:active': { cursor: 'grabbing' },
              '&:hover': { bgcolor: '#F5F3FF', color: '#7C3AED' },
              '& .MuiSvgIcon-root': { fontSize: 17 },
            }}
          >
            {item.icon}
            {item.label}
          </Box>
        ))}
        <Divider sx={{ my: 1 }} />
        <Typography sx={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, textAlign: 'center' }}>
          Click or drag to canvas
        </Typography>
      </Box>

      {/* ── Canvas area ── */}
      <Box sx={{ overflow: 'auto', p: 2.5 }}>
        <Box
          ref={canvasRef}
          onMouseDown={() => { setSelectedId(null); setSelectedCellId(null) }}
          onDrop={handleCanvasDrop}
          onDragOver={e => {
            if (e.dataTransfer.types.includes('application/x-canvas-element')) {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'copy'
            }
          }}
          sx={{
            position: 'relative',
            width: CANVAS_W,
            minHeight: canvasHeight,
            bgcolor: '#ffffff',
            borderRadius: '12px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            border: '1px solid #E2E8F0',
            backgroundImage: [
              'radial-gradient(circle, #CBD5E1 1px, transparent 1px)',
            ].join(','),
            backgroundSize: `${GRID * 2}px ${GRID * 2}px`,
            backgroundPosition: `${GRID}px ${GRID}px`,
          }}
        >
          {elements.map(renderElement)}
        </Box>
      </Box>

      {/* ── Right properties panel ── */}
      <Box sx={{
        bgcolor: '#ffffff',
        borderLeft: '1px solid #E2E8F0',
        p: 1.5,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
      }}>
        <Typography sx={{ fontSize: 10, fontWeight: 900, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
          Properties
        </Typography>
        {renderProperties()}
      </Box>

    </Box>
  )
}

// ─────────────────────────────────────────────
// Viewer component (for filling out the form)
// ─────────────────────────────────────────────

export type CanvasFormValues = Record<string, string | boolean | string[]>

interface ViewerProps {
  schema: CanvasFormSchema
  values?: CanvasFormValues
  onChange?: (values: CanvasFormValues) => void
  readOnly?: boolean
}

export function CanvasFormViewer({ schema, values = {}, onChange, readOnly = false }: ViewerProps) {
  const set = (id: string, val: string | boolean | string[]) => {
    onChange?.({ ...values, [id]: val })
  }

  return (
    <Box sx={{
      position: 'relative',
      width: schema.canvas_width ?? CANVAS_W,
      minHeight: schema.canvas_height ?? 600,
      bgcolor: '#ffffff',
      border: '1px solid #E2E8F0',
      borderRadius: '12px',
      overflow: 'visible',
    }}>
      {schema.elements.map(el => {
        if (el.type === 'table') {
          return (
            <Box
              key={el.id}
              sx={{
                position: 'absolute',
                left: el.x,
                top: el.y,
                width: el.width,
                height: el.height,
                zIndex: el.zIndex ?? 1,
                boxSizing: 'border-box',
              }}
            >
              {renderViewerTable(el, values, set, readOnly)}
            </Box>
          )
        }
        const val = values[el.id]
        return (
          <Box
            key={el.id}
            sx={{
              position: 'absolute',
              left: el.x,
              top: el.y,
              width: el.width,
              height: el.height,
              zIndex: el.zIndex ?? 1,
              boxSizing: 'border-box',
              p: 0.75,
              display: 'flex',
              flexDirection: 'column',
              gap: 0.4,
              bgcolor: el.bgColor === 'grey' ? '#E5E7EB' : 'transparent',
              borderRadius: el.bgColor === 'grey' ? '8px' : 0,
            }}
          >
            {renderViewerContent(el, val, (v) => set(el.id, v), readOnly)}
          </Box>
        )
      })}
    </Box>
  )
}

function renderViewerContent(
  el: CanvasElement,
  val: string | boolean | string[] | undefined,
  set: (v: string | boolean | string[]) => void,
  readOnly: boolean,
) {
  const labelSx = {
    fontSize: el.fontSize ?? (el.type === 'heading' ? 17 : 12),
    fontWeight: el.fontWeight ?? (el.type === 'heading' ? 'bold' : 600),
    color: el.type === 'heading' ? '#1E1B4B' : '#374151',
    textAlign: (el.align ?? 'left') as 'left' | 'center' | 'right',
    lineHeight: 1.4,
    mb: 0.25,
  } as const

  const descLine = el.description ? (
    <Typography sx={{ fontSize: 11, color: '#6B7280', fontStyle: 'italic', lineHeight: 1.3, mb: 0.25 }}>
      {el.description}
    </Typography>
  ) : null

  switch (el.type) {
    case 'heading':
    case 'label':
      return (
        <Box>
          <Typography sx={labelSx}>{el.label}</Typography>
          {descLine}
        </Box>
      )

    case 'input':
    case 'number':
    case 'date':
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4, height: '100%' }}>
          {el.label && <Typography sx={labelSx}>{el.label}</Typography>}
          {descLine}
          <TextField
            size="small"
            type={el.type === 'number' ? 'number' : el.type === 'date' ? 'date' : 'text'}
            placeholder={el.placeholder}
            disabled={readOnly}
            value={typeof val === 'string' ? val : ''}
            onChange={e => set(e.target.value)}
            fullWidth
            sx={{ flex: 1, '& .MuiInputBase-root': { height: '100%', fontSize: 13 } }}
          />
        </Box>
      )

    case 'textarea':
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4, height: '100%' }}>
          {el.label && <Typography sx={labelSx}>{el.label}</Typography>}
          {descLine}
          <TextField
            size="small"
            multiline
            placeholder={el.placeholder}
            disabled={readOnly}
            value={typeof val === 'string' ? val : ''}
            onChange={e => set(e.target.value)}
            fullWidth
            sx={{ flex: 1, '& .MuiInputBase-root': { height: '100%', alignItems: 'flex-start', fontSize: 13 } }}
          />
        </Box>
      )

    case 'radio': {
      const opts = el.options?.length ? el.options : ['Yes', 'No']
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4, height: '100%' }}>
          {el.label && <Typography sx={labelSx}>{el.label}</Typography>}
          {descLine}
          <RadioGroup
            row={el.optionLayout !== 'vertical'}
            value={typeof val === 'string' ? val : ''}
            onChange={e => !readOnly && set(e.target.value)}
            sx={{ flexWrap: 'wrap', gap: 0.25 }}
          >
            {opts.map(opt => (
              <FormControlLabel
                key={opt}
                value={opt}
                control={<Radio size="small" disabled={readOnly} />}
                label={<Typography sx={{ fontSize: 12 }}>{opt}</Typography>}
                sx={{ mr: 0.5 }}
              />
            ))}
          </RadioGroup>
        </Box>
      )
    }

    case 'checkbox': {
      const opts = el.options?.length ? el.options : ['Option']
      const checked: string[] = Array.isArray(val) ? val : []
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4, height: '100%' }}>
          {el.label && <Typography sx={labelSx}>{el.label}</Typography>}
          {descLine}
          <Box sx={{ display: 'flex', flexDirection: el.optionLayout === 'vertical' ? 'column' : 'row', flexWrap: 'wrap', gap: 0.25 }}>
            {opts.map(opt => (
              <FormControlLabel
                key={opt}
                control={
                  <Checkbox
                    size="small"
                    disabled={readOnly}
                    checked={checked.includes(opt)}
                    onChange={e => {
                      if (readOnly) return
                      const next = e.target.checked ? [...checked, opt] : checked.filter(v => v !== opt)
                      set(next)
                    }}
                  />
                }
                label={<Typography sx={{ fontSize: 12 }}>{opt}</Typography>}
                sx={{ mr: 0.5 }}
              />
            ))}
          </Box>
        </Box>
      )
    }

    case 'signature':
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4, height: '100%' }}>
          {el.label && <Typography sx={labelSx}>{el.label}</Typography>}
          {descLine}
          <Box sx={{
            flex: 1,
            border: '1px dashed #9CA3AF',
            borderRadius: '6px',
            bgcolor: '#FAFAFA',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Typography sx={{ fontSize: 11, color: '#9CA3AF', fontStyle: 'italic' }}>Sign here</Typography>
          </Box>
        </Box>
      )

    default:
      return null
  }
}

// ─────────────────────────────────────────────
// Table cell renderers (builder preview + live viewer)
// ─────────────────────────────────────────────

function renderTableCellPreview(cell: TableCell, isHeader: boolean) {
  const textSx = {
    fontSize: 12,
    fontWeight: (isHeader || cell.fontWeight === 'bold') ? 800 : 500,
    color: '#374151',
    textAlign: (cell.align ?? 'left') as 'left' | 'center' | 'right',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    userSelect: 'none' as const,
  }
  const fauxField = (text: string) => (
    <Box sx={{ border: '1px solid #D1D5DB', borderRadius: '4px', bgcolor: '#F9FAFB', px: 0.5, py: 0.25 }}>
      <Typography sx={{ fontSize: 10, color: '#9CA3AF', userSelect: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{text}</Typography>
    </Box>
  )
  switch (cell.type) {
    case 'label':
    case 'heading':
      return <Typography sx={textSx}>{cell.label || <span style={{ color: '#CBD5E1' }}>Text</span>}</Typography>
    case 'input':
      return <Box>{cell.label && <Typography sx={{ ...textSx, mb: 0.25 }}>{cell.label}</Typography>}{fauxField(cell.placeholder || '')}</Box>
    case 'number':
      return <Box>{cell.label && <Typography sx={{ ...textSx, mb: 0.25 }}>{cell.label}</Typography>}{fauxField(cell.placeholder || '0')}</Box>
    case 'date':
      return <Box>{cell.label && <Typography sx={{ ...textSx, mb: 0.25 }}>{cell.label}</Typography>}{fauxField('MM / DD / YYYY')}</Box>
    case 'textarea':
      return (
        <Box>
          {cell.label && <Typography sx={{ ...textSx, mb: 0.25 }}>{cell.label}</Typography>}
          <Box sx={{ border: '1px solid #D1D5DB', borderRadius: '4px', bgcolor: '#F9FAFB', height: 26 }} />
        </Box>
      )
    case 'radio':
    case 'checkbox': {
      const opts = cell.options?.length ? cell.options : ['Option']
      return (
        <Box>
          {cell.label && <Typography sx={{ ...textSx, mb: 0.25 }}>{cell.label}</Typography>}
          <Box sx={{ display: 'flex', flexDirection: cell.optionLayout === 'vertical' ? 'column' : 'row', flexWrap: 'wrap', gap: 0.5 }}>
            {opts.map((o, i) => (
              <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                <Box sx={{ width: 10, height: 10, border: '1.5px solid #6B7280', borderRadius: cell.type === 'radio' ? '50%' : '2px', flexShrink: 0 }} />
                <Typography sx={{ fontSize: 10, color: '#374151', userSelect: 'none' }}>{o}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
      )
    }
    case 'signature':
      return (
        <Box sx={{ border: '1px dashed #9CA3AF', borderRadius: '4px', bgcolor: '#FAFAFA', height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography sx={{ fontSize: 9, color: '#9CA3AF', fontStyle: 'italic' }}>Sign</Typography>
        </Box>
      )
    default:
      return null
  }
}

function renderTableCellField(
  cell: TableCell,
  val: string | boolean | string[] | undefined,
  set: (v: string | boolean | string[]) => void,
  readOnly: boolean,
  isHeader: boolean,
) {
  const textSx = {
    fontSize: 12,
    fontWeight: (isHeader || cell.fontWeight === 'bold') ? 800 : 600,
    color: '#374151',
    textAlign: (cell.align ?? 'left') as 'left' | 'center' | 'right',
    lineHeight: 1.35,
  }
  switch (cell.type) {
    case 'label':
    case 'heading':
      return <Typography sx={textSx}>{cell.label}</Typography>
    case 'input':
    case 'number':
    case 'date':
      return (
        <Box>
          {cell.label && <Typography sx={{ ...textSx, mb: 0.25 }}>{cell.label}</Typography>}
          <TextField
            size="small"
            type={cell.type === 'number' ? 'number' : cell.type === 'date' ? 'date' : 'text'}
            placeholder={cell.placeholder}
            disabled={readOnly}
            value={typeof val === 'string' ? val : ''}
            onChange={e => set(e.target.value)}
            fullWidth
            sx={{ '& .MuiInputBase-root': { fontSize: 13 } }}
          />
        </Box>
      )
    case 'textarea':
      return (
        <Box>
          {cell.label && <Typography sx={{ ...textSx, mb: 0.25 }}>{cell.label}</Typography>}
          <TextField
            size="small"
            multiline
            minRows={2}
            placeholder={cell.placeholder}
            disabled={readOnly}
            value={typeof val === 'string' ? val : ''}
            onChange={e => set(e.target.value)}
            fullWidth
            sx={{ '& .MuiInputBase-root': { fontSize: 13, alignItems: 'flex-start' } }}
          />
        </Box>
      )
    case 'radio': {
      const opts = cell.options?.length ? cell.options : ['Yes', 'No']
      return (
        <Box>
          {cell.label && <Typography sx={{ ...textSx, mb: 0.25 }}>{cell.label}</Typography>}
          <RadioGroup
            row={cell.optionLayout !== 'vertical'}
            value={typeof val === 'string' ? val : ''}
            onChange={e => !readOnly && set(e.target.value)}
            sx={{ flexWrap: 'wrap', gap: 0.25 }}
          >
            {opts.map(opt => (
              <FormControlLabel
                key={opt}
                value={opt}
                control={<Radio size="small" disabled={readOnly} />}
                label={<Typography sx={{ fontSize: 12 }}>{opt}</Typography>}
                sx={{ mr: 0.5 }}
              />
            ))}
          </RadioGroup>
        </Box>
      )
    }
    case 'checkbox': {
      const opts = cell.options?.length ? cell.options : ['Option']
      const checked: string[] = Array.isArray(val) ? val : []
      return (
        <Box>
          {cell.label && <Typography sx={{ ...textSx, mb: 0.25 }}>{cell.label}</Typography>}
          <Box sx={{ display: 'flex', flexDirection: cell.optionLayout === 'vertical' ? 'column' : 'row', flexWrap: 'wrap', gap: 0.25 }}>
            {opts.map(opt => (
              <FormControlLabel
                key={opt}
                control={
                  <Checkbox
                    size="small"
                    disabled={readOnly}
                    checked={checked.includes(opt)}
                    onChange={e => {
                      if (readOnly) return
                      const next = e.target.checked ? [...checked, opt] : checked.filter(v => v !== opt)
                      set(next)
                    }}
                  />
                }
                label={<Typography sx={{ fontSize: 12 }}>{opt}</Typography>}
                sx={{ mr: 0.5 }}
              />
            ))}
          </Box>
        </Box>
      )
    }
    case 'signature':
      return (
        <Box sx={{ border: '1px dashed #9CA3AF', borderRadius: '4px', bgcolor: '#FAFAFA', minHeight: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography sx={{ fontSize: 10, color: '#9CA3AF', fontStyle: 'italic' }}>Sign here</Typography>
        </Box>
      )
    default:
      return null
  }
}

function renderViewerTable(
  el: CanvasElement,
  values: CanvasFormValues,
  set: (id: string, val: string | boolean | string[]) => void,
  readOnly: boolean,
) {
  const cells = el.cells ?? []
  const cols = el.cols ?? (cells[0]?.length ?? 1)
  const widths = el.colWidths?.length === cols ? el.colWidths : Array.from({ length: cols }, () => 1)
  return (
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: widths.map(w => `${w}fr`).join(' '),
      gridAutoRows: 'minmax(40px, auto)',
      width: '100%',
      height: '100%',
      border: '1px solid #94A3B8',
      borderRadius: '6px',
      overflow: 'hidden',
    }}>
      {cells.map((row, r) => row.map((cell, c) => {
        const isHeader = Boolean(el.headerRow) && r === 0
        return (
          <Box
            key={cell.id}
            sx={{
              borderRight: c < cols - 1 ? '1px solid #CBD5E1' : 'none',
              borderBottom: r < cells.length - 1 ? '1px solid #CBD5E1' : 'none',
              bgcolor: (cell.bgColor === 'grey' || isHeader) ? '#E5E7EB' : '#ffffff',
              p: 0.75,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              minWidth: 0,
            }}
          >
            {renderTableCellField(cell, values[cell.id], v => set(cell.id, v), readOnly, isHeader)}
          </Box>
        )
      }))}
    </Box>
  )
}
