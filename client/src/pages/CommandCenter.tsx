import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BRANCH_CONFIG } from '@/lib/types';
import { DollarSign, TrendingUp, Package, AlertCircle, Users, Clock } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string;
  icon: React.ComponentType<any>;
  color: string;
}

function MetricCard({ title, value, icon: Icon, color }: MetricCardProps) {
  return (
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
}

export default function CommandCenter() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');

  if (!user || user.role !== 'executive') {
    return (
      <DashboardLayout>
        <div className="p-6 text-center">
          <p className="text-red-600">Access denied. This page is for executives only.</p>
        </div>
      </DashboardLayout>
    );
  }

  // Mock data for all three branches
  const branchMetrics = {
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

  const totalRevenue = Object.values(branchMetrics).reduce((sum, b) => sum + b.revenue, 0);
  const totalCogs = Object.values(branchMetrics).reduce((sum, b) => sum + b.cogs, 0);
  const totalLosses = Object.values(branchMetrics).reduce((sum, b) => sum + b.losses, 0);
  const totalMargin = Object.values(branchMetrics).reduce((sum, b) => sum + b.margin, 0);
  const avgMarginPercent = (totalMargin / totalRevenue * 100).toFixed(1);

  return (
    <DashboardLayout title="Command Center">
      <div className="p-6 space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 bg-gray-100 mb-6">
            <TabsTrigger value="overview" className="font-corp-body">
              Overview
            </TabsTrigger>
            <TabsTrigger value="danielito" className="font-corp-body">
              Danielito's
            </TabsTrigger>
            <TabsTrigger value="malaya" className="font-corp-body">
              Malaya's
            </TabsTrigger>
            <TabsTrigger value="dbar" className="font-corp-body">
              D' Bar
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Corporate Totals */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard
                title="Total Revenue"
                value={`$${totalRevenue.toFixed(2)}`}
                icon={DollarSign}
                color="#B8860B"
              />
              <MetricCard
                title="Total COGS"
                value={`$${totalCogs.toFixed(2)}`}
                icon={Package}
                color="#2E8B99"
              />
              <MetricCard
                title="Total Losses"
                value={`$${totalLosses.toFixed(2)}`}
                icon={AlertCircle}
                color="#DC2626"
              />
              <MetricCard
                title="Avg Margin %"
                value={`${avgMarginPercent}%`}
                icon={TrendingUp}
                color="#1B2A4A"
              />
            </div>

            {/* Three-Column Brand Comparison */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {Object.entries(branchMetrics).map(([key, branch]: any) => (
                <Card
                  key={key}
                  className="border-l-4 overflow-hidden hover:shadow-lg transition-shadow"
                  style={{ borderLeftColor: branch.color }}
                >
                  <CardHeader style={{ backgroundColor: branch.color + '10' }}>
                    <CardTitle className="font-corp-display text-lg">{branch.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-gray-600 font-corp-body mb-1">Revenue</p>
                        <p className="text-xl font-corp-display font-bold text-gray-900">
                          ${branch.revenue.toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 font-corp-body mb-1">Margin %</p>
                        <p className="text-xl font-corp-display font-bold" style={{ color: branch.color }}>
                          {branch.marginPercent}%
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 font-corp-body mb-1">COGS</p>
                        <p className="text-lg font-corp-display font-semibold text-gray-900">
                          ${branch.cogs.toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 font-corp-body mb-1">Losses</p>
                        <p className="text-lg font-corp-display font-semibold text-red-600">
                          ${branch.losses.toFixed(2)}
                        </p>
                      </div>
                    </div>

                    <div className="border-t pt-4 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 font-corp-body">Staff Utilization</span>
                        <span className="font-corp-display font-semibold">{branch.avgStaffUtilization}%</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 font-corp-body">Expiring Items</span>
                        <span className="font-corp-display font-semibold text-orange-600">{branch.expiringItems}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 font-corp-body">Low Stock Items</span>
                        <span className="font-corp-display font-semibold text-yellow-600">{branch.lowStockItems}</span>
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      className="w-full font-corp-body text-sm"
                      onClick={() => setActiveTab(key)}
                    >
                      View Details
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Individual Branch Tabs */}
          {Object.entries(branchMetrics).map(([key, branch]: any) => (
            <TabsContent key={key} value={key} className="space-y-6">
              {/* Branch Header */}
              <Card
                className="border-l-4"
                style={{ borderLeftColor: branch.color }}
              >
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
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
