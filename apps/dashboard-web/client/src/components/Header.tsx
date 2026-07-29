import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSync } from '@/contexts/SyncContext';
import { BRANCH_CONFIG } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { LogOut, Settings } from 'lucide-react';

interface HeaderProps {
  title?: string;
  showLogo?: boolean;
}

export function Header({ title, showLogo = true }: HeaderProps) {
  const { user, logout } = useAuth();
  const { syncStatus } = useSync();

  if (!user) return null;

  const branchConfig = user.branch
    ? BRANCH_CONFIG[user.branch]
    : { name: 'Corporate HQ', color: '#1B2A4A' };

  const getSyncDotColor = () => {
    switch (syncStatus.status) {
      case 'synced':
        return 'bg-green-500';
      case 'syncing':
        return 'bg-yellow-500 animate-pulse';
      case 'offline-queued':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 md:px-6">
        <div className="flex items-center gap-3">
          {showLogo && (
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
              style={{ backgroundColor: branchConfig.color }}
            >
              {user.branch === 'danielito' && 'D'}
              {user.branch === 'malaya' && 'M'}
              {user.branch === 'dbar' && 'B'}
              {!user.branch && 'HQ'}
            </div>
          )}
          <div>
            <h1 className="text-lg font-corp-display font-semibold text-gray-900">
              {title || branchConfig.name}
            </h1>
            <p className="text-xs text-gray-500 capitalize">
              {user.role} • {user.branch ?? 'All Venues'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Sync Status Indicator */}
          <div className="flex items-center gap-2">
            <div className={`sync-dot ${getSyncDotColor()}`} />
            <span className="text-xs text-gray-600 hidden sm:inline">
              {syncStatus.status === 'synced' && 'Synced'}
              {syncStatus.status === 'syncing' && 'Syncing...'}
              {syncStatus.status === 'offline-queued' && 'Offline'}
            </span>
          </div>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <img
                  src={user.avatar}
                  alt={user.name}
                  className="w-6 h-6 rounded-full"
                />
                <span className="hidden sm:inline text-sm font-medium">{user.name}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem disabled>
                <span className="text-xs text-gray-500">{user.email}</span>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={logout} className="text-red-600">
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
