export const Colors = {
  primary: '#2D5A27',
  primaryLight: '#4A8C42',
  primaryDark: '#1A3A16',
  primarySurface: '#EBF5E8',

  secondary: '#C8526A',
  secondaryLight: '#E07A8F',
  secondaryDark: '#9E3A50',
  secondarySurface: '#FCEEF1',

  accent: '#D4A853',
  accentLight: '#E8C47A',
  accentDark: '#A67C2E',
  accentSurface: '#FDF5E6',

  success: '#2E7D32',
  successLight: '#66BB6A',
  successSurface: '#E8F5E9',

  warning: '#E65100',
  warningLight: '#FF8A50',
  warningSurface: '#FFF3E0',

  error: '#C62828',
  errorLight: '#EF5350',
  errorSurface: '#FFEBEE',

  neutral: {
    50: '#FAFAF9',
    100: '#F5F4F2',
    200: '#EBE9E5',
    300: '#D4D1CA',
    400: '#B0ADA5',
    500: '#8C8880',
    600: '#6B6762',
    700: '#4A4744',
    800: '#2E2C2A',
    900: '#1A1917',
  },

  white: '#FFFFFF',
  black: '#0A0A0A',

  tabBar: '#FFFFFF',
  tabBarBorder: '#EBE9E5',
  tabBarActive: '#2D5A27',
  tabBarInactive: '#B0ADA5',

  background: '#FAFAF9',
  surface: '#FFFFFF',
  border: '#EBE9E5',
  divider: '#F0EDE8',

  textPrimary: '#1A1917',
  textSecondary: '#4A4744',
  textTertiary: '#8C8880',
  textDisabled: '#B0ADA5',
  textInverse: '#FFFFFF',
};

export const Typography = {
  fontFamily: {
    regular: 'DMSerifDisplay-Regular',
    medium: 'DMSerifDisplay-Regular',
    semiBold: 'DMSerifDisplay-Regular',
    bold: 'DMSerifDisplay-Regular',
    sansRegular: 'DMSans-Regular',
    sansMedium: 'DMSans-Medium',
    sansSemiBold: 'DMSans-SemiBold',
  },
  size: {
    xs: 11,
    sm: 13,
    base: 15,
    md: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 28,
    '4xl': 32,
    '5xl': 38,
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.7,
  },
};

export const Spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
};

export const Radius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const Shadow = {
  sm: {
    shadowColor: '#1A1917',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#1A1917',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#1A1917',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 8,
  },
};
