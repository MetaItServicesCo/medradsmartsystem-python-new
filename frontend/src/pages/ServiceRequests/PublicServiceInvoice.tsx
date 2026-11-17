/**
 * What a customer sees through a service invoice link, without signing in: the
 * invoice, paying its balance by Square, or reporting an ACH, MBMTS ACH or
 * cheque payment for Billing to check. Nothing else is offered here.
 */
import { useParams } from 'react-router-dom'
import { fetchPublicServiceInvoice, payPublicServiceInvoice, reportPublicServiceInvoicePayment } from '@/api/serviceRequests'
import PublicInvoicePayPage from '@/components/Billing/PublicInvoicePayPage'
import { buildServiceInvoiceHtml } from '@/utils/serviceInvoiceHtml'

const PublicServiceInvoice = () => {
  const { token = '' } = useParams()
  return (
    <PublicInvoicePayPage
      token={token}
      kind="service-invoice"
      fetchInvoice={fetchPublicServiceInvoice}
      payByCard={payPublicServiceInvoice}
      reportPayment={reportPublicServiceInvoicePayment}
      buildHtml={buildServiceInvoiceHtml}
    />
  )
}

export default PublicServiceInvoice
