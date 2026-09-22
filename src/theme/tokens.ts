/** Tokens visuais do app. Uma fonte só, para as telas não inventarem valores. */
export const colors = {
  background: '#FFFFFF',
  surface: '#F4F6F8',
  border: '#D8DEE4',
  borderFocused: '#1F5FA8',
  text: '#131A20',
  textMuted: '#5A6873',
  primary: '#1F5FA8',
  primaryPressed: '#17497F',
  primaryDisabled: '#A9C0DC',
  onPrimary: '#FFFFFF',
  danger: '#B3261E',
  dangerPressed: '#8C1D18',
  dangerSurface: '#FCE9E7',
  success: '#136A3A',
  successSurface: '#E6F4EB',
  warning: '#8A5A00',
  warningSurface: '#FDF3E2',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
} as const;

export const typography = {
  title: { fontSize: 26, fontWeight: '700' as const, color: colors.text },
  subtitle: { fontSize: 15, lineHeight: 21, color: colors.textMuted },
  label: { fontSize: 14, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  helper: { fontSize: 13, color: colors.textMuted },
} as const;
