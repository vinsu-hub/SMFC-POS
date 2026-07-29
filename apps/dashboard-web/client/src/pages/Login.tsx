import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, ChevronDown, ChevronUp } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [expandedBranch, setExpandedBranch] = useState<string | null>('danielito');
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

  const demoAccounts = [
    {
      branch: 'danielito',
      branchName: "Danielito's Home Kitchen",
      color: '#1F2E28',
      accounts: [
        { name: 'Employee - Marco', email: 'marco@danielito.com', role: 'employee' },
        { name: 'Employee - Rosa', email: 'rosa@danielito.com', role: 'employee' },
        { name: 'Manager - Chef Luis', email: 'luis@danielito.com', role: 'manager' },
      ],
    },
    {
      branch: 'malaya',
      branchName: "Malaya's Cafe",
      color: '#6E8368',
      accounts: [
        { name: 'Employee - Ana', email: 'ana@malaya.com', role: 'employee' },
        { name: 'Employee - Javier', email: 'javier@malaya.com', role: 'employee' },
        { name: 'Manager - Sofia', email: 'sofia@malaya.com', role: 'manager' },
      ],
    },
    {
      branch: 'dbar',
      branchName: "D' Bar",
      color: '#B5651D',
      accounts: [
        { name: 'Employee - Diego', email: 'diego@dbar.com', role: 'employee' },
        { name: 'Employee - Carmen', email: 'carmen@dbar.com', role: 'employee' },
        { name: 'Manager - Victor', email: 'victor@dbar.com', role: 'manager' },
      ],
    },
  ];

  const executiveAccounts = [
    { name: 'Executive - Corporate', email: 'exec@corp.com', role: 'executive' },
    { name: 'Executive - Operations', email: 'ops@corp.com', role: 'executive' },
  ];

  const handleSelectAccount = (accountEmail: string) => {
    setEmail(accountEmail);
    setPassword('demo1234');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-2xl shadow-lg">
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
          <form onSubmit={handleSubmit} className="space-y-4 mb-6">
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

          <div className="border-t pt-6">
            <p className="text-sm font-corp-display font-semibold text-gray-900 mb-4">
              Demo Accounts (Password: demo1234)
            </p>

            {/* Branch Demo Accounts */}
            <div className="space-y-3 mb-4">
              {demoAccounts.map((branch) => (
                <div key={branch.branch} className="border rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedBranch(expandedBranch === branch.branch ? null : branch.branch)
                    }
                    className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                    style={{ borderLeft: `4px solid ${branch.color}` }}
                  >
                    <div className="text-left">
                      <p className="font-corp-display font-semibold text-gray-900 text-sm">
                        {branch.branchName}
                      </p>
                      <p className="text-xs text-gray-600 font-corp-body">
                        {branch.accounts.length} accounts
                      </p>
                    </div>
                    {expandedBranch === branch.branch ? (
                      <ChevronUp className="w-4 h-4 text-gray-600" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-600" />
                    )}
                  </button>

                  {expandedBranch === branch.branch && (
                    <div className="bg-white border-t space-y-2 p-3">
                      {branch.accounts.map((account) => (
                        <button
                          key={account.email}
                          type="button"
                          onClick={() => handleSelectAccount(account.email)}
                          className="w-full text-left p-2 rounded hover:bg-gray-100 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-corp-body font-medium text-gray-900">
                                {account.name}
                              </p>
                              <code className="text-xs text-gray-600">{account.email}</code>
                            </div>
                            <span className="text-xs font-corp-body px-2 py-1 bg-gray-100 rounded text-gray-700 capitalize">
                              {account.role}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Executive Accounts */}
            <div className="border rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() =>
                  setExpandedBranch(expandedBranch === 'executive' ? null : 'executive')
                }
                className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                style={{ borderLeft: '4px solid #2E8B99' }}
              >
                <div className="text-left">
                  <p className="font-corp-display font-semibold text-gray-900 text-sm">
                    Executive (All Venues)
                  </p>
                  <p className="text-xs text-gray-600 font-corp-body">
                    {executiveAccounts.length} accounts
                  </p>
                </div>
                {expandedBranch === 'executive' ? (
                  <ChevronUp className="w-4 h-4 text-gray-600" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-600" />
                )}
              </button>

              {expandedBranch === 'executive' && (
                <div className="bg-white border-t space-y-2 p-3">
                  {executiveAccounts.map((account) => (
                    <button
                      key={account.email}
                      type="button"
                      onClick={() => handleSelectAccount(account.email)}
                      className="w-full text-left p-2 rounded hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-corp-body font-medium text-gray-900">
                            {account.name}
                          </p>
                          <code className="text-xs text-gray-600">{account.email}</code>
                        </div>
                        <span className="text-xs font-corp-body px-2 py-1 bg-[#2E8B99]/10 rounded text-[#1B2A4A] capitalize">
                          {account.role}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <p className="text-xs text-gray-500 font-corp-body mt-4 text-center">
              Click any account to auto-fill the login form
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
