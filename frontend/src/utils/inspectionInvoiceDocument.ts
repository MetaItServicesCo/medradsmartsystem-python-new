/**
 * An inspection invoice as its customer link page shows it: the same document
 * Billing prints, built by the same function from the same fields, mapped the
 * way Billing maps them (pages/Sales/Billing.tsx, the "inspection" cases of its
 * printable invoice and line items). A browser test compares the two.
 */
import {
  buildPrintableHtml,
  type PrintableInvoice,
  type PrintableInvoiceSummaryRow,
  type PrintableLineItem,
} from '@/components/Billing/InvoicePrintDialog'
import { printStyles } from '@/utils/invoiceDocumentStyles'

/** What the link page receives: the invoice's own fields, nothing internal. */
export interface InspectionInvoiceDocument {
  invoice_number: string
  invoice_type?: string | null
  customer_name: string
  customer_email?: string | null
  customer_phone?: string | null
  customer_address?: string | null
  facility_name?: string | null
  subtotal?: number | string | null
  tax_amount?: number | string | null
  discount_amount?: number | string | null
  total_amount?: number | string | null
  amount_paid?: number | string | null
  balance_due?: number | string | null
  status?: string | null
  issue_date?: string | null
  due_date?: string | null
  created_at?: string | null
  payment_method?: string | null
  card_fee_amount?: number | string | null
  labels?: Record<string, any> | null
  summary_rows?: PrintableInvoiceSummaryRow[] | null
  line_items?: any[] | null
  travel_charges?: number | string | null
  service_charges?: number | string | null
  travel_cost?: number | string | null
  inspection_id?: number | null
  inspection_batch_id?: number | null
  inspection_number?: string | null
  inspection_batch_number?: string | null
  batch_asset_count?: number | null
  batch_items?: Array<{ inspection_number: string; asset_name: string | null; asset_tag: string | null; serial_number: string | null; subtotal: number | string }> | null
  inventory_part_name?: string | null
}

const INSPECTION_ACCENT = '#2563EB'

const relatedNumber = (invoice: InspectionInvoiceDocument) =>
  invoice.inspection_batch_number || invoice.inspection_number || '-'

const description = (invoice: InspectionInvoiceDocument) => (invoice.inspection_batch_id
  ? `${invoice.batch_asset_count || invoice.batch_items?.length || 0} asset inspection batch`
  : invoice.inventory_part_name || 'Inspection invoice')

export const inspectionPrintableInvoice = (invoice: InspectionInvoiceDocument): PrintableInvoice => {
  const amount = Number(invoice.total_amount || 0)
  return {
    invoice_number: invoice.invoice_number,
    invoice_type: 'inspection',
    reference_number: relatedNumber(invoice),
    customer_name: invoice.customer_name,
    customer_email: invoice.customer_email,
    customer_phone: invoice.customer_phone || null,
    customer_address: invoice.customer_address || null,
    facility_name: invoice.facility_name || '-',
    subtotal: Number(invoice.subtotal ?? amount ?? 0),
    tax_amount: Number(invoice.tax_amount || 0),
    discount_amount: Number(invoice.discount_amount || 0),
    total_amount: amount,
    amount_paid: Number(invoice.amount_paid || 0),
    balance_due: Number(invoice.balance_due || 0),
    status: String(invoice.status || ''),
    issue_date: invoice.issue_date || invoice.created_at,
    due_date: invoice.due_date,
    payment_method: invoice.payment_method,
    notes: description(invoice),
    labels: invoice.labels || null,
    summary_rows: invoice.summary_rows || [],
    card_fee_amount: Number(invoice.card_fee_amount || 0),
    card_fee_label: 'Card processing fee',
    ...(Number(invoice.travel_charges || 0) > 0 ? { travel_charges: Number(invoice.travel_charges) } : {}),
    ...(Number(invoice.service_charges || 0) > 0 ? { service_charges: Number(invoice.service_charges) } : {}),
  }
}

const customLineItems = (rows: any[] | null | undefined, fallbackNumber: string): PrintableLineItem[] => (
  (rows || []).map((line, index) => ({
    item_number: line.item_number || line.part_number || fallbackNumber || `ITEM-${index + 1}`,
    description: line.description || line.part_description || 'Invoice item',
    quantity: Number(line.quantity || 0),
    unit_price: Number(line.unit_price || 0),
    shipping_fee: Number(line.shipping_fee || 0),
    setup_fee: Number(line.setup_fee || 0),
    condition: line.condition || line.item_type || null,
    total_amount: Number(line.total_amount ?? line.total ?? 0),
    unitLabel: line.unitLabel,
    custom_cells: Array.isArray(line.custom_cells) ? line.custom_cells : [],
  }))
)

export const inspectionPrintableLineItems = (invoice: InspectionInvoiceDocument): PrintableLineItem[] => {
  const number = invoice.invoice_number
  const related = relatedNumber(invoice)
  const custom = customLineItems(invoice.line_items, number)
  if (custom.length) return custom
  if (invoice.inspection_batch_id && invoice.batch_items?.length) {
    const assetRows: PrintableLineItem[] = invoice.batch_items.map(line => ({
      item_number: line.inspection_number,
      description: line.asset_name || 'Inspection asset',
      quantity: 1,
      unit_price: Number(line.subtotal || 0),
      shipping_fee: 0,
      setup_fee: 0,
      condition: line.serial_number || line.asset_tag || null,
      total_amount: Number(line.subtotal || 0),
    }))
    const travel = Number(invoice.travel_cost || 0)
    return travel > 0
      ? [...assetRows, { item_number: 'TRAVEL', description: 'Travel Cost', quantity: 1, unit_price: travel, shipping_fee: 0, setup_fee: 0, condition: null, total_amount: travel }]
      : assetRows
  }
  const baseAmount = Number(invoice.subtotal || invoice.total_amount || 0)
  const rows: PrintableLineItem[] = [{
    item_number: related || number,
    description: description(invoice),
    quantity: 1,
    unit_price: baseAmount,
    shipping_fee: 0,
    setup_fee: 0,
    condition: null,
    total_amount: baseAmount,
  }]
  if (Number(invoice.travel_charges || 0) > 0) {
    rows.push({ item_number: related || number, description: 'Travel Charges', quantity: 1, unit_price: Number(invoice.travel_charges), shipping_fee: 0, setup_fee: 0, condition: null, total_amount: Number(invoice.travel_charges) })
  }
  if (Number(invoice.service_charges || 0) > 0) {
    rows.push({ item_number: related || number, description: 'Service Charges', quantity: 1, unit_price: Number(invoice.service_charges), shipping_fee: 0, setup_fee: 0, condition: null, total_amount: Number(invoice.service_charges) })
  }
  return rows
}

/** The invoice sheet, as Billing prints it. */
export const inspectionInvoiceSheet = (invoice: InspectionInvoiceDocument): string => buildPrintableHtml(
  inspectionPrintableInvoice(invoice),
  'invoice',
  inspectionPrintableLineItems(invoice),
  [],
  'Inspection',
  'Invoice',
  INSPECTION_ACCENT,
  'Qty',
)

/** The sheet with its styles, to show in a frame or print on its own. */
export const inspectionInvoiceHtml = (invoice: InspectionInvoiceDocument): string =>
  `${printStyles}${inspectionInvoiceSheet(invoice)}`
