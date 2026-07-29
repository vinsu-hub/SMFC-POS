import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  // Redirect if already authenticated
  React.useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please enter email and password');
      return;
    }

    setLoading(true);
    try {
      await login(email, password);
      toast.success('Login successful');
      // Navigation happens automatically via useEffect above
    } catch (error) {
      toast.error('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-2 text-center">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[#1B2A4A] to-[#2E8B99] flex items-center justify-center text-white font-bold text-lg">
              SM
            </div>
          </div>
          <CardTitle className="text-2xl font-corp-display">Saint Michael</CardTitle>
          <CardDescription>Food Corp • Multi-Venue POS System</CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-gray-700">
                Email Address
              </label>
              <Input
                id="email"
                type="email"
                placeholder="user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="font-corp-body"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-gray-700">
                Password
              </label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="font-corp-body"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-[#1B2A4A] hover:bg-[#13203A] font-corp-display"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t">
            <p className="text-xs text-gray-600 mb-3 font-corp-body">
              <strong>Demo Accounts:</strong>
            </p>
            <div className="space-y-2 text-xs">
              <div className="border-l-4 border-l-[#1F2E28] p-3 rounded bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors" onClick={() => { setEmail('employee@danielito.com'); setPassword('demo'); }}>
                <p className="font-medium text-gray-900">Employee (Danielito's)</p>
                <code className="text-gray-700 text-xs">employee@danielito.com</code>
              </div>
              <div className="border-l-4 border-l-[#6E8368] p-3 rounded bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors" onClick={() => { setEmail('manager@malaya.com'); setPassword('demo'); }}>
                <p className="font-medium text-gray-900">Manager (Malaya's)</p>
                <code className="text-gray-700 text-xs">manager@malaya.com</code>
              </div>
              <div className="border-l-4 border-l-[#B5651D] p-3 rounded bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors" onClick={() => { setEmail('exec@corp.com'); setPassword('demo'); }}>
                <p className="font-medium text-gray-900">Executive (All Venues)</p>
                <code className="text-gray-700 text-xs">exec@corp.com</code>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
