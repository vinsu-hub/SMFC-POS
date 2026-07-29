import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'wouter';
import { BRANCH_CONFIG } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  BarChart3,
  ShoppingCart,
  Package,
  AlertCircle,
  Users,
  TrendingUp,
  MessageSquare,
  Settings,
  Menu,
  X,
  Bell,
} from 'lucide-react';
import { useState } from 'react';

export function Sidebar() {
  const { user } = useAuth();
  const [location, navigate] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!user) return null;

  const branchConfig = BRANCH_CONFIG[user.branch];

  const isEmployee = user.role === 'employee';
  const isManager = user.role === 'manager';
  const isExecutive = user.role === 'executive';

  const navItems = [
    // Common items
    ...(isEmployee
      ? [
          { icon: ShoppingCart, label: 'POS Terminal', href: '/pos', show: true },
          { icon: Package, label: 'Count Stock', href: '/inventory-count', show: true },
          { icon: AlertCircle, label: 'Log Loss', href: '/loss-log', show: true },
        ]
      : []),
    ...(isManager
      ? [
          { icon: BarChart3, label: 'EOD Dashboard', href: '/dashboard', show: true },
          { icon: Package, label: 'Inventory Count', href: '/inventory-count', show: true },
          { icon: AlertCircle, label: 'Loss Log', href: '/loss-log', show: true },
          { icon: Users, label: 'HR Flags', href: '/hr-flags', show: true },
          { icon: MessageSquare, label: 'Newsfeed', href: '/newsfeed', show: true },
        ]
      : []),
    ...(isExecutive
      ? [
          { icon: BarChart3, label: 'Command Center', href: '/command-center', show: true },
          { icon: TrendingUp, label: 'Trend Analysis', href: '/trends', show: true },
          { icon: Users, label: 'HR Flags', href: '/hr-flags', show: true },
          { icon: MessageSquare, label: 'Newsfeed', href: '/newsfeed', show: true },
        ]
      : []),
    { icon: Settings, label: 'Settings', href: '/settings', show: true },
  ];

  const activeItem = navItems.find((item) => item.href === location);

  const sidebarContent = (
    <>
      <div className="p-4 border-b">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-lg"
            style={{ backgroundColor: branchConfig.color }}
          >
            {user.branch === 'danielito' && 'D'}
            {user.branch === 'malaya' && 'M'}
            {user.branch === 'dbar' && 'B'}
          </div>
          <div>
            <h2 className="text-sm font-corp-display font-semibold text-gray-900">
              {branchConfig.name}
            </h2>
            <p className="text-xs text-gray-500 capitalize">{user.role}</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.href;

          return (
            <Button
              key={item.href}
              variant={isActive ? 'default' : 'ghost'}
              className={`w-full justify-start gap-3 mb-1 ${
                isActive
                  ? 'bg-[#1B2A4A] text-white hover:bg-[#13203A]'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
              onClick={() => {
                navigate(item.href);
                setMobileOpen(false);
              }}
            >
              <Icon className="w-4 h-4" />
              <span className="font-corp-body text-sm">{item.label}</span>
            </Button>
          );
        })}
      </nav>

      <div className="p-4 border-t text-xs text-gray-500 font-corp-body">
        <p>Saint Michael Food Corp</p>
        <p>v1.0.0</p>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col bg-white border-r border-gray-200">
        {sidebarContent}
      </aside>

      {/* Mobile Header with Menu Button */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200 flex items-center justify-between px-4 py-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>
      </div>

      {/* Mobile Sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setMobileOpen(false)}>
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-white flex flex-col">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
