/**
 * What a customer sees through an inspection invoice link, without signing in:
 * the invoice as Billing prints it, paying its balance by Square, or reporting
 * an ACH, MBMTS ACH or cheque payment for Billing to check. Nothing else.
 */
import { useParams } from 'react-router-dom'
import {
  fetchPublicInspectionInvoice, payPublicInspectionInvoice, reportPublicInspectionInvoicePayment,
} from '@/api/inspectionInvoiceLinks'
import PublicInvoicePayPage from '@/components/Billing/PublicInvoicePayPage'
import { inspectionInvoiceHtml } from '@/utils/inspectionInvoiceDocument'

const PublicInspectionInvoice = () => {
  const { token = '' } = useParams()
  return (
    <PublicInvoicePayPage
      token={token}
      kind="inspection-invoice"
      fetchInvoice={fetchPublicInspectionInvoice}
      payByCard={payPublicInspectionInvoice}
      reportPayment={reportPublicInspectionInvoicePayment}
      buildHtml={inspectionInvoiceHtml}
    />
  )
}

export default PublicInspectionInvoice
