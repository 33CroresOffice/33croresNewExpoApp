export type AppRole = 'user' | 'rider';

// Set EXPO_PUBLIC_APP_ROLE=rider when building the rider app; defaults to the customer app.
export const APP_ROLE: AppRole =
  process.env.EXPO_PUBLIC_APP_ROLE === 'rider' ? 'rider' : 'user';

export const DEFAULT_AUTH_ROUTE = APP_ROLE === 'rider' ? '/rider/login' : '/auth/mobile';
