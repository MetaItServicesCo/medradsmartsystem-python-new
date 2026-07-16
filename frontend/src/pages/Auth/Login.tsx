import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box, TextField, Button, Typography, InputAdornment,
  IconButton, Alert, CircularProgress
} from '@mui/material'
import PersonOutlineIcon from '@mui/icons-material/PersonOutline'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import { useAuthStore } from '@/stores/authStore'
import apiClient from '@/api/client'

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
    <Box
      sx={{
        display: 'flex',
        minHeight: '100vh',
        backgroundColor: '#F5F3FF',
      }}
    >
      {/* Left panel — Premium Gradient */}
      <Box
        sx={{
          width: { xs: 0, md: '45%' },
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          justifyContent: 'center',
          px: 8,
          background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 50%, #F472B6 100%)',
          position: 'relative',
          overflow: 'hidden',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: '-20%',
            right: '-20%',
            width: '60%',
            height: '60%',
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.1)',
            filter: 'blur(100px)',
          }
        }}
      >
        {/* Logo */}
        <Box
          sx={{
            width: 64,
            height: 64,
            borderRadius: '20px',
            backgroundColor: 'rgba(255,255,255,0.12)',
            border: '1px solid rgba(255,255,255,0.25)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mb: 5,
            fontSize: '1.8rem',
            fontWeight: 900,
            color: '#fff',
            boxShadow: '0 12px 32px rgba(0,0,0,0.15)',
            letterSpacing: '-1px',
          }}
        >
          M
        </Box>

        <Typography
          variant="h2"
          sx={{ fontWeight: 900, color: '#fff', mb: 2, lineHeight: 1.1, letterSpacing: '-1.5px' }}
        >
          Medrad<br />Admin Panel
        </Typography>

        <Typography
          sx={{
            color: 'rgba(255,255,255,0.85)',
            fontSize: '1.1rem',
            lineHeight: 1.7,
            maxWidth: 360,
            mb: 6,
            fontWeight: 500,
          }}
        >
          Comprehensive healthcare equipment management for hospitals and medical facilities.
        </Typography>

        {/* Features list */}
        {[
          'Multi-Facility Management',
          'Real-time Equipment Tracking',
          'Compliance & Inspections',
          'Smart Attendance System',
        ].map((feat) => (
          <Box key={feat} sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <Box
              sx={{
                width: 24,
                height: 24,
                borderRadius: '8px',
                backgroundColor: 'rgba(255,255,255,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Box sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#fff' }} />
            </Box>
            <Typography sx={{ color: '#fff', fontSize: '1rem', fontWeight: 600 }}>
              {feat}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* Right panel — login form */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: 4,
        }}
      >
        <Box sx={{ width: '100%', maxWidth: 380 }}>
          {/* Mobile logo */}
          <Box
            sx={{
              display: { xs: 'flex', md: 'none' },
              alignItems: 'center',
              gap: 1.5,
              mb: 4,
            }}
          >
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: '12px',
                backgroundColor: '#7C3AED',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '1.1rem',
                color: '#fff',
              }}
            >
              M
            </Box>
            <Typography sx={{ fontWeight: 700, color: '#1E1B4B', fontSize: '1.1rem' }}>
              Medrad Admin
            </Typography>
          </Box>

          <Typography variant="h5" sx={{ fontWeight: 700, color: '#1E1B4B', mb: 0.5 }}>
            {isSignUp ? 'Create Account' : 'Sign in'}
          </Typography>
          <Typography variant="body2" sx={{ color: '#9CA3AF', mb: 3.5 }}>
            {isSignUp ? 'Fill in your details to get started' : 'Enter your credentials to continue'}
          </Typography>

          {error && (
            <Alert
              severity="error"
              sx={{ mb: 2.5, borderRadius: '12px', fontSize: '0.85rem' }}
            >
              {error}
            </Alert>
          )}

          {success && (
            <Alert
              severity="success"
              sx={{ mb: 2.5, borderRadius: '12px', fontSize: '0.85rem' }}
            >
              {success}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
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

            {isSignUp && (
              <>
                <TextField
                  fullWidth
                  label="Full Name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  margin="normal"
                  required
                />
                <TextField
                  fullWidth
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  margin="normal"
                  required
                />
              </>
            )}

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
                    <IconButton
                      size="small"
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                    >
                      {showPassword
                        ? <VisibilityOffOutlinedIcon sx={{ fontSize: '1.1rem', color: '#9CA3AF' }} />
                        : <VisibilityOutlinedIcon sx={{ fontSize: '1.1rem', color: '#9CA3AF' }} />
                      }
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            <Button
              fullWidth
              type="submit"
              variant="contained"
              disabled={loading}
              sx={{
                mt: 3.5,
                py: 1.8,
                fontSize: '1rem',
                fontWeight: 800,
                background: 'linear-gradient(135deg, #7C3AED 0%, #F472B6 100%)',
                boxShadow: '0 8px 24px rgba(124,58,237,0.25)',
                borderRadius: '14px',
                textTransform: 'none',
                '&:hover': {
                  background: 'linear-gradient(135deg, #6D28D9 0%, #EC4899 100%)',
                  boxShadow: '0 12px 32px rgba(124,58,237,0.35)',
                  transform: 'translateY(-2px)',
                },
                '&:disabled': {
                  background: 'linear-gradient(135deg, #C4B5FD 0%, #FBCFE8 100%)',
                },
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              {loading
                ? <CircularProgress size={24} sx={{ color: '#fff' }} />
                : isSignUp ? 'Create Account' : 'Sign In'
              }
            </Button>
          </form>

          <Box sx={{ mt: 3, textAlign: 'center' }}>
            <Typography variant="body2" sx={{ color: '#6B7280' }}>
              {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
              <Button 
                variant="text" 
                onClick={() => {
                  setIsSignUp(!isSignUp)
                  setError('')
                  setSuccess('')
                }}
                sx={{ 
                  color: '#7C3AED', 
                  fontWeight: 600, 
                  textTransform: 'none', 
                  p: 0, 
                  minWidth: 'auto',
                  '&:hover': { background: 'transparent', textDecoration: 'underline' }
                }}
              >
                {isSignUp ? 'Sign in' : 'Create one'}
              </Button>
            </Typography>
          </Box>

          <Typography
            variant="caption"
            sx={{ display: 'block', textAlign: 'center', mt: 4, color: '#D1D5DB' }}
          >
            © 2025 Medrad Systems · All rights reserved
          </Typography>
        </Box>
      </Box>
    </Box>
  )
}

export default Login
