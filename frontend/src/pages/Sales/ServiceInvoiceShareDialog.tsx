import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  MenuItem, TextField, Typography,
} from '@mui/material'
import { toast } from 'react-toastify'
import { fetchServiceInvoiceShareOptions, shareServiceInvoice } from '@/api/serviceRequests'

export interface ServiceInvoiceShareTarget {
  invoiceId: number
  invoiceNumber: string
  channel: 'email' | 'link'
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

const problem = (error: any, fallback: string) => {
  const detail = error?.response?.data?.detail
  return typeof detail === 'string' ? detail : fallback
}

/**
 * Send a service invoice by email, or copy its link to send any other way.
 * A facility with users: confirm which one receives it. A facility with none:
 * the sender is asked for an address.
 */
const ServiceInvoiceShareDialog = ({ target, onClose }: { target: ServiceInvoiceShareTarget | null; onClose: () => void }) => {
  const queryClient = useQueryClient()
  const [userId, setUserId] = useState<number | ''>('')
  const [email, setEmail] = useState('')
  const [link, setLink] = useState('')
  const [copied, setCopied] = useState(false)
  const isEmail = target?.channel === 'email'

  const options = useQuery({
    queryKey: ['service-invoice-share-options', target?.invoiceId],
    queryFn: () => fetchServiceInvoiceShareOptions(target!.invoiceId),
    enabled: Boolean(target && isEmail),
    staleTime: 0,
  })
  const recipients = options.data?.recipients ?? []
  const hasUsers = recipients.length > 0
  const chosen = recipients.find(person => person.user_id === userId)

  const refresh = () => {
    if (!target) return
    queryClient.invalidateQueries({ queryKey: ['service-invoice-document', target.invoiceId] })
    queryClient.invalidateQueries({ queryKey: ['billing-service-invoices'] })
  }

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toast.success('Link copied')
    } catch {
      setCopied(false) // The link stays on screen to copy by hand.
    }
  }

  const issueLink = useMutation({
    mutationFn: () => shareServiceInvoice(target!.invoiceId, { channel: 'link' }),
    onSuccess: (result) => {
      setLink(result.share_url)
      refresh()
      void copy(result.share_url)
    },
  })

  const sendEmail = useMutation({
    mutationFn: () => shareServiceInvoice(target!.invoiceId, hasUsers
      ? { channel: 'email', recipient_user_id: Number(userId) }
      : { channel: 'email', email: email.trim() }),
    onSuccess: (result) => {
      toast.success(`Invoice ${target?.invoiceNumber} sent to ${result.email}`)
      refresh()
      onClose()
    },
    onError: (error) => toast.error(problem(error, 'The invoice could not be sent')),
  })

  useEffect(() => {
    setLink('')
    setCopied(false)
    setEmail('')
    setUserId('')
    issueLink.reset()
    sendEmail.reset()
    if (target?.channel === 'link') issueLink.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  useEffect(() => {
    if (recipients.length && userId === '') setUserId(recipients[0].user_id)
    if (!recipients.length && options.data?.suggested_email && !email) setEmail(options.data.suggested_email)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.data])

  const emailValid = EMAIL_PATTERN.test(email.trim())

  return (
    <Dialog open={Boolean(target)} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 900 }}>
        {isEmail ? 'Send Invoice via Email' : 'Copy Link'} · {target?.invoiceNumber}
      </DialogTitle>
      <DialogContent dividers>
        {!isEmail && (
          <Box sx={{ display: 'grid', gap: 1.5 }}>
            {issueLink.isPending && <CircularProgress size={24} />}
            {issueLink.isError && <Alert severity="error">{problem(issueLink.error, 'The link could not be created')}</Alert>}
            {link && (
              <>
                <Typography sx={{ color: '#475569' }}>
                  {copied ? 'The link is copied. Send it by text, chat or any other way.' : 'Copy this link and send it by text, chat or any other way.'}
                  {' '}Anyone with it can view this invoice and pay the balance. Nobody was emailed.
                </Typography>
                <TextField label="Payment link" value={link} fullWidth InputProps={{ readOnly: true }} onFocus={event => event.target.select()} />
              </>
            )}
          </Box>
        )}
        {isEmail && (
          <Box sx={{ display: 'grid', gap: 1.5 }}>
            {options.isLoading && <CircularProgress size={24} />}
            {options.isError && <Alert severity="error">{problem(options.error, 'The recipients could not be loaded')}</Alert>}
            {options.data && hasUsers && (
              <>
                {recipients.length > 1 ? (
                  <TextField select label="Send to" value={userId} onChange={event => setUserId(Number(event.target.value))} fullWidth>
                    {recipients.map(person => <MenuItem key={person.user_id} value={person.user_id}>{person.name} ({person.email})</MenuItem>)}
                  </TextField>
                ) : null}
                <Typography sx={{ fontWeight: 700 }}>
                  Send this invoice to {chosen?.name} at {chosen?.email}?
                </Typography>
              </>
            )}
            {options.data && !hasUsers && (
              <>
                <Typography sx={{ fontWeight: 700 }}>This facility has no user. Enter the email address to send the invoice to.</Typography>
                <TextField
                  autoFocus
                  type="email"
                  label="Email address"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  error={Boolean(email.trim()) && !emailValid}
                  helperText={email.trim() && !emailValid ? 'Enter a valid email address' : ' '}
                  fullWidth
                />
              </>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose}>{link ? 'Close' : 'Cancel'}</Button>
        {!isEmail && link && <Button variant="contained" onClick={() => void copy(link)} sx={{ fontWeight: 900 }}>Copy Link</Button>}
        {isEmail && options.data && (
          <Button
            variant="contained"
            disabled={sendEmail.isPending || (hasUsers ? !chosen : !emailValid)}
            onClick={() => sendEmail.mutate()}
            sx={{ fontWeight: 900 }}
          >
            {hasUsers ? 'Confirm and Send' : 'Send Invoice'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}

export default ServiceInvoiceShareDialog
