import { useRef } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material'
import { toast } from 'react-toastify'
import { copyText } from '@/utils/clipboard'

export interface DeliveryLink {
  url: string
  /** False when staff chose Share Link Only and nobody was emailed. */
  emailed: boolean
}

interface Props {
  link: DeliveryLink | null
  /** What was delivered, capitalised, e.g. "Quotation", "Rental Agreement". */
  documentLabel: string
  /** Optional extra line, e.g. that a newer link retires the previous one. */
  note?: string
  onClose: () => void
}

/**
 * The one dialog Sales, Rentals and Lease to Own show after a customer link
 * is issued -- whether it was emailed or shared by staff -- so the moment
 * looks and reads the same everywhere.
 */
export default function DeliveryLinkDialog({ link, documentLabel, note, onClose }: Props) {
  const lower = documentLabel.toLowerCase()
  const fieldRef = useRef<HTMLInputElement>(null)
  return (
    <Dialog open={Boolean(link)} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '20px' } }}>
      <DialogTitle sx={{ fontWeight: 900, color: '#1E1B4B' }}>
        {documentLabel} {link?.emailed ? 'Sent' : 'Link Ready'}
      </DialogTitle>
      <DialogContent dividers>
        <Typography sx={{ color: '#4B5563', mb: 2 }}>
          {link?.emailed
            ? `The customer was notified. You can also copy this secure ${lower} link.`
            : `No email was sent. Copy this secure ${lower} link and share it by text, chat or any other medium.`}
          {note ? ` ${note}` : ''}
        </Typography>
        <TextField
          fullWidth
          value={link?.url ?? ''}
          inputRef={fieldRef}
          InputProps={{ readOnly: true }}
          onFocus={event => event.target.select()}
        />
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose}>Close</Button>
        <Button
          variant="contained"
          onClick={() => {
            if (!link) return
            void copyText(link.url, fieldRef.current).then(copied => {
              if (copied) {
                toast.success(`${documentLabel} link copied`)
              } else {
                // Leave it selected so Ctrl+C / long-press copies it.
                fieldRef.current?.focus()
                fieldRef.current?.select()
                toast.error('Your browser blocked copying. The link is selected; press Ctrl+C to copy it.')
              }
            })
          }}
          sx={{ fontWeight: 900 }}
        >
          Copy Link
        </Button>
      </DialogActions>
    </Dialog>
  )
}
