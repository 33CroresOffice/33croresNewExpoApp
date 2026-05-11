import { create } from 'zustand';
import { Session } from '@supabase/supabase-js';
import { router } from 'expo-router';
import { Profile, AdminRole } from '@/types/database';
import { supabase } from '@/lib/supabase';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  adminRole: AdminRole | null;
  setSession: (session: Session | null) => void;
  setProfile: (profile: Profile | null) => void;
  setLoading: (loading: boolean) => void;
  loadProfile: (userId: string) => Promise<Profile | null>;
  signOut: () => Promise<void>;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  profile: null,
  isLoading: true,
  isAuthenticated: false,
  isAdmin: false,
  isSuperAdmin: false,
  adminRole: null,

  setSession: (session) => {
    set({
      session,
      isAuthenticated: !!session,
    });
  },

  setProfile: (profile) => {
    set({
      profile,
      isAdmin: profile?.role === 'admin',
      isSuperAdmin: profile?.role === 'admin' && profile?.admin_role === 'super_admin',
      adminRole: profile?.admin_role ?? null,
    });
  },

  setLoading: (isLoading) => set({ isLoading }),

  loadProfile: async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error || !data) return null;

    get().setProfile(data as Profile);
    return data as Profile;
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({
      session: null,
      profile: null,
      isAuthenticated: false,
      isAdmin: false,
      isSuperAdmin: false,
      adminRole: null,
    });
    router.replace('/auth/welcome');
  },

  reset: () => {
    set({
      session: null,
      profile: null,
      isLoading: false,
      isAuthenticated: false,
      isAdmin: false,
      isSuperAdmin: false,
      adminRole: null,
    });
  },
}));
