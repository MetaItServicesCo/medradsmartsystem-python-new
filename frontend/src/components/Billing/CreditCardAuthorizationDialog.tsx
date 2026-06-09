import { type ReactNode, useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'

export interface AuthorizationLineItem {
  item_number: string
  description: string
  amount: number
  quantity: number
  total_amount: number
}

export interface CreditCardAuthorizationPayload {
  request_type: string
  card_holder_name: string
  card_type: string
  name_on_card: string
  phone: string
  title: string
  expiration: string
  masked_card_number: string
}

interface Props {
  open: boolean
  customerName?: string | null
  requestType?: string
  items: AuthorizationLineItem[]
  onClose: () => void
  onSubmit: (payload: CreditCardAuthorizationPayload) => void
}

const maskCardNumber = (value: string) => {
  const digits = value.replace(/\D/g, '')
  if (digits.length <= 4) return digits
  return `**** **** **** ${digits.slice(-4)}`
}

const emptyForm = {
  request_type: 'Service',
  card_holder_name: '',
  card_type: '',
  name_on_card: '',
  card_number: '',
  phone: '',
  security_code: '',
  title: '',
  expiration: '',
}

const money = (value: number | string | null | undefined) => `$${Number(value || 0).toFixed(2)}`

const CreditCardAuthorizationDialog = ({ open, customerName, requestType = 'Service', items, onClose, onSubmit }: Props) => {
  const [form, setForm] = useState(emptyForm)

  useEffect(() => {
    if (open) {
      setForm(prev => ({ ...emptyForm, request_type: requestType || prev.request_type }))
    }
  }, [open, requestType])

  const total = useMemo(() => items.reduce((sum, item) => sum + Number(item.total_amount || 0), 0), [items])

  const submit = () => {
    onSubmit({
      request_type: form.request_type,
      card_holder_name: form.card_holder_name,
      card_type: form.card_type,
      name_on_card: form.name_on_card,
      phone: form.phone,
      title: form.title,
      expiration: form.expiration,
      masked_card_number: maskCardNumber(form.card_number),
    })
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '18px' } }}>
      <DialogContent sx={{ p: 3.2 }}>
        <Box sx={{ mb: 3 }}>
          <Typography sx={{ fontWeight: 950, color: '#111827', fontSize: 26, lineHeight: 1 }}>MR.BIOMED</Typography>
          <Typography sx={{ color: '#0EA5E9', fontWeight: 950, letterSpacing: 1.2, fontSize: 12 }}>TECH SERVICES</Typography>
        </Box>

        <Box sx={{ mb: 3 }}>
          <Typography sx={{ fontWeight: 900 }}>Mr. BioMed Tech Services</Typography>
          <Typography sx={{ color: '#334155', fontSize: 13 }}>555 N. 5th Street Suite 109,</Typography>
          <Typography sx={{ color: '#334155', fontSize: 13 }}>Garland, TX 75040</Typography>
        </Box>

        <Typography sx={{ textAlign: 'center', fontSize: 22, color: '#111827', mb: 2, fontFamily: 'serif' }}>
          Credit Card Authorization Form
        </Typography>

        <Typography sx={{ color: '#111827', mb: 1.5, fontSize: 14 }}>
          I <strong>{customerName || 'Customer'}</strong> authorize <strong>MBMTS</strong> to charge my CC for equipment and service charges as described below.
        </Typography>

        <Typography sx={{ fontWeight: 900, mb: 0.8 }}>Authorization Required for:</Typography>
        <TextField
          select
          size="small"
          label="Select Request Type"
          value={form.request_type}
          onChange={e => setForm(prev => ({ ...prev, request_type: e.target.value }))}
          fullWidth
          sx={{ mb: 2 }}
        >
          <MenuItem value="Service">Service</MenuItem>
          <MenuItem value="Sales">Sales</MenuItem>
          <MenuItem value="Rental">Rental</MenuItem>
          <MenuItem value="Inspection">Inspection</MenuItem>
        </TextField>

        <TableContainer sx={{ border: '1px solid #CBD5E1', borderRadius: '4px', mb: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#F8FAFC' }}>
                <TableCell sx={{ fontWeight: 900 }}>Part Number</TableCell>
                <TableCell sx={{ fontWeight: 900 }}>Description</TableCell>
                <TableCell sx={{ fontWeight: 900 }}>Amount</TableCell>
                <TableCell sx={{ fontWeight: 900 }}>Quantity</TableCell>
                <TableCell sx={{ fontWeight: 900 }}>Total Amount</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center">No items selected</TableCell>
                </TableRow>
              ) : items.map((item, index) => (
                <TableRow key={`${item.item_number}-${index}`}>
                  <TableCell>{item.item_number}</TableCell>
                  <TableCell>{item.description}</TableCell>
                  <TableCell>{money(item.amount)}</TableCell>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell>{money(item.total_amount)}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={4} align="right" sx={{ fontWeight: 900 }}>Total</TableCell>
                <TableCell sx={{ fontWeight: 900 }}>{money(total)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>

        <Typography sx={{ fontWeight: 900, mb: 1 }}>Credit or Debit Card Details:</Typography>
        <Box sx={{ border: '1px solid #CBD5E1', borderRadius: '4px', overflow: 'hidden' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            <FormCell label="Card Holder Name">
              <TextField size="small" placeholder="Card Holder Name" value={form.card_holder_name} onChange={e => setForm(prev => ({ ...prev, card_holder_name: e.target.value }))} />
            </FormCell>
            <FormCell label="Card Type">
              <TextField select size="small" value={form.card_type} onChange={e => setForm(prev => ({ ...prev, card_type: e.target.value }))}>
                <MenuItem value="">Select Card Type</MenuItem>
                <MenuItem value="visa">Visa</MenuItem>
                <MenuItem value="mastercard">Mastercard</MenuItem>
                <MenuItem value="amex">American Express</MenuItem>
                <MenuItem value="discover">Discover</MenuItem>
              </TextField>
            </FormCell>
            <FormCell label="Name On Card">
              <TextField size="small" placeholder="Name On Card" value={form.name_on_card} onChange={e => setForm(prev => ({ ...prev, name_on_card: e.target.value }))} />
            </FormCell>
            <FormCell label="Card Number">
              <TextField size="small" placeholder="Card Number" value={form.card_number} onChange={e => setForm(prev => ({ ...prev, card_number: e.target.value }))} />
            </FormCell>
            <FormCell label="PH#">
              <TextField size="small" placeholder="Phone Number" value={form.phone} onChange={e => setForm(prev => ({ ...prev, phone: e.target.value }))} />
            </FormCell>
            <FormCell label="Security Code">
              <TextField size="small" placeholder="Security Code" value={form.security_code} onChange={e => setForm(prev => ({ ...prev, security_code: e.target.value }))} />
            </FormCell>
            <FormCell label="Title">
              <TextField size="small" placeholder="Title" value={form.title} onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))} />
            </FormCell>
            <FormCell label="Expiration">
              <TextField size="small" type="month" value={form.expiration} onChange={e => setForm(prev => ({ ...prev, expiration: e.target.value }))} />
            </FormCell>
          </Box>
        </Box>

        <Box sx={{ mt: 2, p: 1.5, border: '1px solid #E2E8F0', borderRadius: '4px', bgcolor: '#F8FAFC' }}>
          <Typography sx={{ fontStyle: 'italic', color: '#475569', fontSize: 12 }}>
            Note: 3.5% CC processing fee will be added to the charged amount. Full card number and security code are not stored in this system.
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3.2, pb: 2.5 }}>
        <Button onClick={onClose} sx={{ fontWeight: 900 }}>Cancel</Button>
        <Button onClick={submit} variant="contained" sx={{ fontWeight: 900, background: 'linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)' }}>
          Submit Authorization
        </Button>
      </DialogActions>
    </Dialog>
  )
}

const FormCell = ({ label, children }: { label: string; children: ReactNode }) => (
  <Box sx={{ display: 'grid', gridTemplateColumns: '92px 1fr', gap: 1, p: 1.2, borderRight: '1px solid #CBD5E1', borderBottom: '1px solid #CBD5E1', alignItems: 'center' }}>
    <Typography sx={{ color: '#0F172A', fontWeight: 800, fontSize: 13 }}>{label}</Typography>
    {children}
  </Box>
)

export default CreditCardAuthorizationDialog
