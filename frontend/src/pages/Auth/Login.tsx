import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box, TextField, Button, Typography, InputAdornment,
  IconButton, Alert, CircularProgress
} from '@mui/material'
import { keyframes } from '@emotion/react'
import { motion, useMotionValue, useSpring, useTransform, useMotionTemplate } from 'framer-motion'
import PersonOutlineIcon from '@mui/icons-material/PersonOutline'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined'
import MonitorHeartOutlinedIcon from '@mui/icons-material/MonitorHeartOutlined'
import { useAuthStore } from '@/stores/authStore'
import { Stagger, StaggerItem } from '@/components/motion'
import apiClient from '@/api/client'

const LOGO = '/mr-biomed-logo.jpeg'

// --- Self-contained motion (login page only) ---
const drift = keyframes`
  0%,100% { transform: translate(0,0) scale(1); }
  50%     { transform: translate(38px,-44px) scale(1.12); }
`
const driftAlt = keyframes`
  0%,100% { transform: translate(0,0) scale(1); }
  50%     { transform: translate(-46px,36px) scale(1.16); }
`
const floaty = keyframes`
  0%,100% { transform: translateY(0); }
  50%     { transform: translateY(-14px); }
`
const glowPulse = keyframes`
  0%,100% { box-shadow: 0 30px 70px rgba(84,69,179,0.28), 0 0 0 0 rgba(240,93,146,0); }
  50%     { box-shadow: 0 34px 80px rgba(84,69,179,0.34), 0 0 46px 8px rgba(240,93,146,0.20); }
`
const sheen = keyframes`
  0%   { transform: translateX(-130%) skewX(-18deg); }
  60%,100% { transform: translateX(320%) skewX(-18deg); }
`
const petal = keyframes`
  0%   { transform: translateY(12px) translateX(0) rotate(0deg); opacity: 0; }
  12%  { opacity: 0.9; }
  85%  { opacity: 0.9; }
  100% { transform: translateY(-160px) translateX(24px) rotate(300deg); opacity: 0; }
`
const badgeFloat = keyframes`
  0%,100% { transform: translateY(0) rotate(-3deg); }
  50%     { transform: translateY(-12px) rotate(3deg); }
`

// Drifting brand-colored "petals" (leaf shapes) around the hero.
const petals = [
  { top: '8%', left: '18%', size: 16, color: 'rgba(240,93,146,0.75)', dur: 9, delay: 0 },
  { top: '22%', left: '68%', size: 12, color: 'rgba(124,93,216,0.7)', dur: 11, delay: 1.6 },
  { top: '52%', left: '10%', size: 14, color: 'rgba(155,142,240,0.7)', dur: 10, delay: 0.8 },
  { top: '70%', left: '60%', size: 18, color: 'rgba(240,93,146,0.6)', dur: 12, delay: 2.4 },
  { top: '40%', left: '82%', size: 10, color: 'rgba(124,93,216,0.6)', dur: 9.5, delay: 3.2 },
  { top: '84%', left: '30%', size: 12, color: 'rgba(249,168,199,0.8)', dur: 10.5, delay: 1.2 },
  { top: '14%', left: '44%', size: 9, color: 'rgba(155,142,240,0.6)', dur: 8.5, delay: 4 },
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
  const { login, isAuthenticated } = useAuthStore()

  // Mouse-reactive 3D tilt for the hero medallion.
  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const rotateX = useSpring(useTransform(my, [-0.5, 0.5], [14, -14]), { stiffness: 120, damping: 15 })
  const rotateY = useSpring(useTransform(mx, [-0.5, 0.5], [-16, 16]), { stiffness: 120, damping: 15 })
  const heroTransform = useMotionTemplate`perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`
  const handleHeroMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    mx.set((e.clientX - r.left) / r.width - 0.5)
    my.set((e.clientY - r.top) / r.height - 0.5)
  }
  const resetHero = () => { mx.set(0); my.set(0) }

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard')
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
    <Box
      sx={{
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: { xs: 2, sm: 4 },
        overflow: 'hidden',
        background: 'linear-gradient(125deg, #ECEAFF 0%, #F3EEFF 42%, #FDEBF2 100%)',
      }}
    >
      {/* Ambient background blobs (blurred behind the glass) */}
      <Box aria-hidden sx={{ position: 'absolute', top: '-12%', left: '-6%', width: 460, height: 460, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,93,216,0.34), transparent 70%)', filter: 'blur(28px)', animation: `${drift} 18s ease-in-out infinite` }} />
      <Box aria-hidden sx={{ position: 'absolute', bottom: '-14%', right: '-8%', width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle, rgba(240,93,146,0.32), transparent 70%)', filter: 'blur(30px)', animation: `${driftAlt} 22s ease-in-out infinite` }} />
      <Box aria-hidden sx={{ position: 'absolute', top: '30%', left: '48%', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(155,142,240,0.3), transparent 70%)', filter: 'blur(26px)', animation: `${drift} 26s ease-in-out infinite` }} />

      {/* Glass stage */}
      <Box
        component={motion.div}
        initial={{ opacity: 0, y: 26, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        sx={{
          position: 'relative',
          width: '100%',
          maxWidth: 1000,
          display: 'flex',
          alignItems: 'stretch',
          gap: { xs: 0, md: 2 },
          p: { xs: 2.5, sm: 3, md: 3.5 },
          borderRadius: '34px',
          background: 'rgba(255,255,255,0.42)',
          backdropFilter: 'blur(26px)',
          WebkitBackdropFilter: 'blur(26px)',
          border: '1px solid rgba(255,255,255,0.6)',
          boxShadow: '0 44px 120px rgba(84,69,179,0.20)',
        }}
      >
        {/* Left — form card */}
        <Box
          sx={{
            width: { xs: '100%', md: 400 },
            flexShrink: 0,
            p: { xs: 2.5, sm: 4 },
            borderRadius: '26px',
            background: 'rgba(255,255,255,0.92)',
            boxShadow: '0 24px 60px rgba(84,69,179,0.12)',
            border: '1px solid rgba(255,255,255,0.9)',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, mb: 3 }}>
            <Box sx={{ width: 38, height: 38, borderRadius: '12px', background: 'linear-gradient(135deg, #7161D8, #F05D92)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#fff', fontSize: '1.05rem', boxShadow: '0 8px 20px rgba(113,97,216,0.35)' }}>M</Box>
            <Typography sx={{ fontWeight: 800, color: '#7161D8', letterSpacing: '0.14em', fontSize: '0.72rem', textTransform: 'uppercase' }}>Mr. BioMed Tech</Typography>
          </Box>

          <Typography variant="h4" sx={{ fontWeight: 900, color: '#1E1B4B', letterSpacing: '-0.5px', mb: 0.5 }}>
            {isSignUp ? 'Create account' : 'Login'}
          </Typography>
          <Typography variant="body2" sx={{ color: '#94A3B8', mb: 3, fontWeight: 600 }}>
            {isSignUp ? 'Fill in your details to get started' : 'Sign in to continue to your workspace'}
          </Typography>

          {error && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
              <Alert severity="error" sx={{ mb: 2.5, borderRadius: '14px', fontSize: '0.85rem', fontWeight: 600 }}>{error}</Alert>
            </motion.div>
          )}
          {success && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
              <Alert severity="success" sx={{ mb: 2.5, borderRadius: '14px', fontSize: '0.85rem', fontWeight: 600 }}>{success}</Alert>
            </motion.div>
          )}

          <form onSubmit={handleSubmit}>
            <Stagger>
              <StaggerItem>
                <Typography sx={{ fontWeight: 700, color: '#475569', fontSize: '0.8rem', mb: 0.5 }}>Username</Typography>
                <TextField
                  fullWidth size="small"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required autoFocus
                  placeholder="your.username"
                  InputProps={{ startAdornment: (<InputAdornment position="start"><PersonOutlineIcon sx={{ color: '#9CA3AF', fontSize: '1.15rem' }} /></InputAdornment>) }}
                />
              </StaggerItem>

              {isSignUp && (
                <>
                  <StaggerItem>
                    <Typography sx={{ fontWeight: 700, color: '#475569', fontSize: '0.8rem', mt: 2, mb: 0.5 }}>Full Name</Typography>
                    <TextField fullWidth size="small" value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="Your full name" />
                  </StaggerItem>
                  <StaggerItem>
                    <Typography sx={{ fontWeight: 700, color: '#475569', fontSize: '0.8rem', mt: 2, mb: 0.5 }}>Email</Typography>
                    <TextField fullWidth size="small" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="username@gmail.com" />
                  </StaggerItem>
                </>
              )}

              <StaggerItem>
                <Typography sx={{ fontWeight: 700, color: '#475569', fontSize: '0.8rem', mt: 2, mb: 0.5 }}>Password</Typography>
                <TextField
                  fullWidth size="small"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Password"
                  InputProps={{
                    startAdornment: (<InputAdornment position="start"><LockOutlinedIcon sx={{ color: '#9CA3AF', fontSize: '1.15rem' }} /></InputAdornment>),
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={() => setShowPassword(!showPassword)} edge="end">
                          {showPassword
                            ? <VisibilityOffOutlinedIcon sx={{ fontSize: '1.05rem', color: '#9CA3AF' }} />
                            : <VisibilityOutlinedIcon sx={{ fontSize: '1.05rem', color: '#9CA3AF' }} />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
              </StaggerItem>

              <StaggerItem>
                <Button
                  fullWidth type="submit" variant="contained" disabled={loading}
                  component={motion.button}
                  whileHover={{ y: -2, scale: 1.01 }}
                  whileTap={{ scale: 0.985 }}
                  sx={{
                    mt: 3, py: 1.5, fontSize: '0.95rem', fontWeight: 800,
                    position: 'relative', overflow: 'hidden',
                    background: 'linear-gradient(135deg, #7161D8 0%, #F05D92 100%)',
                    boxShadow: '0 14px 30px rgba(113,97,216,0.32)',
                    borderRadius: '13px', textTransform: 'none',
                    '&:hover': { background: 'linear-gradient(135deg, #6151C7 0%, #E14A83 100%)' },
                    '&:disabled': { background: 'linear-gradient(135deg, #C4B5FD 0%, #FBCFE8 100%)', color: 'rgba(255,255,255,0.85)' },
                  }}
                >
                  {!loading && (
                    <Box aria-hidden sx={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '40%', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)', animation: `${sheen} 3.6s ease-in-out infinite`, pointerEvents: 'none' }} />
                  )}
                  <Box component="span" sx={{ position: 'relative', zIndex: 1, display: 'inline-flex', alignItems: 'center' }}>
                    {loading ? <CircularProgress size={22} sx={{ color: '#fff' }} /> : isSignUp ? 'Create Account' : 'Sign In'}
                  </Box>
                </Button>
              </StaggerItem>
            </Stagger>
          </form>

          <Box sx={{ mt: 2.5, textAlign: 'center' }}>
            <Typography variant="body2" sx={{ color: '#6B7280', fontWeight: 600, fontSize: '0.85rem' }}>
              {isSignUp ? 'Already have an account? ' : "Don't have an account yet? "}
              <Button
                variant="text"
                onClick={() => { setIsSignUp(!isSignUp); setError(''); setSuccess('') }}
                sx={{ color: '#F05D92', fontWeight: 800, textTransform: 'none', p: 0, minWidth: 'auto', fontSize: '0.85rem', '&:hover': { background: 'transparent', textDecoration: 'underline' } }}
              >
                {isSignUp ? 'Sign in' : 'Register for free'}
              </Button>
            </Typography>
          </Box>
        </Box>

        {/* Right — floating 3D hero (hidden on small screens) */}
        <Box
          onMouseMove={handleHeroMove}
          onMouseLeave={resetHero}
          sx={{ flex: 1, display: { xs: 'none', md: 'flex' }, position: 'relative', alignItems: 'center', justifyContent: 'center', minHeight: 480, overflow: 'hidden', borderRadius: '26px' }}
        >
          {/* Drifting petals */}
          {petals.map((p, i) => (
            <Box key={i} aria-hidden sx={{ position: 'absolute', top: p.top, left: p.left, width: p.size, height: p.size, background: p.color, borderRadius: '50% 0 50% 0', animation: `${petal} ${p.dur}s ease-in-out ${p.delay}s infinite` }} />
          ))}

          {/* Floating glass badges */}
          <Box sx={{ position: 'absolute', top: '18%', left: '10%', display: 'flex', alignItems: 'center', gap: 1, px: 1.6, py: 1, borderRadius: '14px', background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.8)', boxShadow: '0 14px 30px rgba(84,69,179,0.14)', animation: `${badgeFloat} 6s ease-in-out infinite` }}>
            <ShieldOutlinedIcon sx={{ color: '#7161D8', fontSize: '1.1rem' }} />
            <Typography sx={{ fontWeight: 800, color: '#1E1B4B', fontSize: '0.72rem' }}>Secure Access</Typography>
          </Box>
          <Box sx={{ position: 'absolute', bottom: '16%', right: '8%', display: 'flex', alignItems: 'center', gap: 1, px: 1.6, py: 1, borderRadius: '14px', background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.8)', boxShadow: '0 14px 30px rgba(84,69,179,0.14)', animation: `${badgeFloat} 7s ease-in-out 1.5s infinite` }}>
            <MonitorHeartOutlinedIcon sx={{ color: '#F05D92', fontSize: '1.1rem' }} />
            <Typography sx={{ fontWeight: 800, color: '#1E1B4B', fontSize: '0.72rem' }}>Live Equipment Data</Typography>
          </Box>

          {/* Logo medallion — mouse-reactive 3D tilt + float + glow */}
          <Box sx={{ animation: `${floaty} 6s ease-in-out infinite` }}>
            <Box
              component={motion.div}
              style={{ transform: heroTransform }}
              sx={{
                width: 230, height: 230, borderRadius: '40px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'linear-gradient(150deg, rgba(255,255,255,0.96), rgba(243,238,255,0.9))',
                border: '1px solid rgba(255,255,255,0.9)',
                animation: `${glowPulse} 5s ease-in-out infinite`,
              }}
            >
              <Box component="img" src={LOGO} alt="Mr. BioMed Tech" sx={{ width: '78%', height: '78%', objectFit: 'contain', borderRadius: '24px' }} />
            </Box>
          </Box>
        </Box>
      </Box>

      <Typography variant="caption" sx={{ position: 'absolute', bottom: 16, left: 0, right: 0, textAlign: 'center', color: '#A79FC9', fontWeight: 600 }}>
        © 2026 Medrad Systems · All rights reserved
      </Typography>
    </Box>
  )
}

export default Login
