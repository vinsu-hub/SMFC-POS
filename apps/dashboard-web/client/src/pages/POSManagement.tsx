import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Percent } from 'lucide-react';
import { toast } from 'sonner';
import {
  ApiDiscountType,
  ApiBranch,
  fetchDiscountTypes,
  createDiscountType,
  updateDiscountType,
  fetchBranches,
} from '@/lib/api';
import { BRANCH_CONFIG } from '@/lib/types';

export default function POSManagement() {
  const { user } = useAuth();
  const [branches, setBranches] = useState<ApiBranch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [discountTypes, setDiscountTypes] = useState<ApiDiscountType[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: '', percentage: '', vat_exempt: false });
  const [savingId, setSavingId] = useState<string | null>(null);

  // Managers act on their own branch; executives have no fixed branch, so
  // they pick one from the same real-location allow-list used elsewhere.
  const isExecutive = user?.role === 'executive';

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

  const loadData = () => {
    if (!activeBranchId) return;
    setLoading(true);
    fetchDiscountTypes(activeBranchId)
      .then(setDiscountTypes)
      .catch(() => toast.error('Could not load discount types'))
      .finally(() => setLoading(false));
  };

  useEffect(loadData, [activeBranchId]);

  if (!user || (user.role !== 'manager' && user.role !== 'executive')) {
    return (
      <DashboardLayout>
        <div className="p-6 text-center">
          <p className="text-destructive">Access denied. This page is for managers and executives only.</p>
        </div>
      </DashboardLayout>
    );
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBranchId) return;
    if (!form.name.trim() || !form.percentage) {
      toast.error('Enter a name and percentage');
      return;
    }
    setSubmitting(true);
    try {
      await createDiscountType({
        branch_id: activeBranchId,
        name: form.name.trim(),
        percentage: parseFloat(form.percentage),
        vat_exempt: form.vat_exempt,
      });
      toast.success('Discount type created');
      setForm({ name: '', percentage: '', vat_exempt: false });
      setDialogOpen(false);
      loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create discount type');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePercentageBlur = async (discount: ApiDiscountType, value: string) => {
    const pct = parseFloat(value);
    if (isNaN(pct) || pct === discount.percentage) return;
    setSavingId(discount.id);
    try {
      const updated = await updateDiscountType(discount.id, { percentage: pct });
      setDiscountTypes((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      toast.success(`${discount.name} updated`);
    } catch (error) {
      toast.error('Failed to update percentage');
    } finally {
      setSavingId(null);
    }
  };

  const handleToggle = async (discount: ApiDiscountType, field: 'vat_exempt' | 'active', value: boolean) => {
    setSavingId(discount.id);
    try {
      const updated = await updateDiscountType(discount.id, { [field]: value });
      setDiscountTypes((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
    } catch (error) {
      toast.error('Failed to update discount type');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <DashboardLayout title="POS Management">
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
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle className="font-corp-display flex items-center gap-2">
                <Percent className="w-6 h-6" />
                Discount Types
              </CardTitle>
              <CardDescription>
                Configured discounts available as buttons on the POS Terminal checkout screen
              </CardDescription>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2">
                  <Plus className="w-4 h-4" />
                  <span className="font-corp-body">Add Discount Type</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="font-corp-display">Add Discount Type</DialogTitle>
                  <DialogDescription className="font-corp-body">
                    Creates a new discount button on the POS checkout screen for this branch.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground font-corp-body">Name</label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="e.g. Student Discount"
                      className="font-corp-body"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground font-corp-body">Percentage</label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={form.percentage}
                      onChange={(e) => setForm({ ...form, percentage: e.target.value })}
                      placeholder="e.g. 10"
                      className="font-corp-body font-corp-mono"
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-corp-body font-medium text-foreground text-sm">VAT Exempt</p>
                      <p className="text-xs text-muted-foreground">Senior Citizen / PWD discounts are VAT-exempt by PH law</p>
                    </div>
                    <Switch
                      checked={form.vat_exempt}
                      onCheckedChange={(checked) => setForm({ ...form, vat_exempt: checked })}
                    />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
                      Cancel
                    </Button>
                    <Button type="submit" disabled={submitting} className="flex-1">
                      {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                      Create
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : discountTypes.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 font-corp-body">No discount types configured yet</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="font-corp-body">
                    <TableHead>Name</TableHead>
                    <TableHead className="w-32">Percentage</TableHead>
                    <TableHead className="w-32">VAT Exempt</TableHead>
                    <TableHead className="w-24">Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {discountTypes.map((d) => (
                    <TableRow key={d.id} className="font-corp-body">
                      <TableCell className="font-medium">
                        {d.name}
                        {savingId === d.id && <Loader2 className="w-3 h-3 ml-2 inline animate-spin" />}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            defaultValue={d.percentage}
                            onBlur={(e) => handlePercentageBlur(d, e.target.value)}
                            className="font-corp-mono w-20"
                          />
                          <span className="text-muted-foreground text-sm">%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={d.vat_exempt}
                          onCheckedChange={(checked) => handleToggle(d, 'vat_exempt', checked)}
                        />
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={d.active}
                          onCheckedChange={(checked) => handleToggle(d, 'active', checked)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
