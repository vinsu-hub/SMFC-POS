import React, { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'wouter';

export default function Home() {
  const { isAuthenticated, user, loading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (loading) return;

    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    // Route based on role
    if (user?.role === 'employee') {
      navigate('/pos');
    } else if (user?.role === 'manager') {
      navigate('/pos');
    } else if (user?.role === 'executive') {
      navigate('/command-center');
    } else if (user?.role === 'procurement') {
      navigate('/procurement');
    } else if (user?.role === 'canvasser') {
      navigate('/canvass');
    } else if (user?.role === 'finance_admin') {
      navigate('/finance');
    } else if (user?.role === 'logistics') {
      navigate('/logistics');
    }
  }, [isAuthenticated, user, loading, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-border border-t-primary rounded-full animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground font-corp-body">Loading...</p>
      </div>
    </div>
  );
}
