import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box, TextField, Button, Typography, InputAdornment,
  IconButton, Alert, CircularProgress
} from '@mui/material'
import { keyframes } from '@emotion/react'
import { motion } from 'framer-motion'
import PersonOutlineIcon from '@mui/icons-material/PersonOutline'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import CheckRoundedIcon from '@mui/icons-material/CheckRounded'
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined'
import { useAuthStore } from '@/stores/authStore'
import { Stagger, StaggerItem } from '@/components/motion'
import apiClient from '@/api/client'

// --- Continuous ambient motion (keeps the panel alive, not just on entrance) ---
const aurora = keyframes`
  0%   { background-position: 0% 50%; }
  50%  { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
`
const drift = keyframes`
  0%   { transform: translate(0px, 0px) scale(1); }
  50%  { transform: translate(40px, -50px) scale(1.14); }
  100% { transform: translate(0px, 0px) scale(1); }
`
const driftAlt = keyframes`
  0%   { transform: translate(0px, 0px) scale(1); }
  50%  { transform: translate(-48px, 40px) scale(1.18); }
  100% { transform: translate(0px, 0px) scale(1); }
`
const floaty = keyframes`
  0%, 100% { transform: translateY(0px); }
  50%      { transform: translateY(-9px); }
`
const glowPulse = keyframes`
  0%, 100% { box-shadow: 0 16px 40px rgba(0,0,0,0.22), 0 0 0 0 rgba(255,255,255,0.0); }
  50%      { box-shadow: 0 16px 40px rgba(0,0,0,0.22), 0 0 36px 6px rgba(255,255,255,0.22); }
`
const sheen = keyframes`
  0%   { transform: translateX(-130%) skewX(-18deg); }
  60%, 100% { transform: translateX(320%) skewX(-18deg); }
`
const rise = keyframes`
  0%   { transform: translateY(10px); opacity: 0; }
  15%  { opacity: 0.7; }
  100% { transform: translateY(-150px); opacity: 0; }
`

const features = [
  'Multi-Facility Management',
  'Real-time Equipment Tracking',
  'Compliance & Inspections',
  'Smart Attendance System',
]

// Small ambient particles that keep rising in the brand panel.
const particles = [
  { left: '18%', size: 6, delay: 0, dur: 9 },
  { left: '32%', size: 4, delay: 2.4, dur: 11 },
  { left: '54%', size: 5, delay: 1.2, dur: 10 },
  { left: '68%', size: 3, delay: 3.1, dur: 12 },
  { left: '80%', size: 6, delay: 0.7, dur: 9.5 },
  { left: '44%', size: 3, delay: 4.2, dur: 13 },
]

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
  // Motion is always on in this app (see components/motion). Kept as a flag so the
  // animation wiring stays in one place if an in-app calm mode is added later.
  const reduce = false
  const { login, isAuthenticated } = useAuthStore()

  const anim = (value: string) => (reduce ? 'none' : value)

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard')
    }
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
        setSuccess('Account created! You can now sign in.')
        setIsSignUp(false)
        setPassword('')
      } else {
        const form = new URLSearchParams()
        form.append('username', username)
        form.append('password', password)
        const res = await apiClient.post('/auth/login', form.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
        login(res.data.user, res.data.access_token)
        navigate('/dashboard')
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', backgroundColor: '#F5F3FF', overflow: 'hidden' }}>
      {/* Left panel — living brand showcase */}
      <Box
        sx={{
          width: { xs: 0, md: '46%' },
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          justifyContent: 'center',
          px: 8,
          position: 'relative',
          overflow: 'hidden',
          color: '#fff',
          // Animated aurora gradient (always flowing)
          background: 'linear-gradient(130deg, #4C3FBF 0%, #6D5AD6 26%, #9D5CD0 50%, #F0528A 78%, #6D5AD6 100%)',
          backgroundSize: '300% 300%',
          animation: anim(`${aurora} 18s ease infinite`),
        }}
      >
        {/* Drifting orbs */}
        <Box sx={{ position: 'absolute', top: '-14%', right: '-12%', width: 440, height: 440, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.32), rgba(255,255,255,0))', filter: 'blur(28px)', animation: anim(`${drift} 15s ease-in-out infinite`) }} />
        <Box sx={{ position: 'absolute', bottom: '-16%', left: '-10%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(240,82,138,0.5), rgba(240,82,138,0))', filter: 'blur(32px)', animation: anim(`${driftAlt} 19s ease-in-out infinite`) }} />
        <Box sx={{ position: 'absolute', top: '28%', left: '18%', width: 240, height: 240, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,93,216,0.5), rgba(124,93,216,0))', filter: 'blur(26px)', animation: anim(`${drift} 22s ease-in-out infinite`) }} />

        {/* Rising particles */}
        {!reduce && particles.map((p, i) => (
          <Box key={i} sx={{ position: 'absolute', bottom: '12%', left: p.left, width: p.size, height: p.size, borderRadius: '50%', background: 'rgba(255,255,255,0.7)', animation: `${rise} ${p.dur}s linear ${p.delay}s infinite` }} />
        ))}

        {/* Faint grid */}
        <Box aria-hidden sx={{ position: 'absolute', inset: 0, opacity: 0.5, pointerEvents: 'none', backgroundImage: 'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)', backgroundSize: '46px 46px', maskImage: 'radial-gradient(circle at 40% 40%, #000 0%, transparent 78%)', WebkitMaskImage: 'radial-gradient(circle at 40% 40%, #000 0%, transparent 78%)' }} />

        {/* Continuously-drawing ECG heartbeat */}
        <Box aria-hidden sx={{ position: 'absolute', left: 0, right: 0, bottom: '15%', color: 'rgba(255,255,255,0.65)', pointerEvents: 'none' }}>
          <svg width="100%" height="90" viewBox="0 0 600 90" preserveAspectRatio="none" fill="none">
            <polyline
              className={reduce ? undefined : 'ecg-line'}
              points="0,45 120,45 150,45 168,16 190,74 214,45 300,45 330,45 348,22 368,66 388,45 470,45 500,45 518,28 536,60 556,45 600,45"
              stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
              pathLength={1}
            />
          </svg>
        </Box>

        {/* Content */}
        <Box sx={{ position: 'relative', zIndex: 1 }}>
          <motion.div
            initial={reduce ? false : { opacity: 0, scale: 0.9, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <Box
              sx={{
                width: 68, height: 68, borderRadius: '22px', mb: 5,
                background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.32)',
                backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.9rem', fontWeight: 900, color: '#fff', letterSpacing: '-1px',
                animation: anim(`${floaty} 5s ease-in-out infinite, ${glowPulse} 4.5s ease-in-out infinite`),
              }}
            >
              M
            </Box>
          </motion.div>

          {/* Word-by-word headline reveal */}
          <Box sx={{ mb: 2 }}>
            {[['Medrad'], ['Admin', 'Panel']].map((line, li) => (
              <Box key={li} sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                {line.map((word, wi) => (
                  <motion.span
                    key={word}
                    initial={reduce ? false : { opacity: 0, y: 26, rotateX: -40 }}
                    animate={{ opacity: 1, y: 0, rotateX: 0 }}
                    transition={{ duration: 0.6, delay: 0.1 + (li * 2 + wi) * 0.12, ease: [0.16, 1, 0.3, 1] }}
                    style={{ display: 'inline-block', fontWeight: 900, fontSize: '2.85rem', lineHeight: 1.05, letterSpacing: '-1.5px', color: '#fff', transformOrigin: 'bottom' }}
                  >
                    {word}
                  </motion.span>
                ))}
              </Box>
            ))}
          </Box>

          <motion.div
            initial={reduce ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <Typography sx={{ color: 'rgba(255,255,255,0.88)', fontSize: '1.1rem', lineHeight: 1.7, maxWidth: 380, mb: 5, fontWeight: 500 }}>
              Comprehensive healthcare equipment management for hospitals and medical facilities.
            </Typography>
          </motion.div>

          <Stagger>
            {features.map((feat) => (
              <StaggerItem key={feat}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.8, mb: 1.8 }}>
                  <motion.div
                    initial={reduce ? false : { scale: 0, rotate: -90 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 18, delay: 0.5 }}
                  >
                    <Box sx={{ width: 30, height: 30, borderRadius: '10px', flexShrink: 0, background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <CheckRoundedIcon sx={{ fontSize: '1.05rem', color: '#fff' }} />
                    </Box>
                  </motion.div>
                  <Typography sx={{ color: '#fff', fontSize: '1rem', fontWeight: 600 }}>{feat}</Typography>
                </Box>
              </StaggerItem>
            ))}
          </Stagger>

          <motion.div initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.8 }}>
            <Box sx={{ mt: 5, display: 'inline-flex', alignItems: 'center', gap: 1, px: 2, py: 1, borderRadius: '999px', background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.24)', backdropFilter: 'blur(10px)' }}>
              <ShieldOutlinedIcon sx={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.92)' }} />
              <Typography sx={{ color: 'rgba(255,255,255,0.92)', fontSize: '0.82rem', fontWeight: 700 }}>
                Enterprise-grade security &amp; access control
              </Typography>
            </Box>
          </motion.div>
        </Box>
      </Box>

      {/* Right panel — login form */}
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: { xs: 3, sm: 4 }, position: 'relative' }}>
        <Box aria-hidden sx={{ position: 'absolute', top: -120, right: -80, width: 380, height: 380, borderRadius: '50%', background: 'radial-gradient(circle, rgba(113,97,216,0.12), transparent 70%)', pointerEvents: 'none', animation: anim(`${drift} 20s ease-in-out infinite`) }} />

        <motion.div
          initial={reduce ? false : { opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          style={{ width: '100%', maxWidth: 392, position: 'relative' }}
        >
          {/* Mobile logo */}
          <Box sx={{ display: { xs: 'flex', md: 'none' }, alignItems: 'center', gap: 1.5, mb: 4 }}>
            <Box sx={{ width: 42, height: 42, borderRadius: '13px', background: 'linear-gradient(135deg, #7161D8, #F05D92)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '1.15rem', color: '#fff' }}>
              M
            </Box>
            <Typography sx={{ fontWeight: 800, color: '#1E1B4B', fontSize: '1.15rem' }}>Medrad Admin</Typography>
          </Box>

          <Typography variant="h4" sx={{ fontWeight: 900, color: '#1E1B4B', mb: 0.5, letterSpacing: '-0.5px' }}>
            {isSignUp ? 'Create account' : 'Welcome back'}
          </Typography>
          <Typography variant="body2" sx={{ color: '#94A3B8', mb: 3.5, fontWeight: 600 }}>
            {isSignUp ? 'Fill in your details to get started' : 'Sign in to continue to your workspace'}
          </Typography>

          {error && (
            <motion.div initial={reduce ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
              <Alert severity="error" sx={{ mb: 2.5, borderRadius: '14px', fontSize: '0.85rem', fontWeight: 600 }}>{error}</Alert>
            </motion.div>
          )}
          {success && (
            <motion.div initial={reduce ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
              <Alert severity="success" sx={{ mb: 2.5, borderRadius: '14px', fontSize: '0.85rem', fontWeight: 600 }}>{success}</Alert>
            </motion.div>
          )}

          <form onSubmit={handleSubmit}>
            <Stagger>
              <StaggerItem>
                <TextField
                  fullWidth
                  label="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  margin="normal"
                  required
                  autoFocus
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <PersonOutlineIcon sx={{ color: '#9CA3AF', fontSize: '1.2rem' }} />
                      </InputAdornment>
                    ),
                  }}
                />
              </StaggerItem>

              {isSignUp && (
                <>
                  <StaggerItem>
                    <TextField fullWidth label="Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} margin="normal" required />
                  </StaggerItem>
                  <StaggerItem>
                    <TextField fullWidth label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} margin="normal" required />
                  </StaggerItem>
                </>
              )}

              <StaggerItem>
                <TextField
                  fullWidth
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  margin="normal"
                  required
                  inputProps={{ minLength: isSignUp ? 12 : undefined, maxLength: 72 }}
                  helperText={isSignUp ? 'Use at least 12 characters.' : undefined}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <LockOutlinedIcon sx={{ color: '#9CA3AF', fontSize: '1.2rem' }} />
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={() => setShowPassword(!showPassword)} edge="end">
                          {showPassword
                            ? <VisibilityOffOutlinedIcon sx={{ fontSize: '1.1rem', color: '#9CA3AF' }} />
                            : <VisibilityOutlinedIcon sx={{ fontSize: '1.1rem', color: '#9CA3AF' }} />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
              </StaggerItem>

              <StaggerItem>
                <Button
                  fullWidth
                  type="submit"
                  variant="contained"
                  disabled={loading}
                  component={motion.button}
                  whileHover={reduce ? undefined : { y: -2, scale: 1.01 }}
                  whileTap={reduce ? undefined : { scale: 0.985 }}
                  sx={{
                    mt: 3.5, py: 1.7, fontSize: '1rem', fontWeight: 800,
                    position: 'relative', overflow: 'hidden',
                    background: 'linear-gradient(135deg, #7161D8 0%, #F05D92 100%)',
                    boxShadow: '0 12px 30px rgba(113,97,216,0.32)',
                    borderRadius: '14px', textTransform: 'none',
                    '&:hover': { background: 'linear-gradient(135deg, #6151C7 0%, #E14A83 100%)', boxShadow: '0 16px 38px rgba(113,97,216,0.4)' },
                    '&:disabled': { background: 'linear-gradient(135deg, #C4B5FD 0%, #FBCFE8 100%)', color: 'rgba(255,255,255,0.85)' },
                  }}
                >
                  {/* Sweeping sheen */}
                  {!loading && (
                    <Box aria-hidden sx={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '40%', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)', animation: anim(`${sheen} 3.4s ease-in-out infinite`), pointerEvents: 'none' }} />
                  )}
                  <Box component="span" sx={{ position: 'relative', zIndex: 1, display: 'inline-flex', alignItems: 'center' }}>
                    {loading ? <CircularProgress size={24} sx={{ color: '#fff' }} /> : isSignUp ? 'Create Account' : 'Sign In'}
                  </Box>
                </Button>
              </StaggerItem>
            </Stagger>
          </form>

          <Box sx={{ mt: 3, textAlign: 'center' }}>
            <Typography variant="body2" sx={{ color: '#6B7280', fontWeight: 600 }}>
              {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
              <Button
                variant="text"
                onClick={() => { setIsSignUp(!isSignUp); setError(''); setSuccess('') }}
                sx={{ color: '#7161D8', fontWeight: 800, textTransform: 'none', p: 0, minWidth: 'auto', '&:hover': { background: 'transparent', textDecoration: 'underline' } }}
              >
                {isSignUp ? 'Sign in' : 'Create one'}
              </Button>
            </Typography>
          </Box>

          <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', mt: 4, color: '#CBD5E1', fontWeight: 600 }}>
            © 2026 Medrad Systems · All rights reserved
          </Typography>
        </motion.div>
      </Box>
    </Box>
  )
}

export default Login
