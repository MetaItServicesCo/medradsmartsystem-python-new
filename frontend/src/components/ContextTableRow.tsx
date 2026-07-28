import {
  TableRow,
  type TableRowProps,
} from '@mui/material'
import { useListContext } from '@/contexts/ListContext'

interface ContextTableRowProps extends TableRowProps {
  recordKey: string | number
  recordLabel: string
  contextSelected?: boolean
}

const ContextTableRow = ({
  recordKey,
  recordLabel,
  contextSelected = false,
  onPointerDownCapture,
  children,
  ...props
}: ContextTableRowProps) => {
  const { focusRecord, isFocused } = useListContext()
  const focused = isFocused(recordKey)

  return (
    <TableRow
      {...props}
      tabIndex={focused ? 0 : -1}
      aria-current={focused ? 'true' : undefined}
      aria-selected={contextSelected || focused}
      data-list-row-key={String(recordKey)}
      data-list-row-focused={focused ? 'true' : undefined}
      data-list-row-selected={contextSelected ? 'true' : undefined}
      onPointerDownCapture={event => {
        focusRecord(recordKey, recordLabel)
        onPointerDownCapture?.(event)
      }}
    >
      {children}
    </TableRow>
  )
}

export default ContextTableRow

