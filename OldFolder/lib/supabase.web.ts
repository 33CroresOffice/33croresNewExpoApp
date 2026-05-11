import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

const webStorage = {
  getItem: (key: string) => Promise.resolve(
    typeof window !== 'undefined' ? window.localStorage.getItem(key) : null
  ),
  setItem: (key: string, value: string) => Promise.resolve(
    typeof window !== 'undefined' ? window.localStorage.setItem(key, value) : undefined
  ),
  removeItem: (key: string) => Promise.resolve(
    typeof window !== 'undefined' ? window.localStorage.removeItem(key) : undefined
  ),
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: webStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export const SUPABASE_URL = supabaseUrl;
export const SUPABASE_ANON_KEY = supabaseAnonKey;
