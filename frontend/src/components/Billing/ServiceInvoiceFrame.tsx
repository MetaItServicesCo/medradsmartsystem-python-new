import { useRef, useState } from 'react'
import { Box } from '@mui/material'

/**
 * Shows the service invoice document on its own, so its layout is the printed
 * one exactly and nothing on the page restyles it. Sandboxed: it never runs a
 * script, whatever the invoice's text contains.
 */
const ServiceInvoiceFrame = ({ html, title }: { html: string; title: string }) => {
  const frame = useRef<HTMLIFrameElement | null>(null)
  const [height, setHeight] = useState(900)
  return (
    <Box
      component="iframe"
      ref={frame}
      title={title}
      data-testid="service-invoice-frame"
      sandbox="allow-same-origin"
      srcDoc={`<!doctype html><html><head><meta charset="utf-8"/></head><body style="margin:0;background:#fff">${html}<style>.sheet{width:100%;max-width:8.5in;min-height:0;margin:0 auto;box-shadow:none}body{background:#fff!important}</style></body></html>`}
      onLoad={() => {
        const body = frame.current?.contentDocument?.documentElement
        if (body) setHeight(body.scrollHeight + 8)
      }}
      sx={{ width: '100%', height, border: 0, display: 'block', bgcolor: '#fff' }}
    />
  )
}

export default ServiceInvoiceFrame
