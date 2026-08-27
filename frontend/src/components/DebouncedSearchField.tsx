import { useEffect, useRef, useState } from 'react'
import { TextField, type TextFieldProps } from '@mui/material'

type Props = Omit<TextFieldProps, 'value' | 'onChange' | 'defaultValue'> & {
  /** Initial text. Change the component's `key` to re-seed it (e.g. deep links). */
  defaultValue?: string
  /** Debounce window in ms before the trimmed value is reported. */
  delay?: number
  /** Called with the debounced, trimmed value. Use a stable setter. */
  onDebouncedChange: (value: string) => void
}

/**
 * A search text field that keeps its keystroke state to itself and only reports
 * a debounced value to the parent. This prevents every keystroke from
 * re-rendering large page components — the parent re-renders at most once per
 * debounce window (when the query actually changes), not on every character.
 *
 * Behaviour matches the previous inline `TextField` + debounce effect: same
 * 300ms debounce and trimming. External resets (deep links, clears) are applied
 * by remounting via a changed `key`.
 */
const DebouncedSearchField = ({
  defaultValue = '',
  delay = 300,
  onDebouncedChange,
  ...textFieldProps
}: Props) => {
  const [value, setValue] = useState(defaultValue)
  const onDebouncedChangeRef = useRef(onDebouncedChange)
  onDebouncedChangeRef.current = onDebouncedChange

  useEffect(() => {
    const timeout = window.setTimeout(() => onDebouncedChangeRef.current(value.trim()), delay)
    return () => window.clearTimeout(timeout)
  }, [value, delay])

  return (
    <TextField
      {...textFieldProps}
      value={value}
      onChange={(event) => setValue(event.target.value)}
    />
  )
}

export default DebouncedSearchField
