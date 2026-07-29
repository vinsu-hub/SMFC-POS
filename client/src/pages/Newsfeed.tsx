import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, Package, Users, Info, Clock, DollarSign, TrendingUp } from 'lucide-react';

interface NewsItem {
  id: string;
  branch: string;
  branchName: string;
  branchColor: string;
  type: 'expiry' | 'low_stock' | 'hr' | 'general' | 'expiry_urgent';
  title: string;
  message: string;
  timestamp: Date;
  icon: React.ComponentType<any>;
  daysUntilExpiry?: number;
}

interface BranchMetrics {
  name: string;
  color: string;
  accentColor: string;
  revenue: number;
  cogs: number;
  losses: number;
  margin: number;
  marginPercent: number;
  staffCount: number;
  avgStaffUtilization: number;
  expiringItems: number;
  lowStockItems: number;
  lastInventoryCount: string;
  todaysSales: number;
  yesterdaysSales: number;
  weeklyTrend: string;
}

export default function Newsfeed() {
  const { user } = useAuth();
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('alerts');

  // Mock newsfeed items with expiry information
  const allItems: NewsItem[] = [
    {
      id: '1',
      branch: 'dbar',
      branchName: "D' Bar",
      branchColor: '#B5651D',
      type: 'expiry_urgent',
      title: 'Premium Vodka - Expires Tomorrow',
      message: 'Premium vodka expires tomorrow. Recommend featuring in cocktail specials immediately.',
      timestamp: new Date(Date.now() - 30 * 60 * 1000),
      icon: AlertTriangle,
      daysUntilExpiry: 1,
    },
    {
      id: '2',
      branch: 'malaya',
      branchName: "Malaya's Cafe",
      branchColor: '#6E8368',
      type: 'low_stock',
      title: 'Matcha Powder Low Stock',
      message: 'Matcha powder at 15% capacity. Reorder recommended for weekend rush.',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
      icon: Package,
    },
    {
      id: '3',
      branch: 'danielito',
      branchName: "Danielito's Home Kitchen",
      branchColor: '#1F2E28',
      type: 'hr',
      title: 'Staff Training Schedule',
      message: 'Chef Marcus will be training new sous chef this weekend. Plan accordingly.',
      timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000),
      icon: Users,
    },
    {
      id: '4',
      branch: 'dbar',
      branchName: "D' Bar",
      branchColor: '#B5651D',
      type: 'general',
      title: 'Inventory Count Complete',
      message: 'Daily inventory count completed. Variance: 2.3%. All items accounted for.',
      timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000),
      icon: Info,
    },
    {
      id: '5',
      branch: 'malaya',
      branchName: "Malaya's Cafe",
      branchColor: '#6E8368',
      type: 'expiry',
      title: 'Cream Expires in 2 Days',
      message: 'Cream expires in 2 days. Use in desserts or promotional items.',
      timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000),
      icon: AlertTriangle,
      daysUntilExpiry: 2,
    },
    {
      id: '6',
      branch: 'danielito',
      branchName: "Danielito's Home Kitchen",
      branchColor: '#1F2E28',
      type: 'low_stock',
      title: 'Fresh Produce Delivery',
      message: 'Fresh produce delivery arrived. Check quality and store accordingly.',
      timestamp: new Date(Date.now() - 10 * 60 * 60 * 1000),
      icon: Package,
    },
    {
      id: '7',
      branch: 'malaya',
      branchName: "Malaya's Cafe",
      branchColor: '#6E8368',
      type: 'expiry',
      title: 'Almond Milk Expires in 3 Days',
      message: 'Organic almond milk expires in 3 days. Feature in daily specials.',
      timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000),
      icon: AlertTriangle,
      daysUntilExpiry: 3,
    },
    {
      id: '8',
      branch: 'danielito',
      branchName: "Danielito's Home Kitchen",
      branchColor: '#1F2E28',
      type: 'expiry',
      title: 'Duck Breast Expires in 1 Day',
      message: 'Premium duck breast expires tomorrow. Plan special menu items.',
      timestamp: new Date(Date.now() - 14 * 60 * 60 * 1000),
      icon: AlertTriangle,
      daysUntilExpiry: 1,
    },
    {
      id: '9',
      branch: 'dbar',
      branchName: "D' Bar",
      branchColor: '#B5651D',
      type: 'low_stock',
      title: 'Tonic Water Low Stock',
      message: 'Tonic water at 20% capacity. Urgent reorder needed.',
      timestamp: new Date(Date.now() - 16 * 60 * 60 * 1000),
      icon: Package,
    },
    {
      id: '10',
      branch: 'malaya',
      branchName: "Malaya's Cafe",
      branchColor: '#6E8368',
      type: 'hr',
      title: 'New POS Training',
      message: 'All staff required to attend POS system training on Friday at 2 PM.',
      timestamp: new Date(Date.now() - 18 * 60 * 60 * 1000),
      icon: Users,
    },
  ];

  // Branch metrics data
  const branchMetrics: Record<string, BranchMetrics> = {
    danielito: {
      name: "Danielito's Home Kitchen",
      color: '#1F2E28',
      accentColor: '#C9A24B',
      revenue: 4250.50,
      cogs: 1487.68,
      losses: 125.00,
      margin: 2637.82,
      marginPercent: 62.1,
      staffCount: 8,
      avgStaffUtilization: 92,
      expiringItems: 3,
      lowStockItems: 2,
      lastInventoryCount: '2 hours ago',
      todaysSales: 1240.50,
      yesterdaysSales: 1180.25,
      weeklyTrend: '+5.2%',
    },
    malaya: {
      name: "Malaya's Cafe",
      color: '#6E8368',
      accentColor: '#D9A441',
      revenue: 3850.25,
      cogs: 1155.08,
      losses: 95.50,
      margin: 2599.67,
      marginPercent: 67.5,
      staffCount: 6,
      avgStaffUtilization: 88,
      expiringItems: 2,
      lowStockItems: 1,
      lastInventoryCount: '4 hours ago',
      todaysSales: 950.25,
      yesterdaysSales: 920.00,
      weeklyTrend: '+3.3%',
    },
    dbar: {
      name: "D' Bar",
      color: '#B5651D',
      accentColor: '#241726',
      revenue: 5120.75,
      cogs: 1536.23,
      losses: 180.00,
      margin: 3404.52,
      marginPercent: 66.5,
      staffCount: 7,
      avgStaffUtilization: 95,
      expiringItems: 4,
      lowStockItems: 3,
      lastInventoryCount: '1 hour ago',
      todaysSales: 1680.75,
      yesterdaysSales: 1620.50,
      weeklyTrend: '+3.7%',
    },
  };

  // Filter items based on user role and branch
  const getFilteredItems = () => {
    let filtered = allItems;

    // If employee or manager, only show their branch
    if (user?.role === 'employee' || user?.role === 'manager') {
      filtered = filtered.filter((item) => item.branch === user.branch);
    }

    // Apply type filter
    if (selectedFilter !== 'all') {
      filtered = filtered.filter((item) => item.type === selectedFilter);
    }

    return filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'expiry_urgent':
        return 'bg-red-100 text-red-800';
      case 'expiry':
        return 'bg-orange-100 text-orange-800';
      case 'low_stock':
        return 'bg-yellow-100 text-yellow-800';
      case 'hr':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'expiry_urgent':
        return 'EXPIRES SOON';
      case 'expiry':
        return 'EXPIRY ALERT';
      case 'low_stock':
        return 'LOW STOCK';
      case 'hr':
        return 'STAFF UPDATE';
      default:
        return 'INFO';
    }
  };

  const filteredItems = getFilteredItems();
  const expiryItems = filteredItems.filter((item) => item.type === 'expiry' || item.type === 'expiry_urgent');
  const lowStockItems = filteredItems.filter((item) => item.type === 'low_stock');
  const hrItems = filteredItems.filter((item) => item.type === 'hr');
  const generalItems = filteredItems.filter((item) => item.type === 'general');

  // Get user's branch metrics
  const userBranchMetrics = user?.branch ? branchMetrics[user.branch] : null;

  // Determine which branches to show
  const visibleBranches = user?.role === 'executive' 
    ? ['danielito', 'malaya', 'dbar']
    : user?.branch 
    ? [user.branch]
    : [];

  const MetricCard = ({ title, value, icon: Icon, color }: any) => (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-600 font-corp-body mb-1">{title}</p>
            <p className="text-2xl font-corp-display font-bold text-gray-900">{value}</p>
          </div>
          <Icon className="w-8 h-8" style={{ color }} />
        </div>
      </CardContent>
    </Card>
  );

  return (
    <DashboardLayout title="Newsfeed">
      <div className="p-6 space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full gap-2 bg-gray-100 mb-6" style={{ gridTemplateColumns: `repeat(${user?.role === 'executive' ? 4 : 2}, 1fr)` }}>
            <TabsTrigger value="alerts" className="font-corp-body">
              Alerts & Updates
            </TabsTrigger>
            {user?.role === 'executive' ? (
              <>
                <TabsTrigger value="danielito" className="font-corp-body">
                  Danielito's
                </TabsTrigger>
                <TabsTrigger value="malaya" className="font-corp-body">
                  Malaya's
                </TabsTrigger>
                <TabsTrigger value="dbar" className="font-corp-body">
                  D' Bar
                </TabsTrigger>
              </>
            ) : (
              <TabsTrigger value="overview" className="font-corp-body">
                Branch Overview
              </TabsTrigger>
            )}
          </TabsList>

          {/* Alerts Tab */}
          <TabsContent value="alerts" className="space-y-6">
            {/* Branch Info for Employees/Managers */}
            {(user?.role === 'employee' || user?.role === 'manager') && userBranchMetrics && (
              <Card className="border-l-4" style={{ borderLeftColor: userBranchMetrics.color }}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-corp-display font-semibold text-gray-900">
                        {userBranchMetrics.name}
                      </h3>
                      <p className="text-sm text-gray-600 font-corp-body">Branch alerts and updates</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-corp-display font-bold text-gray-900">{expiryItems.length}</p>
                      <p className="text-xs text-gray-600 font-corp-body">Items expiring soon</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Filter Tabs */}
            <Tabs defaultValue="all" onValueChange={setSelectedFilter} className="w-full">
              <TabsList className="grid w-full grid-cols-5 bg-gray-100">
                <TabsTrigger value="all" className="font-corp-body text-xs">
                  All ({filteredItems.length})
                </TabsTrigger>
                <TabsTrigger value="expiry_urgent" className="font-corp-body text-xs">
                  Urgent ({expiryItems.filter((i) => i.type === 'expiry_urgent').length})
                </TabsTrigger>
                <TabsTrigger value="expiry" className="font-corp-body text-xs">
                  Expiry ({expiryItems.filter((i) => i.type === 'expiry').length})
                </TabsTrigger>
                <TabsTrigger value="low_stock" className="font-corp-body text-xs">
                  Stock ({lowStockItems.length})
                </TabsTrigger>
                <TabsTrigger value="hr" className="font-corp-body text-xs">
                  Staff ({hrItems.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="all" className="space-y-3 mt-4">
                {filteredItems.length === 0 ? (
                  <Card>
                    <CardContent className="pt-8 text-center">
                      <Info className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-600 font-corp-body">No updates at this time</p>
                    </CardContent>
                  </Card>
                ) : (
                  filteredItems.map((item) => (
                    <Card
                      key={item.id}
                      className="border-l-4 hover:shadow-md transition-shadow"
                      style={{ borderLeftColor: item.branchColor }}
                    >
                      <CardContent className="pt-4">
                        <div className="flex items-start gap-4">
                          <div className="mt-1">
                            <item.icon className="w-5 h-5 text-gray-600" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <h4 className="font-corp-display font-semibold text-gray-900">{item.title}</h4>
                                <p className="text-xs text-gray-600 font-corp-body">{item.branchName}</p>
                              </div>
                              <Badge className={getTypeColor(item.type)}>
                                {getTypeLabel(item.type)}
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-700 font-corp-body mb-3">{item.message}</p>
                            <div className="flex items-center justify-between">
                              <p className="text-xs text-gray-500 font-corp-body">{formatTime(item.timestamp)}</p>
                              {item.daysUntilExpiry && (
                                <div className="flex items-center gap-1 text-xs font-corp-body">
                                  <Clock className="w-3 h-3" />
                                  <span className={item.daysUntilExpiry === 1 ? 'text-red-600 font-semibold' : 'text-orange-600'}>
                                    {item.daysUntilExpiry} day{item.daysUntilExpiry > 1 ? 's' : ''} left
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>

              <TabsContent value="expiry_urgent" className="space-y-3 mt-4">
                {expiryItems.filter((i) => i.type === 'expiry_urgent').length === 0 ? (
                  <Card>
                    <CardContent className="pt-8 text-center">
                      <Info className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-600 font-corp-body">No urgent expiry alerts</p>
                    </CardContent>
                  </Card>
                ) : (
                  expiryItems
                    .filter((i) => i.type === 'expiry_urgent')
                    .map((item) => (
                      <Card key={item.id} className="border-l-4 border-red-500 bg-red-50">
                        <CardContent className="pt-4">
                          <div className="flex items-start gap-4">
                            <AlertTriangle className="w-5 h-5 text-red-600 mt-1" />
                            <div className="flex-1">
                              <div className="flex items-start justify-between mb-2">
                                <div>
                                  <h4 className="font-corp-display font-semibold text-gray-900">{item.title}</h4>
                                  <p className="text-xs text-gray-600 font-corp-body">{item.branchName}</p>
                                </div>
                                <Badge className="bg-red-100 text-red-800">URGENT</Badge>
                              </div>
                              <p className="text-sm text-gray-700 font-corp-body mb-3">{item.message}</p>
                              <div className="flex items-center justify-between">
                                <p className="text-xs text-gray-500 font-corp-body">{formatTime(item.timestamp)}</p>
                                {item.daysUntilExpiry && (
                                  <div className="flex items-center gap-1 text-xs font-corp-body font-semibold text-red-600">
                                    <Clock className="w-3 h-3" />
                                    {item.daysUntilExpiry} day{item.daysUntilExpiry > 1 ? 's' : ''} left
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                )}
              </TabsContent>

              <TabsContent value="expiry" className="space-y-3 mt-4">
                {expiryItems.filter((i) => i.type === 'expiry').length === 0 ? (
                  <Card>
                    <CardContent className="pt-8 text-center">
                      <Info className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-600 font-corp-body">No expiry alerts</p>
                    </CardContent>
                  </Card>
                ) : (
                  expiryItems
                    .filter((i) => i.type === 'expiry')
                    .map((item) => (
                      <Card key={item.id} className="border-l-4 border-orange-500" style={{ borderLeftColor: item.branchColor }}>
                        <CardContent className="pt-4">
                          <div className="flex items-start gap-4">
                            <AlertTriangle className="w-5 h-5 text-orange-600 mt-1" />
                            <div className="flex-1">
                              <div className="flex items-start justify-between mb-2">
                                <div>
                                  <h4 className="font-corp-display font-semibold text-gray-900">{item.title}</h4>
                                  <p className="text-xs text-gray-600 font-corp-body">{item.branchName}</p>
                                </div>
                                <Badge className="bg-orange-100 text-orange-800">EXPIRY</Badge>
                              </div>
                              <p className="text-sm text-gray-700 font-corp-body mb-3">{item.message}</p>
                              <div className="flex items-center justify-between">
                                <p className="text-xs text-gray-500 font-corp-body">{formatTime(item.timestamp)}</p>
                                {item.daysUntilExpiry && (
                                  <div className="flex items-center gap-1 text-xs font-corp-body text-orange-600">
                                    <Clock className="w-3 h-3" />
                                    {item.daysUntilExpiry} day{item.daysUntilExpiry > 1 ? 's' : ''} left
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                )}
              </TabsContent>

              <TabsContent value="low_stock" className="space-y-3 mt-4">
                {lowStockItems.length === 0 ? (
                  <Card>
                    <CardContent className="pt-8 text-center">
                      <Info className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-600 font-corp-body">No low stock alerts</p>
                    </CardContent>
                  </Card>
                ) : (
                  lowStockItems.map((item) => (
                    <Card key={item.id} className="border-l-4" style={{ borderLeftColor: item.branchColor }}>
                      <CardContent className="pt-4">
                        <div className="flex items-start gap-4">
                          <Package className="w-5 h-5 text-yellow-600 mt-1" />
                          <div className="flex-1">
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <h4 className="font-corp-display font-semibold text-gray-900">{item.title}</h4>
                                <p className="text-xs text-gray-600 font-corp-body">{item.branchName}</p>
                              </div>
                              <Badge className="bg-yellow-100 text-yellow-800">LOW STOCK</Badge>
                            </div>
                            <p className="text-sm text-gray-700 font-corp-body mb-3">{item.message}</p>
                            <p className="text-xs text-gray-500 font-corp-body">{formatTime(item.timestamp)}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>

              <TabsContent value="hr" className="space-y-3 mt-4">
                {hrItems.length === 0 ? (
                  <Card>
                    <CardContent className="pt-8 text-center">
                      <Info className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-600 font-corp-body">No staff updates</p>
                    </CardContent>
                  </Card>
                ) : (
                  hrItems.map((item) => (
                    <Card key={item.id} className="border-l-4" style={{ borderLeftColor: item.branchColor }}>
                      <CardContent className="pt-4">
                        <div className="flex items-start gap-4">
                          <Users className="w-5 h-5 text-blue-600 mt-1" />
                          <div className="flex-1">
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <h4 className="font-corp-display font-semibold text-gray-900">{item.title}</h4>
                                <p className="text-xs text-gray-600 font-corp-body">{item.branchName}</p>
                              </div>
                              <Badge className="bg-blue-100 text-blue-800">STAFF</Badge>
                            </div>
                            <p className="text-sm text-gray-700 font-corp-body mb-3">{item.message}</p>
                            <p className="text-xs text-gray-500 font-corp-body">{formatTime(item.timestamp)}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>
            </Tabs>
          </TabsContent>

          {/* Branch Overview Tab for Employees/Managers */}
          {(user?.role === 'employee' || user?.role === 'manager') && userBranchMetrics && (
            <TabsContent value="overview" className="space-y-6">
              {/* Branch Header */}
              <Card className="border-l-4" style={{ borderLeftColor: userBranchMetrics.color }}>
                <CardHeader style={{ backgroundColor: userBranchMetrics.color + '10' }}>
                  <CardTitle className="font-corp-display text-2xl">{userBranchMetrics.name}</CardTitle>
                </CardHeader>
              </Card>

              {/* Key Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard
                  title="Today's Revenue"
                  value={`$${userBranchMetrics.todaysSales.toFixed(2)}`}
                  icon={DollarSign}
                  color={userBranchMetrics.color}
                />
                <MetricCard
                  title="Weekly Trend"
                  value={userBranchMetrics.weeklyTrend}
                  icon={TrendingUp}
                  color="#22C55E"
                />
                <MetricCard
                  title="Staff Count"
                  value={`${userBranchMetrics.staffCount}`}
                  icon={Users}
                  color="#3B82F6"
                />
                <MetricCard
                  title="Margin %"
                  value={`${userBranchMetrics.marginPercent}%`}
                  icon={TrendingUp}
                  color={userBranchMetrics.color}
                />
              </div>

              {/* Detailed Breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Financial Summary */}
                <Card className="border-l-4" style={{ borderLeftColor: userBranchMetrics.color }}>
                  <CardHeader>
                    <CardTitle className="font-corp-display">Financial Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between py-2 border-b">
                      <span className="text-gray-700 font-corp-body">Total Revenue</span>
                      <span className="font-corp-display font-bold">${userBranchMetrics.revenue.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b">
                      <span className="text-gray-700 font-corp-body">COGS</span>
                      <span className="font-corp-display font-bold">${userBranchMetrics.cogs.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b">
                      <span className="text-gray-700 font-corp-body">Losses</span>
                      <span className="font-corp-display font-bold text-red-600">${userBranchMetrics.losses.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 bg-gray-50 px-3 rounded">
                      <span className="text-gray-700 font-corp-body font-semibold">Gross Margin</span>
                      <span className="font-corp-display font-bold text-lg" style={{ color: userBranchMetrics.color }}>
                        ${userBranchMetrics.margin.toFixed(2)}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {/* Operational Status */}
                <Card className="border-l-4" style={{ borderLeftColor: userBranchMetrics.color }}>
                  <CardHeader>
                    <CardTitle className="font-corp-display">Operational Status</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between py-2 border-b">
                      <span className="text-gray-700 font-corp-body">Staff Utilization</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${userBranchMetrics.avgStaffUtilization}%`,
                              backgroundColor: userBranchMetrics.color,
                            }}
                          />
                        </div>
                        <span className="font-corp-display font-bold w-12 text-right">
                          {userBranchMetrics.avgStaffUtilization}%
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b">
                      <span className="text-gray-700 font-corp-body">Expiring Items</span>
                      <span className="font-corp-display font-bold text-orange-600">{userBranchMetrics.expiringItems}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b">
                      <span className="text-gray-700 font-corp-body">Low Stock Items</span>
                      <span className="font-corp-display font-bold text-yellow-600">{userBranchMetrics.lowStockItems}</span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-gray-700 font-corp-body flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        Last Inventory
                      </span>
                      <span className="font-corp-body text-sm text-gray-600">{userBranchMetrics.lastInventoryCount}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Performance Comparison */}
              <Card className="border-l-4" style={{ borderLeftColor: userBranchMetrics.color }}>
                <CardHeader>
                  <CardTitle className="font-corp-display">Performance Comparison</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-600 font-corp-body mb-2">Today's Sales</p>
                      <p className="text-2xl font-corp-display font-bold text-gray-900">
                        ${userBranchMetrics.todaysSales.toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 font-corp-body mb-2">Yesterday's Sales</p>
                      <p className="text-2xl font-corp-display font-bold text-gray-600">
                        ${userBranchMetrics.yesterdaysSales.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  <div className="bg-gray-50 p-4 rounded">
                    <p className="text-sm text-gray-700 font-corp-body mb-1">Weekly Trend</p>
                    <p className="text-3xl font-corp-display font-bold text-green-600">{userBranchMetrics.weeklyTrend}</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* Executive Branch Tabs */}
          {user?.role === 'executive' && (
            <>
              {Object.entries(branchMetrics).map(([key, branch]) => (
                <TabsContent key={key} value={key} className="space-y-6">
                  {/* Branch Header */}
                  <Card className="border-l-4" style={{ borderLeftColor: branch.color }}>
                    <CardHeader style={{ backgroundColor: branch.color + '10' }}>
                      <CardTitle className="font-corp-display text-2xl">{branch.name}</CardTitle>
                    </CardHeader>
                  </Card>

                  {/* Key Metrics */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <MetricCard
                      title="Today's Revenue"
                      value={`$${branch.todaysSales.toFixed(2)}`}
                      icon={DollarSign}
                      color={branch.color}
                    />
                    <MetricCard
                      title="Weekly Trend"
                      value={branch.weeklyTrend}
                      icon={TrendingUp}
                      color="#22C55E"
                    />
                    <MetricCard
                      title="Staff Count"
                      value={`${branch.staffCount}`}
                      icon={Users}
                      color="#3B82F6"
                    />
                    <MetricCard
                      title="Margin %"
                      value={`${branch.marginPercent}%`}
                      icon={TrendingUp}
                      color={branch.color}
                    />
                  </div>

                  {/* Detailed Breakdown */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Financial Summary */}
                    <Card className="border-l-4" style={{ borderLeftColor: branch.color }}>
                      <CardHeader>
                        <CardTitle className="font-corp-display">Financial Summary</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center justify-between py-2 border-b">
                          <span className="text-gray-700 font-corp-body">Total Revenue</span>
                          <span className="font-corp-display font-bold">${branch.revenue.toFixed(2)}</span>
                        </div>
                        <div className="flex items-center justify-between py-2 border-b">
                          <span className="text-gray-700 font-corp-body">COGS</span>
                          <span className="font-corp-display font-bold">${branch.cogs.toFixed(2)}</span>
                        </div>
                        <div className="flex items-center justify-between py-2 border-b">
                          <span className="text-gray-700 font-corp-body">Losses</span>
                          <span className="font-corp-display font-bold text-red-600">${branch.losses.toFixed(2)}</span>
                        </div>
                        <div className="flex items-center justify-between py-2 bg-gray-50 px-3 rounded">
                          <span className="text-gray-700 font-corp-body font-semibold">Gross Margin</span>
                          <span className="font-corp-display font-bold text-lg" style={{ color: branch.color }}>
                            ${branch.margin.toFixed(2)}
                          </span>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Operational Status */}
                    <Card className="border-l-4" style={{ borderLeftColor: branch.color }}>
                      <CardHeader>
                        <CardTitle className="font-corp-display">Operational Status</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center justify-between py-2 border-b">
                          <span className="text-gray-700 font-corp-body">Staff Utilization</span>
                          <div className="flex items-center gap-2">
                            <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${branch.avgStaffUtilization}%`,
                                  backgroundColor: branch.color,
                                }}
                              />
                            </div>
                            <span className="font-corp-display font-bold w-12 text-right">
                              {branch.avgStaffUtilization}%
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between py-2 border-b">
                          <span className="text-gray-700 font-corp-body">Expiring Items</span>
                          <span className="font-corp-display font-bold text-orange-600">{branch.expiringItems}</span>
                        </div>
                        <div className="flex items-center justify-between py-2 border-b">
                          <span className="text-gray-700 font-corp-body">Low Stock Items</span>
                          <span className="font-corp-display font-bold text-yellow-600">{branch.lowStockItems}</span>
                        </div>
                        <div className="flex items-center justify-between py-2">
                          <span className="text-gray-700 font-corp-body flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            Last Inventory
                          </span>
                          <span className="font-corp-body text-sm text-gray-600">{branch.lastInventoryCount}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Performance Comparison */}
                  <Card className="border-l-4" style={{ borderLeftColor: branch.color }}>
                    <CardHeader>
                      <CardTitle className="font-corp-display">Performance Comparison</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-gray-600 font-corp-body mb-2">Today's Sales</p>
                          <p className="text-2xl font-corp-display font-bold text-gray-900">
                            ${branch.todaysSales.toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600 font-corp-body mb-2">Yesterday's Sales</p>
                          <p className="text-2xl font-corp-display font-bold text-gray-600">
                            ${branch.yesterdaysSales.toFixed(2)}
                          </p>
                        </div>
                      </div>
                      <div className="bg-gray-50 p-4 rounded">
                        <p className="text-sm text-gray-700 font-corp-body mb-1">Weekly Trend</p>
                        <p className="text-3xl font-corp-display font-bold text-green-600">{branch.weeklyTrend}</p>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              ))}
            </>
          )}
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
