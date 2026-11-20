/**
 * A rental invoice's tax, as the server calculates it
 * (backend/app/utils/rental_billing.py, rental_tax_for_lines): 8.25% on rent,
 * shipping & packing, delivery & setup and removal & pickup; never on a
 * refundable deposit, labor, or a final invoice's service charges. Lines are
 * told apart by their item number, which the invoice was made with.
 */
import { serviceTaxOn } from './serviceTax'

const NON_TAXABLE_CODES = new Set(['DEPOSIT', 'LABOR', 'WORKED-HOURS', 'SERVICE-FEE', 'APP-FEE'])

export const rentalLineTaxable = (itemNumber: unknown): boolean => {
  const code = String(itemNumber ?? '').trim().toUpperCase()
  return !(NON_TAXABLE_CODES.has(code) || code.startsWith('DEP-'))
}

type Line = { item_number?: unknown; total_amount?: unknown }

export const rentalTaxForLines = (lines: Line[]): number => {
  const taxable = (lines || [])
    .filter(line => rentalLineTaxable(line.item_number))
    .reduce((sum, line) => sum + Math.round(Number(line.total_amount || 0) * 100), 0) / 100
  return serviceTaxOn(taxable)
}
