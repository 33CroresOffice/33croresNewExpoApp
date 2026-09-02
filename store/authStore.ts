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
  canManageNotifications: boolean;
  modules: string[];
  customRoleName: string | null;
  customRoleColor: string | null;
  setSession: (session: Session | null) => void;
  setProfile: (profile: Profile | null) => void;
  setLoading: (loading: boolean) => void;
  loadProfile: (userId: string) => Promise<Profile | null>;
  hasModule: (module: string) => boolean;
  refreshModules: () => Promise<void>;
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
  canManageNotifications: false,
  modules: [],
  customRoleName: null,
  customRoleColor: null,

  setSession: (session) => {
    const modules = (session?.user?.app_metadata?.modules as string[]) ?? [];
    set({ session, isAuthenticated: !!session, modules });
  },

  setProfile: (profile) => {
    const isSuperAdmin = profile?.role === 'admin' && profile?.admin_role === 'super_admin';
    set({
      profile,
      isAdmin: profile?.role === 'admin',
      isSuperAdmin,
      adminRole: profile?.admin_role ?? null,
      canManageNotifications: isSuperAdmin || (profile?.role === 'admin' && profile?.notification_module_access === true),
    });
    // Load custom role name/color if applicable
    if (profile?.role === 'admin' && profile?.custom_role_id) {
      supabase
        .from('custom_roles')
        .select('name, color')
        .eq('id', profile.custom_role_id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) set({ customRoleName: data.name, customRoleColor: data.color });
        });
    }
  },

  setLoading: (isLoading) => set({ isLoading }),

  loadProfile: async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('[loadProfile] query error:', error.message, error.code, error.details);
      return null;
    }

    if (!data) {
      console.warn('[loadProfile] no profile row found for user:', userId);
      return null;
    }

    get().setProfile(data as Profile);
    return data as Profile;
  },

  hasModule: (module: string) => {
    const { isSuperAdmin, modules } = get();
    if (isSuperAdmin) return true;
    return modules.includes(module);
  },

  refreshModules: async () => {
    const { data: { session } } = await supabase.auth.refreshSession();
    if (session) {
      const modules = (session.user?.app_metadata?.modules as string[]) ?? [];
      set({ session, modules });
    }
  },

  signOut: async () => {
    const { session } = get();
    const userId = session?.user?.id;
    if (userId) {
      try {
        await supabase.from('expo_push_tokens').delete().eq('user_id', userId);
      } catch {}
    }
    await supabase.auth.signOut();
    set({
      session: null,
      profile: null,
      isAuthenticated: false,
      isAdmin: false,
      isSuperAdmin: false,
      adminRole: null,
      canManageNotifications: false,
      modules: [],
      customRoleName: null,
      customRoleColor: null,
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
      canManageNotifications: false,
      modules: [],
      customRoleName: null,
      customRoleColor: null,
    });
  },
}));
