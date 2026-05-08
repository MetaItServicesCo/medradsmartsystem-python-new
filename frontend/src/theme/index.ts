import { createTheme } from '@mui/material/styles'

const theme = createTheme({
  palette: {
    primary: {
      main: '#7161D8',
      light: '#9B8EF0',
      dark: '#5445B3',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#F05D92',
      light: '#F9A8C7',
      dark: '#D93672',
      contrastText: '#ffffff',
    },
    background: {
      default: '#E9EEFA',
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
    h1: { fontWeight: 900, color: '#1E1B4B' },
    h2: { fontWeight: 900, color: '#1E1B4B' },
    h3: { fontWeight: 900, color: '#1E1B4B' },
    h4: { fontWeight: 900, color: '#1E1B4B' },
    h5: { fontWeight: 900, color: '#1E1B4B' },
    h6: { fontWeight: 800, color: '#1E1B4B' },
    subtitle1: { color: '#6B7280' },
    subtitle2: { color: '#6B7280' },
    body1: { color: '#374151' },
    body2: { color: '#6B7280' },
  },
  shape: {
    borderRadius: 18,
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
          borderRadius: 14,
          textTransform: 'none',
          fontWeight: 700,
          padding: '10px 24px',
          fontSize: '0.875rem',
          transition: 'all 0.2s ease',
          '&:hover': {
            boxShadow: '0 14px 28px rgba(113,97,216,0.18)',
          },
        },
        contained: {
          background: 'linear-gradient(135deg, #7161D8 0%, #F05D92 100%)',
          boxShadow: '0 10px 24px rgba(113,97,216,0.22)',
          '&:hover': {
            background: 'linear-gradient(135deg, #6151C7 0%, #E14A83 100%)',
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
          boxShadow: '0 18px 45px rgba(49,46,129,0.08)',
          border: '1px solid #EEF0F6',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 12,
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: '#7161D8',
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: '#7161D8',
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
            backgroundColor: '#F8FAFC',
            color: '#6B7280',
            fontWeight: 800,
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            borderBottom: '1px solid #E8ECF4',
          },
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:hover': {
            backgroundColor: '#F8FAFC',
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
