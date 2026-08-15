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
import { useAuthStore } from '@/stores/authStore'
import { Stagger, StaggerItem } from '@/components/motion'
import apiClient from '@/api/client'

// --- Self-contained ambient motion (login page only) ---
const drift = keyframes`
  0%,100% { transform: translate3d(0,0,0) scale(1); }
  50%     { transform: translate3d(38px,-44px,0) scale(1.12); }
`
const driftAlt = keyframes`
  0%,100% { transform: translate3d(0,0,0) scale(1); }
  50%     { transform: translate3d(-46px,36px,0) scale(1.16); }
`
const sheen = keyframes`
  0%   { transform: translateX(-130%) skewX(-18deg); }
  60%,100% { transform: translateX(320%) skewX(-18deg); }
`

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
      {/* Subtle ambient blobs behind the card */}
      <Box aria-hidden sx={{ position: 'absolute', top: '-12%', left: '-6%', width: 460, height: 460, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,93,216,0.30), transparent 70%)', animation: `${drift} 20s ease-in-out infinite`, pointerEvents: 'none' }} />
      <Box aria-hidden sx={{ position: 'absolute', bottom: '-14%', right: '-8%', width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle, rgba(240,93,146,0.28), transparent 70%)', animation: `${driftAlt} 24s ease-in-out infinite`, pointerEvents: 'none' }} />

      {/* Centered login — frosted outer panel framing the white form card (double-box) */}
      <Box
        component={motion.div}
        initial={{ opacity: 0, y: 22, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        sx={{
          position: 'relative',
          width: '100%',
          maxWidth: 480,
          p: { xs: 2, sm: 3 },
          borderRadius: '34px',
          background: 'linear-gradient(135deg, rgba(255,255,255,0.66), rgba(255,255,255,0.38))',
          border: '1px solid rgba(255,255,255,0.6)',
          boxShadow: '0 44px 110px rgba(84,69,179,0.22)',
        }}
      >
        {/* Inner white form card */}
        <Box
          sx={{
            p: { xs: 2.75, sm: 4 },
            borderRadius: '26px',
            background: 'rgba(255,255,255,0.96)',
            border: '1px solid rgba(255,255,255,0.9)',
            boxShadow: '0 22px 55px rgba(84,69,179,0.12)',
          }}
        >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, mb: 3 }}>
          <Box sx={{ width: 40, height: 40, borderRadius: '13px', background: 'linear-gradient(135deg, #7161D8, #F05D92)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#fff', fontSize: '1.1rem', boxShadow: '0 8px 20px rgba(113,97,216,0.35)' }}>M</Box>
          <Typography sx={{ fontWeight: 800, color: '#7161D8', letterSpacing: '0.14em', fontSize: '0.72rem', textTransform: 'uppercase' }}>MEDRAD</Typography>
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
      </Box>

      <Typography variant="caption" sx={{ position: 'absolute', bottom: 16, left: 0, right: 0, textAlign: 'center', color: '#A79FC9', fontWeight: 600 }}>
        © 2026 Medrad Systems · All rights reserved
      </Typography>
    </Box>
  )
}

export default Login
