import { createTheme } from '@mui/material/styles'

const theme = createTheme({
  palette: {
    primary: {
      main: '#7C3AED',
      light: '#A78BFA',
      dark: '#5B21B6',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#F472B6',
      light: '#FBCFE8',
      dark: '#DB2777',
      contrastText: '#ffffff',
    },
    background: {
      default: '#F8F7FF',
      paper: '#ffffff',
    },
    text: {
      primary: '#1E1B4B',
      secondary: '#6B7280',
    },
    error: { main: '#EF4444' },
    warning: { main: '#F59E0B' },
    success: { main: '#10B981' },
    info: { main: '#4F46E5' },
  },
  typography: {
    fontFamily: '"Inter", "Segoe UI", sans-serif',
    h1: { fontWeight: 700, color: '#1E1B4B' },
    h2: { fontWeight: 700, color: '#1E1B4B' },
    h3: { fontWeight: 600, color: '#1E1B4B' },
    h4: { fontWeight: 600, color: '#1E1B4B' },
    h5: { fontWeight: 600, color: '#1E1B4B' },
    h6: { fontWeight: 600, color: '#1E1B4B' },
    subtitle1: { color: '#6B7280' },
    subtitle2: { color: '#6B7280' },
    body1: { color: '#374151' },
    body2: { color: '#6B7280' },
  },
  shape: {
    borderRadius: 16,
  },
  shadows: [
    'none',
    '0 1px 3px rgba(124,58,237,0.06)',
    '0 4px 12px rgba(124,58,237,0.08)',
    '0 8px 24px rgba(124,58,237,0.10)',
    '0 12px 40px rgba(124,58,237,0.12)',
    '0 16px 48px rgba(124,58,237,0.14)',
    ...Array(19).fill('none'),
  ] as any,
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          textTransform: 'none',
          fontWeight: 700,
          padding: '10px 24px',
          fontSize: '0.875rem',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: '0 12px 24px rgba(124,58,237,0.2)',
          },
        },
        contained: {
          background: 'linear-gradient(135deg, #7C3AED 0%, #F472B6 100%)',
          boxShadow: '0 4px 14px rgba(124,58,237,0.25)',
          '&:hover': {
            background: 'linear-gradient(135deg, #6D28D9 0%, #EC4899 100%)',
          },
        },
        outlined: {
          borderWidth: '1.5px',
          borderColor: 'rgba(124,58,237,0.4)',
          '&:hover': { 
            borderWidth: '1.5px',
            backgroundColor: 'rgba(124,58,237,0.04)' 
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 24,
          boxShadow: '0 10px 40px -10px rgba(124,58,237,0.08)',
          border: '1px solid rgba(124,58,237,0.05)',
          transition: 'all 0.3s ease',
          '&:hover': {
            boxShadow: '0 20px 60px -15px rgba(124,58,237,0.14)',
            transform: 'translateY(-2px)',
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 12,
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: '#8B5CF6',
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: '#7C3AED',
              borderWidth: '2px',
            },
          },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        outlined: {
          borderRadius: 12,
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          '& .MuiTableCell-head': {
            backgroundColor: '#F5F3FF',
            color: '#6B7280',
            fontWeight: 600,
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            borderBottom: '1px solid #E9D5FF',
          },
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:hover': {
            backgroundColor: '#FAFAFF',
          },
          '&:last-child td': {
            borderBottom: 0,
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: '1px solid #F3F4F6',
          padding: '14px 16px',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 600,
          fontSize: '0.75rem',
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 24,
          boxShadow: '0 24px 64px rgba(124,58,237,0.18)',
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          height: 6,
          backgroundColor: '#E9D5FF',
        },
        bar: {
          borderRadius: 8,
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          borderRadius: 8,
          backgroundColor: '#1E1B4B',
          fontSize: '0.75rem',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 20,
        },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        root: {
          fontSize: '0.875rem',
        },
      },
    },
  },
})

export default theme
