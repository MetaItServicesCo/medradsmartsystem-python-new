import { createTheme } from '@mui/material/styles'
import Fade from '@mui/material/Fade'
import { palette } from '@/theme/palette'

const theme = createTheme({
  palette: {
    primary: {
      main: palette.brand,
      light: palette.brandLight,
      dark: palette.brandDeep,
      contrastText: palette.white,
    },
    secondary: {
      main: palette.accent,
      light: palette.accentLight,
      dark: palette.accentDark,
      contrastText: palette.white,
    },
    background: {
      default: palette.pageBg,
      paper: palette.white,
    },
    text: {
      primary: palette.ink,
      secondary: palette.textMuted,
    },
    error: { main: palette.dangerBright },
    warning: { main: palette.warningBright },
    success: { main: palette.brandMid },
    info: { main: palette.indigo },
  },
  typography: {
    fontFamily: '"Manrope", "Inter", "Segoe UI", sans-serif',
    fontWeightRegular: 400,
    fontWeightMedium: 600,
    fontWeightBold: 800,
    h1: { fontWeight: 800, color: palette.ink, letterSpacing: '-0.035em', '@media (max-width:600px)': { fontSize: '2.2rem', lineHeight: 1.08 } },
    h2: { fontWeight: 800, color: palette.ink, letterSpacing: '-0.03em', '@media (max-width:600px)': { fontSize: '1.9rem', lineHeight: 1.12 } },
    h3: { fontWeight: 800, color: palette.ink, letterSpacing: '-0.025em', '@media (max-width:600px)': { fontSize: '1.65rem', lineHeight: 1.15 } },
    h4: { fontWeight: 800, color: palette.ink, letterSpacing: '-0.02em', '@media (max-width:600px)': { fontSize: '1.4rem', lineHeight: 1.2 } },
    h5: { fontWeight: 800, color: palette.ink, letterSpacing: '-0.015em', '@media (max-width:600px)': { fontSize: '1.2rem', lineHeight: 1.25 } },
    h6: { fontWeight: 700, color: palette.ink, letterSpacing: '-0.01em', '@media (max-width:600px)': { fontSize: '1.05rem', lineHeight: 1.3 } },
    subtitle1: { color: palette.textMuted, fontWeight: 600 },
    subtitle2: { color: palette.textMuted, fontWeight: 600 },
    body1: { color: palette.textStrong },
    body2: { color: palette.textMuted },
    button: { textTransform: 'none', fontWeight: 700, letterSpacing: '-0.01em' },
  },
  shape: {
    borderRadius: 18,
  },
  shadows: [
    'none',
    '0 1px 3px rgba(4,120,87,0.06)',
    '0 4px 12px rgba(4,120,87,0.08)',
    '0 8px 24px rgba(4,120,87,0.10)',
    '0 12px 40px rgba(4,120,87,0.12)',
    '0 16px 48px rgba(4,120,87,0.14)',
    ...Array(19).fill('none'),
  ] as any,
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: palette.pageBg,
          color: palette.ink,
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
          textRendering: 'optimizeLegibility',
        },
        '::selection': {
          backgroundColor: 'rgba(4,120,87,0.18)',
          color: palette.ink,
        },
        ':focus-visible': {
          outline: '3px solid rgba(4,120,87,0.32)',
          outlineOffset: 2,
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: 14,
          textTransform: 'none',
          fontWeight: 700,
          padding: '10px 24px',
          fontSize: '0.875rem',
          transition: 'background-color 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease',
          minHeight: 42,
          '@media (max-width:600px)': {
            minHeight: 40,
            padding: '9px 14px',
            fontSize: '0.8125rem',
          },
          '&:hover': {
            boxShadow: '0 14px 28px rgba(4,120,87,0.18)',
            transform: 'translateY(-1px)',
          },
          '&:active': {
            transform: 'translateY(0)',
          },
        },
        contained: {
          background: palette.gradientBrand,
          boxShadow: '0 10px 24px rgba(4,120,87,0.22)',
          '&:hover': {
            background: 'linear-gradient(135deg, #34D399 0%, #E14A83 100%)',
          },
        },
        outlined: {
          borderWidth: '1.5px',
          borderColor: 'rgba(4,120,87,0.4)',
          backgroundColor: '#fff',
          '&:hover': { 
            borderWidth: '1.5px',
            backgroundColor: 'rgba(4,120,87,0.04)' 
          },
        },
        text: {
          '&:hover': {
            backgroundColor: 'rgba(4,120,87,0.07)',
            boxShadow: 'none',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 24,
          boxShadow: '0 18px 45px rgba(6,78,59,0.08)',
          border: `1px solid ${palette.borderSoft}`,
          backgroundImage: 'none',
          minWidth: 0,
          '@media (max-width:600px)': {
            borderRadius: 18,
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 14,
          transition: 'background-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease',
          '&:hover': {
            transform: 'translateY(-1px)',
          },
          '&:active': {
            transform: 'translateY(0)',
          },
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
      },
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 12,
            backgroundColor: '#fff',
            transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: palette.brand,
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: palette.brand,
              borderWidth: '2px',
            },
            '&.Mui-focused': {
              boxShadow: '0 12px 28px rgba(4,120,87,0.12)',
            },
          },
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: palette.textSubtle,
          fontWeight: 600,
          '&.Mui-focused': {
            color: palette.brand,
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
    MuiMenu: {
      styleOverrides: {
        paper: {
          borderRadius: 16,
          border: `1px solid ${palette.border}`,
          boxShadow: '0 20px 50px rgba(15,23,42,0.16)',
          padding: 6,
          maxWidth: 'calc(100vw - 16px)',
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          margin: '3px 6px',
          minHeight: 40,
          fontWeight: 600,
          '&.Mui-selected': {
            backgroundColor: 'rgba(4,120,87,0.10)',
            color: palette.brandDeep,
          },
          '&.Mui-selected:hover': {
            backgroundColor: 'rgba(4,120,87,0.16)',
          },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: {
          minHeight: 58,
          maxWidth: '100%',
          '@media (max-width:600px)': {
            minHeight: 48,
          },
        },
        scroller: {
          WebkitOverflowScrolling: 'touch',
        },
        indicator: {
          height: 3,
          borderRadius: '99px 99px 0 0',
          background: palette.gradientBrand,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          minHeight: 58,
          textTransform: 'none',
          fontWeight: 700,
          color: palette.textSubtle,
          '@media (max-width:600px)': {
            minHeight: 48,
            minWidth: 96,
            padding: '10px 14px',
            fontSize: '0.8125rem',
          },
          '&.Mui-selected': {
            color: palette.brandDeep,
          },
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          '& .MuiTableCell-head': {
            backgroundColor: palette.surface,
            color: palette.textMuted,
            fontWeight: 700,
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            borderBottom: '1px solid #E8ECF4',
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
          borderBottom: `1px solid ${palette.surfaceGray}`,
          padding: '13px 16px',
          '@media (max-width:600px)': {
            padding: '10px 12px',
          },
        },
      },
    },
    MuiTableContainer: {
      styleOverrides: {
        root: {
          width: '100%',
          maxWidth: '100%',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 9,
          fontWeight: 700,
          fontSize: '0.75rem',
        },
      },
    },
    MuiDialog: {
      // Presentation only: opacity stays compositor-friendly even for large,
      // data-heavy dialogs. Any dialog can still override this per-instance.
      defaultProps: {
        TransitionComponent: Fade,
        transitionDuration: { enter: 180, exit: 140 },
      },
      styleOverrides: {
        paper: {
          borderRadius: 24,
          boxShadow: '0 24px 64px rgba(4,120,87,0.18)',
          border: '1px solid rgba(226,232,240,0.9)',
          backgroundImage: 'none',
          maxWidth: 'calc(100vw - 24px)',
          '@media (max-width:600px)': {
            width: 'calc(100vw - 16px)',
            maxWidth: 'calc(100vw - 16px)',
            maxHeight: 'calc(100dvh - 16px)',
            margin: 8,
            borderRadius: 18,
          },
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          color: palette.ink,
          fontWeight: 800,
          padding: '22px 28px 18px',
          '@media (max-width:600px)': {
            padding: '18px 16px 14px',
          },
        },
      },
    },
    MuiDialogContent: {
      styleOverrides: {
        root: {
          padding: '24px 28px',
          '@media (max-width:600px)': {
            padding: '16px',
          },
        },
      },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: {
          padding: '16px 28px 22px',
          gap: 10,
          borderTop: `1px solid ${palette.borderSoft}`,
          flexWrap: 'wrap',
          '@media (max-width:600px)': {
            padding: '12px 16px 16px',
            gap: 8,
          },
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          height: 6,
          backgroundColor: palette.brandBorder,
        },
        bar: {
          borderRadius: 8,
        },
      },
    },
    MuiTooltip: {
      defaultProps: {
        // Prevent tooltips from lingering/"sticking" when their anchor unmounts
        // during a data refetch or navigation: dismiss the moment the pointer
        // leaves the anchor, and drop the fade transition that can strand a
        // half-shown tooltip on screen.
        disableInteractive: true,
        enterDelay: 300,
        enterNextDelay: 300,
        TransitionProps: { timeout: 0 },
      },
      styleOverrides: {
        tooltip: {
          borderRadius: 8,
          backgroundColor: palette.ink,
          fontSize: '0.75rem',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 20,
          backgroundImage: 'none',
          minWidth: 0,
          '@media (max-width:600px)': {
            borderRadius: 16,
          },
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
