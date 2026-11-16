/**
 * The service progress report as a real PDF file, downloaded in one click.
 *
 * It is the same document as the service report (serviceReportHtml), drawn in a
 * hidden frame of its own so its styles never touch the app, then turned into
 * US Letter pages: each report page is one PDF page. A page whose content runs
 * longer than a sheet continues on the next one, broken between rows and blocks
 * rather than through a line of text.
 */
import { fetchFacility, type Facility } from '@/api/facilities'
import type { ServiceReport } from '@/api/reports'
import { buildServiceReportDocument } from '@/utils/serviceReportHtml'

// A report page is 8.5in × 11in: 816 × 1056 CSS pixels, 612 × 792 points.
const PAGE_WIDTH_PX = 816
const PAGE_HEIGHT_PX = 1056
const PAGE_WIDTH_PT = 612
const PAGE_HEIGHT_PT = 792
const RENDER_SCALE = 2

// Only for the PDF: white sheets edge to edge, without the on-screen shadow and gap.
const PDF_CSS = `
  body { background: #fff !important; }
  .page { margin: 0 !important; box-shadow: none !important; width: ${PAGE_WIDTH_PX}px !important; min-height: ${PAGE_HEIGHT_PX}px !important; }
`

// Where a sheet may end without cutting through something.
const BREAKABLE = 'tr, h2, h3, p, .rtitle, .identity, .facbox, .card, .rhead, .divider, .rfoot, table, img, section > div > div'

/** "SR-000024-progress-report-2026-11-14.pdf", from the local date. */
export const progressReportFileName = (requestNumber: string | null | undefined, when = new Date()) => {
  const number = String(requestNumber || 'service-request').replace(/[^A-Za-z0-9._-]+/g, '-')
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${number}-progress-report-${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}.pdf`
}

/**
 * Where to end each sheet of a page that is `height` pixels tall: as near the end
 * of the sheet as possible, at the bottom of a row or block (`bottoms`). Falls back
 * to a straight cut only when one block is taller than a whole sheet.
 */
export const sheetBreaks = (height: number, bottoms: number[], sheet = PAGE_HEIGHT_PX): number[] => {
  const ends: number[] = []
  const sorted = [...new Set(bottoms.map(Math.round))].sort((a, b) => a - b)
  let start = 0
  while (height - start > sheet) {
    const limit = start + sheet
    // A break that leaves at least a third of the sheet used, so no near-empty pages.
    const candidates = sorted.filter(bottom => bottom > start + sheet / 3 && bottom <= limit)
    const end = candidates.length ? candidates[candidates.length - 1] : limit
    ends.push(end)
    start = end
  }
  ends.push(height)
  return ends
}

// The bottom of every line of text: inside a block taller than a sheet (a long
// note), the sheet then still ends between two lines, never through one.
const lineBottoms = (doc: Document, root: HTMLElement): number[] => {
  const bottoms: number[] = []
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const range = doc.createRange()
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.trim()) continue
    range.selectNodeContents(node)
    for (const rect of range.getClientRects()) bottoms.push(rect.bottom)
  }
  return bottoms
}

const waitForImages = async (doc: Document) => {
  await Promise.all([...doc.images].map(image => (image.complete ? Promise.resolve() : new Promise<void>(resolve => {
    image.addEventListener('load', () => resolve(), { once: true })
    image.addEventListener('error', () => resolve(), { once: true })
  }))))
  await (doc as Document & { fonts?: FontFaceSet }).fonts?.ready
}

const openReportFrame = (html: string) => new Promise<HTMLIFrameElement>((resolve, reject) => {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.tabIndex = -1
  // Off screen, at the width of a sheet: laid out exactly as printed, never seen.
  frame.style.cssText = `position:fixed;left:-20000px;top:0;width:${PAGE_WIDTH_PX}px;height:${PAGE_HEIGHT_PX}px;border:0;pointer-events:none`
  document.body.appendChild(frame)
  const doc = frame.contentDocument
  if (!doc) {
    frame.remove()
    reject(new Error('The report could not be prepared.'))
    return
  }
  doc.open()
  doc.write(html.replace('</head>', `<style>${PDF_CSS}</style></head>`))
  doc.close()
  resolve(frame)
})

/** Draw the report document into a PDF and return it. */
export const renderReportPdf = async (html: string) => {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas')])
  const frame = await openReportFrame(html)
  try {
    const doc = frame.contentDocument!
    await waitForImages(doc)
    const pages = [...doc.querySelectorAll<HTMLElement>('section.page')]
    if (!pages.length) throw new Error('The report has no pages.')

    const pdf = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait', compress: true })
    let first = true
    for (const page of pages) {
      const top = page.getBoundingClientRect().top
      const height = Math.ceil(page.scrollHeight)
      const bottoms = [
        ...[...page.querySelectorAll<HTMLElement>(BREAKABLE)].map(element => element.getBoundingClientRect().bottom),
        ...lineBottoms(doc, page),
      ].map(bottom => bottom - top)
      const canvas = await html2canvas(page, {
        scale: RENDER_SCALE,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: PAGE_WIDTH_PX,
        width: PAGE_WIDTH_PX,
        height,
      })
      let from = 0
      for (const end of sheetBreaks(height, bottoms)) {
        const slice = document.createElement('canvas')
        slice.width = canvas.width
        slice.height = Math.max(1, Math.round((end - from) * RENDER_SCALE))
        const context = slice.getContext('2d')!
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, slice.width, slice.height)
        context.drawImage(canvas, 0, Math.round(from * RENDER_SCALE), canvas.width, slice.height, 0, 0, slice.width, slice.height)
        if (!first) pdf.addPage('letter', 'portrait')
        first = false
        const sliceHeightPt = Math.min(PAGE_HEIGHT_PT, (end - from) * (PAGE_WIDTH_PT / PAGE_WIDTH_PX))
        pdf.addImage(slice.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, PAGE_WIDTH_PT, sliceHeightPt)
        from = end
      }
    }
    return pdf
  } finally {
    frame.remove()
  }
}

/** Download the progress report of a request that is not completed yet. */
export const downloadServiceProgressReport = async (report: ServiceReport) => {
  let facility: Facility | null = null
  if (report.facility_id) {
    try { facility = await fetchFacility(report.facility_id) } catch { /* the report shows what the request has */ }
  }
  const generatedAt = new Date()
  const html = buildServiceReportDocument(report, facility, { progress: true, generatedAt })
  const pdf = await renderReportPdf(html)
  pdf.save(progressReportFileName(report.request_number, generatedAt))
}
