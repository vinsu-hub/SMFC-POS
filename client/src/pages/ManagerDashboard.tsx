import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BRANCH_CONFIG } from '@/lib/types';
import { TrendingUp, TrendingDown, DollarSign, Package, AlertCircle } from 'lucide-react';

export default function ManagerDashboard() {
  const { user } = useAuth();

  if (!user || user.role !== 'manager') {
    return (
      <DashboardLayout>
        <div className="p-6 text-center">
          <p className="text-red-600">Access denied. This page is for managers only.</p>
        </div>
      </DashboardLayout>
    );
  }

  const branchConfig = BRANCH_CONFIG[user.branch];

  // Mock data
  const metrics = {
    revenue: 4250.50,
    cogs: 1487.68,
    losses: 125.00,
    margin: 2637.82,
    marginPercent: 62.1,
  };

  const salesByProduct = [
    { name: 'Pan-Seared Halibut', units: 12, revenue: 504, cogs: 180 },
    { name: 'Dry-Aged Ribeye', units: 8, revenue: 464, cogs: 220 },
    { name: 'Duck Confit', units: 15, revenue: 570, cogs: 225 },
    { name: 'Chocolate Soufflé', units: 24, revenue: 384, cogs: 96 },
    { name: 'Cocktails', units: 32, revenue: 512, cogs: 160 },
  ];

  const losses = [
    { item: 'Halibut Fillet', quantity: 2, reason: 'Spoilage', value: 45 },
    { item: 'Ribeye Steak', quantity: 1, reason: 'Prep Error', value: 35 },
    { item: 'Duck Breast', quantity: 3, reason: 'Breakage', value: 45 },
  ];

  const attendance = [
    { name: 'John Smith', status: 'On Time', hours: 8 },
    { name: 'Maria Garcia', status: 'On Time', hours: 8 },
    { name: 'James Wilson', status: 'Late (15min)', hours: 7.75 },
    { name: 'Sarah Chen', status: 'On Time', hours: 8 },
  ];

  return (
    <DashboardLayout title="End of Day Dashboard">
      <div className="p-6 space-y-6">
        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <MetricCard
            title="Revenue"
            value={`$${metrics.revenue.toFixed(2)}`}
            icon={DollarSign}
            color="#B8860B"
            trend="+12%"
          />
          <MetricCard
            title="COGS"
            value={`$${metrics.cogs.toFixed(2)}`}
            icon={Package}
            color="#2E8B99"
            trend="-3%"
          />
          <MetricCard
            title="Losses"
            value={`$${metrics.losses.toFixed(2)}`}
            icon={AlertCircle}
            color="#6B2E2E"
            trend="+5%"
          />
          <MetricCard
            title="Margin"
            value={`$${metrics.margin.toFixed(2)}`}
            icon={TrendingUp}
            color="#1F2E28"
            trend="+8%"
          />
          <MetricCard
            title="Margin %"
            value={`${metrics.marginPercent}%`}
            icon={TrendingUp}
            color="#2E8B99"
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
                      <TableCell className="text-right font-corp-mono">${item.revenue}</TableCell>
                      <TableCell className="text-right font-corp-mono">${item.cogs}</TableCell>
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
                    <p className="text-xs text-gray-600">{loss.quantity}x • {loss.reason}</p>
                    <p className="text-sm font-corp-mono text-red-600">${loss.value}</p>
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
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
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
            <p className="text-xs text-gray-600 font-corp-body mb-1">{title}</p>
            <p className="text-2xl font-corp-display font-bold">{value}</p>
            <p className="text-xs text-green-600 mt-1">{trend}</p>
          </div>
          <Icon className="w-8 h-8 opacity-20" style={{ color }} />
        </div>
      </CardContent>
    </Card>
  );
}
