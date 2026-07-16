import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Divider,
  FormControlLabel,
  IconButton,
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
]

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

    switch (el.type) {
      case 'heading':
      case 'label':
        return <Typography sx={{ ...labelSx, whiteSpace: 'pre-wrap' }}>{el.label || 'Label'}</Typography>

      case 'input':
        return (
          <Box sx={wrapSx}>
            {el.label && <Typography sx={labelSx}>{el.label}</Typography>}
            <Box sx={fieldBoxSx}>
              <Typography sx={{ fontSize: 12, color: '#9CA3AF', userSelect: 'none' }}>{el.placeholder || ''}</Typography>
            </Box>
          </Box>
        )

      case 'textarea':
        return (
          <Box sx={wrapSx}>
            {el.label && <Typography sx={labelSx}>{el.label}</Typography>}
            <Box sx={{ ...fieldBoxSx, alignItems: 'flex-start', pt: 0.75, pb: 0.5 }}>
              <Typography sx={{ fontSize: 12, color: '#9CA3AF', userSelect: 'none' }}>{el.placeholder || ''}</Typography>
            </Box>
          </Box>
        )

      case 'number':
        return (
          <Box sx={wrapSx}>
            {el.label && <Typography sx={labelSx}>{el.label}</Typography>}
            <Box sx={fieldBoxSx}>
              <Typography sx={{ fontSize: 12, color: '#9CA3AF', userSelect: 'none' }}>0</Typography>
            </Box>
          </Box>
        )

      case 'date':
        return (
          <Box sx={wrapSx}>
            {el.label && <Typography sx={labelSx}>{el.label}</Typography>}
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
          bgcolor: '#ffffff',
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

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '168px 1fr 260px', height: '100%', bgcolor: '#F1F5F9' }}>

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
          onMouseDown={() => setSelectedId(null)}
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

  switch (el.type) {
    case 'heading':
    case 'label':
      return <Typography sx={labelSx}>{el.label}</Typography>

    case 'input':
    case 'number':
    case 'date':
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4, height: '100%' }}>
          {el.label && <Typography sx={labelSx}>{el.label}</Typography>}
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
