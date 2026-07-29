import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Branch, Role } from '@/lib/types';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Simulate checking stored session on mount
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        console.error('Failed to parse stored user:', e);
      }
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      // Simulate API call - in production, this would validate credentials
      // For demo purposes, we'll auto-detect role and branch based on email patterns
      
      let branch: Branch = 'danielito';
      let role: Role = 'employee';

      if (email.includes('exec')) {
        role = 'executive';
      } else if (email.includes('manager')) {
        role = 'manager';
      }

      if (email.includes('malaya')) {
        branch = 'malaya';
      } else if (email.includes('dbar')) {
        branch = 'dbar';
      }

      const newUser: User = {
        id: Math.random().toString(36).substr(2, 9),
        name: email.split('@')[0],
        email,
        branch,
        role,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`,
      };

      setUser(newUser);
      localStorage.setItem('user', JSON.stringify(newUser));
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('user');
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
