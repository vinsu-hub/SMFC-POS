import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Wallet, Loader2, Printer, Download, Calculator, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';
import { BRANCH_CONFIG } from '@/lib/types';
import {
  ApiPayrollSummary,
  ApiPayrollRow,
  fetchPayrollSummary,
  fetchPayrollReceiptPdf,
  fetchPayrollReceiptsZip,
  fetchEmployees,
  updateEmployee,
} from '@/lib/api';

export default function HRPayroll() {
  const { user } = useAuth();
  const [payrollSummary, setPayrollSummary] = useState<ApiPayrollSummary | null>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [payrollPeriod, setPayrollPeriod] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 13); // 2 weeks
    return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
  });
  const [activeTab, setActiveTab] = useState('current');

  useEffect(() => {
    if (!user?.branchId) return;
    loadData();
  }, [user?.branchId, payrollPeriod]);

  const loadData = async () => {
    if (!user?.branchId) return;
    setLoading(true);
    try {
      const [empData, payrollData] = await Promise.all([
        fetchEmployees(user.branchId),
        fetchPayrollSummary(user.branchId, payrollPeriod.start, payrollPeriod.end),
      ]);
      setEmployees(empData);
      setPayrollSummary(payrollData);
    } catch (error) {
      toast.error('Failed to load payroll data');
    } finally {
      setLoading(false);
    }
  };

  const handlePayRateChange = async (employeeId: string, newRate: number) => {
    try {
      await updateEmployee(employeeId, { pay_rate: newRate });
      toast.success('Pay rate updated');
      loadData();
    } catch (error) {
      toast.error('Failed to update pay rate');
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

  const handlePayRateEdit = (emp: any) => {
    const newRate = prompt(`New hourly pay rate for ${emp.full_name} (current: ${emp.pay_rate}):`);
    if (newRate !== null && !isNaN(parseFloat(newRate))) {
      handlePayRateChange(emp.id, parseFloat(newRate));
    }
  };

  const branchColor = user?.branch ? BRANCH_CONFIG[user.branch as keyof typeof BRANCH_CONFIG]?.color : '#14524B';

  return (
    <DashboardLayout title="HR Payroll">
      <div className="p-6 space-y-6">
        {/* Period Selector */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground font-corp-body">Period Start</label>
                <Input
                  type="date"
                  value={payrollPeriod.start}
                  onChange={e => setPayrollPeriod({ ...payrollPeriod, start: e.target.value })}
                  className="font-corp-body w-48"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground font-corp-body">Period End</label>
                <Input
                  type="date"
                  value={payrollPeriod.end}
                  onChange={e => setPayrollPeriod({ ...payrollPeriod, end: e.target.value })}
                  className="font-corp-body w-48"
                />
              </div>
              <Button variant="outline" onClick={loadData} className="gap-2" disabled={payrollLoading}>
                <RefreshCw className="w-4 h-4" />
                <span className="font-corp-body">Generate Payroll</span>
                {payrollLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Tabs for Current/History */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="current" className="font-corp-body">Current Period</TabsTrigger>
            <TabsTrigger value="history" className="font-corp-body">History</TabsTrigger>
          </TabsList>

          <TabsContent value="current">
            {payrollSummary && (
              <>
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <Card className="border-l-4" style={{ borderLeftColor: '#14524B' }}>
                    <CardContent className="p-4 text-center">
                      <p className="text-sm text-muted-foreground font-corp-body">Total Hours</p>
                      <p className="text-2xl font-corp-mono font-bold">{payrollSummary.total_hours.toFixed(1)}h</p>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4" style={{ borderLeftColor: '#1E7A4C' }}>
                    <CardContent className="p-4 text-center">
                      <p className="text-sm text-muted-foreground font-corp-body">Total Pay</p>
                      <p className="text-2xl font-corp-mono font-bold text-success">{formatCurrency(payrollSummary.total_pay)}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4" style={{ borderLeftColor: '#C98A2C' }}>
                    <CardContent className="p-4 text-center">
                      <p className="text-sm text-muted-foreground font-corp-body">Employees</p>
                      <p className="text-2xl font-corp-mono font-bold">{payrollSummary.employee_count}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4" style={{ borderLeftColor: '#6F6A5C' }}>
                    <CardContent className="p-4 text-center">
                      <p className="text-sm text-muted-foreground font-corp-body">Avg Hours/Emp</p>
                      <p className="text-2xl font-corp-mono font-bold">
                        {payrollSummary.employee_count > 0 ? (payrollSummary.total_hours / payrollSummary.employee_count).toFixed(1) : 0}h
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Payroll Table */}
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
                              <TableHead>Position</TableHead>
                              <TableHead className="text-right">Hours</TableHead>
                              <TableHead className="text-right">Rate/hr</TableHead>
                              <TableHead className="text-right">Total Pay</TableHead>
                              <TableHead className="w-50">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {payrollSummary.rows.map((row) => (
                              <TableRow key={row.employee_id} className="font-corp-body">
                                <TableCell className="font-medium">{row.employee_name}</TableCell>
                                <TableCell className="text-muted-foreground">{row.position || '—'}</TableCell>
                                <TableCell className="text-right font-corp-mono">{row.hours_worked.toFixed(1)}h</TableCell>
                                <TableCell className="text-right font-corp-mono">{formatCurrency(row.pay_rate)}</TableCell>
                                <TableCell className="text-right font-corp-mono font-bold text-success">{formatCurrency(row.total_pay)}</TableCell>
                                <TableCell>
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handlePrintReceipt(row)}
                                      disabled={receiptLoading === row.employee_id}
                                      className="text-primary gap-1"
                                    >
                                      {receiptLoading === row.employee_id ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                      ) : (
                                        <Printer className="w-3 h-3" />
                                      )}
                                      Receipt
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Download All Receipts */}
                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={handlePrintAllReceipts} disabled={bulkReceiptLoading} className="gap-2">
                    {bulkReceiptLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    <span className="font-corp-body">Download All Receipts (ZIP)</span>
                  </Button>
                </div>
              </>
            )}

            {!payrollSummary && !loading && (
              <Card>
                <CardContent className="p-8 text-center">
                  <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
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
                  <Users className="w-5 h-5" />
                  Employee Pay Rates
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="font-corp-body">
                          <TableHead>Name</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead className="text-right">Pay Rate</TableHead>
                          <TableHead>Position</TableHead>
                          <TableHead className="w-40">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {employees.map((emp) => (
                          <TableRow key={emp.id} className="font-corp-body">
                            <TableCell className="font-medium">{emp.full_name}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={
                                emp.role === 'manager' ? 'bg-primary text-primary-foreground' :
                                emp.role === 'executive' ? 'bg-warning-bg text-warning' :
                                'bg-muted-foreground/50 text-muted-foreground'
                              }>
                                {emp.role}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">{emp.email}</TableCell>
                            <TableCell className="text-right font-corp-mono">{formatCurrency(emp.pay_rate)}/hr</TableCell>
                            <TableCell>{emp.position || '—'}</TableCell>
                            <TableCell>
                              <Button size="sm" variant="outline" onClick={() => handlePayRateEdit(emp)} className="text-primary">
                                Edit Rate
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
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}