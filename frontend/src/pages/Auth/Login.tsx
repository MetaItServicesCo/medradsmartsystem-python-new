/*
  Sign-in page, redesigned to match the public landing page: the same "Circuit Glow" film tinted
  in MedRad's violet and pink, a deep indigo ground, liquid-glass card, the violet-to-pink action
  and the serif accent (MotionSites: split hero, blur-rise entrance, frosted rows, grain; taste-skill
  form rules: visible labels, 48px fields at 16px, one filled action, a status line; ui-ux-pro-max:
  autofill, paste, password toggle, focus rings, persistent errors). The sign-in logic is unchanged.
*/
import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Box, TextField, Button, Typography, InputAdornment,
  IconButton, Alert, CircularProgress
} from '@mui/material'
import PersonOutlineIcon from '@mui/icons-material/PersonOutline'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import { useAuthStore } from '@/stores/authStore'
import { takeSessionPlace } from '@/utils/sessionResume'
import apiClient from '@/api/client'
import './login.css'

const prefersReducedMotion = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** What a signed-in team finds inside: three real parts of MedRad. */
const INSIDE = [
  ['Service requests and inspections', 'Every job with its facility, equipment and report.'],
  ['Invoices and payments', 'Card, ACH or cheque, recorded on the invoice it pays.'],
  ['A view for each role', 'Seven roles, each signed in to the part that is theirs.'],
] as const

const Login = () => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [success, setSuccess] = useState('')
  const navigate = useNavigate()
  const { login, isAuthenticated } = useAuthStore()
  const filmRef = useRef<HTMLVideoElement>(null)
  const [filmStill] = useState(prefersReducedMotion)
  const [filmPaused, setFilmPaused] = useState(false)

  // The landing page's faces, and the page's head, while this page is open.
  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Sign in · MedRad'
    if (!document.querySelector('link[data-landing-fonts]')) {
      const fonts = document.createElement('link')
      fonts.rel = 'stylesheet'
      fonts.href = 'https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400..700&family=JetBrains+Mono:wght@400..500&family=Instrument+Serif:ital@1&display=swap'
      fonts.setAttribute('data-landing-fonts', '')
      document.head.appendChild(fonts)
    }
    return () => { document.title = previousTitle }
  }, [])

  // The background film plays muted and looping; reduced motion keeps its still poster; it can be paused.
  useEffect(() => {
    const film = filmRef.current
    if (!film) return
    if (filmStill || filmPaused) { film.pause(); return }
    film.muted = true
    const playing = film.play()
    if (playing && typeof playing.catch === 'function') playing.catch(() => setFilmPaused(true))
  }, [filmStill, filmPaused])

  useEffect(() => {
    // Back to where the system signed this user out, if it did; else the dashboard.
    if (isAuthenticated) navigate(takeSessionPlace(useAuthStore.getState().user?.id) || '/dashboard')
  }, [isAuthenticated, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (isSignUp && password.length < 12) {
      setError('Password must be at least 12 characters')
      return
    }
    setLoading(true)
    try {
      if (isSignUp) {
        await apiClient.post('/auth/register', {
          username,
          password,
          email,
          full_name: fullName,
          role: 'employee'
        })
        setSuccess('Account created. An administrator will approve it before you can sign in.')
        setIsSignUp(false)
        setPassword('')
      } else {
        const form = new URLSearchParams()
        form.append('username', username)
        form.append('password', password)
        const res = await apiClient.post('/auth/login', form.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
        // Signing in moves on from here (the effect above): to where the system
        // signed this user out, if it did, else the dashboard.
        login(res.data.user, res.data.access_token)
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box className="medrad-auth">
      <div className="auth-film" aria-hidden="true">
        <video
          ref={filmRef}
          className="auth-film__video"
          src="/landing-kit/media/circuit-glow.mp4"
          poster="/landing-kit/media/circuit-glow-poster.jpg"
          muted
          loop
          playsInline
          preload="auto"
          tabIndex={-1}
        />
        <div className="auth-film__tint" />
        <div className="auth-film__glow" />
        <div className="auth-film__scrim" />
        <div className="auth-film__grain" />
      </div>

      <header className="auth-header auth-in" style={{ ['--d' as string]: '0ms' }}>
        <Link className="auth-brand" to="/" aria-label="MedRad home">
          <span className="auth-mark" aria-hidden="true">M</span>
          <span>MedRad</span>
        </Link>
        <Link className="auth-back" to="/">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8H4M7.5 4.5 4 8l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Back to the site
        </Link>
      </header>

      <Box component="main" className="auth-main">
        <section className="auth-intro" aria-label="What is inside MedRad">
          <p className="auth-eyebrow auth-in" style={{ ['--d' as string]: '120ms' }}>MedRad workspace</p>
          <p className="auth-headline auth-in" style={{ ['--d' as string]: '220ms' }}>
            Welcome back to your <span className="auth-accent">service workspace</span>
          </p>
          <p className="auth-lead auth-in" style={{ ['--d' as string]: '360ms' }}>
            Requests, inspections, invoices and payments for your biomedical team, in one record.
          </p>
          <ol className="auth-rows auth-in" style={{ ['--d' as string]: '480ms' }}>
            {INSIDE.map(([title, line], index) => (
              <li key={title}>
                <span className="auth-rows__index">{String(index + 1).padStart(2, '0')}</span>
                <div><strong>{title}</strong><span>{line}</span></div>
              </li>
            ))}
          </ol>
        </section>

        <Box component="section" className="auth-card auth-in auth-in--card" style={{ ['--d' as string]: '300ms' }} aria-labelledby="auth-title">
          <Typography component="h1" id="auth-title" className="auth-title">
            {isSignUp ? <>Create your <span className="auth-accent">account</span></> : <>Sign in to <span className="auth-accent">MedRad</span></>}
          </Typography>
          <Typography className="auth-description">
            {isSignUp ? 'Fill in your details. An administrator approves new accounts.' : 'Use your MedRad username and password.'}
          </Typography>

          <div role="status" aria-live="polite" className="auth-status">
            {error && <Alert severity="error" className="auth-alert">{error}</Alert>}
            {success && <Alert severity="success" className="auth-alert">{success}</Alert>}
          </div>

          <form onSubmit={handleSubmit}>
            <Box className="auth-field">
              <label htmlFor="auth-username">Username</label>
              <TextField
                id="auth-username"
                fullWidth
                size="small"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
                autoComplete="username"
                placeholder="your.username"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <PersonOutlineIcon className="auth-field-icon" />
                    </InputAdornment>
                  ),
                }}
              />
            </Box>

            {isSignUp && (
              <>
                <Box className="auth-field">
                  <label htmlFor="auth-full-name">Full Name</label>
                  <TextField
                    id="auth-full-name"
                    fullWidth
                    size="small"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    autoComplete="name"
                    placeholder="Your full name"
                  />
                </Box>
                <Box className="auth-field">
                  <label htmlFor="auth-email">Email</label>
                  <TextField
                    id="auth-email"
                    fullWidth
                    size="small"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    placeholder="username@gmail.com"
                  />
                </Box>
              </>
            )}

            <Box className="auth-field">
              <label htmlFor="auth-password">Password</label>
              <TextField
                id="auth-password"
                fullWidth
                size="small"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                placeholder="Password"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockOutlinedIcon className="auth-field-icon" />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        type="button"
                        className="auth-password-toggle"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        aria-pressed={showPassword}
                        onClick={() => setShowPassword(!showPassword)}
                        edge="end"
                      >
                        {showPassword
                          ? <VisibilityOffOutlinedIcon className="auth-field-icon" />
                          : <VisibilityOutlinedIcon className="auth-field-icon" />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              {isSignUp && <p className="auth-hint">At least 12 characters.</p>}
            </Box>

            <Button
              fullWidth
              type="submit"
              variant="contained"
              disabled={loading}
              className="auth-submit"
              aria-busy={loading}
            >
              {loading
                ? <CircularProgress size={22} color="inherit" aria-label={isSignUp ? 'Creating account' : 'Signing in'} />
                : isSignUp ? 'Create Account' : 'Sign In'}
            </Button>
          </form>

          <Box className="auth-switch">
            <Typography component="span">
              {isSignUp ? 'Already have an account? ' : "Don't have an account yet? "}
            </Typography>
            <Button
              variant="text"
              onClick={() => { setIsSignUp(!isSignUp); setError(''); setSuccess('') }}
            >
              {isSignUp ? 'Sign in' : 'Register for free'}
            </Button>
          </Box>
        </Box>
      </Box>

      <footer className="auth-footer auth-in" style={{ ['--d' as string]: '700ms' }}>
        <span>© {new Date().getFullYear()} MedRad Systems · All rights reserved</span>
        {!filmStill && (
          <button type="button" className="auth-film-toggle" onClick={() => setFilmPaused(value => !value)} aria-pressed={filmPaused} aria-label={filmPaused ? 'Play the background film' : 'Pause the background film'}>
            {filmPaused
              ? <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.5v9l7.5-4.5z" fill="currentColor" /></svg>
              : <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 3.5h2.5v9H4.5zM9 3.5h2.5v9H9z" fill="currentColor" /></svg>}
          </button>
        )}
      </footer>
    </Box>
  )
}

export default Login
