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
import { Plus, AlertCircle, Loader2, Truck, ArrowUpRight, ArrowDownLeft, Package, Send, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';
import { BRANCH_CONFIG } from '@/lib/types';
import {
  ApiIngredient,
  ApiInventoryMovement,
  MovementType,
  createInventoryMovement,
  fetchBranchInventoryMovements,
  fetchInventory,
  fetchBranchLosses,
  ApiLossRecord,
  createTransfer,
  fetchTransfers,
  confirmTransfer,
  rejectTransfer,
  ApiTransfer,
} from '@/lib/api';

const MOVEMENT_TYPES: { value: MovementType; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'trans_in', label: 'Receive Stock', icon: <ArrowDownLeft className="w-4 h-4" />, color: 'bg-success-bg text-success' },
  { value: 'trans_out', label: 'Remove Stock', icon: <ArrowUpRight className="w-4 h-4" />, color: 'bg-error-bg text-destructive' },
  { value: 'delivery', label: 'Delivery', icon: <Truck className="w-4 h-4" />, color: 'bg-warning-bg text-warning' },
  { value: 'transfer_out', label: 'Transfer Out', icon: <Send className="w-4 h-4" />, color: 'bg-accent-soft text-accent-foreground' },
];

const TRANSFER_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-warning-bg text-warning',
  confirmed: 'bg-success-bg text-success',
  rejected: 'bg-error-bg text-destructive',
  cancelled: 'bg-muted-foreground/50 text-muted-foreground',
};

function getMovementColor(type: MovementType) {
  switch (type) {
    case 'trans_in': return 'bg-success-bg text-success';
    case 'trans_out': return 'bg-error-bg text-destructive';
    case 'delivery': return 'bg-warning-bg text-warning';
    case 'transfer_in': return 'bg-accent-soft text-accent-foreground';
    case 'transfer_out': return 'bg-accent-soft text-accent-foreground';
  }
}

function getMovementLabel(type: MovementType) {
  const t = MOVEMENT_TYPES.find(m => m.value === type);
  return t?.label ?? type;
}

function getMovementIcon(type: MovementType) {
  const t = MOVEMENT_TYPES.find(m => m.value === type);
  return t?.icon ?? <Package className="w-4 h-4" />;
}

export default function InventoryMovements() {
  const { user } = useAuth();
  const [ingredients, setIngredients] = useState<ApiIngredient[]>([]);
  const [movements, setMovements] = useState<ApiInventoryMovement[]>([]);
  const [transfers, setTransfers] = useState<ApiTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<MovementType>('trans_in');

  const [form, setForm] = useState({
    ingredientId: '',
    quantity: '',
    reason: '',
  });

  useEffect(() => {
    if (!user?.branchId) return;
    loadData();
  }, [user?.branchId]);

  const loadData = async () => {
    if (!user?.branchId) return;
    setLoading(true);
    try {
      const [inv, mov, trf] = await Promise.all([
        fetchInventory(user.branchId),
        fetchBranchInventoryMovements(user.branchId),
        fetchTransfers(user.branchId),
      ]);
      setIngredients(inv);
      setMovements(mov);
      setTransfers(trf);
    } catch (error) {
      toast.error('Failed to load inventory movements');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.ingredientId || !form.quantity) {
      toast.error('Please select an ingredient and enter quantity');
      return;
    }
    setSubmitting(true);
    try {
      await createInventoryMovement({
        branch_id: user.branchId!,
        ingredient_id: form.ingredientId,
        type: selectedType,
        quantity: parseFloat(form.quantity),
        reason: form.reason || undefined,
        employee_id: user.id,
      });
      toast.success('Movement recorded');
      setForm({ ingredientId: '', quantity: '', reason: '' });
      setDialogOpen(false);
      loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to record movement');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenDialog = (type: MovementType) => {
    setSelectedType(type);
    setForm({ ingredientId: '', quantity: '', reason: '' });
    setDialogOpen(true);
  };

  const handleConfirmTransfer = async (transferId: string) => {
    try {
      await confirmTransfer(transferId);
      toast.success('Transfer confirmed');
      loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to confirm transfer');
    }
  };

  const handleRejectTransfer = async (transferId: string) => {
    if (!confirm('Reject this transfer? Stock will be returned to source branch.')) return;
    try {
      await rejectTransfer(transferId);
      toast.success('Transfer rejected, stock returned');
      loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to reject transfer');
    }
  };

  const branchColor = user?.branch ? BRANCH_CONFIG[user.branch as keyof typeof BRANCH_CONFIG]?.color : '#14524B';

  return (
    <DashboardLayout title="Inventory Movements">
      <div className="p-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-l-4" style={{ borderLeftColor: '#1E7A4C' }}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground font-corp-body">Trans In</p>
                  <p className="text-2xl font-corp-mono font-bold text-success">
                    {movements.filter(m => m.type === 'trans_in').reduce((sum, m) => sum + m.quantity, 0)}
                  </p>
                </div>
                <ArrowDownLeft className="w-8 h-8 text-success/30" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4" style={{ borderLeftColor: '#B23A2E' }}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground font-corp-body">Trans Out</p>
                  <p className="text-2xl font-corp-mono font-bold text-destructive">
                    {movements.filter(m => m.type === 'trans_out').reduce((sum, m) => sum + m.quantity, 0)}
                  </p>
                </div>
                <ArrowUpRight className="w-8 h-8 text-destructive/30" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4" style={{ borderLeftColor: '#C98A2C' }}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground font-corp-body">Deliveries</p>
                  <p className="text-2xl font-corp-mono font-bold text-warning">
                    {movements.filter(m => m.type === 'delivery').reduce((sum, m) => sum + m.quantity, 0)}
                  </p>
                </div>
                <Truck className="w-8 h-8 text-warning/30" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4" style={{ borderLeftColor: '#14524B' }}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground font-corp-body">Transfers Out</p>
                  <p className="text-2xl font-corp-mono font-bold text-primary">
                    {transfers.filter(t => t.status === 'pending').length}
                  </p>
                </div>
                <Send className="w-8 h-8 text-primary/30" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Action Buttons */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3">
              {MOVEMENT_TYPES.map((type) => (
                <Button
                  key={type.value}
                  variant="outline"
                  onClick={() => handleOpenDialog(type.value)}
                  className="gap-2"
                >
                  {type.icon}
                  <span className="font-corp-body">{type.label}</span>
                </Button>
              ))}
              <Button
                variant="outline"
                onClick={loadData}
                className="gap-2 ml-auto"
              >
                <RefreshCw className="w-4 h-4" />
                <span className="font-corp-body">Refresh</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Movement Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" className="hidden">Open</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="font-corp-display">{getMovementLabel(selectedType)}</DialogTitle>
              <DialogDescription className="font-corp-body">
                Record a {getMovementLabel(selectedType).toLowerCase()} for an ingredient
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground font-corp-body">Ingredient</label>
                <Select value={form.ingredientId} onValueChange={v => setForm({ ...form, ingredientId: v })}>
                  <SelectTrigger className="font-corp-body">
                    <SelectValue placeholder="Select ingredient" />
                  </SelectTrigger>
                  <SelectContent>
                    {ingredients.map((ing) => (
                      <SelectItem key={ing.id} value={ing.id}>
                        {ing.name} ({ing.current_stock} {ing.unit})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground font-corp-body">Quantity</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={form.quantity}
                  onChange={e => setForm({ ...form, quantity: e.target.value })}
                  placeholder="Enter quantity"
                  className="font-corp-body font-corp-mono"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground font-corp-body">Reason (optional)</label>
                <Input
                  value={form.reason}
                  onChange={e => setForm({ ...form, reason: e.target.value })}
                  placeholder="Supplier, transfer note, etc."
                  className="font-corp-body"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting} className="flex-1">
                  {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Record {getMovementLabel(selectedType)}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Recent Movements Table */}
        <Card>
          <CardHeader>
            <CardTitle className="font-corp-display">Recent Movements</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : movements.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 font-corp-body">No movements recorded yet</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="font-corp-body">
                      <TableHead className="w-32">Type</TableHead>
                      <TableHead>Ingredient</TableHead>
                      <TableHead className="text-right w-24">Qty</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead className="w-40">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.slice(0, 50).map((mov) => {
                      const ingredient = ingredients.find(i => i.id === mov.ingredient_id);
                      return (
                        <TableRow key={mov.id} className="font-corp-body">
                          <TableCell>
                            <Badge className={getMovementColor(mov.type)} variant="outline">
                              <div className="flex items-center gap-1">
                                {getMovementIcon(mov.type)}
                                <span>{getMovementLabel(mov.type)}</span>
                              </div>
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">{ingredient?.name ?? 'Unknown'}</TableCell>
                          <TableCell className="text-right font-corp-mono">
                            {mov.type.startsWith('trans_out') || mov.type === 'transfer_out' ? '-' : '+'}{mov.quantity}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">{mov.reason ?? '—'}</TableCell>
                          <TableCell className="text-sm font-corp-mono">{new Date(mov.created_at).toLocaleString()}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pending Transfers */}
        {transfers.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="font-corp-display">Incoming Transfers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="font-corp-body">
                      <TableHead>From Branch</TableHead>
                      <TableHead>Ingredient</TableHead>
                      <TableHead className="text-right w-24">Qty</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-40">Initiated</TableHead>
                      <TableHead className="w-40">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transfers
                      .filter(t => t.to_branch_id === user.branchId && t.status === 'pending')
                      .map((t) => (
                        <TableRow key={t.id} className="font-corp-body">
                          <TableCell>{BRANCH_CONFIG[t.from_branch_id as keyof typeof BRANCH_CONFIG]?.name ?? t.from_branch_id}</TableCell>
                          <TableCell>{t.ingredient_id}</TableCell>
                          <TableCell className="text-right font-corp-mono">{t.quantity}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={TRANSFER_STATUS_COLORS[t.status]}>
                              {t.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm font-corp-mono">{new Date(t.initiated_at).toLocaleString()}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button size="sm" variant="default" onClick={() => handleConfirmTransfer(t.id)} className="text-success">
                                <RefreshCw className="w-3 h-3 mr-1" /> Receive
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => handleRejectTransfer(t.id)} className="text-destructive">
                                <AlertCircle className="w-3 h-3 mr-1" /> Reject
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}