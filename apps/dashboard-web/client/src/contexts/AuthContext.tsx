import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Branch, Role } from '@/lib/types';
import { supabase } from '@/lib/supabaseClient';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function loadUser(authUserId: string, email: string): Promise<User> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role, full_name, branch_id, branches(theme_key)')
    .eq('id', authUserId)
    .single();

  if (error || !profile) {
    throw new Error('No profile found for this account. Contact an administrator.');
  }

  const branchRow = profile.branches as unknown as { theme_key: Branch } | null;

  return {
    id: authUserId,
    branchId: profile.branch_id,
    name: profile.full_name ?? email.split('@')[0],
    email,
    branch: (branchRow?.theme_key ?? null) as Branch | null,
    role: profile.role as Role,
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user?.email) {
        try {
          setUser(await loadUser(session.user.id, session.user.email));
        } catch (e) {
          console.error('Failed to load profile:', e);
        }
      }
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setUser(null);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.user) {
        throw error ?? new Error('Login failed');
      }
      setUser(await loadUser(data.user.id, data.user.email ?? email));
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    supabase.auth.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        login,
        logout,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
