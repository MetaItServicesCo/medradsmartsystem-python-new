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
  children,
  ...props
}: ContextTableRowProps) => {
  const { isFocused } = useListContext()
  const focused = isFocused(recordKey)
  void recordLabel

  return (
    <TableRow
      {...props}
      tabIndex={focused ? 0 : -1}
      aria-current={focused ? 'true' : undefined}
      aria-selected={contextSelected || undefined}
      data-list-row-key={String(recordKey)}
      data-list-row-focused={focused ? 'true' : undefined}
      data-list-row-selected={contextSelected ? 'true' : undefined}
    >
      {children}
    </TableRow>
  )
}

export default ContextTableRow
