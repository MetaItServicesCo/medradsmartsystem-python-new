import { useEffect, useState } from 'react'
import TextField, { type TextFieldProps } from '@mui/material/TextField'

type Props = Omit<TextFieldProps, 'value' | 'onChange' | 'type'> & {
  value: number
  onChange: (val: number) => void
}

/**
 * Numeric input that keeps local string state so the field can be empty
 * while the user is typing, preventing the "field snaps to 0" problem.
 */
export function NumericField({ value, onChange, onBlur, ...props }: Props) {
  const [text, setText] = useState(value === 0 ? '' : String(value))

  useEffect(() => {
    const current = text === '' ? 0 : parseFloat(text) || 0
    if (current !== value) {
      setText(value === 0 ? '' : String(value))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <TextField
      {...props}
      type="number"
      value={text}
      onChange={e => {
        const raw = e.target.value
        setText(raw)
        const num = parseFloat(raw)
        onChange(isNaN(num) ? 0 : num)
      }}
      onBlur={e => {
        const num = parseFloat(text)
        const final = isNaN(num) ? 0 : num
        onChange(final)
        setText(final === 0 ? '' : String(final))
        if (typeof onBlur === 'function') onBlur(e)
      }}
    />
  )
}
