import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider, CssBaseline } from '@mui/material'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import App from './App'
import theme from './theme'
import './theme/global.css'
import ErrorBoundary from './components/ErrorBoundary'
import { isChunkLoadError, reloadOnceForChunkError } from './utils/lazyWithReload'

// Vite fires this when a dynamically-imported chunk fails to load — almost always
// a stale-deploy hash mismatch. Recover by reloading once to fetch fresh assets.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  reloadOnceForChunkError()
})

// Catch chunk failures that surface as unhandled promise rejections (e.g. a
// dynamic import awaited outside a lazy boundary) and self-heal the same way.
window.addEventListener('unhandledrejection', (event) => {
  if (isChunkLoadError(event.reason)) {
    event.preventDefault()
    reloadOnceForChunkError()
  }
})

// Select-all on focus so the leading zero doesn't stick when the user starts typing
document.addEventListener('focusin', (e) => {
  const el = e.target
  if (el instanceof HTMLInputElement && el.type === 'number') {
    el.select()
  }
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
      gcTime: 5 * 60_000,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
          <ToastContainer position="top-right" autoClose={3000} />
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
