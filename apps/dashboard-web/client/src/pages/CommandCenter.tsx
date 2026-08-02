import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CartesianGrid, Line, LineChart, XAxis, YAxis, BarChart, Bar } from 'recharts';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { BRANCH_CONFIG, COMPANY_THEME, getCompanyKey, type Branch, type CompanyKey } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import { ApiOrganizationSummary, fetchMyOrganizationSummary } from '@/lib/api';
import { ApiUtilitySummary, ApiBranch, fetchOrgUtilitySummary, fetchTransfers, fetchBranches } from '@/lib/api';
import { supabase } from '@/lib/supabaseClient';
import { AlertCircle, Banknote, Clock, Loader2, Package, TrendingUp, Users, Zap, Droplets, Flame, Send, RefreshCw } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string;
  icon: React.ComponentType<any>;
  color: string;
}

interface BranchDetailPanelProps {
  branch: {
    key: Branch;
    name: string;
    color: string;
    revenue: number;
    cogs: number;
    losses: number;
    margin: number;
    marginPercent: number;
    todaysSales: number;
    staffCount: number;
    avgStaffUtilization: number;
    expiringItems: number;
    lowStockItems: number;
    lastInventoryCount: string;
    yesterdaysSales: number;
    weeklyTrend: string;
  };
}

// Extracted from the old flat per-location TabsContent so the same markup
// can be reused inside a nested per-company/per-location tab structure.
function BranchDetailPanel({ branch }: BranchDetailPanelProps) {
  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Today's Revenue" value={formatCurrency(branch.todaysSales)} icon={Banknote} color={branch.color} />
        <MetricCard title="Weekly Trend" value={branch.weeklyTrend} icon={TrendingUp} color="#1E7A4C" />
        <MetricCard title="Staff Count" value={`${branch.staffCount}`} icon={Users} color="#14524B" />
        <MetricCard title="Margin %" value={`${branch.marginPercent}%`} icon={TrendingUp} color={branch.color} />
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
              <span className="text-foreground font-corp-body">Total Revenue</span>
              <span className="font-corp-mono font-bold">{formatCurrency(branch.revenue)}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-foreground font-corp-body">COGS</span>
              <span className="font-corp-mono font-bold">{formatCurrency(branch.cogs)}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-foreground font-corp-body">Losses</span>
              <span className="font-corp-mono font-bold text-destructive">{formatCurrency(branch.losses)}</span>
            </div>
            <div className="flex items-center justify-between py-2 bg-secondary px-3 rounded">
              <span className="text-foreground font-corp-body font-semibold">Gross Margin</span>
              <span className="font-corp-mono font-bold text-lg" style={{ color: branch.color }}>
                {formatCurrency(branch.margin)}
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
              <span className="text-foreground font-corp-body">Staff Utilization</span>
              <div className="flex items-center gap-2">
                <div className="w-24 h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${branch.avgStaffUtilization}%`,
                      backgroundColor: branch.color,
                    }}
                  />
                </div>
                <span className="font-corp-mono font-bold w-12 text-right">
                  {branch.avgStaffUtilization}%
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-foreground font-corp-body">Expiring Items</span>
              <span className="font-corp-mono font-bold text-warning">{branch.expiringItems}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-foreground font-corp-body">Low Stock Items</span>
              <span className="font-corp-mono font-bold text-warning">{branch.lowStockItems}</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-foreground font-corp-body flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Last Inventory
              </span>
              <span className="font-corp-body text-sm text-muted-foreground">{branch.lastInventoryCount}</span>
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
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground font-corp-body mb-2">Today's Sales</p>
              <p className="text-stat-md font-corp-mono font-bold text-foreground truncate">
                {formatCurrency(branch.todaysSales)}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground font-corp-body mb-2">Yesterday's Sales</p>
              <p className="text-stat-md font-corp-mono font-bold text-muted-foreground truncate">
                {formatCurrency(branch.yesterdaysSales)}
              </p>
            </div>
          </div>
          <div className="bg-secondary p-4 rounded min-w-0">
            <p className="text-sm text-foreground font-corp-body mb-1">Weekly Trend</p>
            <p className="text-stat-lg font-corp-mono font-bold text-success truncate">{branch.weeklyTrend}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ title, value, icon: Icon, color }: MetricCardProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground font-corp-body mb-1 truncate">{title}</p>
            <p className="text-stat-md font-corp-mono font-bold text-foreground truncate">{value}</p>
          </div>
          <Icon className="w-8 h-8 shrink-0" style={{ color }} />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Operational figures with no real backend yet — attendance_logs, hr_flags,
 * and a proper inventory-count history table aren't built (see
 * docs/backend-execution-plan.md §2). Revenue/COGS/losses/margin below come
 * from the real GET /organizations/summary endpoint instead; only these
 * still-mock fields live here.
 */
const BRANCH_OPERATIONAL_META: Record<
  Branch,
  {
    staffCount: number;
    avgStaffUtilization: number;
    expiringItems: number;
    lowStockItems: number;
    lastInventoryCount: string;
    yesterdaysSales: number;
    weeklyTrend: string;
  }
> = {
  'danielito-agapita': { staffCount: 4, avgStaffUtilization: 92, expiringItems: 3, lowStockItems: 2, lastInventoryCount: '2 hours ago', yesterdaysSales: 18880.25, weeklyTrend: '+5.2%' },
  'danielito-maitim': { staffCount: 3, avgStaffUtilization: 89, expiringItems: 2, lowStockItems: 1, lastInventoryCount: '3 hours ago', yesterdaysSales: 15420.0, weeklyTrend: '+4.1%' },
  'danielito-tagaytay': { staffCount: 3, avgStaffUtilization: 90, expiringItems: 1, lowStockItems: 1, lastInventoryCount: '5 hours ago', yesterdaysSales: 12980.5, weeklyTrend: '+2.8%' },
  'malaya-agapita': { staffCount: 3, avgStaffUtilization: 88, expiringItems: 2, lowStockItems: 1, lastInventoryCount: '4 hours ago', yesterdaysSales: 14720.0, weeklyTrend: '+3.3%' },
  'malaya-maitim': { staffCount: 3, avgStaffUtilization: 86, expiringItems: 1, lowStockItems: 1, lastInventoryCount: '2 hours ago', yesterdaysSales: 11250.75, weeklyTrend: '+2.5%' },
  'malaya-pitx': { staffCount: 4, avgStaffUtilization: 91, expiringItems: 2, lowStockItems: 2, lastInventoryCount: '1 hour ago', yesterdaysSales: 19870.0, weeklyTrend: '+6.0%' },
  'malaya-jsh': { staffCount: 2, avgStaffUtilization: 84, expiringItems: 1, lowStockItems: 0, lastInventoryCount: '6 hours ago', yesterdaysSales: 8940.25, weeklyTrend: '+1.9%' },
  'dden-agapita': { staffCount: 4, avgStaffUtilization: 95, expiringItems: 4, lowStockItems: 3, lastInventoryCount: '1 hour ago', yesterdaysSales: 25920.5, weeklyTrend: '+3.7%' },
  'dden-maitim': { staffCount: 3, avgStaffUtilization: 90, expiringItems: 2, lowStockItems: 2, lastInventoryCount: '3 hours ago', yesterdaysSales: 17650.0, weeklyTrend: '+2.9%' },
  'dvenue-agapita': { staffCount: 3, avgStaffUtilization: 87, expiringItems: 1, lowStockItems: 1, lastInventoryCount: '5 hours ago', yesterdaysSales: 32100.0, weeklyTrend: '+4.4%' },
  'dvenue-maitim': { staffCount: 2, avgStaffUtilization: 83, expiringItems: 0, lowStockItems: 1, lastInventoryCount: '8 hours ago', yesterdaysSales: 21400.5, weeklyTrend: '+3.1%' },
  'isabelas-agapita': { staffCount: 2, avgStaffUtilization: 89, expiringItems: 1, lowStockItems: 1, lastInventoryCount: '3 hours ago', yesterdaysSales: 27650.0, weeklyTrend: '+5.5%' },
};

function matchBranchKey(branchName: string): Branch | null {
  // Returns null (not a fallback key) for a branch with no BRANCH_CONFIG entry
  // (e.g. a legacy/renamed branch still holding transaction history) --
  // silently coercing it to 'danielito' here previously caused two branches
  // to collide under the same React list key.
  const entry = (Object.entries(BRANCH_CONFIG) as [Branch, (typeof BRANCH_CONFIG)[Branch]][]).find(
    ([, config]) => config.name === branchName
  );
  return entry ? entry[0] : null;
}

// Built from all 12 locations (not just 3) so the revenue chart's
// tooltip/legend labels cover every branch, not only the original 3.
const chartConfig: ChartConfig = Object.fromEntries(
  (Object.entries(BRANCH_CONFIG) as [Branch, (typeof BRANCH_CONFIG)[Branch]][]).map(([key, config]) => [
    key,
    { label: config.name, color: config.color },
  ])
);

export default function CommandCenter() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [summary, setSummary] = useState<ApiOrganizationSummary | null>(null);
  const [utilitySummary, setUtilitySummary] = useState<ApiUtilitySummary[]>([]);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [utilityLoading, setUtilityLoading] = useState(false);
  const [transfersLoading, setTransfersLoading] = useState(false);
  const [utilityPeriodStart, setUtilityPeriodStart] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [utilityPeriodEnd, setUtilityPeriodEnd] = useState(() => new Date().toISOString().split('T')[0]);

  const isExecutive = user?.role === 'executive';

  useEffect(() => {
    if (!isExecutive) return;

    const loadSummary = () => {
      fetchMyOrganizationSummary()
        .then(setSummary)
        .catch(() => toast.error('Could not load Command Center data. Check your connection.'))
        .finally(() => setLoading(false));
    };

    const loadUtilitySummary = async () => {
      setUtilityLoading(true);
      try {
        const [data, branches] = await Promise.all([
          fetchOrgUtilitySummary(utilityPeriodStart, utilityPeriodEnd),
          fetchBranches(),
        ]);
        // Legacy pre-restructure branches (old single-row "D'Den", "D' Bar",
        // "Malaya's Cafe", etc.) still exist in the DB for their historical
        // data, but shouldn't clutter this report - same real-location
        // allow-list used to filter them out of the transfer/request pickers.
        const validBranchIds = new Set(
          branches.filter((b) => b.theme_key in BRANCH_CONFIG).map((b) => b.id)
        );
        setUtilitySummary(data.filter((u) => validBranchIds.has(u.branch_id)));
      } catch (error) {
        console.error('Failed to load utility summary:', error);
      } finally {
        setUtilityLoading(false);
      }
    };

    const loadTransfers = async () => {
      setTransfersLoading(true);
      try {
        // Get transfers for all branches (executive can see all)
        const branchIds = (summary?.branches.map(b => {
          const key = matchBranchKey(b.branch_name);
          return key ? (BRANCH_CONFIG[key] as { id?: string })?.id : undefined; // This needs branch ids from BRANCH_CONFIG
        }).filter(Boolean) || []) as string[];
        
        for (const branchId of branchIds) {
          const data = await fetchTransfers(branchId);
          setTransfers(prev => [...prev, ...data]);
        }
      } catch (error) {
        console.error('Failed to load transfers:', error);
      } finally {
        setTransfersLoading(false);
      }
    };

    loadSummary();
    loadUtilitySummary();

    // Live updates: a POS sale or a logged loss changes these numbers the
    // moment it happens, no polling or manual refresh needed.
    const channel = supabase
      .channel('command-center-summary')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transactions' }, loadSummary)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'loss_records' }, loadSummary)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'utility_logs' }, loadUtilitySummary)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transfers' }, loadTransfers)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isExecutive, summary, utilityPeriodStart, utilityPeriodEnd]);

  if (!user || user.role !== 'executive') {
    return (
      <DashboardLayout>
        <div className="p-6 text-center">
          <p className="text-destructive">Access denied. This page is for executives only.</p>
        </div>
      </DashboardLayout>
    );
  }

  if (loading || !summary) {
    return (
      <DashboardLayout title="Command Center">
        <div className="p-6 flex items-center justify-center text-muted-foreground">
          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
          Loading Command Center...
        </div>
      </DashboardLayout>
    );
  }

  const branches = summary.branches.flatMap((b) => {
    const key = matchBranchKey(b.branch_name);
    if (!key) return [];
    const config = BRANCH_CONFIG[key];
    const meta = BRANCH_OPERATIONAL_META[key];
    return [{
      key,
      companyKey: getCompanyKey(key),
      name: b.branch_name,
      color: config.color,
      revenue: b.revenue,
      cogs: b.cogs,
      losses: b.losses,
      margin: b.margin,
      marginPercent: b.margin_percent,
      hourlyRevenue: b.hourly_revenue,
      todaysSales: b.revenue,
      ...meta,
    }];
  });

  // Group locations by company for the nested company -> location tabs.
  const companyKeys = Object.keys(COMPANY_THEME) as CompanyKey[];
  const branchesByCompany = companyKeys.map((ck) => ({
    key: ck,
    name: COMPANY_THEME[ck].name,
    locations: branches.filter((b) => b.companyKey === ck),
  }));

  const totalRevenue = summary.total_revenue;
  const totalCogs = summary.total_cogs;
  const totalLosses = summary.total_losses;
  const avgMarginPercent = summary.total_margin_percent.toFixed(1);

  // Utility totals across all branches
  const totalElectricityCost = utilitySummary.reduce((sum, u) => sum + (u.electricity?.cost || 0), 0);
  const totalWaterCost = utilitySummary.reduce((sum, u) => sum + (u.water?.cost || 0), 0);
  const totalGasCost = utilitySummary.reduce((sum, u) => sum + (u.gas?.cost || 0), 0);
  const totalUtilityCost = totalElectricityCost + totalWaterCost + totalGasCost;
  const totalElectricityConsumption = utilitySummary.reduce((sum, u) => sum + (u.electricity?.consumption || 0), 0);
  const totalWaterConsumption = utilitySummary.reduce((sum, u) => sum + (u.water?.consumption || 0), 0);

  // Transfer stats
  const pendingTransfers = transfers.filter(t => t.status === 'pending').length;
  const confirmedTransfers = transfers.filter(t => t.status === 'confirmed').length;

  // Only chart hours with any activity across branches so far today — an
  // all-zero 24-hour axis before the branches open is just noise.
  const activeHours = summary.hourly_revenue.filter((point) => point.revenue > 0);
  const hoursToChart = activeHours.length > 0 ? activeHours.map((p) => p.hour) : [new Date().getUTCHours()];
  const chartData = hoursToChart.map((hour) => {
    const row: Record<string, number | string> = { hour: `${hour}:00` };
    for (const b of branches) {
      row[b.key] = b.hourlyRevenue.find((p) => p.hour === hour)?.revenue ?? 0;
    }
    return row;
  });

  return (
    <DashboardLayout title="Command Center">
      <div className="p-6 space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-7 mb-6">
            <TabsTrigger value="overview" className="font-corp-body">
              Overview
            </TabsTrigger>
            {branchesByCompany.map((company) => (
              <TabsTrigger key={company.key} value={company.key} className="font-corp-body">
                {company.name}
              </TabsTrigger>
            ))}
            <TabsTrigger value="utility-monitor" className="font-corp-body">
              Utility Monitor
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Corporate Totals */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-8 gap-4">
              <MetricCard
                title="Total Revenue"
                value={formatCurrency(totalRevenue)}
                icon={Banknote}
                color="#C98A2C"
              />
              <MetricCard
                title="Total COGS"
                value={formatCurrency(totalCogs)}
                icon={Package}
                color="#14524B"
              />
              <MetricCard
                title="Total Losses"
                value={formatCurrency(totalLosses)}
                icon={AlertCircle}
                color="#B23A2E"
              />
              <MetricCard
                title="Avg Margin %"
                value={`${avgMarginPercent}%`}
                icon={TrendingUp}
                color="#0E3F3A"
              />
              <MetricCard
                title="Electricity Cost"
                value={formatCurrency(totalElectricityCost)}
                icon={Zap}
                color="#C98A2C"
              />
              <MetricCard
                title="Water Cost"
                value={formatCurrency(totalWaterCost)}
                icon={Droplets}
                color="#14524B"
              />
              <MetricCard
                title="Total Utilities"
                value={formatCurrency(totalUtilityCost)}
                icon={Zap}
                color="#6F6A5C"
              />
              <MetricCard
                title="Pending Transfers"
                value={String(pendingTransfers)}
                icon={Send}
                color="#1E7A4C"
              />
            </div>

            {/* Three-Column Brand Comparison */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {branches.map((branch) => (
                <Card
                  key={branch.key}
                  className="border-l-4 overflow-hidden hover:shadow-lg transition-shadow"
                  style={{ borderLeftColor: branch.color }}
                >
                  <CardHeader style={{ backgroundColor: branch.color + '10' }}>
                    <CardTitle className="font-corp-display text-lg">{branch.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground font-corp-body mb-1">Revenue</p>
                        <p className="text-xl font-corp-mono font-bold text-foreground">
                          {formatCurrency(branch.revenue)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground font-corp-body mb-1">Margin %</p>
                        <p className="text-xl font-corp-mono font-bold" style={{ color: branch.color }}>
                          {branch.marginPercent}%
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground font-corp-body mb-1">COGS</p>
                        <p className="text-lg font-corp-mono font-semibold text-foreground">
                          {formatCurrency(branch.cogs)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground font-corp-body mb-1">Losses</p>
                        <p className="text-lg font-corp-mono font-semibold text-destructive">
                          {formatCurrency(branch.losses)}
                        </p>
                      </div>
                    </div>

                    <div className="border-t pt-4 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground font-corp-body">Staff Utilization</span>
                        <span className="font-corp-mono font-semibold">{branch.avgStaffUtilization}%</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground font-corp-body">Expiring Items</span>
                        <span className="font-corp-mono font-semibold text-warning">{branch.expiringItems}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground font-corp-body">Low Stock Items</span>
                        <span className="font-corp-mono font-semibold text-warning">{branch.lowStockItems}</span>
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      className="w-full font-corp-body text-sm"
                      onClick={() => setActiveTab(branch.companyKey)}
                    >
                      View Details
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Live revenue chart — updates the moment a sale posts */}
            <Card className="border-l-4 border-l-primary">
              <CardHeader>
                <CardTitle className="font-corp-display">Revenue Today, By Hour</CardTitle>
                <CardDescription>
                  Live — reflects every POS sale across all branches as it happens
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="max-h-72 w-full">
                  <LineChart data={chartData} margin={{ left: 8, right: 8 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="hour" tickLine={false} axisLine={false} />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={72}
                      tickFormatter={(value) => formatCurrency(Number(value))}
                    />
                    <ChartTooltip
                      content={<ChartTooltipContent formatter={(value) => formatCurrency(Number(value))} />}
                    />
                    {branches.map((branch) => (
                      <Line
                        key={branch.key}
                        type="monotone"
                        dataKey={branch.key}
                        stroke={branch.color}
                        strokeWidth={2}
                        dot={false}
                      />
                    ))}
                  </LineChart>
                </ChartContainer>
              </CardContent>
            </Card>

            {/* Live summary table — same data as the chart, same live subscription */}
            <Card className="border-l-4 border-l-primary">
              <CardHeader>
                <CardTitle className="font-corp-display">Branch Performance (Today)</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Branch</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">COGS</TableHead>
                      <TableHead className="text-right">Losses</TableHead>
                      <TableHead className="text-right">Margin</TableHead>
                      <TableHead className="text-right">Margin %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {branches.map((branch) => (
                      <TableRow key={branch.key}>
                        <TableCell className="font-corp-body font-medium">{branch.name}</TableCell>
                        <TableCell className="text-right font-corp-mono">{formatCurrency(branch.revenue)}</TableCell>
                        <TableCell className="text-right font-corp-mono">{formatCurrency(branch.cogs)}</TableCell>
                        <TableCell className="text-right font-corp-mono text-destructive">
                          {formatCurrency(branch.losses)}
                        </TableCell>
                        <TableCell className="text-right font-corp-mono">{formatCurrency(branch.margin)}</TableCell>
                        <TableCell className="text-right font-corp-mono">{branch.marginPercent}%</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-secondary font-semibold">
                      <TableCell className="font-corp-body">Total</TableCell>
                      <TableCell className="text-right font-corp-mono">{formatCurrency(totalRevenue)}</TableCell>
                      <TableCell className="text-right font-corp-mono">{formatCurrency(totalCogs)}</TableCell>
                      <TableCell className="text-right font-corp-mono text-destructive">
                        {formatCurrency(totalLosses)}
                      </TableCell>
                      <TableCell className="text-right font-corp-mono">
                        {formatCurrency(summary.total_margin)}
                      </TableCell>
                      <TableCell className="text-right font-corp-mono">{avgMarginPercent}%</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Company Tabs — each nests one sub-tab per location under that company */}
          {branchesByCompany.map((company) => (
            <TabsContent key={company.key} value={company.key} className="space-y-6">
              {company.locations.length === 0 ? (
                <p className="text-center text-muted-foreground py-12 font-corp-body">
                  No revenue data yet for {company.name}.
                </p>
              ) : (
                <Tabs defaultValue={company.locations[0].key} className="w-full">
                  <TabsList className="flex w-full flex-wrap h-auto gap-2 bg-transparent p-0 justify-start">
                    {company.locations.map((branch) => (
                      <TabsTrigger key={branch.key} value={branch.key} className="font-corp-body">
                        {branch.name}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {company.locations.map((branch) => (
                    <TabsContent key={branch.key} value={branch.key} className="space-y-6 mt-4">
                      <Card className="border-l-4" style={{ borderLeftColor: branch.color }}>
                        <CardHeader style={{ backgroundColor: branch.color + '10' }}>
                          <CardTitle className="font-corp-display text-2xl">{branch.name}</CardTitle>
                        </CardHeader>
                      </Card>
                      <BranchDetailPanel branch={branch} />
                    </TabsContent>
                  ))}
                </Tabs>
              )}
            </TabsContent>
          ))}

          {/* Utility Monitor Tab */}
          <TabsContent value="utility-monitor" className="space-y-6">
            {/* Period Selector */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-end gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground font-corp-body">Period Start</label>
                    <Input
                      type="date"
                      value={utilityPeriodStart}
                      onChange={(e) => setUtilityPeriodStart(e.target.value)}
                      className="font-corp-body w-48"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground font-corp-body">Period End</label>
                    <Input
                      type="date"
                      value={utilityPeriodEnd}
                      onChange={(e) => setUtilityPeriodEnd(e.target.value)}
                      className="font-corp-body w-48"
                    />
                  </div>
                  {utilityLoading && (
                    <div className="flex items-center text-muted-foreground text-sm font-corp-body">
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Refreshing...
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Corporate Utility Totals */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
              <MetricCard
                title="Electricity Used"
                value={`${totalElectricityConsumption.toFixed(1)} kWh`}
                icon={Zap}
                color="#C98A2C"
              />
              <MetricCard
                title="Electricity Cost"
                value={formatCurrency(totalElectricityCost)}
                icon={Zap}
                color="#C98A2C"
              />
              <MetricCard
                title="Water Used"
                value={`${totalWaterConsumption.toFixed(1)} m³`}
                icon={Droplets}
                color="#14524B"
              />
              <MetricCard
                title="Water Cost"
                value={formatCurrency(totalWaterCost)}
                icon={Droplets}
                color="#14524B"
              />
              <MetricCard
                title="Gas Cost"
                value={formatCurrency(totalGasCost)}
                icon={Flame}
                color="#C1440E"
              />
              <MetricCard
                title="Total Utility Cost"
                value={formatCurrency(totalUtilityCost)}
                icon={Zap}
                color="#6F6A5C"
              />
            </div>

            {/* Per-Branch Cost Comparison */}
            <Card className="border-l-4 border-l-primary">
              <CardHeader>
                <CardTitle className="font-corp-display">Utility Cost by Branch</CardTitle>
                <CardDescription>
                  {utilityPeriodStart} to {utilityPeriodEnd}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {utilitySummary.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8 font-corp-body">
                    No utility readings recorded for this period
                  </p>
                ) : (
                  <ChartContainer
                    config={{ cost: { label: 'Total Utility Cost', color: '#14524B' } }}
                    className="max-h-72 w-full"
                  >
                    <BarChart
                      data={utilitySummary.map((u) => ({ branch: u.branch_name, cost: u.total_cost }))}
                      margin={{ left: 8, right: 8 }}
                    >
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="branch" tickLine={false} axisLine={false} />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        width={72}
                        tickFormatter={(value) => formatCurrency(Number(value))}
                      />
                      <ChartTooltip
                        content={<ChartTooltipContent formatter={(value) => formatCurrency(Number(value))} />}
                      />
                      <Bar dataKey="cost" fill="#14524B" radius={4} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            {/* Per-Branch Breakdown Table */}
            <Card className="border-l-4 border-l-primary">
              <CardHeader>
                <CardTitle className="font-corp-display">Branch Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Branch</TableHead>
                      <TableHead className="text-right">Electricity (kWh)</TableHead>
                      <TableHead className="text-right">Electricity Cost</TableHead>
                      <TableHead className="text-right">Water (m³)</TableHead>
                      <TableHead className="text-right">Water Cost</TableHead>
                      <TableHead className="text-right">Gas Cost</TableHead>
                      <TableHead className="text-right">Total Cost</TableHead>
                      <TableHead className="text-right">Readings</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {utilitySummary.map((u) => (
                      <TableRow key={u.branch_id}>
                        <TableCell className="font-corp-body font-medium">{u.branch_name}</TableCell>
                        <TableCell className="text-right font-corp-mono">
                          {u.electricity.consumption.toFixed(1)}
                        </TableCell>
                        <TableCell className="text-right font-corp-mono">
                          {formatCurrency(u.electricity.cost)}
                        </TableCell>
                        <TableCell className="text-right font-corp-mono">{u.water.consumption.toFixed(1)}</TableCell>
                        <TableCell className="text-right font-corp-mono">{formatCurrency(u.water.cost)}</TableCell>
                        <TableCell className="text-right font-corp-mono">{formatCurrency(u.gas?.cost || 0)}</TableCell>
                        <TableCell className="text-right font-corp-mono font-bold">
                          {formatCurrency(u.total_cost)}
                        </TableCell>
                        <TableCell className="text-right font-corp-mono text-muted-foreground">
                          {u.electricity.readings_count + u.water.readings_count + (u.gas?.readings_count || 0)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-secondary font-semibold">
                      <TableCell className="font-corp-body">Total</TableCell>
                      <TableCell className="text-right font-corp-mono">
                        {totalElectricityConsumption.toFixed(1)}
                      </TableCell>
                      <TableCell className="text-right font-corp-mono">{formatCurrency(totalElectricityCost)}</TableCell>
                      <TableCell className="text-right font-corp-mono">{totalWaterConsumption.toFixed(1)}</TableCell>
                      <TableCell className="text-right font-corp-mono">{formatCurrency(totalWaterCost)}</TableCell>
                      <TableCell className="text-right font-corp-mono">{formatCurrency(totalGasCost)}</TableCell>
                      <TableCell className="text-right font-corp-mono">{formatCurrency(totalUtilityCost)}</TableCell>
                      <TableCell className="text-right font-corp-mono">
                        {utilitySummary.reduce((sum, u) => sum + u.electricity.readings_count + u.water.readings_count + (u.gas?.readings_count || 0), 0)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
