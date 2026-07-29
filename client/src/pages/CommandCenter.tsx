import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BRANCH_CONFIG } from '@/lib/types';
import { DollarSign, TrendingUp, Package, AlertCircle } from 'lucide-react';

export default function CommandCenter() {
  const { user } = useAuth();

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
              <CardHeader
                className="text-white"
                style={{ backgroundColor: branch.color }}
              >
                <CardTitle className="text-lg">{branch.name}</CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                {/* Metrics */}
                <div className="space-y-3">
                  <MetricRow
                    label="Revenue"
                    value={`$${branch.revenue.toFixed(2)}`}
                    accentColor={branch.accentColor}
                  />
                  <MetricRow
                    label="COGS"
                    value={`$${branch.cogs.toFixed(2)}`}
                    accentColor={branch.accentColor}
                  />
                  <MetricRow
                    label="Losses"
                    value={`$${branch.losses.toFixed(2)}`}
                    accentColor={branch.accentColor}
                  />
                  <div
                    className="p-3 rounded text-white"
                    style={{ backgroundColor: branch.accentColor }}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-corp-body font-semibold">Margin</span>
                      <span className="font-corp-mono font-bold">
                        ${branch.margin.toFixed(2)}
                      </span>
                    </div>
                    <div className="text-xs opacity-90 mt-1">
                      {branch.marginPercent}% of revenue
                    </div>
                  </div>
                </div>

                {/* Drill-down Button */}
                <Button
                  variant="outline"
                  className="w-full"
                  style={{
                    borderColor: branch.color,
                    color: branch.color,
                  }}
                >
                  View Details →
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Performance Summary */}
        <Card className="border-l-4 border-l-[#1B2A4A]">
          <CardHeader>
            <CardTitle className="font-corp-display">Performance Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <p className="text-sm text-gray-600 font-corp-body mb-2">Top Performer</p>
                <p className="text-lg font-corp-display font-bold text-[#B5651D]">
                  D' Bar
                </p>
                <p className="text-xs text-gray-500">
                  $5,120.75 revenue • 66.5% margin
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600 font-corp-body mb-2">Best Margin</p>
                <p className="text-lg font-corp-display font-bold text-[#6E8368]">
                  Malaya's Cafe
                </p>
                <p className="text-xs text-gray-500">
                  67.5% margin • Efficient operations
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600 font-corp-body mb-2">Attention Needed</p>
                <p className="text-lg font-corp-display font-bold text-red-600">
                  Losses
                </p>
                <p className="text-xs text-gray-500">
                  D' Bar: $180 • Review spoilage patterns
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

function MetricCard({ title, value, icon: Icon, color }: any) {
  return (
    <Card className="border-l-4" style={{ borderLeftColor: color }}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-600 font-corp-body mb-1">{title}</p>
            <p className="text-2xl font-corp-display font-bold">{value}</p>
          </div>
          <Icon className="w-8 h-8 opacity-20" style={{ color }} />
        </div>
      </CardContent>
    </Card>
  );
}

function MetricRow({ label, value, accentColor }: any) {
  return (
    <div className="flex justify-between items-center pb-2 border-b border-gray-200">
      <span className="text-sm font-corp-body text-gray-700">{label}</span>
      <span className="font-corp-mono font-semibold" style={{ color: accentColor }}>
        {value}
      </span>
    </div>
  );
}
