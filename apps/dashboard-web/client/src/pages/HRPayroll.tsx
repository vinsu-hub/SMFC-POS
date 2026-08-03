import React, { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import {
  Wallet, Loader2, Printer, Download, RefreshCw, CheckCircle, AlertTriangle,
  CalendarDays, Settings2, FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';
import { BRANCH_CONFIG } from '@/lib/types';
import {
  ApiPayrollSummary,
  ApiPayrollRow,
  ApiPayrollRecord,
  ApiBranch,
  fetchPayrollSummary,
  fetchPayrollReceiptPdf,
  fetchPayrollReceiptsZip,
  fetchBranches,
  generatePayroll,
  listPayrollRecords,
  fetchPayrollRecordForPrint,
  createPayrollOverride,
} from '@/lib/api';

export default function HRPayroll() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [payrollSummary, setPayrollSummary] = useState<ApiPayrollSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [payrollPeriod, setPayrollPeriod] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 13); // 2 weeks
    return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
  });
  const [activeTab, setActiveTab] = useState('current');

  // Managers act on their own branch; executives have no fixed branch, so
  // they pick one from the same real-location allow-list used elsewhere.
  const isExecutive = user?.role === 'executive';
  const [branches, setBranches] = useState<ApiBranch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);

  useEffect(() => {
    if (!isExecutive) return;
    fetchBranches()
      .then((all) => {
        const real = all.filter((b) => b.theme_key in BRANCH_CONFIG);
        setBranches(real);
        if (real.length > 0) setSelectedBranchId((prev) => prev ?? real[0].id);
      })
      .catch(() => toast.error('Could not load branches'));
  }, [isExecutive]);

  const activeBranchId = isExecutive ? selectedBranchId : user?.branchId ?? null;

  const loadData = async () => {
    if (!activeBranchId) return;
    setLoading(true);
    try {
      const payrollData = await fetchPayrollSummary(activeBranchId, payrollPeriod.start, payrollPeriod.end);
      setPayrollSummary(payrollData);
    } catch (error) {
      toast.error('Failed to load payroll data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!activeBranchId) return;
    loadData();
  }, [activeBranchId, payrollPeriod]);

  const [generating, setGenerating] = useState(false);
  const handleGeneratePayroll = async () => {
    if (!activeBranchId) return;
    if (!confirm(`Generate and save a payroll run for ${payrollPeriod.start} to ${payrollPeriod.end}? This persists a record in payroll history.`)) {
      return;
    }
    setGenerating(true);
    try {
      await generatePayroll(activeBranchId, payrollPeriod.start, payrollPeriod.end);
      toast.success('Payroll run generated and saved');
      loadData();
      if (activeTab === 'history') loadHistory();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate payroll');
    } finally {
      setGenerating(false);
    }
  };

  const [receiptLoading, setReceiptLoading] = useState<string | null>(null);
  const [bulkReceiptLoading, setBulkReceiptLoading] = useState(false);

  const handlePrintReceipt = async (row: ApiPayrollRow) => {
    setReceiptLoading(row.employee_id);
    try {
      const blob = await fetchPayrollReceiptPdf(row.branch_id, row.employee_id, row.period_start, row.period_end);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate payslip');
    } finally {
      setReceiptLoading(null);
    }
  };

  const handlePrintAllReceipts = async () => {
    if (!payrollSummary) return;
    setBulkReceiptLoading(true);
    try {
      const blob = await fetchPayrollReceiptsZip(payrollSummary.branch_id, payrollSummary.period_start, payrollSummary.period_end);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `payroll_receipts_${payrollSummary.period_start}_${payrollSummary.period_end}.zip`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate payroll receipts');
    } finally {
      setBulkReceiptLoading(false);
    }
  };

  // History tab: real persisted payroll runs.
  const [history, setHistory] = useState<ApiPayrollRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const loadHistory = async () => {
    if (!activeBranchId) return;
    setHistoryLoading(true);
    try {
      setHistory(await listPayrollRecords(activeBranchId));
    } catch {
      toast.error('Failed to load payroll history');
    } finally {
      setHistoryLoading(false);
    }
  };
  useEffect(() => {
    if (activeTab === 'history' && activeBranchId) loadHistory();
  }, [activeTab, activeBranchId]);

  const [printRecord, setPrintRecord] = useState<ApiPayrollRecord | null>(null);
  const handleViewRecord = async (id: string) => {
    try {
      setPrintRecord(await fetchPayrollRecordForPrint(id));
    } catch {
      toast.error('Failed to load payroll run detail');
    }
  };

  // Employee Drawer
  const [drawerRow, setDrawerRow] = useState<ApiPayrollRow | null>(null);
  const [overrideField, setOverrideField] = useState<'regular_hours' | 'overtime_hours' | 'night_diff_hours'>('overtime_hours');
  const [overrideValue, setOverrideValue] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [submittingOverride, setSubmittingOverride] = useState(false);

  const handleSubmitOverride = async () => {
    if (!overrideValue || !overrideReason) {
      toast.error('Please provide a new value and a reason');
      return;
    }
    setSubmittingOverride(true);
    try {
      // Overrides apply to a specific attendance log; without a log picker in
      // this summary-level drawer we can't target one from here yet, so this
      // wiring is left for a follow-up that surfaces per-day attendance logs
      // inside the drawer's Attendance tab.
      toast.info('Per-day override targeting is not wired up yet — see the Attendance tab for individual shifts.');
    } finally {
      setSubmittingOverride(false);
    }
  };

  const engineEnabled = payrollSummary?.engine_enabled ?? false;
  const validation = payrollSummary?.validation;

  return (
    <DashboardLayout title="Payroll">
      <div className="p-6 space-y-6">
        {/* Toolbar */}
        <Card className="sticky top-0 z-10">
          <CardContent className="p-4 flex flex-wrap items-end gap-4">
            {isExecutive && (
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground font-corp-body">Branch</label>
                <Select value={selectedBranchId ?? undefined} onValueChange={setSelectedBranchId}>
                  <SelectTrigger className="w-56 font-corp-body">
                    <SelectValue placeholder="Select a branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground font-corp-body">Period Start</label>
              <Input
                type="date"
                value={payrollPeriod.start}
                onChange={(e) => setPayrollPeriod({ ...payrollPeriod, start: e.target.value })}
                className="font-corp-body w-48"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground font-corp-body">Period End</label>
              <Input
                type="date"
                value={payrollPeriod.end}
                onChange={(e) => setPayrollPeriod({ ...payrollPeriod, end: e.target.value })}
                className="font-corp-body w-48"
              />
            </div>
            <Button onClick={handleGeneratePayroll} className="gap-2" disabled={generating}>
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              <span className="font-corp-body">Generate Payroll</span>
            </Button>
            <Button variant="outline" onClick={() => navigate('/hr/holiday-calendar')} className="gap-2">
              <CalendarDays className="w-4 h-4" />
              <span className="font-corp-body">Holiday Calendar</span>
            </Button>
            <Button variant="outline" onClick={() => navigate('/hr/payroll-settings')} className="gap-2">
              <Settings2 className="w-4 h-4" />
              <span className="font-corp-body">Settings</span>
            </Button>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="current" className="font-corp-body">Current Period</TabsTrigger>
            <TabsTrigger value="history" className="font-corp-body">History</TabsTrigger>
          </TabsList>

          <TabsContent value="current" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : payrollSummary ? (
              <>
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <Card className="border-l-4" style={{ borderLeftColor: '#14524B' }}>
                    <CardContent className="p-4 text-center">
                      <p className="text-sm text-muted-foreground font-corp-body">Total Payroll</p>
                      <p className="text-2xl font-corp-mono font-bold text-success">{formatCurrency(payrollSummary.total_pay)}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4" style={{ borderLeftColor: '#C98A2C' }}>
                    <CardContent className="p-4 text-center">
                      <p className="text-sm text-muted-foreground font-corp-body">Holiday Premium</p>
                      <p className="text-2xl font-corp-mono font-bold">
                        {formatCurrency(payrollSummary.rows.reduce((sum, r) => sum + (r.holiday_pay ?? 0), 0))}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4" style={{ borderLeftColor: '#6F6A5C' }}>
                    <CardContent className="p-4 text-center">
                      <p className="text-sm text-muted-foreground font-corp-body">Night Differential</p>
                      <p className="text-2xl font-corp-mono font-bold">
                        {formatCurrency(payrollSummary.rows.reduce((sum, r) => sum + (r.night_diff_pay ?? 0), 0))}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4" style={{ borderLeftColor: '#1E7A4C' }}>
                    <CardContent className="p-4 text-center">
                      <p className="text-sm text-muted-foreground font-corp-body">Overtime</p>
                      <p className="text-2xl font-corp-mono font-bold">
                        {formatCurrency(payrollSummary.rows.reduce((sum, r) => sum + (r.overtime_pay ?? 0), 0))}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4" style={{ borderLeftColor: '#14524B' }}>
                    <CardContent className="p-4 text-center">
                      <p className="text-sm text-muted-foreground font-corp-body">Employees</p>
                      <p className="text-2xl font-corp-mono font-bold">{payrollSummary.employee_count}</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Validation Panel */}
                {validation && (
                  <div className="flex flex-wrap gap-2">
                    <Badge className={validation.attendance_complete ? 'bg-success/20 text-success' : 'bg-warning-bg text-warning'}>
                      {validation.attendance_complete ? <CheckCircle className="w-3 h-3 mr-1" /> : <AlertTriangle className="w-3 h-3 mr-1" />}
                      Attendance {validation.attendance_complete ? 'Complete' : 'Incomplete'}
                    </Badge>
                    {engineEnabled && (
                      <Badge className={validation.holiday_configured ? 'bg-success/20 text-success' : 'bg-warning-bg text-warning'}>
                        {validation.holiday_configured ? <CheckCircle className="w-3 h-3 mr-1" /> : <AlertTriangle className="w-3 h-3 mr-1" />}
                        Holiday {validation.holiday_configured ? 'Configured' : 'Missing'}
                      </Badge>
                    )}
                    <Badge className={validation.pending_overrides === 0 ? 'bg-success/20 text-success' : 'bg-warning-bg text-warning'}>
                      {validation.pending_overrides === 0 ? <CheckCircle className="w-3 h-3 mr-1" /> : <AlertTriangle className="w-3 h-3 mr-1" />}
                      {validation.pending_overrides} Pending Override{validation.pending_overrides === 1 ? '' : 's'}
                    </Badge>
                    <Badge className={!engineEnabled ? 'bg-muted-foreground/20 text-muted-foreground' : 'bg-success/20 text-success'}>
                      Engine {engineEnabled ? 'On' : 'Off (flat rate)'}
                    </Badge>
                  </div>
                )}

                {/* Main Table */}
                <Card>
                  <CardHeader>
                    <CardTitle className="font-corp-display flex items-center gap-2">
                      <Wallet className="w-5 h-5" />
                      Payroll Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {payrollSummary.rows.length === 0 ? (
                      <p className="text-center text-muted-foreground py-8 font-corp-body">No payroll data for this period</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="font-corp-body">
                              <TableHead>Employee</TableHead>
                              <TableHead className="text-right">Regular Hrs</TableHead>
                              {engineEnabled && <TableHead className="text-right">OT</TableHead>}
                              {engineEnabled && <TableHead className="text-right">Night Diff</TableHead>}
                              <TableHead className="text-right">Gross Pay</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="w-40">Receipt</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {payrollSummary.rows.map((row) => (
                              <TableRow
                                key={row.employee_id}
                                className="font-corp-body cursor-pointer hover:bg-muted/50"
                                onClick={() => setDrawerRow(row)}
                              >
                                <TableCell className="font-medium">{row.employee_name}</TableCell>
                                <TableCell className="text-right font-corp-mono">{(row.regular_hours ?? row.hours_worked).toFixed(1)}h</TableCell>
                                {engineEnabled && <TableCell className="text-right font-corp-mono">{(row.overtime_hours ?? 0).toFixed(1)}h</TableCell>}
                                {engineEnabled && <TableCell className="text-right font-corp-mono">{(row.night_diff_hours ?? 0).toFixed(1)}h</TableCell>}
                                <TableCell className="text-right font-corp-mono font-bold text-success">{formatCurrency(row.total_pay)}</TableCell>
                                <TableCell><Badge variant="outline">Pending</Badge></TableCell>
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handlePrintReceipt(row)}
                                    disabled={receiptLoading === row.employee_id}
                                    className="text-primary gap-1"
                                  >
                                    {receiptLoading === row.employee_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Printer className="w-3 h-3" />}
                                    Receipt
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={handlePrintAllReceipts} disabled={bulkReceiptLoading} className="gap-2">
                    {bulkReceiptLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    <span className="font-corp-body">Download All Receipts (ZIP)</span>
                  </Button>
                </div>
              </>
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <AlertTriangle className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-lg font-corp-body text-muted-foreground mb-2">No payroll data</p>
                  <p className="text-sm text-muted-foreground font-corp-body">Adjust the period and click Generate Payroll</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle className="font-corp-display flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Payroll Runs
                </CardTitle>
              </CardHeader>
              <CardContent>
                {historyLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : history.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8 font-corp-body">No payroll runs generated yet for this branch</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="font-corp-body">
                          <TableHead>Period</TableHead>
                          <TableHead className="text-right">Total Pay</TableHead>
                          <TableHead className="text-right">Employees</TableHead>
                          <TableHead>Generated</TableHead>
                          <TableHead className="w-24">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {history.map((record) => (
                          <TableRow key={record.id} className="font-corp-body">
                            <TableCell>{record.period_start} – {record.period_end}</TableCell>
                            <TableCell className="text-right font-corp-mono font-bold text-success">{formatCurrency(record.total_pay)}</TableCell>
                            <TableCell className="text-right font-corp-mono">{record.employee_count}</TableCell>
                            <TableCell className="text-muted-foreground">{new Date(record.created_at).toLocaleDateString()}</TableCell>
                            <TableCell>
                              <Button size="sm" variant="outline" onClick={() => handleViewRecord(record.id)}>View</Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Employee Drawer */}
        <Sheet open={!!drawerRow} onOpenChange={(open) => !open && setDrawerRow(null)}>
          <SheetContent className="sm:max-w-xl w-full overflow-y-auto">
            {drawerRow && (
              <>
                <SheetHeader>
                  <SheetTitle className="font-corp-display">{drawerRow.employee_name}</SheetTitle>
                  <SheetDescription>{drawerRow.position || 'No position set'} · {drawerRow.period_start} – {drawerRow.period_end}</SheetDescription>
                </SheetHeader>
                <div className="px-4 pb-4">
                  <Tabs defaultValue="overview">
                    <TabsList className="grid w-full grid-cols-4 mb-4">
                      <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
                      <TabsTrigger value="breakdown" className="text-xs">Breakdown</TabsTrigger>
                      <TabsTrigger value="override" className="text-xs">Overrides</TabsTrigger>
                      <TabsTrigger value="payslip" className="text-xs">Payslip</TabsTrigger>
                    </TabsList>
                    <TabsContent value="overview" className="space-y-3 font-corp-body text-sm">
                      <div className="flex justify-between"><span className="text-muted-foreground">Hours Worked</span><span>{drawerRow.hours_worked.toFixed(2)}h</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Pay Rate</span><span>{formatCurrency(drawerRow.pay_rate)}/hr</span></div>
                      <div className="flex justify-between font-bold"><span>Total Pay</span><span className="text-success">{formatCurrency(drawerRow.total_pay)}</span></div>
                    </TabsContent>
                    <TabsContent value="breakdown" className="space-y-3 font-corp-body text-sm">
                      <div className="flex justify-between"><span className="text-muted-foreground">Regular Hours</span><span>{(drawerRow.regular_hours ?? drawerRow.hours_worked).toFixed(2)}h</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Overtime Hours</span><span>{(drawerRow.overtime_hours ?? 0).toFixed(2)}h</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Night Differential Hours</span><span>{(drawerRow.night_diff_hours ?? 0).toFixed(2)}h</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Overtime Pay</span><span>{formatCurrency(drawerRow.overtime_pay ?? 0)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Night Differential Pay</span><span>{formatCurrency(drawerRow.night_diff_pay ?? 0)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Holiday Premium</span><span>{formatCurrency(drawerRow.holiday_pay ?? 0)}</span></div>
                    </TabsContent>
                    <TabsContent value="override" className="space-y-3">
                      <p className="text-xs text-muted-foreground font-corp-body">
                        Corrections go through a logged override on a specific attendance log, never a direct payroll edit.
                      </p>
                      <Select value={overrideField} onValueChange={(v) => setOverrideField(v as typeof overrideField)}>
                        <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="regular_hours">Regular Hours</SelectItem>
                          <SelectItem value="overtime_hours">Overtime Hours</SelectItem>
                          <SelectItem value="night_diff_hours">Night Differential Hours</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input placeholder="New value" value={overrideValue} onChange={(e) => setOverrideValue(e.target.value)} />
                      <Textarea placeholder="Reason (required)" value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
                      <Button onClick={handleSubmitOverride} disabled={submittingOverride} className="w-full font-corp-display">
                        {submittingOverride ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Submit Override'}
                      </Button>
                    </TabsContent>
                    <TabsContent value="payslip">
                      <Button
                        onClick={() => handlePrintReceipt(drawerRow)}
                        disabled={receiptLoading === drawerRow.employee_id}
                        className="w-full gap-2 font-corp-display"
                      >
                        {receiptLoading === drawerRow.employee_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                        View / Print Payslip
                      </Button>
                    </TabsContent>
                  </Tabs>
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>

        {/* Payroll run detail (History "View") */}
        <Sheet open={!!printRecord} onOpenChange={(open) => !open && setPrintRecord(null)}>
          <SheetContent className="sm:max-w-xl w-full overflow-y-auto">
            {printRecord && (
              <>
                <SheetHeader>
                  <SheetTitle className="font-corp-display">Payroll Run — {printRecord.period_start} to {printRecord.period_end}</SheetTitle>
                  <SheetDescription>{printRecord.employee_count} employees · {formatCurrency(printRecord.total_pay)} total</SheetDescription>
                </SheetHeader>
                <div className="px-4 pb-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead className="text-right">Hours</TableHead>
                        <TableHead className="text-right">Pay</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {printRecord.items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{item.employee_name}</TableCell>
                          <TableCell className="text-right font-corp-mono">{item.hours_worked.toFixed(1)}h</TableCell>
                          <TableCell className="text-right font-corp-mono">{formatCurrency(item.total_pay)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </DashboardLayout>
  );
}
