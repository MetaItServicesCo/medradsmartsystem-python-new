/** An inspection invoice sent to its customer, and paid through its link. */
import apiClient from './client'
import { linkPaymentForm, type LinkPaymentReport, type PublicServiceInvoice, type ServiceInvoiceShareOptions, type ServiceInvoiceShareResult } from './serviceRequests'
import type { InspectionInvoiceDocument } from '@/utils/inspectionInvoiceDocument'

/** The link page's response: as a service invoice's, with the inspection invoice's own document. */
export type PublicInspectionInvoice = Omit<PublicServiceInvoice, 'document'> & { document: InspectionInvoiceDocument | null }

export const fetchInspectionInvoiceShareOptions = async (invoiceId: number): Promise<ServiceInvoiceShareOptions> => {
  const res = await apiClient.get(`/inspection-invoices/${invoiceId}/share-options`)
  return res.data
}

export const shareInspectionInvoice = async (
  invoiceId: number,
  data: { channel: 'email' | 'link'; recipient_user_id?: number; email?: string },
): Promise<ServiceInvoiceShareResult> => {
  const res = await apiClient.post(`/inspection-invoices/${invoiceId}/share`, data)
  return res.data
}

export const fetchPublicInspectionInvoice = async (token: string): Promise<PublicInspectionInvoice> => {
  const res = await apiClient.get(`/public/inspection-invoices/${token}`)
  return res.data
}

export const payPublicInspectionInvoice = async (
  token: string,
  data: { source_id: string; idempotency_key: string; payer_name: string; charge_amount?: string },
): Promise<PublicInspectionInvoice> => {
  const res = await apiClient.post(`/public/inspection-invoices/${token}/square-payment`, data)
  return res.data
}

export const reportPublicInspectionInvoicePayment = async (
  token: string,
  report: LinkPaymentReport,
): Promise<PublicInspectionInvoice> => {
  const res = await apiClient.post(`/public/inspection-invoices/${token}/payment-proof`, linkPaymentForm(report), {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}
