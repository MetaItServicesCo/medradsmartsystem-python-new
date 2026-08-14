import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box, TextField, Button, Typography, InputAdornment,
  IconButton, Alert, CircularProgress
} from '@mui/material'
import { keyframes } from '@emotion/react'
import { motion, useReducedMotion } from 'framer-motion'
import PersonOutlineIcon from '@mui/icons-material/PersonOutline'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import CheckRoundedIcon from '@mui/icons-material/CheckRounded'
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined'
import { useAuthStore } from '@/stores/authStore'
import { Stagger, StaggerItem } from '@/components/motion'
import apiClient from '@/api/client'

// Ambient drift for the background orbs on the brand panel.
const drift = keyframes`
  0%   { transform: translate(0px, 0px) scale(1); }
  50%  { transform: translate(34px, -42px) scale(1.1); }
  100% { transform: translate(0px, 0px) scale(1); }
`
const driftAlt = keyframes`
  0%   { transform: translate(0px, 0px) scale(1); }
  50%  { transform: translate(-40px, 30px) scale(1.12); }
  100% { transform: translate(0px, 0px) scale(1); }
`
const pulse = keyframes`
  0%, 100% { opacity: 0.28; }
  50%      { opacity: 0.6; }
`

const features = [
  'Multi-Facility Management',
  'Real-time Equipment Tracking',
  'Compliance & Inspections',
  'Smart Attendance System',
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
  const reduce = useReducedMotion()
  const { login, isAuthenticated } = useAuthStore()

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard')
    }
  }, [isAuthenticated, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
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
      {/* Left panel — animated brand showcase */}
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
          background: 'linear-gradient(150deg, #5D4FCF 0%, #7C5DD8 46%, #F0528A 128%)',
        }}
      >
        {/* Ambient drifting orbs */}
        <Box sx={{ position: 'absolute', top: '-14%', right: '-12%', width: 420, height: 420, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.28), rgba(255,255,255,0))', filter: 'blur(30px)', animation: reduce ? 'none' : `${drift} 18s ease-in-out infinite` }} />
        <Box sx={{ position: 'absolute', bottom: '-16%', left: '-10%', width: 380, height: 380, borderRadius: '50%', background: 'radial-gradient(circle, rgba(240,82,138,0.4), rgba(240,82,138,0))', filter: 'blur(36px)', animation: reduce ? 'none' : `${driftAlt} 22s ease-in-out infinite` }} />
        <Box sx={{ position: 'absolute', top: '30%', left: '20%', width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,93,216,0.45), rgba(124,93,216,0))', filter: 'blur(30px)', animation: reduce ? 'none' : `${drift} 26s ease-in-out infinite` }} />

        {/* Faint grid + ECG pulse motif */}
        <Box aria-hidden sx={{ position: 'absolute', inset: 0, opacity: 0.5, pointerEvents: 'none', backgroundImage: 'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)', backgroundSize: '46px 46px', maskImage: 'radial-gradient(circle at 40% 40%, #000 0%, transparent 78%)', WebkitMaskImage: 'radial-gradient(circle at 40% 40%, #000 0%, transparent 78%)' }} />
        <Box aria-hidden sx={{ position: 'absolute', left: 0, right: 0, bottom: '16%', color: 'rgba(255,255,255,0.5)', animation: reduce ? 'none' : `${pulse} 4s ease-in-out infinite`, pointerEvents: 'none' }}>
          <svg width="100%" height="80" viewBox="0 0 600 80" preserveAspectRatio="none" fill="none">
            <polyline points="0,40 120,40 150,40 168,14 190,66 214,40 300,40 330,40 348,20 368,58 388,40 600,40" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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
                width: 66, height: 66, borderRadius: '22px', mb: 5,
                background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.3)',
                backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.9rem', fontWeight: 900, color: '#fff', letterSpacing: '-1px',
                boxShadow: '0 16px 40px rgba(0,0,0,0.22)',
              }}
            >
              M
            </Box>
          </motion.div>

          <motion.div
            initial={reduce ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
          >
            <Typography variant="h2" sx={{ fontWeight: 900, color: '#fff', mb: 2, lineHeight: 1.08, letterSpacing: '-1.5px' }}>
              Medrad<br />Admin Panel
            </Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.86)', fontSize: '1.1rem', lineHeight: 1.7, maxWidth: 380, mb: 5, fontWeight: 500 }}>
              Comprehensive healthcare equipment management for hospitals and medical facilities.
            </Typography>
          </motion.div>

          <Stagger>
            {features.map((feat) => (
              <StaggerItem key={feat}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.8, mb: 1.8 }}>
                  <Box
                    sx={{
                      width: 30, height: 30, borderRadius: '10px', flexShrink: 0,
                      background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.28)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <CheckRoundedIcon sx={{ fontSize: '1.05rem', color: '#fff' }} />
                  </Box>
                  <Typography sx={{ color: '#fff', fontSize: '1rem', fontWeight: 600 }}>{feat}</Typography>
                </Box>
              </StaggerItem>
            ))}
          </Stagger>

          <motion.div
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            <Box sx={{ mt: 5, display: 'inline-flex', alignItems: 'center', gap: 1, px: 2, py: 1, borderRadius: '999px', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.22)', backdropFilter: 'blur(10px)' }}>
              <ShieldOutlinedIcon sx={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.9)' }} />
              <Typography sx={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.82rem', fontWeight: 700 }}>
                Enterprise-grade security &amp; access control
              </Typography>
            </Box>
          </motion.div>
        </Box>
      </Box>

      {/* Right panel — login form */}
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: { xs: 3, sm: 4 }, position: 'relative' }}>
        {/* Soft ambient tint on the form side */}
        <Box aria-hidden sx={{ position: 'absolute', top: -120, right: -80, width: 360, height: 360, borderRadius: '50%', background: 'radial-gradient(circle, rgba(113,97,216,0.10), transparent 70%)', pointerEvents: 'none' }} />

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
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
                  whileHover={reduce ? undefined : { y: -2 }}
                  whileTap={reduce ? undefined : { scale: 0.985 }}
                  sx={{
                    mt: 3.5, py: 1.7, fontSize: '1rem', fontWeight: 800,
                    background: 'linear-gradient(135deg, #7161D8 0%, #F05D92 100%)',
                    boxShadow: '0 12px 30px rgba(113,97,216,0.32)',
                    borderRadius: '14px', textTransform: 'none',
                    '&:hover': { background: 'linear-gradient(135deg, #6151C7 0%, #E14A83 100%)', boxShadow: '0 16px 38px rgba(113,97,216,0.4)' },
                    '&:disabled': { background: 'linear-gradient(135deg, #C4B5FD 0%, #FBCFE8 100%)', color: 'rgba(255,255,255,0.85)' },
                  }}
                >
                  {loading ? <CircularProgress size={24} sx={{ color: '#fff' }} /> : isSignUp ? 'Create Account' : 'Sign In'}
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
