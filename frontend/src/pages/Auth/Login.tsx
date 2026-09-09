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
import './login.css'

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
    <Box component="main" className="medrad-auth">
      <Box component="section" className="auth-card" aria-labelledby="auth-title">
        <Box className="auth-brand">
          <Box component="span" className="auth-mark" aria-hidden="true">M</Box>
          <Box component="span">MEDRAD<small>SMART SYSTEM</small></Box>
        </Box>

        <Typography component="h1" id="auth-title" className="auth-title">
          {isSignUp ? 'Create account' : 'Login'}
        </Typography>
        <Typography className="auth-description">
          {isSignUp ? 'Fill in your details to get started' : 'Sign in to continue to your workspace'}
        </Typography>

        {error && <Alert severity="error" className="auth-alert">{error}</Alert>}
        {success && <Alert severity="success" className="auth-alert">{success}</Alert>}

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

      <Typography component="footer" className="auth-footer">
        © {new Date().getFullYear()} MedRad Systems · All rights reserved
      </Typography>
    </Box>
  )
}

export default Login
