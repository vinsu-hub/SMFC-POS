import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Clock, Loader2, CheckCircle, XCircle, User, UserPlus, LogOut, AlertCircle, RefreshCw, Calculator } from 'lucide-react';
import { toast } from 'sonner';
import {
  ApiAttendanceLog,
  ApiPayrollRow,
  ApiBranch,
  ClockOutRequest,
  clockOut,
  fetchMyAttendance,
  fetchBranchAttendance,
  fetchPayrollSummary,
  fetchPayrollReceiptPdf,
  fetchEmployees,
  ApiEmployee,
  ApiEmployeeCreated,
  ApiPayrollSummary,
  createEmployee,
  updateEmployee,
  fetchBranches,
} from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { BRANCH_CONFIG } from '@/lib/types';

const STATUS_COLORS: Record<string, string> = {
  working: 'bg-primary text-primary-foreground',
  on_break: 'bg-warning-bg text-warning',
  completed: 'bg-success-bg text-success',
};

function formatTime(dateStr: string | null | undefined) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function getHoursWorkedDisplay(hours: number | null | undefined) {
  if (!hours) return '—';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m}m`;
}

export default function HRAttendance() {
  const { user } = useAuth();
  const [myAttendance, setMyAttendance] = useState<ApiAttendanceLog | null>(null);
  const [branchAttendance, setBranchAttendance] = useState<ApiAttendanceLog[]>([]);
  const [employees, setEmployees] = useState<ApiEmployee[]>([]);
  const [payrollSummary, setPayrollSummary] = useState<ApiPayrollSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [clockingOut, setClockingOut] = useState(false);
  const [payrollPeriod, setPayrollPeriod] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 13); // 2 weeks
    return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
  });
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [receiptLoading, setReceiptLoading] = useState<string | null>(null);
  const [addEmployeeOpen, setAddEmployeeOpen] = useState(false);
  const [addEmployeeSubmitting, setAddEmployeeSubmitting] = useState(false);
  const [newEmployeeForm, setNewEmployeeForm] = useState({ full_name: '', role: 'employee' as 'employee' | 'manager', position: '', pay_rate: '' });
  const [createdEmployee, setCreatedEmployee] = useState<ApiEmployeeCreated | null>(null);

  // Managers act on their own branch; executives have no fixed branch, so
  // they pick one from the same real-location allow-list used elsewhere
  // (e.g. POS Management) - without this, Employee Management/Payroll here
  // silently show nothing for executives since user.branchId is null.
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

  useEffect(() => {
    if (user?.id && user?.branchId) loadMyAttendance();
  }, [user?.id, user?.branchId]);

  useEffect(() => {
    if (!activeBranchId || (user?.role !== 'manager' && user?.role !== 'executive')) return;
    loadBranchData();
  }, [activeBranchId, user?.role]);

  const loadMyAttendance = async () => {
    if (!user?.id) return;
    try {
      const data = await fetchMyAttendance();
      setMyAttendance(data);
    } catch (error) {
      // Silent fail for personal attendance
    }
  };

  const loadBranchData = async () => {
    if (!activeBranchId) return;
    setLoading(true);
    try {
      const [empData, attData] = await Promise.all([
        fetchEmployees(activeBranchId),
        fetchBranchAttendance(activeBranchId, payrollPeriod.start, payrollPeriod.end),
      ]);
      setEmployees(empData);
      setBranchAttendance(attData);
      if (empData.length > 0) {
        await loadPayrollSummary();
      }
    } catch (error) {
      toast.error('Failed to load branch data');
    } finally {
      setLoading(false);
    }
  };

  const loadPayrollSummary = async () => {
    if (!activeBranchId) return;
    setPayrollLoading(true);
    try {
      const data = await fetchPayrollSummary(activeBranchId, payrollPeriod.start, payrollPeriod.end);
      setPayrollSummary(data);
    } catch (error) {
      toast.error('Failed to load payroll summary');
    } finally {
      setPayrollLoading(false);
    }
  };

  const handleClockOut = async () => {
    setClockingOut(true);
    try {
      await clockOut({ employee_id: user.id });
      toast.success('Clocked out successfully');
      loadMyAttendance();
      if (user.role === 'manager' || user.role === 'executive') {
        loadBranchData();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to clock out');
    } finally {
      setClockingOut(false);
    }
  };

  const handlePayRateChange = async (employeeId: string, newRate: number) => {
    try {
      await updateEmployee(employeeId, { pay_rate: newRate });
      toast.success('Pay rate updated');
      loadBranchData();
    } catch (error) {
      toast.error('Failed to update pay rate');
    }
  };

  const handleOpenAddEmployee = () => {
    setNewEmployeeForm({ full_name: '', role: 'employee', position: '', pay_rate: '' });
    setCreatedEmployee(null);
    setAddEmployeeOpen(true);
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBranchId || !newEmployeeForm.full_name.trim()) {
      toast.error('Enter a name for the new employee');
      return;
    }
    setAddEmployeeSubmitting(true);
    try {
      const created = await createEmployee({
        branch_id: activeBranchId,
        full_name: newEmployeeForm.full_name.trim(),
        role: newEmployeeForm.role,
        position: newEmployeeForm.position || undefined,
        pay_rate: newEmployeeForm.pay_rate ? parseFloat(newEmployeeForm.pay_rate) : undefined,
      });
      setCreatedEmployee(created);
      toast.success('Employee created');
      loadBranchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create employee');
    } finally {
      setAddEmployeeSubmitting(false);
    }
  };

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

  const isClockedIn = myAttendance?.status === 'working' || myAttendance?.status === 'on_break';
  const currentTime = new Date();
  const clockInTime = myAttendance?.clock_in ? new Date(myAttendance.clock_in) : null;
  const elapsedMs = clockInTime ? currentTime.getTime() - clockInTime.getTime() : 0;
  const elapsedHours = Math.floor(elapsedMs / 3600000);
  const elapsedMinutes = Math.floor((elapsedMs % 3600000) / 60000);
  const elapsedSeconds = Math.floor((elapsedMs % 60000) / 1000);

  const branchColor = user?.branch ? BRANCH_CONFIG[user.branch as keyof typeof BRANCH_CONFIG]?.color : '#14524B';

  return (
    <DashboardLayout title={user?.role === 'employee' ? 'Time Clock' : 'HR Attendance'}>
      <div className="p-6 space-y-6">
        {isExecutive && (
          <Card>
            <CardContent className="p-4">
              <div className="space-y-1 max-w-xs">
                <label className="text-sm font-medium text-foreground font-corp-body">Branch</label>
                <Select value={selectedBranchId ?? undefined} onValueChange={setSelectedBranchId}>
                  <SelectTrigger className="font-corp-body">
                    <SelectValue placeholder="Select a branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Employee/Manager Personal Time Clock - executives have no kiosk shift of their own */}
        {!isExecutive && (
        <Card className="border-l-4" style={{ borderLeftColor: branchColor }}>
          <CardHeader>
            <CardTitle className="font-corp-display flex items-center gap-2">
              <Clock className="w-6 h-6" style={{ color: branchColor }} />
              {user?.role === 'employee' ? 'My Time Clock' : 'Current Shift'}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Current Time */}
              <div className="md:col-span-1 text-center p-6 bg-muted/30 rounded-xl min-w-0">
                <p className="text-xs text-muted-foreground font-corp-body uppercase tracking-wide mb-1">Today</p>
                <p className="text-lg font-corp-display font-medium">{formatDate(new Date().toISOString())}</p>
                <p className="text-stat-lg font-corp-mono font-bold tabular-nums mt-2 truncate" style={{ color: branchColor }}>
                  {currentTime.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                </p>
              </div>

              {/* Clock In/Out Status */}
              <div className="md:col-span-2 space-y-4">
                {isClockedIn ? (
                  <div className="space-y-4">
                    <div className="p-6 bg-primary/5 rounded-xl border border-primary/20">
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-sm text-muted-foreground font-corp-body">Shift Started</span>
                        <Badge variant="outline" className={STATUS_COLORS[myAttendance?.status ?? 'working']}>
                          <CheckCircle className="w-3 h-3 mr-1" /> {myAttendance?.status === 'on_break' ? 'On Break' : 'Active'}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-center">
                        <div className="min-w-0">
                          <p className="text-stat-lg font-corp-mono font-bold tabular-nums truncate" style={{ color: branchColor }}>
                            {formatTime(myAttendance.clock_in)}
                          </p>
                          <p className="text-xs text-muted-foreground font-corp-body">Clock In Time</p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-stat-lg font-corp-mono font-bold tabular-nums text-primary truncate">
                            {elapsedHours.toString().padStart(2, '0')}:{elapsedMinutes.toString().padStart(2, '0')}:{elapsedSeconds.toString().padStart(2, '0')}
                          </p>
                          <p className="text-xs text-muted-foreground font-corp-body">Elapsed</p>
                        </div>
                      </div>
                    </div>
                    <Button
                      onClick={handleClockOut}
                      disabled={clockingOut}
                      size="lg"
                      className="w-full bg-destructive hover:bg-destructive/90 text-destructive-foreground gap-2"
                    >
                      <LogOut className="w-5 h-5" />
                      <span className="font-corp-display text-lg">Clock Out</span>
                      {clockingOut && <Loader2 className="w-5 h-5 animate-spin" />}
                    </Button>
                  </div>
                ) : (
                  <div className="p-6 bg-muted/30 rounded-xl text-center">
                    <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
                    <p className="text-lg font-corp-body text-muted-foreground mb-2">No Active Shift</p>
                    <p className="text-sm text-muted-foreground font-corp-body">Clock in via the staff kiosk to begin tracking hours</p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        )}

        {/* Manager/Executive Views */}
        {(user?.role === 'manager' || user?.role === 'executive') && (
          <>
            {/* Payroll Period Selector */}
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
                  <Button variant="outline" onClick={loadBranchData} className="gap-2" disabled={payrollLoading}>
                    <RefreshCw className="w-4 h-4" />
                    <span className="font-corp-body">Generate Payroll</span>
                    {payrollLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Payroll Summary */}
            {payrollSummary && (
              <Card className="border-l-4" style={{ borderLeftColor: '#1E7A4C' }}>
                <CardHeader>
                  <CardTitle className="font-corp-display flex items-center gap-2">
                    <Calculator className="w-6 h-6 text-success" />
                    Payroll Summary ({payrollPeriod.start} to {payrollPeriod.end})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <Card className="border-l-4" style={{ borderLeftColor: '#14524B' }}>
                      <CardContent className="p-4 text-center min-w-0">
                        <p className="text-sm text-muted-foreground font-corp-body">Total Hours</p>
                        <p className="text-stat-md font-corp-mono font-bold truncate">{payrollSummary.total_hours.toFixed(1)}h</p>
                      </CardContent>
                    </Card>
                    <Card className="border-l-4" style={{ borderLeftColor: '#1E7A4C' }}>
                      <CardContent className="p-4 text-center min-w-0">
                        <p className="text-sm text-muted-foreground font-corp-body">Total Pay</p>
                        <p className="text-stat-md font-corp-mono font-bold text-success truncate">{formatCurrency(payrollSummary.total_pay)}</p>
                      </CardContent>
                    </Card>
                    <Card className="border-l-4" style={{ borderLeftColor: '#C98A2C' }}>
                      <CardContent className="p-4 text-center min-w-0">
                        <p className="text-sm text-muted-foreground font-corp-body">Employees</p>
                        <p className="text-stat-md font-corp-mono font-bold truncate">{payrollSummary.employee_count}</p>
                      </CardContent>
                    </Card>
                    <Card className="border-l-4" style={{ borderLeftColor: '#6F6A5C' }}>
                      <CardContent className="p-4 text-center min-w-0">
                        <p className="text-sm text-muted-foreground font-corp-body">Avg Hours</p>
                        <p className="text-stat-md font-corp-mono font-bold truncate">
                          {payrollSummary.employee_count > 0 ? (payrollSummary.total_hours / payrollSummary.employee_count).toFixed(1) : 0}h
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="font-corp-body">
                          <TableHead>Employee</TableHead>
                          <TableHead>Position</TableHead>
                          <TableHead className="text-right">Hours</TableHead>
                          <TableHead className="text-right">Rate</TableHead>
                          <TableHead className="text-right">Total Pay</TableHead>
                          <TableHead className="w-40">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {payrollSummary.rows.map((row) => (
                          <TableRow key={row.employee_id} className="font-corp-body">
                            <TableCell className="font-medium">{row.employee_name}</TableCell>
                            <TableCell className="text-muted-foreground">{row.position || '—'}</TableCell>
                            <TableCell className="text-right font-corp-mono">{row.hours_worked.toFixed(1)}h</TableCell>
                            <TableCell className="text-right font-corp-mono">{formatCurrency(row.pay_rate)}/hr</TableCell>
                            <TableCell className="text-right font-corp-mono font-bold text-success">{formatCurrency(row.total_pay)}</TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handlePrintReceipt(row)}
                                disabled={receiptLoading === row.employee_id}
                                className="text-primary"
                              >
                                {receiptLoading === row.employee_id ? (
                                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                ) : null}
                                Print Receipt
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Employee Management */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="font-corp-display flex items-center gap-2">
                  <User className="w-6 h-6" />
                  Employee Management
                </CardTitle>
                <Button size="sm" onClick={handleOpenAddEmployee} className="gap-2">
                  <UserPlus className="w-4 h-4" />
                  <span className="font-corp-body">Add Employee</span>
                </Button>
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
                              <Button size="sm" variant="outline" onClick={() => {
                                const newRate = prompt(`New pay rate for ${emp.full_name} (current: ${emp.pay_rate}):`);
                                if (newRate !== null && !isNaN(parseFloat(newRate))) {
                                  handlePayRateChange(emp.id, parseFloat(newRate));
                                }
                              }}>
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

            {/* Branch Attendance Log */}
            <Card>
              <CardHeader>
                <CardTitle className="font-corp-display flex items-center gap-2">
                  <Clock className="w-6 h-6" />
                  Branch Attendance Log
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : branchAttendance.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8 font-corp-body">No attendance records in this period</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="font-corp-body">
                          <TableHead>Employee</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Clock In</TableHead>
                          <TableHead>Clock Out</TableHead>
                          <TableHead>Hours</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {branchAttendance.map((att) => {
                          const emp = employees.find(e => e.id === att.employee_id);
                          return (
                            <TableRow key={att.id} className="font-corp-body">
                              <TableCell className="font-medium">{emp?.full_name ?? 'Unknown'}</TableCell>
                              <TableCell className="font-corp-mono">{formatDate(att.date)}</TableCell>
                              <TableCell className="font-corp-mono">{formatTime(att.clock_in)}</TableCell>
                              <TableCell className="font-corp-mono">{formatTime(att.clock_out)}</TableCell>
                              <TableCell className="font-corp-mono">{getHoursWorkedDisplay(att.hours_worked)}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={STATUS_COLORS[att.status] || 'bg-muted-foreground/50 text-muted-foreground'}>
                                  {att.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* Add Employee Dialog */}
        <Dialog open={addEmployeeOpen} onOpenChange={setAddEmployeeOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="font-corp-display">
                {createdEmployee ? 'Employee Created' : 'Add Employee'}
              </DialogTitle>
              <DialogDescription className="font-corp-body">
                {createdEmployee
                  ? 'Share these credentials with the new employee — they will not be shown again.'
                  : 'Creates a login account and kiosk employee number for this branch.'}
              </DialogDescription>
            </DialogHeader>
            {createdEmployee ? (
              <div className="space-y-3">
                <div className="space-y-2 rounded-lg border p-4 font-corp-mono text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span>{createdEmployee.full_name}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span>{createdEmployee.email}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Password</span><span>{createdEmployee.default_password}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Kiosk PIN</span><span>{createdEmployee.default_pin}</span></div>
                </div>
                <Button className="w-full" onClick={() => setAddEmployeeOpen(false)}>
                  Done
                </Button>
              </div>
            ) : (
              <form onSubmit={handleCreateEmployee} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground font-corp-body">Full Name</label>
                  <Input
                    value={newEmployeeForm.full_name}
                    onChange={e => setNewEmployeeForm({ ...newEmployeeForm, full_name: e.target.value })}
                    placeholder="Juan Dela Cruz"
                    className="font-corp-body"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground font-corp-body">Role</label>
                  <Select value={newEmployeeForm.role} onValueChange={v => setNewEmployeeForm({ ...newEmployeeForm, role: v as 'employee' | 'manager' })}>
                    <SelectTrigger className="font-corp-body">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="employee">Employee</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground font-corp-body">Position (optional)</label>
                  <Input
                    value={newEmployeeForm.position}
                    onChange={e => setNewEmployeeForm({ ...newEmployeeForm, position: e.target.value })}
                    placeholder="e.g. Barista, Line Cook"
                    className="font-corp-body"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground font-corp-body">Pay Rate (optional)</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newEmployeeForm.pay_rate}
                    onChange={e => setNewEmployeeForm({ ...newEmployeeForm, pay_rate: e.target.value })}
                    placeholder="Hourly rate"
                    className="font-corp-body font-corp-mono"
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => setAddEmployeeOpen(false)} className="flex-1">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={addEmployeeSubmitting} className="flex-1">
                    {addEmployeeSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Create
                  </Button>
                </div>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}