/**
 * What a customer sees through a bulk invoice link, without signing in: the
 * front page with every invoice and the totals, then each invoice in full;
 * paying the balance by card through Square, or reporting an ACH, MBMTS ACH or
 * cheque payment for Billing to check -- as on any invoice link.
 */
import { useParams } from 'react-router-dom'
import { fetchPublicBulkInvoice, payPublicBulkInvoice, reportPublicBulkInvoicePayment } from '@/api/bulkInvoices'
import PublicInvoicePayPage from '@/components/Billing/PublicInvoicePayPage'
import { buildBulkInvoiceHtml } from '@/utils/bulkInvoiceHtml'
import { printHtmlDocument } from '@/utils/printHtmlDocument'

const PublicBulkInvoice = () => {
  const { token = '' } = useParams()
  return (
    <PublicInvoicePayPage
      token={token}
      kind="bulk-invoice"
      fetchInvoice={fetchPublicBulkInvoice}
      payByCard={payPublicBulkInvoice}
      reportPayment={reportPublicBulkInvoicePayment}
      buildHtml={buildBulkInvoiceHtml}
      print={printHtmlDocument}
    />
  )
}

export default PublicBulkInvoice
