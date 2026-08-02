import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Loader2, Zap, Droplets, Flame, Calculator, Calendar, Clock, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';
import { BRANCH_CONFIG } from '@/lib/types';
import {
  ApiUtilityLog,
  ApiUtilitySummary,
  UtilityType,
  createUtilityLog,
  fetchUtilityLogs,
  fetchUtilitySummary,
} from '@/lib/api';

const UTILITY_TYPES: { value: UtilityType; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'electricity', label: 'Electricity', icon: <Zap className="w-4 h-4" />, color: 'bg-warning-bg text-warning' },
  { value: 'water', label: 'Water', icon: <Droplets className="w-4 h-4" />, color: 'bg-accent-soft text-accent-foreground' },
  { value: 'gas', label: 'Gas', icon: <Flame className="w-4 h-4" />, color: 'bg-error-bg text-destructive' },
];

const GAS_UNIT_OPTIONS = ['kg', 'tank', 'L'];

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
}

export default function UtilityLog() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<ApiUtilityLog[]>([]);
  const [summary, setSummary] = useState<ApiUtilitySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<UtilityType>('electricity');
  const [editingLog, setEditingLog] = useState<ApiUtilityLog | null>(null);
  const [periodStart, setPeriodStart] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [periodEnd, setPeriodEnd] = useState(() => new Date().toISOString().split('T')[0]);

  const emptyForm = () => ({
    utility_type: 'electricity' as UtilityType,
    business_date: new Date().toISOString().split('T')[0],
    reading_start: '',
    reading_end: '',
    quantity: '',
    unit_label: 'kg',
    days_covered: '1',
    unit_cost: '',
  });

  const [form, setForm] = useState(emptyForm());

  useEffect(() => {
    if (!user?.branchId) return;
    loadData();
  }, [user?.branchId, periodStart, periodEnd]);

  const loadData = async () => {
    if (!user?.branchId) return;
    setLoading(true);
    try {
      const [logData, sumData] = await Promise.all([
        fetchUtilityLogs(user.branchId),
        fetchUtilitySummary(user.branchId, periodStart, periodEnd),
      ]);
      setLogs(logData);
      setSummary(sumData);
    } catch (error) {
      toast.error('Failed to load utility logs');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isGas = form.utility_type === 'gas';
    if (!form.business_date || !form.unit_cost) {
      toast.error('Please fill all fields');
      return;
    }
    if (isGas) {
      if (!form.quantity || !form.unit_label || !form.days_covered) {
        toast.error('Please fill quantity, unit, and days covered');
        return;
      }
    } else {
      if (!form.reading_start || !form.reading_end) {
        toast.error('Please fill all fields');
        return;
      }
      if (parseFloat(form.reading_end) < parseFloat(form.reading_start)) {
        toast.error('End reading cannot be less than start reading');
        return;
      }
    }
    setSubmitting(true);
    try {
      await createUtilityLog({
        branch_id: user.branchId!,
        utility_type: form.utility_type,
        business_date: form.business_date,
        reading_start: isGas ? undefined : parseFloat(form.reading_start),
        reading_end: isGas ? undefined : parseFloat(form.reading_end),
        quantity: isGas ? parseFloat(form.quantity) : undefined,
        unit_label: isGas ? form.unit_label : undefined,
        days_covered: isGas ? parseInt(form.days_covered, 10) : undefined,
        unit_cost: parseFloat(form.unit_cost),
        recorded_by: user.id,
      });
      toast.success('Utility reading recorded');
      setForm(emptyForm());
      setDialogOpen(false);
      setEditingLog(null);
      loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to record utility reading');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (log: ApiUtilityLog) => {
    setEditingLog(log);
    setForm({
      utility_type: log.utility_type,
      business_date: log.business_date,
      reading_start: log.reading_start !== null ? String(log.reading_start) : '',
      reading_end: log.reading_end !== null ? String(log.reading_end) : '',
      quantity: log.quantity !== null ? String(log.quantity) : '',
      unit_label: log.unit_label ?? 'kg',
      days_covered: log.days_covered !== null ? String(log.days_covered) : '1',
      unit_cost: String(log.unit_cost),
    });
    setSelectedType(log.utility_type);
    setDialogOpen(true);
  };

  const handleDelete = async (logId: string) => {
    if (!confirm('Delete this utility reading?')) return;
    try {
      // Note: DELETE endpoint not implemented yet
      toast.error('Delete not implemented yet');
    } catch (error) {
      toast.error('Failed to delete');
    }
  };

  const handleOpenDialog = (type: UtilityType) => {
    setSelectedType(type);
    setEditingLog(null);
    setForm({ ...emptyForm(), utility_type: type });
    setDialogOpen(true);
  };

  const getUtilityType = (type: UtilityType) => UTILITY_TYPES.find(t => t.value === type)!;

  const branchColor = user?.branch ? BRANCH_CONFIG[user.branch as keyof typeof BRANCH_CONFIG]?.color : '#14524B';

  return (
    <DashboardLayout title="Utility Log">
      <div className="p-6 space-y-6">
        {/* Period Selector */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground font-corp-body">Period Start</label>
                <Input
                  type="date"
                  value={periodStart}
                  onChange={e => setPeriodStart(e.target.value)}
                  className="font-corp-body w-48"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground font-corp-body">Period End</label>
                <Input
                  type="date"
                  value={periodEnd}
                  onChange={e => setPeriodEnd(e.target.value)}
                  className="font-corp-body w-48"
                />
              </div>
              <Button variant="outline" onClick={loadData} className="gap-2">
                <RefreshCw className="w-4 h-4" />
                <span className="font-corp-body">Refresh</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="border-l-4" style={{ borderLeftColor: '#C98A2C' }}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground font-corp-body">Electricity Consumption</p>
                    <p className="text-3xl font-corp-mono font-bold text-warning">{summary.electricity.consumption.toFixed(1)} kWh</p>
                    <p className="text-sm text-muted-foreground font-corp-body mt-1">{summary.electricity.readings_count} readings</p>
                  </div>
                  <Zap className="w-12 h-12 text-warning/30" />
                </div>
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm text-muted-foreground font-corp-body">Cost</p>
                  <p className="text-2xl font-corp-mono font-bold text-foreground">{formatCurrency(summary.electricity.cost)}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-l-4" style={{ borderLeftColor: '#14524B' }}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground font-corp-body">Water Consumption</p>
                    <p className="text-3xl font-corp-mono font-bold text-primary">{summary.water.consumption.toFixed(1)} m³</p>
                    <p className="text-sm text-muted-foreground font-corp-body mt-1">{summary.water.readings_count} readings</p>
                  </div>
                  <Droplets className="w-12 h-12 text-primary/30" />
                </div>
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm text-muted-foreground font-corp-body">Cost</p>
                  <p className="text-2xl font-corp-mono font-bold text-foreground">{formatCurrency(summary.water.cost)}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-l-4" style={{ borderLeftColor: '#C1440E' }}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground font-corp-body">Gas Cost</p>
                    <p className="text-3xl font-corp-mono font-bold text-destructive">{formatCurrency(summary.gas?.cost ?? 0)}</p>
                    <p className="text-sm text-muted-foreground font-corp-body mt-1">{summary.gas?.readings_count ?? 0} logs</p>
                  </div>
                  <Flame className="w-12 h-12 text-destructive/30" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-l-4" style={{ borderLeftColor: '#6F6A5C' }}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground font-corp-body">Total Utilities Cost</p>
                    <p className="text-3xl font-corp-mono font-bold text-foreground">{formatCurrency(summary.total_cost)}</p>
                  </div>
                  <Calculator className="w-12 h-12 text-muted-foreground/30" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Action Buttons */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3">
              {UTILITY_TYPES.map((type) => (
                <Button
                  key={type.value}
                  variant="outline"
                  onClick={() => handleOpenDialog(type.value)}
                  className="gap-2"
                >
                  {type.icon}
                  <span className="font-corp-body">Log {type.label}</span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Utility Log Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" className="hidden">Open</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="font-corp-display">{editingLog ? 'Edit' : 'Log'} {getUtilityType(form.utility_type).label} Reading</DialogTitle>
              <DialogDescription className="font-corp-body">
                Record {getUtilityType(form.utility_type).label.toLowerCase()} meter reading for {form.business_date}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground font-corp-body">Utility Type</label>
                <Select value={form.utility_type} onValueChange={v => setForm({ ...form, utility_type: v as UtilityType })} disabled={editingLog}>
                  <SelectTrigger className="font-corp-body">
                    <SelectValue placeholder="Select utility" />
                  </SelectTrigger>
                  <SelectContent>
                    {UTILITY_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.icon}
                        <span className="ml-2">{type.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground font-corp-body">Business Date</label>
                <Input
                  type="date"
                  value={form.business_date}
                  onChange={e => setForm({ ...form, business_date: e.target.value })}
                  className="font-corp-body"
                />
              </div>
              {form.utility_type === 'gas' ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground font-corp-body">Quantity Consumed</label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.quantity}
                        onChange={e => setForm({ ...form, quantity: e.target.value })}
                        placeholder="e.g. 11"
                        className="font-corp-body font-corp-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground font-corp-body">Unit</label>
                      <Select value={form.unit_label} onValueChange={v => setForm({ ...form, unit_label: v })}>
                        <SelectTrigger className="font-corp-body">
                          <SelectValue placeholder="Unit" />
                        </SelectTrigger>
                        <SelectContent>
                          {GAS_UNIT_OPTIONS.map((u) => (
                            <SelectItem key={u} value={u}>{u}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground font-corp-body">Days Covered</label>
                    <Select value={form.days_covered} onValueChange={v => setForm({ ...form, days_covered: v })}>
                      <SelectTrigger className="font-corp-body">
                        <SelectValue placeholder="Days" />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                          <SelectItem key={d} value={String(d)}>{d} day{d > 1 ? 's' : ''}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground font-corp-body">Unit Cost (per {form.unit_label || 'unit'})</label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.unit_cost}
                      onChange={e => setForm({ ...form, unit_cost: e.target.value })}
                      placeholder="e.g. 950"
                      className="font-corp-body font-corp-mono"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground font-corp-body">Start Reading</label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.reading_start}
                        onChange={e => setForm({ ...form, reading_start: e.target.value })}
                        placeholder="Start"
                        className="font-corp-body font-corp-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground font-corp-body">End Reading</label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.reading_end}
                        onChange={e => setForm({ ...form, reading_end: e.target.value })}
                        placeholder="End"
                        className="font-corp-body font-corp-mono"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground font-corp-body">Unit Cost (per kWh/m³)</label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.unit_cost}
                      onChange={e => setForm({ ...form, unit_cost: e.target.value })}
                      placeholder="e.g. 12.50"
                      className="font-corp-body font-corp-mono"
                    />
                  </div>
                </>
              )}
              <div className="flex gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); setEditingLog(null); }} className="flex-1">
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting} className="flex-1">
                  {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  {editingLog ? 'Update' : 'Record'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Utility Logs Table */}
        <Card>
          <CardHeader>
            <CardTitle className="font-corp-display">Recent Readings</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : logs.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 font-corp-body">No utility readings recorded yet</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="font-corp-body">
                      <TableHead className="w-32">Utility</TableHead>
                      <TableHead className="w-40">Date</TableHead>
                      <TableHead className="text-right w-28">Start</TableHead>
                      <TableHead className="text-right w-28">End</TableHead>
                      <TableHead className="text-right w-32">Consumption / Qty-Days</TableHead>
                      <TableHead className="text-right w-28">Unit Cost</TableHead>
                      <TableHead className="text-right w-32">Cost</TableHead>
                      <TableHead className="w-48">Recorded</TableHead>
                      <TableHead className="w-40">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => {
                      const isGas = log.utility_type === 'gas';
                      const consumption = log.reading_end !== null && log.reading_start !== null ? log.reading_end - log.reading_start : null;
                      const cost = isGas
                        ? (log.quantity ?? 0) * log.unit_cost
                        : consumption !== null ? consumption * log.unit_cost : null;
                      const type = getUtilityType(log.utility_type);
                      return (
                        <TableRow key={log.id} className="font-corp-body">
                          <TableCell>
                            <Badge variant="outline" className={type.color}>
                              <div className="flex items-center gap-1">
                                {type.icon}
                                <span>{type.label}</span>
                              </div>
                            </Badge>
                          </TableCell>
                          <TableCell className="font-corp-mono">{formatDate(log.business_date)}</TableCell>
                          <TableCell className="text-right font-corp-mono">{isGas || log.reading_start === null ? <span className="text-muted-foreground">—</span> : log.reading_start.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-corp-mono">{!isGas && log.reading_end !== null ? log.reading_end.toLocaleString() : <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell className="text-right font-corp-mono font-medium">
                            {isGas
                              ? `${log.quantity ?? '—'} ${log.unit_label ?? ''} / ${log.days_covered ?? '—'}d`
                              : consumption !== null ? consumption.toLocaleString() : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-right font-corp-mono">{formatCurrency(log.unit_cost)}</TableCell>
                          <TableCell className="text-right font-corp-mono font-medium text-success">
                            {cost !== null ? formatCurrency(cost) : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-sm">
                            <div className="font-corp-body">{formatDate(log.created_at)}</div>
                            <div className="font-corp-mono text-muted-foreground">{formatTime(log.created_at)}</div>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => handleEdit(log)} className="text-primary">
                                <Clock className="w-3 h-3 mr-1" /> Edit
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => handleDelete(log.id)} className="text-destructive">
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
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
      </div>
    </DashboardLayout>
  );
}