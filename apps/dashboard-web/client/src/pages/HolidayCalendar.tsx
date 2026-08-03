import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { CalendarDays, Plus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  ApiHoliday,
  ApiPayrollAuditLogEntry,
  fetchHolidays,
  createHoliday,
  deleteHoliday,
  fetchPayrollAuditLog,
} from '@/lib/api';

const HOLIDAY_TYPE_LABEL: Record<ApiHoliday['holiday_type'], string> = {
  regular_holiday: 'Regular Holiday',
  special_non_working: 'Special Non-Working',
  special_working: 'Special Working',
};

const HOLIDAY_TYPE_BADGE: Record<ApiHoliday['holiday_type'], string> = {
  regular_holiday: 'bg-primary text-primary-foreground',
  special_non_working: 'bg-warning-bg text-warning',
  special_working: 'bg-muted-foreground/50 text-muted-foreground',
};

export default function HolidayCalendar() {
  const { user } = useAuth();
  const isExecutive = user?.role === 'executive';
  const [year, setYear] = useState(new Date().getFullYear());
  const [holidays, setHolidays] = useState<ApiHoliday[]>([]);
  const [auditLog, setAuditLog] = useState<ApiPayrollAuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('upcoming');

  const [newHoliday, setNewHoliday] = useState({
    holiday_date: '',
    name: '',
    holiday_type: 'regular_holiday' as ApiHoliday['holiday_type'],
  });

  const loadHolidays = async () => {
    setLoading(true);
    try {
      const data = await fetchHolidays(year);
      setHolidays(data.sort((a, b) => a.holiday_date.localeCompare(b.holiday_date)));
    } catch {
      toast.error('Failed to load holiday calendar');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHolidays();
  }, [year]);

  useEffect(() => {
    if (activeTab !== 'audit') return;
    fetchPayrollAuditLog({ entityType: 'holiday', limit: 100 })
      .then(setAuditLog)
      .catch(() => toast.error('Failed to load audit log'));
  }, [activeTab]);

  const handleCreate = async () => {
    if (!newHoliday.holiday_date || !newHoliday.name) {
      toast.error('Please fill in the date and name');
      return;
    }
    try {
      await createHoliday(newHoliday);
      toast.success('Holiday added');
      setNewHoliday({ holiday_date: '', name: '', holiday_type: 'regular_holiday' });
      loadHolidays();
    } catch {
      toast.error('Failed to add holiday');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteHoliday(id);
      toast.success('Holiday removed');
      loadHolidays();
    } catch {
      toast.error('Failed to remove holiday');
    }
  };

  const today = new Date().toISOString().split('T')[0];
  const upcoming = holidays.filter((h) => h.holiday_date >= today);

  return (
    <DashboardLayout title="Holiday Calendar">
      <div className="p-6 space-y-6">
        <Card>
          <CardContent className="p-4 flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground font-corp-body">Year</label>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger className="w-32 font-corp-body">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[year - 1, year, year + 1].map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isExecutive && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button className="font-corp-display gap-2">
                    <Plus className="w-4 h-4" />
                    Add Holiday
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle className="font-corp-display">Add Holiday</DialogTitle>
                    <DialogDescription>Applies org-wide unless scoped to a branch.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-sm font-medium font-corp-body">Date</label>
                      <Input
                        type="date"
                        value={newHoliday.holiday_date}
                        onChange={(e) => setNewHoliday({ ...newHoliday, holiday_date: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium font-corp-body">Name</label>
                      <Input
                        value={newHoliday.name}
                        onChange={(e) => setNewHoliday({ ...newHoliday, name: e.target.value })}
                        placeholder="e.g. Independence Day"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium font-corp-body">Type</label>
                      <Select
                        value={newHoliday.holiday_type}
                        onValueChange={(v) => setNewHoliday({ ...newHoliday, holiday_type: v as ApiHoliday['holiday_type'] })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(HOLIDAY_TYPE_LABEL) as ApiHoliday['holiday_type'][]).map((t) => (
                            <SelectItem key={t} value={t}>{HOLIDAY_TYPE_LABEL[t]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button onClick={handleCreate} className="w-full font-corp-display">Add Holiday</Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="upcoming" className="font-corp-body">Upcoming</TabsTrigger>
            <TabsTrigger value="table" className="font-corp-body">Table</TabsTrigger>
            <TabsTrigger value="audit" className="font-corp-body">Audit Log</TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming">
            <Card>
              <CardHeader>
                <CardTitle className="font-corp-display flex items-center gap-2">
                  <CalendarDays className="w-5 h-5" />
                  Upcoming Holidays
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                ) : upcoming.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8 font-corp-body">No upcoming holidays for {year}</p>
                ) : (
                  <div className="space-y-2">
                    {upcoming.map((h) => (
                      <div key={h.id} className="flex items-center justify-between p-3 rounded-md border border-border">
                        <div>
                          <p className="font-medium font-corp-body">{h.name}</p>
                          <p className="text-sm text-muted-foreground font-corp-body">{h.holiday_date}{h.branch_scope ? ' — branch-specific' : ''}</p>
                        </div>
                        <Badge className={HOLIDAY_TYPE_BADGE[h.holiday_type]}>{HOLIDAY_TYPE_LABEL[h.holiday_type]}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="table">
            <Card>
              <CardContent className="pt-6">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="font-corp-body">
                        <TableHead>Date</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Scope</TableHead>
                        {isExecutive && <TableHead className="w-20">Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {holidays.map((h) => (
                        <TableRow key={h.id} className="font-corp-body">
                          <TableCell>{h.holiday_date}</TableCell>
                          <TableCell className="font-medium">{h.name}</TableCell>
                          <TableCell><Badge className={HOLIDAY_TYPE_BADGE[h.holiday_type]}>{HOLIDAY_TYPE_LABEL[h.holiday_type]}</Badge></TableCell>
                          <TableCell className="text-muted-foreground">{h.branch_scope ? 'Branch-specific' : 'Org-wide'}</TableCell>
                          {isExecutive && (
                            <TableCell>
                              <Button size="sm" variant="outline" onClick={() => handleDelete(h.id)} className="text-danger gap-1">
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audit">
            <Card>
              <CardHeader>
                <CardTitle className="font-corp-display">Holiday Audit Log</CardTitle>
                <CardDescription>Every add/edit/delete to the holiday calendar, most recent first.</CardDescription>
              </CardHeader>
              <CardContent>
                {auditLog.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8 font-corp-body">No changes recorded yet</p>
                ) : (
                  <div className="space-y-2">
                    {auditLog.map((entry) => (
                      <div key={entry.id} className="p-3 rounded-md border border-border text-sm font-corp-body">
                        <span className="font-medium capitalize">{entry.action}</span> holiday
                        {entry.reason ? ` — ${entry.reason}` : ''}
                        <span className="text-muted-foreground"> · {new Date(entry.created_at).toLocaleString()}</span>
                      </div>
                    ))}
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
