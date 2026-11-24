/**
 * On an invoice's customer link: reporting an ACH, MBMTS ACH or cheque
 * payment. Any amount up to the balance, with the proof attached, its
 * reference number, or both. It counts once Billing has checked it.
 */
import { useEffect, useState } from 'react'
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, TextField,
  ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material'
import AttachFileIcon from '@mui/icons-material/AttachFile'
import type { LinkPaymentMethod, LinkPaymentReport } from '@/api/serviceRequests'
import MbmtsAchForm from '@/components/Billing/MbmtsAchForm'

const money = (value: number) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const EMAIL_PATTERN = /^[^@\s,;:<>()[\]"\\]+@[^@\s,;:<>()[\]"\\]+\.[^@\s,;:<>()[\]"\\]+$/
const ACCEPTED = 'application/pdf,image/jpeg,image/png,image/webp'

interface Props {
  open: boolean
  onClose: () => void
  invoiceNumber: string
  balanceDue: number
  methods: LinkPaymentMethod[]
  defaultName?: string | null
  defaultEmail?: string | null
  submitting: boolean
  onSubmit: (report: LinkPaymentReport) => void
}

const LinkPaymentReportDialog = ({
  open, onClose, invoiceNumber, balanceDue, methods, defaultName, defaultEmail, submitting, onSubmit,
}: Props) => {
  const [method, setMethod] = useState<LinkPaymentMethod['value'] | ''>('')
  const [amount, setAmount] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)

  useEffect(() => {
    if (!open) return
    setMethod('')
    setAmount(balanceDue > 0 ? balanceDue.toFixed(2) : '')
    setName(defaultName || '')
    setEmail(defaultEmail || '')
    setReference('')
    setNotes('')
    setFile(null)
  }, [open, balanceDue, defaultName, defaultEmail])

  const value = Number(amount)
  const amountProblem = !amount
    ? 'Enter the amount paid'
    : !(value > 0)
      ? 'The amount must be more than zero'
      : Math.round(value * 100) > Math.round(balanceDue * 100)
        ? `Not more than the balance, ${money(balanceDue)}`
        : ''
  const emailProblem = email.trim() && !EMAIL_PATTERN.test(email.trim()) ? 'Enter a valid email, or leave it empty' : ''
  const cheque = method === 'cheque'
  const ready = Boolean(method) && !amountProblem && name.trim().length >= 2 && !emailProblem && Boolean(file || reference.trim())

  const submit = () => {
    if (!ready || !method) return
    onSubmit({
      payment_method: method,
      amount: value.toFixed(2),
      payer_name: name.trim(),
      payer_email: email.trim() || undefined,
      reference_number: reference.trim() || undefined,
      notes: notes.trim() || undefined,
      proof_file: file,
    })
  }

  return (
    <Dialog open={open} onClose={() => !submitting && onClose()} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 900 }}>Pay invoice {invoiceNumber} by ACH or cheque</DialogTitle>
      <DialogContent dividers sx={{ display: 'grid', gap: 2 }}>
        <Box>
          <Typography sx={{ fontWeight: 800, mb: 1, color: '#334155' }}>How did you pay?</Typography>
          <ToggleButtonGroup
            exclusive
            value={method}
            onChange={(_event, next) => next && setMethod(next)}
            sx={{ flexWrap: 'wrap', gap: 1, '& .MuiToggleButton-root': { borderRadius: '10px !important', border: '1px solid #CBD5E1 !important', fontWeight: 800, textTransform: 'none', px: 2 } }}
          >
            {methods.map(option => (
              <ToggleButton key={option.value} value={option.value} data-link-method={option.value}>{option.label}</ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
        {method === 'mbmts_ach' && <MbmtsAchForm />}
        <TextField
          label="Amount paid ($)"
          type="number"
          value={amount}
          onChange={event => setAmount(event.target.value)}
          error={Boolean(amount) && Boolean(amountProblem)}
          helperText={amountProblem || `Any amount up to the balance, ${money(balanceDue)}`}
          inputProps={{ min: 0.01, step: 0.01, 'data-link-amount': true }}
          required
          fullWidth
        />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
          <TextField label="Your name" value={name} onChange={event => setName(event.target.value)} required fullWidth inputProps={{ 'data-link-name': true }} />
          <TextField
            label="Your email (optional)"
            value={email}
            onChange={event => setEmail(event.target.value)}
            error={Boolean(emailProblem)}
            helperText={emailProblem || ' '}
            fullWidth
          />
        </Box>
        <Box sx={{ p: 2, borderRadius: '12px', bgcolor: '#F8FAFC', border: '1px solid #E2E8F0', display: 'grid', gap: 1.5 }}>
          <Typography sx={{ fontWeight: 800, color: '#334155' }}>
            Attach the {cheque ? 'cheque' : 'payment confirmation'}, or enter its {cheque ? 'cheque' : 'reference'} number - or both
          </Typography>
          <TextField
            label={cheque ? 'Cheque number' : 'Transaction / reference number'}
            value={reference}
            onChange={event => setReference(event.target.value.slice(0, 100))}
            fullWidth
            inputProps={{ 'data-link-reference': true }}
          />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <Button component="label" variant="outlined" startIcon={<AttachFileIcon />} sx={{ fontWeight: 800, borderRadius: '10px', textTransform: 'none' }}>
              {file ? 'Change file' : 'Attach proof'}
              <input
                hidden
                type="file"
                accept={ACCEPTED}
                data-link-file
                onChange={event => setFile(event.target.files?.[0] || null)}
              />
            </Button>
            <Typography sx={{ color: file ? '#0F172A' : '#64748B', fontSize: 14, overflowWrap: 'anywhere' }}>
              {file ? file.name : 'PDF, JPG, PNG or WebP'}
            </Typography>
            {file && <Button size="small" onClick={() => setFile(null)} sx={{ textTransform: 'none' }}>Remove</Button>}
          </Box>
        </Box>
        <TextField label="Note (optional)" value={notes} onChange={event => setNotes(event.target.value.slice(0, 1000))} multiline minRows={2} fullWidth />
        <Alert severity="info">
          Your payment is recorded once our billing team has checked it. No card processing fee applies.
        </Alert>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={!ready || submitting}
          data-link-submit
          startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : undefined}
          sx={{ fontWeight: 900, borderRadius: '12px' }}
        >
          Send payment for review
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default LinkPaymentReportDialog
