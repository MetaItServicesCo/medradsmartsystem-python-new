/**
 * Print a document on its own -- never the page around it.
 *
 * The document is written into a hidden frame and printed from there once it
 * and its images are ready, exactly once. It does not wait for the frame's
 * load event, which can come before anyone listens for it (an image already
 * cached), and then never print.
 */
const escapeTitle = (title: string) => title.replace(/&/g, '&amp;').replace(/</g, '&lt;')

export const printHtmlDocument = (title: string, html: string): void => {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(frame)
  const win = frame.contentWindow
  const doc = win?.document
  if (!win || !doc) {
    frame.remove()
    return
  }
  doc.open()
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeTitle(title)}</title></head><body style="margin:0">${html}</body></html>`)
  doc.close()

  let printed = false
  const print = () => {
    if (printed) return
    printed = true
    win.focus()
    win.print()
    // The print dialog holds the page while open; the frame goes once it closes.
    window.setTimeout(() => frame.remove(), 1000)
  }
  const waiting = Array.from(doc.images).filter(image => !image.complete)
  if (!waiting.length) {
    window.setTimeout(print, 50)
    return
  }
  let left = waiting.length
  const settled = () => {
    left -= 1
    if (left <= 0) print()
  }
  waiting.forEach((image) => {
    image.addEventListener('load', settled, { once: true })
    image.addEventListener('error', settled, { once: true })
  })
  // An image that never answers does not stop the print.
  window.setTimeout(print, 4000)
}
