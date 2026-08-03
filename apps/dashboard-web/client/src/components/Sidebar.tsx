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
  ChevronLeft,
  ChevronRight,
  Sparkles,
  X,
  Zap,
  Droplets,
  Wallet,
  ClipboardList,
  Truck,
  Send,
  RefreshCw,
  ListOrdered,
  Percent,
  CalendarDays,
  ChefHat,
} from 'lucide-react';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({ collapsed, onToggleCollapse, mobileOpen, onCloseMobile }: SidebarProps) {
  const { user } = useAuth();
  const [location, navigate] = useLocation();

  if (!user) return null;

  const branchConfig = user.branch
    ? BRANCH_CONFIG[user.branch]
    : { name: 'Corporate HQ', color: '#1B2A4A', logoUrl: undefined as string | undefined };

  const isEmployee = user.role === 'employee';
  const isManager = user.role === 'manager';
  const isExecutive = user.role === 'executive';

  const navItems = [
    // Common items
    ...(isEmployee
      ? [
          { icon: ShoppingCart, label: 'POS Terminal', href: '/pos', show: true },
          { icon: ListOrdered, label: 'Order Queue', href: '/order-queue', show: true },
          { icon: ChefHat, label: 'Kitchen Display', href: '/kitchen-display', show: true },
          { icon: Package, label: 'Count Stock', href: '/inventory-count', show: true },
          { icon: AlertCircle, label: 'Log Loss', href: '/loss-log', show: true },
          { icon: Truck, label: 'Inventory Movements', href: '/inventory-movements', show: true },
          { icon: Zap, label: 'Utility Log', href: '/utility-log', show: true },
          { icon: MessageSquare, label: 'Newsfeed', href: '/newsfeed', show: true },
        ]
      : []),
    ...(isManager
      ? [
          { icon: BarChart3, label: 'EOD Dashboard', href: '/dashboard', show: true },
          { icon: ListOrdered, label: 'Order Queue', href: '/order-queue', show: true },
          { icon: Percent, label: 'POS Management', href: '/pos-management', show: true },
          { icon: Package, label: 'Inventory Count', href: '/inventory-count', show: true },
          { icon: AlertCircle, label: 'Loss Log', href: '/loss-log', show: true },
          { icon: Truck, label: 'Inventory Movements', href: '/inventory-movements', show: true },
          { icon: Zap, label: 'Utility Log', href: '/utility-log', show: true },
          { icon: Users, label: 'HR Management', href: '/hr/attendance', show: true },
          { icon: Wallet, label: 'Payroll', href: '/hr/payroll', show: true },
          { icon: CalendarDays, label: 'Holiday Calendar', href: '/hr/holiday-calendar', show: true },
          { icon: Sparkles, label: 'Malaya AI', href: '/malaya', show: true },
          { icon: MessageSquare, label: 'Newsfeed', href: '/newsfeed', show: true },
        ]
      : []),
    ...(isExecutive
      ? [
          { icon: BarChart3, label: 'Command Center', href: '/command-center', show: true },
          { icon: Percent, label: 'POS Management', href: '/pos-management', show: true },
          { icon: TrendingUp, label: 'Trend Analysis', href: '/trends', show: true },
          { icon: Sparkles, label: 'Malaya AI', href: '/malaya', show: true },
          { icon: Users, label: 'HR Management', href: '/hr/attendance', show: true },
          { icon: Wallet, label: 'Payroll', href: '/hr/payroll', show: true },
          { icon: CalendarDays, label: 'Holiday Calendar', href: '/hr/holiday-calendar', show: true },
          { icon: MessageSquare, label: 'Newsfeed', href: '/newsfeed', show: true },
        ]
      : []),
    { icon: Settings, label: 'Settings', href: '/settings', show: true },
  ];

  function renderSidebar(isCollapsed: boolean, onNavigate: (href: string) => void) {
    return (
      <>
        <div className={`p-4 border-b border-border flex items-center gap-3 ${isCollapsed ? 'justify-center px-2' : ''}`}>
          <div
            className="w-10 h-10 shrink-0 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-l2-raised overflow-hidden bg-white"
            style={{ backgroundColor: branchConfig.logoUrl ? '#fff' : branchConfig.color }}
            title={isCollapsed ? branchConfig.name : undefined}
          >
            {branchConfig.logoUrl ? (
              <img src={branchConfig.logoUrl} alt={branchConfig.name} className="w-full h-full object-contain p-1" />
            ) : !user.branch ? (
              'HQ'
            ) : (
              branchConfig.name.charAt(0).toUpperCase()
            )}
          </div>
          {!isCollapsed && (
            <div className="min-w-0">
              <h2 className="text-sm font-corp-display font-semibold text-foreground truncate">
                {branchConfig.name}
              </h2>
              <p className="text-xs text-muted-foreground capitalize">{user.role}</p>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden p-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href;

            return (
              <Button
                key={item.href}
                variant={isActive ? 'default' : 'ghost'}
                title={isCollapsed ? item.label : undefined}
                className={`w-full mb-1 ${isCollapsed ? 'justify-center px-0' : 'justify-start gap-3'} ${
                  isActive ? '' : 'text-foreground shadow-none hover:bg-accent'
                }`}
                onClick={() => onNavigate(item.href)}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!isCollapsed && <span className="font-corp-body text-sm">{item.label}</span>}
              </Button>
            );
          })}
        </nav>

        {!isCollapsed && (
          <div className="p-4 border-t border-border text-xs text-muted-foreground font-corp-body">
            <p>Saint Michael Food Corp</p>
            <p>v1.0.0</p>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={`hidden md:flex flex-col bg-sidebar border-r border-sidebar-border transition-[width] duration-200 relative ${
          collapsed ? 'w-20' : 'w-64'
        }`}
      >
        {renderSidebar(collapsed, (href) => navigate(href))}
        <Button
          variant="outline"
          size="icon-sm"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="absolute -right-3 top-16 rounded-full bg-card shadow-l2-raised"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </Button>
      </aside>

      {/* Mobile Sidebar Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[60] bg-black/50 md:hidden" onClick={onCloseMobile}>
          <aside
            className="absolute left-0 top-0 bottom-0 w-64 bg-sidebar flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-end p-2">
              <Button variant="ghost" size="icon-sm" onClick={onCloseMobile} aria-label="Close menu">
                <X className="w-5 h-5" />
              </Button>
            </div>
            {renderSidebar(false, (href) => {
              navigate(href);
              onCloseMobile();
            })}
          </aside>
        </div>
      )}
    </>
  );
}
