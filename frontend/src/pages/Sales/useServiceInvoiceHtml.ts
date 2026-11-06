import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchServiceInvoiceDocument } from '@/api/serviceRequests'
import { buildServiceInvoiceHtml } from '@/utils/serviceInvoiceHtml'

/** The document for one service invoice while it is open. A failed load leaves
 *  no html, and the caller falls back to the standard invoice layout. */
export const useServiceInvoiceHtml = (invoiceId: number | null) => {
  const [html, setHtml] = useState<string | null>(null)
  const [buildFailed, setBuildFailed] = useState(false)
  const query = useQuery({
    queryKey: ['service-invoice-document', invoiceId],
    queryFn: () => fetchServiceInvoiceDocument(invoiceId!),
    enabled: invoiceId != null,
    staleTime: 0,
    retry: false,
  })
  const doc = query.data

  useEffect(() => {
    let current = true
    setHtml(null)
    setBuildFailed(false)
    if (invoiceId != null && doc) {
      buildServiceInvoiceHtml(doc)
        .then((built) => {
          if (current) setHtml(built)
        })
        .catch(() => {
          if (current) setBuildFailed(true)
        })
    }
    return () => { current = false }
  }, [invoiceId, doc])

  return {
    html: invoiceId != null ? html : null,
    loading: invoiceId != null && !query.isError && !buildFailed && !html,
  }
}
