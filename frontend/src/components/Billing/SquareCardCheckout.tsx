import { useEffect, useRef, useState } from 'react'
import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material'
import CreditCardIcon from '@mui/icons-material/CreditCard'

interface SquareTokenResult {
  status: string
  token?: string
  errors?: Array<{ message?: string; detail?: string }>
}

interface SquareCard {
  attach: (selector: string) => Promise<void>
  tokenize: (details: Record<string, unknown>) => Promise<SquareTokenResult>
  destroy?: () => Promise<void>
}

interface SquarePayments {
  card: () => Promise<SquareCard>
}

declare global {
  interface Window {
    Square?: {
      payments: (applicationId: string, locationId: string) => SquarePayments
    }
  }
}

const scriptPromises = new Map<string, Promise<void>>()

const loadSquareScript = (url: string) => {
  const existing = scriptPromises.get(url)
  if (existing) return existing
  const promise = new Promise<void>((resolve, reject) => {
    if (window.Square) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = url
    script.async = true
    script.dataset.squareSdk = url
    script.onload = () => resolve()
    script.onerror = () => {
      scriptPromises.delete(url)
      reject(new Error('Could not load the secure Square payment form'))
    }
    document.head.appendChild(script)
  })
  scriptPromises.set(url, promise)
  return promise
}

const createIdempotencyKey = () => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}

interface Props {
  applicationId: string
  locationId: string
  sdkUrl: string
  amount: number
  currency: string
  payerName: string
  payerEmail?: string | null
  processing?: boolean
  onPaymentToken: (token: string, idempotencyKey: string) => void
}

const SquareCardCheckout = ({
  applicationId,
  locationId,
  sdkUrl,
  amount,
  currency,
  payerName,
  payerEmail,
  processing = false,
  onPaymentToken,
}: Props) => {
  const containerId = useRef(`square-card-${Math.random().toString(36).slice(2)}`)
  const cardRef = useRef<SquareCard | null>(null)
  const [loading, setLoading] = useState(true)
  const [tokenizing, setTokenizing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const initialize = async () => {
      setLoading(true)
      setError('')
      try {
        await loadSquareScript(sdkUrl)
        if (!window.Square) throw new Error('Square payment services are unavailable')
        const payments = window.Square.payments(applicationId, locationId)
        const card = await payments.card()
        await card.attach(`#${containerId.current}`)
        if (cancelled) {
          await card.destroy?.()
          return
        }
        cardRef.current = card
      } catch (paymentError: any) {
        if (!cancelled) setError(paymentError?.message || 'Could not initialize Square payments')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void initialize()
    return () => {
      cancelled = true
      const card = cardRef.current
      cardRef.current = null
      void card?.destroy?.()
    }
  }, [applicationId, locationId, sdkUrl])

  const tokenize = async () => {
    if (!cardRef.current || tokenizing || processing) return
    setTokenizing(true)
    setError('')
    try {
      const nameParts = payerName.trim().split(/\s+/)
      const result = await cardRef.current.tokenize({
        amount: Number(amount).toFixed(2),
        currencyCode: currency,
        intent: 'CHARGE',
        customerInitiated: true,
        sellerKeyedIn: false,
        billingContact: {
          givenName: nameParts[0] || payerName,
          familyName: nameParts.slice(1).join(' ') || undefined,
          email: payerEmail || undefined,
          countryCode: 'US',
        },
      })
      if (result.status !== 'OK' || !result.token) {
        const message = result.errors
          ?.map(item => item.message || item.detail)
          .filter(Boolean)
          .join('; ')
        throw new Error(message || 'Square could not verify the payment information')
      }
      onPaymentToken(result.token, createIdempotencyKey())
    } catch (paymentError: any) {
      setError(paymentError?.message || 'Could not prepare the Square payment')
    } finally {
      setTokenizing(false)
    }
  }

  return (
    <Box>
      <Typography sx={{ color: '#1E1B4B', fontWeight: 900, mb: 0.5 }}>
        Card payment
      </Typography>
      <Typography sx={{ color: '#64748B', fontSize: 13, mb: 2 }}>
        Card details are securely collected and tokenized by Square. MedRad does not receive or store the card number.
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box
        id={containerId.current}
        sx={{
          minHeight: 90,
          p: 1.5,
          border: '1px solid #D8D5E8',
          borderRadius: '14px',
          bgcolor: '#FFF',
        }}
      />
      {loading && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.5 }}>
          <CircularProgress size={18} />
          <Typography sx={{ color: '#64748B', fontSize: 13 }}>Loading secure card form…</Typography>
        </Box>
      )}
      <Button
        fullWidth
        variant="contained"
        startIcon={tokenizing || processing ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : <CreditCardIcon />}
        disabled={loading || Boolean(error) || tokenizing || processing || !cardRef.current}
        onClick={tokenize}
        sx={{ mt: 2, py: 1.4, fontWeight: 950 }}
      >
        Pay ${Number(amount || 0).toFixed(2)} securely
      </Button>
    </Box>
  )
}

export default SquareCardCheckout
