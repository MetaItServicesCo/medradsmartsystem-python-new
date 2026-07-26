import { lazy, type ComponentType } from 'react'

// A single reload guard shared across the app. After a deploy, the browser may
// still hold references to old hashed chunk filenames that no longer exist on
// the server, so a dynamic import throws "Failed to fetch dynamically imported
// module". The fix is to reload once to pick up the fresh index.html + chunks —
// guarded via sessionStorage so a genuinely broken build can never trap the
// user in an endless reload loop.
const RELOAD_KEY = 'medrad:chunk-reloaded'

export function isChunkLoadError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase()
  return (
    // Chunk failed to download (old hash 404s after a redeploy)
    message.includes('dynamically imported module') ||
    message.includes('failed to fetch dynamically') ||
    message.includes('loading chunk') ||
    message.includes('importing a module script failed') ||
    message.includes('failed to load module script') ||
    message.includes('error loading dynamically imported module') ||
    // Chunk downloaded but resolved to undefined / wrong version (mismatched
    // build): React.lazy then throws reading `.default` off `undefined`.
    message.includes("reading 'default'") ||
    message.includes('evaluating \'module.default\'') ||
    message.includes('module is undefined') ||
    message.includes("undefined is not an object (evaluating 'module")
  )
}

/** Reload the page once to recover from a stale-deploy chunk error.
 *  Returns true if a reload was triggered, false if it was already attempted. */
export function reloadOnceForChunkError(): boolean {
  try {
    if (window.sessionStorage.getItem(RELOAD_KEY)) return false
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch {
    // sessionStorage unavailable (private mode / blocked) — allow a single reload.
  }
  window.location.reload()
  return true
}

/** Clear the guard after a successful load so future deploys can self-heal too. */
export function clearChunkReloadGuard(): void {
  try {
    window.sessionStorage.removeItem(RELOAD_KEY)
  } catch {
    // ignore
  }
}

/** Drop-in replacement for React.lazy that self-heals stale-chunk errors. */
export function lazyWithReload<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      const module = await factory()
      // A mismatched build can resolve the import to undefined / a module with no
      // default export. Treat that like a chunk error and reload once.
      if (!module || typeof (module as { default?: unknown }).default === 'undefined') {
        if (reloadOnceForChunkError()) {
          return new Promise<{ default: T }>(() => {})
        }
        throw new Error('Failed to load module: undefined default export')
      }
      clearChunkReloadGuard()
      return module
    } catch (error) {
      if (isChunkLoadError(error) && reloadOnceForChunkError()) {
        // Reload was triggered — return a promise that never resolves so nothing
        // flashes on screen before the page navigates away.
        return new Promise<{ default: T }>(() => {})
      }
      throw error
    }
  })
}
