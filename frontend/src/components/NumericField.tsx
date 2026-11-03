import { useEffect, useState } from 'react'
import TextField, { type TextFieldProps } from '@mui/material/TextField'

type Props = Omit<TextFieldProps, 'value' | 'onChange' | 'type'> & {
  value: number
  onChange: (val: number) => void
  /** Show a 0 value as "0" (backspace clears it, typing replaces it) instead of an empty field. */
  showZero?: boolean
}

/**
 * Numeric input that keeps local string state so the field can be empty
 * while the user is typing, preventing the "field snaps to 0" problem.
 */
export function NumericField({ value, onChange, onBlur, showZero = false, ...props }: Props) {
  const display = (num: number) => (num === 0 && !showZero ? '' : String(num))
  const [text, setText] = useState(display(value))

  useEffect(() => {
    const current = text === '' ? 0 : parseFloat(text) || 0
    if (current !== value) {
      setText(display(value))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <TextField
      {...props}
      type="number"
      value={text}
      onChange={e => {
        // A typed digit replaces a leading 0 ("05" -> "5"); "0.5" stays as it is.
        const raw = showZero ? e.target.value.replace(/^(-?)0+(?=\d)/, '$1') : e.target.value
        setText(raw)
        const num = parseFloat(raw)
        onChange(isNaN(num) ? 0 : num)
      }}
      onBlur={e => {
        const num = parseFloat(text)
        const final = isNaN(num) ? 0 : num
        onChange(final)
        setText(display(final))
        if (typeof onBlur === 'function') onBlur(e)
      }}
    />
  )
}
