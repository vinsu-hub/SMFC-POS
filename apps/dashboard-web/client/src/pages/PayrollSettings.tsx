import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, Loader2, Save, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { BRANCH_CONFIG } from '@/lib/types';
import {
  ApiPayMultiplierRule,
  ApiBranch,
  PayMultiplierScenario,
  fetchPayMultiplierRules,
  updatePayMultiplierRule,
  fetchPayrollSettings,
  updatePayrollSettings,
  fetchBranches,
  fetchEmployees,
  updateEmployee,
  uploadHrSignature,
  getHrSignatureUrl,
} from '@/lib/api';

const SCENARIO_LABEL: Record<PayMultiplierScenario, string> = {
  regular_day: 'Regular Day',
  regular_holiday: 'Regular Holiday',
  regular_holiday_rest_day: 'Regular Holiday + Rest Day',
  special_non_working: 'Special Non-Working Day',
  special_non_working_rest_day: 'Special Non-Working + Rest Day',
  special_working: 'Special Working Day',
  rest_day: 'Rest Day',
};

export default function PayrollSettings() {
  const { user } = useAuth();
  const isExecutive = user?.role === 'executive';
  const [rules, setRules] = useState<ApiPayMultiplierRule[]>([]);
  const [engineEnabled, setEngineEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingScenario, setSavingScenario] = useState<string | null>(null);
  const [togglingEngine, setTogglingEngine] = useState(false);

  const [branches, setBranches] = useState<ApiBranch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [rateEdits, setRateEdits] = useState<Record<string, string>>({});
  const [savingEmployee, setSavingEmployee] = useState<string | null>(null);

  const [signatoryName, setSignatoryName] = useState('');
  const [signaturePath, setSignaturePath] = useState<string | null>(null);
  const [signaturePreviewUrl, setSignaturePreviewUrl] = useState<string | null>(null);
  const [savingSignatory, setSavingSignatory] = useState(false);
  const [uploadingSignature, setUploadingSignature] = useState(false);

  const activeBranchId = isExecutive ? selectedBranchId : user?.branchId ?? null;

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

  const loadEmployees = async () => {
    if (!activeBranchId) return;
    setEmployeesLoading(true);
    try {
      setEmployees(await fetchEmployees(activeBranchId));
    } catch {
      toast.error('Failed to load employees');
    } finally {
      setEmployeesLoading(false);
    }
  };

  useEffect(() => {
    loadEmployees();
  }, [activeBranchId]);

  const handleSaveRate = async (employeeId: string) => {
    const value = rateEdits[employeeId];
    if (value === undefined || isNaN(parseFloat(value))) {
      toast.error('Enter a valid pay rate');
      return;
    }
    setSavingEmployee(employeeId);
    try {
      await updateEmployee(employeeId, { pay_rate: parseFloat(value) });
      toast.success('Pay rate updated');
      loadEmployees();
    } catch {
      toast.error('Failed to update pay rate');
    } finally {
      setSavingEmployee(null);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [rulesData, settingsData] = await Promise.all([fetchPayMultiplierRules(), fetchPayrollSettings()]);
      setRules(rulesData);
      setEngineEnabled(settingsData.engine_enabled);
      setSignatoryName(settingsData.hr_signatory_name ?? '');
      setSignaturePath(settingsData.hr_signature_path ?? null);
      if (settingsData.hr_signature_path) {
        getHrSignatureUrl(settingsData.hr_signature_path).then(setSignaturePreviewUrl);
      }
    } catch {
      toast.error('Failed to load payroll settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRuleFieldChange = (scenarioKey: string, field: keyof ApiPayMultiplierRule, value: string) => {
    setRules((prev) =>
      prev.map((r) => (r.scenario_key === scenarioKey ? { ...r, [field]: Number(value) } : r))
    );
  };

  const handleSaveRule = async (rule: ApiPayMultiplierRule) => {
    setSavingScenario(rule.scenario_key);
    try {
      await updatePayMultiplierRule(rule.scenario_key, {
        not_worked_pct: rule.not_worked_pct,
        first_8hr_pct: rule.first_8hr_pct,
        ot_addon_pct: rule.ot_addon_pct,
        night_diff_addon_pct: rule.night_diff_addon_pct,
      });
      toast.success(`${SCENARIO_LABEL[rule.scenario_key]} rate saved`);
    } catch {
      toast.error('Failed to save rate');
    } finally {
      setSavingScenario(null);
    }
  };

  const handleToggleEngine = async (checked: boolean) => {
    setTogglingEngine(true);
    try {
      await updatePayrollSettings({ engine_enabled: checked });
      setEngineEnabled(checked);
      toast.success(checked ? 'Holiday-pay multiplier engine enabled' : 'Holiday-pay multiplier engine disabled');
    } catch {
      toast.error('Failed to update engine setting');
    } finally {
      setTogglingEngine(false);
    }
  };

  const handleSaveSignatoryName = async () => {
    setSavingSignatory(true);
    try {
      await updatePayrollSettings({ hr_signatory_name: signatoryName.trim() || null });
      toast.success('HR signatory name saved');
    } catch {
      toast.error('Failed to save signatory name');
    } finally {
      setSavingSignatory(false);
    }
  };

  const handleUploadSignature = async (file: File) => {
    setUploadingSignature(true);
    try {
      const path = await uploadHrSignature(file);
      await updatePayrollSettings({ hr_signature_path: path });
      setSignaturePath(path);
      setSignaturePreviewUrl(await getHrSignatureUrl(path));
      toast.success('E-signature uploaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload signature');
    } finally {
      setUploadingSignature(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout title="Payroll Settings">
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Payroll Settings">
      <div className="p-6 space-y-6">
        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="general" className="font-corp-body">General</TabsTrigger>
            <TabsTrigger value="multiplier" className="font-corp-body">Multiplier Rules</TabsTrigger>
            <TabsTrigger value="approval" className="font-corp-body">Approval Workflow</TabsTrigger>
            <TabsTrigger value="payslip" className="font-corp-body">Payslip Layout</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-6">
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
                          <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="font-corp-display">Employee Pay Rates</CardTitle>
                <CardDescription>Hourly rate used as the base for both the flat calculation and the multiplier engine.</CardDescription>
              </CardHeader>
              <CardContent>
                {employeesLoading ? (
                  <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="font-corp-body">
                          <TableHead>Name</TableHead>
                          <TableHead>Position</TableHead>
                          <TableHead className="text-right">Pay Rate</TableHead>
                          <TableHead className="w-24">Save</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {employees.map((emp) => (
                          <TableRow key={emp.id} className="font-corp-body">
                            <TableCell className="font-medium">{emp.full_name}</TableCell>
                            <TableCell className="text-muted-foreground">{emp.position || '—'}</TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                value={rateEdits[emp.id] ?? emp.pay_rate}
                                onChange={(e) => setRateEdits({ ...rateEdits, [emp.id]: e.target.value })}
                                className="w-28 text-right ml-auto font-corp-mono"
                              />
                            </TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleSaveRate(emp.id)}
                                disabled={savingEmployee === emp.id}
                                className="gap-1"
                              >
                                {savingEmployee === emp.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
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

            <Card>
              <CardHeader>
                <CardTitle className="font-corp-display">Holiday-Pay Multiplier Engine</CardTitle>
                <CardDescription>
                  Production-wide switch — this shared database has no separate dev/prod environment,
                  so flipping this changes real payroll math for every branch immediately.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between p-4 rounded-md border border-border">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium font-corp-body">Enable engine</p>
                      <p className="text-sm text-muted-foreground font-corp-body">
                        When off, payroll uses flat hours × rate (today's behavior). When on, holiday/overtime/
                        night-differential multipliers below apply.
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={engineEnabled}
                    onCheckedChange={handleToggleEngine}
                    disabled={!isExecutive || togglingEngine}
                  />
                </div>
                {!isExecutive && (
                  <p className="text-sm text-muted-foreground font-corp-body mt-3">Executive access required to change this.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="multiplier">
            <Card>
              <CardHeader>
                <CardTitle className="font-corp-display">Pay Multiplier Rules</CardTitle>
                <CardDescription>Per DOLE Labor Advisory 12-25. Percentages apply against the employee's hourly rate.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="font-corp-body">
                        <TableHead>Scenario</TableHead>
                        <TableHead className="text-right">Not Worked %</TableHead>
                        <TableHead className="text-right">First 8h %</TableHead>
                        <TableHead className="text-right">OT Addon %</TableHead>
                        <TableHead className="text-right">Night Diff Addon %</TableHead>
                        {isExecutive && <TableHead className="w-24">Save</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rules.map((rule) => (
                        <TableRow key={rule.scenario_key} className="font-corp-body">
                          <TableCell className="font-medium">{SCENARIO_LABEL[rule.scenario_key]}</TableCell>
                          {(['not_worked_pct', 'first_8hr_pct', 'ot_addon_pct', 'night_diff_addon_pct'] as const).map((field) => (
                            <TableCell key={field} className="text-right">
                              <Input
                                type="number"
                                value={rule[field]}
                                onChange={(e) => handleRuleFieldChange(rule.scenario_key, field, e.target.value)}
                                disabled={!isExecutive}
                                className="w-24 text-right ml-auto font-corp-mono"
                              />
                            </TableCell>
                          ))}
                          {isExecutive && (
                            <TableCell>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleSaveRule(rule)}
                                disabled={savingScenario === rule.scenario_key}
                                className="gap-1"
                              >
                                {savingScenario === rule.scenario_key ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
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

          <TabsContent value="approval">
            <Card>
              <CardHeader>
                <CardTitle className="font-corp-display">Approval Workflow</CardTitle>
                <CardDescription>Who must approve an attendance override before it affects payroll.</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-corp-body text-muted-foreground">
                  Any manager or executive can create an override (reason required). Only an executive can approve
                  one — an approved override is the only way a payroll amount changes from what attendance/holiday
                  data would otherwise compute. There is no separate multi-step approval chain configured yet.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payslip" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="font-corp-display">Payslip Layout</CardTitle>
                <CardDescription>Which breakdown rows print on generated payslips.</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-corp-body text-muted-foreground">
                  Overtime, night differential, and holiday premium rows print automatically whenever an employee
                  has a non-zero value in that category for the period — no separate toggle needed. Amounts print
                  as "PHP" rather than the ₱ symbol (no Unicode font is embedded in the payslip PDF yet).
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-corp-display">HR Approving Signatory</CardTitle>
                <CardDescription>
                  Name and e-signature printed in the "Approved By" block of every generated payslip.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2 max-w-sm">
                  <label className="text-sm font-medium text-foreground font-corp-body">Approving HR Name</label>
                  <div className="flex gap-2">
                    <Input
                      value={signatoryName}
                      onChange={(e) => setSignatoryName(e.target.value)}
                      placeholder="e.g. Juan Dela Cruz"
                      disabled={!isExecutive}
                      className="font-corp-body"
                    />
                    {isExecutive && (
                      <Button onClick={handleSaveSignatoryName} disabled={savingSignatory} size="sm">
                        {savingSignatory ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      </Button>
                    )}
                  </div>
                  {!isExecutive && (
                    <p className="text-xs text-muted-foreground font-corp-body">Executive access required to edit.</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground font-corp-body">E-Signature Image</label>
                  <div className="flex items-center gap-4">
                    {signaturePreviewUrl ? (
                      <img
                        src={signaturePreviewUrl}
                        alt="HR signatory e-signature"
                        className="h-16 border border-border rounded-md bg-white px-2 object-contain"
                      />
                    ) : (
                      <div className="h-16 w-40 border border-dashed border-border rounded-md flex items-center justify-center text-xs text-muted-foreground font-corp-body">
                        No signature uploaded
                      </div>
                    )}
                    {isExecutive && (
                      <div>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          id="hr-signature-upload"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleUploadSignature(file);
                            e.target.value = '';
                          }}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={uploadingSignature}
                          onClick={() => document.getElementById('hr-signature-upload')?.click()}
                        >
                          {uploadingSignature ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Upload className="w-4 h-4 mr-2" />
                          )}
                          {signaturePath ? 'Replace Signature' : 'Upload Signature'}
                        </Button>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground font-corp-body">
                    PNG, JPEG, or WEBP, up to 2MB. A transparent-background PNG looks best on the printed payslip.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
