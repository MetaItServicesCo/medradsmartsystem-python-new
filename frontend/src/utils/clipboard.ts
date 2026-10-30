/**
 * Copy text to the clipboard, reliably.
 *
 * navigator.clipboard only exists on secure (https / localhost) pages and can
 * still be refused by the browser, so fall back to the older select-and-copy
 * command. Inside an MUI Dialog the focus trap pulls focus back from anything
 * outside the dialog, so pass the dialog's own input when there is one; the
 * fallback then selects and copies that field instead of a hidden helper.
 */
export async function copyText(text: string, field?: HTMLInputElement | HTMLTextAreaElement | null): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Refused (permissions, focus); try the fallback below.
    }
  }
  return legacyCopy(text, field)
}

function legacyCopy(text: string, field?: HTMLInputElement | HTMLTextAreaElement | null): boolean {
  let target = field ?? null
  let temporary: HTMLTextAreaElement | null = null
  if (!target || target.value !== text) {
    temporary = document.createElement('textarea')
    temporary.value = text
    temporary.setAttribute('readonly', '')
    temporary.style.position = 'fixed'
    temporary.style.top = '0'
    temporary.style.left = '0'
    temporary.style.opacity = '0'
    // Stay inside any open dialog so its focus trap does not steal focus back.
    const host = (document.activeElement?.closest('[role="dialog"]') as HTMLElement | null) ?? document.body
    host.appendChild(temporary)
    target = temporary
  }
  try {
    target.focus()
    target.select()
    target.setSelectionRange(0, text.length)
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    temporary?.remove()
  }
}
