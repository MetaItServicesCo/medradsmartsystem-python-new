/**
 * Resolve a floor plan to something an <img> can actually display.
 *
 * Two problems this solves, both of which would fail silently.
 *
 * 1. Authentication. The API authenticates with a Bearer token applied by an
 *    axios interceptor. A bare `<img src="/api/...">` sends no such header, so
 *    the browser would get a 401 and render an empty box with no error anyone
 *    could see. Everything therefore goes through `apiClient` as a blob.
 *
 * 2. PDFs. The usual source for a hospital floor plan is the life safety
 *    drawing, and those are PDFs. A PDF in an <img> renders nothing at all —
 *    again, no error. So PDFs are rasterised here with pdf.js, which keeps
 *    poppler and ghostscript off the deployment.
 *
 * The hook also reports the source's true pixel dimensions. That matters more
 * than it looks: calibration converts a line drawn on the *rendered* image into
 * source pixels, so without the source width the resulting scale would silently
 * depend on how wide the browser happened to draw the plan.
 */
import { useEffect, useRef, useState } from 'react'

import apiClient from '@/api/client'
import { palette } from '@/theme/palette'

// Rasterise at roughly print resolution. A floor plan drawn 900 px wide is
// unreadable at room-number scale; this leaves enough to zoom into.
const TARGET_WIDTH_PX = 2400

export interface PlanImage {
  src: string | null
  width: number | null
  height: number | null
  loading: boolean
  error: string | null
}

const looksLikePdf = (mime?: string | null, filename?: string | null) =>
  mime === 'application/pdf' || (filename || '').toLowerCase().endsWith('.pdf')

export function usePlanImage(
  planId: number | null,
  mime?: string | null,
  filename?: string | null,
  pageNumber?: number | null,
): PlanImage {
  const [state, setState] = useState<PlanImage>({
    src: null, width: null, height: null, loading: !!planId, error: null,
  })
  // Every path here produces an object URL. Leaking one per plan view would
  // hold the whole rendered bitmap for the life of the session.
  const objectUrl = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const release = () => {
      if (objectUrl.current) {
        URL.revokeObjectURL(objectUrl.current)
        objectUrl.current = null
      }
    }

    const publish = (blob: Blob, width: number | null, height: number | null) => {
      release()
      objectUrl.current = URL.createObjectURL(blob)
      setState({ src: objectUrl.current, width, height, loading: false, error: null })
    }

    const fail = (message: string) => {
      if (cancelled) return
      setState({ src: null, width: null, height: null, loading: false, error: message })
    }

    const run = async () => {
      if (!planId) {
        setState({ src: null, width: null, height: null, loading: false, error: null })
        return
      }
      setState((prev) => ({ ...prev, loading: true, error: null }))

      let blob: Blob
      try {
        const response = await apiClient.get(`/locations/floor-plans/${planId}/file`, {
          responseType: 'blob',
        })
        blob = response.data as Blob
      } catch (err: any) {
        fail(err?.response?.status === 404 ? 'The drawing file is missing' : 'Could not load the drawing')
        return
      }
      if (cancelled) return

      if (!looksLikePdf(mime, filename)) {
        // Measure before publishing, so calibration has the source dimensions
        // from the first render rather than a frame later.
        const url = URL.createObjectURL(blob)
        const probe = new Image()
        probe.onload = () => {
          URL.revokeObjectURL(url)
          if (cancelled) return
          publish(blob, probe.naturalWidth, probe.naturalHeight)
        }
        probe.onerror = () => {
          URL.revokeObjectURL(url)
          fail('That file is not a readable image')
        }
        probe.src = url
        return
      }

      try {
        const pdfjs = await import('pdfjs-dist')
        // Vite turns this into a hashed asset URL at build time, so the worker
        // is served from our own origin instead of a CDN.
        const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

        const doc = await pdfjs.getDocument({ data: await blob.arrayBuffer() }).promise
        const page = await doc.getPage(pageNumber || 1)
        if (cancelled) return

        const base = page.getViewport({ scale: 1 })
        const viewport = page.getViewport({ scale: TARGET_WIDTH_PX / base.width })

        const canvas = document.createElement('canvas')
        canvas.width = Math.round(viewport.width)
        canvas.height = Math.round(viewport.height)
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Canvas unavailable')

        // Drawings are line art on nothing. Without a painted ground a
        // transparent PDF renders as black.
        context.fillStyle = palette.white
        context.fillRect(0, 0, canvas.width, canvas.height)

        await page.render({ canvasContext: context, viewport, canvas } as any).promise
        if (cancelled) return

        canvas.toBlob((rendered) => {
          if (cancelled || !rendered) return
          publish(rendered, canvas.width, canvas.height)
        }, 'image/png')
      } catch (err: any) {
        fail(err?.message || 'Could not render that PDF')
      }
    }

    run()
    return () => { cancelled = true; release() }
  }, [planId, mime, filename, pageNumber])

  return state
}
