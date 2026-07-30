import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BRANCH_CONFIG } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import { TrendingUp, TrendingDown, DollarSign, Package, AlertCircle } from 'lucide-react';

export default function ManagerDashboard() {
  const { user } = useAuth();

  if (!user || user.role !== 'manager' || !user.branch) {
    return (
      <DashboardLayout>
        <div className="p-6 text-center">
          <p className="text-destructive">Access denied. This page is for managers only.</p>
        </div>
      </DashboardLayout>
    );
  }

  const branchConfig = BRANCH_CONFIG[user.branch];

  // Mock data (PHP, Philippines-scoped menu)
  const metrics = {
    revenue: 68420.50,
    cogs: 23887.75,
    losses: 2150.00,
    margin: 42382.75,
    marginPercent: 61.9,
  };

  const salesByProduct = [
    { name: 'Kare-Kare', units: 18, revenue: 9990, cogs: 3420 },
    { name: 'Crispy Pata', units: 12, revenue: 8988, cogs: 3600 },
    { name: 'Sinigang na Hipon', units: 20, revenue: 9980, cogs: 3800 },
    { name: 'Leche Flan', units: 24, revenue: 3360, cogs: 960 },
    { name: 'Calamansi Cooler', units: 32, revenue: 3840, cogs: 960 },
  ];

  const losses = [
    { item: 'Kangkong', quantity: 2, reason: 'Spoilage', value: 180 },
    { item: 'Pork Pata', quantity: 1, reason: 'Prep Error', value: 950 },
    { item: 'Shrimp', quantity: 1.5, reason: 'Breakage', value: 720 },
  ];

  const attendance = [
    { name: 'Marco Dela Cruz', status: 'On Time', hours: 8 },
    { name: 'Rosa Villanueva', status: 'On Time', hours: 8 },
    { name: 'Chef Luis Santos', status: 'Late (15min)', hours: 7.75 },
    { name: 'Ana Ramos', status: 'On Time', hours: 8 },
  ];

  return (
    <DashboardLayout title="End of Day Dashboard">
      <div className="p-6 space-y-6">
        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <MetricCard
            title="Revenue"
            value={formatCurrency(metrics.revenue)}
            icon={DollarSign}
            color="#B8860B"
            trend="+12%"
          />
          <MetricCard
            title="COGS"
            value={formatCurrency(metrics.cogs)}
            icon={Package}
            color="#14524B"
            trend="-3%"
          />
          <MetricCard
            title="Losses"
            value={formatCurrency(metrics.losses)}
            icon={AlertCircle}
            color="#6B2E2E"
            trend="+5%"
          />
          <MetricCard
            title="Margin"
            value={formatCurrency(metrics.margin)}
            icon={TrendingUp}
            color="#1F2E28"
            trend="+8%"
          />
          <MetricCard
            title="Margin %"
            value={`${metrics.marginPercent}%`}
            icon={TrendingUp}
            color="#14524B"
            trend="+2%"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sales by Product */}
          <Card className={`lg:col-span-2 border-l-4 ${
            user.branch === 'danielito' ? 'border-l-[#1F2E28]' :
            user.branch === 'malaya' ? 'border-l-[#6E8368]' :
            'border-l-[#B5651D]'
          }`}>
            <CardHeader>
              <CardTitle className="font-corp-display">Sales by Product</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">COGS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salesByProduct.map((item) => (
                    <TableRow key={item.name}>
                      <TableCell className="font-corp-body">{item.name}</TableCell>
                      <TableCell className="text-right font-corp-mono">{item.units}</TableCell>
                      <TableCell className="text-right font-corp-mono">{formatCurrency(item.revenue)}</TableCell>
                      <TableCell className="text-right font-corp-mono">{formatCurrency(item.cogs)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Loss Log */}
          <Card className={`border-l-4 ${
            user.branch === 'danielito' ? 'border-l-[#1F2E28]' :
            user.branch === 'malaya' ? 'border-l-[#6E8368]' :
            'border-l-[#B5651D]'
          }`}>
            <CardHeader>
              <CardTitle className="font-corp-display text-lg">Loss Log</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {losses.map((loss, idx) => (
                  <div key={idx} className="border-l-2 border-l-gray-300 pl-3">
                    <p className="font-corp-body font-semibold text-sm">{loss.item}</p>
                    <p className="text-xs text-muted-foreground">{loss.quantity}x • {loss.reason}</p>
                    <p className="text-sm font-corp-mono text-destructive">{formatCurrency(loss.value)}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Attendance */}
        <Card className={`border-l-4 ${
          user.branch === 'danielito' ? 'border-l-[#1F2E28]' :
          user.branch === 'malaya' ? 'border-l-[#6E8368]' :
          'border-l-[#B5651D]'
        }`}>
          <CardHeader>
            <CardTitle className="font-corp-display">Staff Attendance</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attendance.map((emp) => (
                  <TableRow key={emp.name}>
                    <TableCell className="font-corp-body">{emp.name}</TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-1 rounded ${
                        emp.status === 'On Time'
                          ? 'bg-success-bg text-success'
                          : 'bg-warning-bg text-warning'
                      }`}>
                        {emp.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-corp-mono">{emp.hours}h</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

function MetricCard({ title, value, icon: Icon, color, trend }: any) {
  return (
    <Card className="border-l-4" style={{ borderLeftColor: color }}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-corp-body mb-1">{title}</p>
            <p className="text-2xl font-corp-display font-bold">{value}</p>
            <p className="text-xs text-success mt-1">{trend}</p>
          </div>
          <Icon className="w-8 h-8 opacity-20" style={{ color }} />
        </div>
      </CardContent>
    </Card>
  );
}
