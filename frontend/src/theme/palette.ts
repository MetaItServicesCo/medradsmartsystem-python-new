/**
 * The colour vocabulary. One file.
 *
 * Every colour the interface uses lives here. Components reference these
 * tokens rather than hex literals, so re-theming the product is a change to
 * this file instead of a change to sixty-six.
 *
 * ── How to use it ───────────────────────────────────────────────────────────
 *
 *   import { palette } from '@/theme/palette'
 *   sx={{ color: palette.ink, borderColor: palette.brandBorder }}
 *
 * A raw `#hex` in a component is now the exception, not the norm. If you find
 * yourself reaching for one, either it belongs here, or it is genuinely
 * one-off content (a chart series, an illustration) rather than theme.
 *
 * ── The three groups, and why they are separate ─────────────────────────────
 *
 * BRAND changes when the product is re-themed. Nothing else does.
 *
 * STATUS is semantic and must not follow the brand. Red means failed whatever
 * colour the buttons are, and if the brand ever moved to red, these would have
 * to move away from it rather than toward it.
 *
 * NEUTRAL is the grey scaffolding — text, borders, surfaces. Theme-independent.
 *
 * ── Contrast ────────────────────────────────────────────────────────────────
 *
 * The brand ramp is chosen for measured contrast, not for scale position.
 * Emerald is perceptibly brighter than the violet it replaced, so `brand` sits
 * at the 700 step rather than 600: emerald-600 measures 3.77:1 on white, which
 * fails WCAG AA for normal text. Ratios against white are noted per token.
 * Check any replacement before shipping it.
 */

export const palette = {
  // ── Brand ─────────────────────────────────────────────────────────────────
  // Re-theming the product means editing this block and nothing else.
  brand: '#047857',          // emerald-700  · 5.48:1 on white · buttons, links, active nav
  brandStrong: '#059669',    // emerald-600  · 3.77:1 · large text and UI edges only
  brandMid: '#10B981',       // emerald-500  · accents, pins
  brandLight: '#34D399',     // emerald-400
  brandPale: '#6EE7B7',      // emerald-300
  brandBorder: '#A7F3D0',    // emerald-200  · card and panel borders
  brandSoft: '#D1FAE5',      // emerald-100  · hover fills
  brandTint: '#ECFDF5',      // emerald-50   · chip and surface fills
  brandDeep: '#065F46',      // emerald-800  · 7.68:1 · chip text on brandTint
  brandDeepest: '#022C22',   // emerald-950

  accent: '#0D9488',         // teal-600     · 3.74:1 · gradient partner
  accentDark: '#0F766E',     // teal-700
  accentLight: '#5EEAD4',    // teal-300

  ink: '#064E3B',            // emerald-900  · 9.72:1 · headings and body text
  pageBg: '#E8F5F0',         // app ground
  pageAlt: '#F5FAF8',        // route fallback ground

  // ── Status ────────────────────────────────────────────────────────────────
  // Semantic. Deliberately not derived from the brand: an app whose brand is
  // green still needs a green that means "passed" and is not the brand.
  success: '#15803D',        // green-700 · 4.79:1 on successTint
  successStrong: '#16A34A',
  successBright: '#22C55E',
  successTint: '#F0FDF4',

  danger: '#B91C1C',
  dangerStrong: '#DC2626',
  dangerBright: '#EF4444',
  dangerTint: '#FEE2E2',
  dangerWash: '#FEF2F2',

  warning: '#B45309',
  warningStrong: '#D97706',
  warningBright: '#F59E0B',
  warningDeep: '#92400E',
  warningTint: '#FEF3C7',
  warningWash: '#FFFBEB',
  warningPeach: '#FFEDD5',

  info: '#1D4ED8',
  infoStrong: '#2563EB',
  infoBright: '#3B82F6',
  infoDeep: '#1E3A8A',
  infoTint: '#EFF6FF',
  infoSoft: '#DBEAFE',

  // Extra hues used to keep categorical lists distinguishable. Violet is here
  // precisely because the brand left it: it is now free to mean "reserved"
  // without being confused for a primary action.
  violet: '#6D28D9',
  violetMid: '#8B5CF6',
  violetTint: '#F5F3FF',
  indigo: '#4F46E5',
  indigoTint: '#EEF2FF',
  cyan: '#0E7490',
  cyanTint: '#ECFEFF',
  lime: '#4D7C0F',
  limeTint: '#F7FEE7',

  // ── Neutral ───────────────────────────────────────────────────────────────
  white: '#FFFFFF',
  textMuted: '#6B7280',      // body secondary
  textSubtle: '#64748B',     // table headers, labels
  textFaint: '#94A3B8',      // timestamps, placeholders
  textDisabled: '#9CA3AF',
  textStrong: '#374151',
  slate600: '#475569',
  slate800: '#656578',
  border: '#E5E7EB',
  borderSoft: '#EEF0F6',     // card dividers
  borderSlate: '#E2E8F0',
  surface: '#F8FAFC',
  surfaceMuted: '#F1F5F9',
  surfaceGray: '#F3F4F6',
  surfaceFaint: '#F9FAFB',

  // ── Composites ────────────────────────────────────────────────────────────
  // Named rather than reassembled at each call site, so the signature gradient
  // cannot drift by a stop or a degree between one button and the next.
  gradientBrand: 'linear-gradient(135deg, #047857 0%, #0D9488 100%)',
  gradientSidebar: 'linear-gradient(180deg, #047857 0%, #065F46 100%)',
  shadowCard: '0 18px 45px rgba(4,120,87,0.08)',
  shadowMenu: '0 18px 45px rgba(6,78,59,0.16)',
  focusRing: 'rgba(4,120,87,0.32)',
} as const

export type PaletteToken = keyof typeof palette

/**
 * Mirror the brand tokens onto CSS custom properties.
 *
 * `global.css` cannot import TypeScript, so without this the stylesheet would
 * carry its own copy of the brand and the two would drift the first time
 * somebody edited one of them. Called once from `main.tsx`; the stylesheet
 * keeps only the tokens that are not brand-derived.
 */
export function applyPaletteToDocument(): void {
  if (typeof document === 'undefined') return

  const root = document.documentElement.style
  const cssVars: Record<string, string> = {
    '--primary': palette.brand,
    '--primary-light': palette.brandLight,
    '--primary-dark': palette.brandDeep,
    '--accent': palette.accent,
    '--accent-light': palette.accentLight,
    '--bg-base': palette.pageBg,
    '--text-primary': palette.ink,
    '--text-secondary': palette.textMuted,
    '--bg-sidebar': palette.gradientSidebar,
    '--shadow-premium': palette.shadowCard,
    '--focus-ring': palette.focusRing,
  }

  for (const [name, value] of Object.entries(cssVars)) {
    root.setProperty(name, value)
  }
}
