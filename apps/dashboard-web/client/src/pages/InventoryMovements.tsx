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
import { Plus, AlertCircle, Loader2, Truck, ArrowUpRight, ArrowDownLeft, Package, Send, RefreshCw, PackagePlus, CheckCircle2, ClipboardCheck, TrendingUp, TrendingDown } from 'lucide-react';
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
  fetchBranches,
  ApiBranch,
  createStockRequest,
  fetchStockRequests,
  fulfillStockRequest,
  declineStockRequest,
  ApiStockRequest,
} from '@/lib/api';

// The manual "create movement" dialog's type picker — same-branch, instant,
// final actions only. Deliberately excludes transfer_out (cross-branch,
// needs the other branch to confirm -- has its own dedicated dialog, see
// "Send Stock" below), transfer_in (only ever produced by confirming a
// transfer), and count_adjustment (only ever produced by Count Stock).
const MOVEMENT_TYPES: { value: MovementType; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'trans_in', label: 'Receive Stock', icon: <ArrowDownLeft className="w-4 h-4" />, color: 'bg-success-bg text-success' },
  { value: 'trans_out', label: 'Remove Stock', icon: <ArrowUpRight className="w-4 h-4" />, color: 'bg-error-bg text-destructive' },
  { value: 'delivery', label: 'Delivery', icon: <Truck className="w-4 h-4" />, color: 'bg-warning-bg text-warning' },
];

// Full display config for every movement type, used by Recent Movements —
// a superset of MOVEMENT_TYPES since it also needs to render transfer_in
// and count_adjustment rows, which never appear in the create dialog.
const MOVEMENT_DISPLAY: Record<MovementType, { label: string; icon: React.ReactNode; color: string }> = {
  trans_in: { label: 'Receive Stock', icon: <ArrowDownLeft className="w-4 h-4" />, color: 'bg-success-bg text-success' },
  trans_out: { label: 'Remove Stock', icon: <ArrowUpRight className="w-4 h-4" />, color: 'bg-error-bg text-destructive' },
  delivery: { label: 'Delivery', icon: <Truck className="w-4 h-4" />, color: 'bg-warning-bg text-warning' },
  transfer_in: { label: 'Transfer In', icon: <ArrowDownLeft className="w-4 h-4" />, color: 'bg-accent-soft text-accent-foreground' },
  transfer_out: { label: 'Transfer Out', icon: <Send className="w-4 h-4" />, color: 'bg-accent-soft text-accent-foreground' },
  count_adjustment: { label: 'Stock Count Adjustment', icon: <ClipboardCheck className="w-4 h-4" />, color: 'bg-accent-soft text-accent-foreground' },
};

const TRANSFER_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-warning-bg text-warning',
  confirmed: 'bg-success-bg text-success',
  rejected: 'bg-error-bg text-destructive',
  cancelled: 'bg-muted-foreground/50 text-muted-foreground',
};

function getMovementColor(movement: ApiInventoryMovement) {
  if (movement.type === 'count_adjustment' && movement.variance !== null) {
    return movement.variance > 0 ? 'bg-warning-bg text-warning' : 'bg-error-bg text-destructive';
  }
  return MOVEMENT_DISPLAY[movement.type]?.color ?? 'bg-accent-soft text-accent-foreground';
}

function getMovementLabel(type: MovementType) {
  return MOVEMENT_DISPLAY[type]?.label ?? type;
}

function getMovementIcon(movement: ApiInventoryMovement) {
  if (movement.type === 'count_adjustment' && movement.variance !== null) {
    return movement.variance > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />;
  }
  return MOVEMENT_DISPLAY[movement.type]?.icon ?? <Package className="w-4 h-4" />;
}

export default function InventoryMovements() {
  const { user } = useAuth();
  const [ingredients, setIngredients] = useState<ApiIngredient[]>([]);
  const [movements, setMovements] = useState<ApiInventoryMovement[]>([]);
  const [transfers, setTransfers] = useState<ApiTransfer[]>([]);
  const [branches, setBranches] = useState<ApiBranch[]>([]);
  const [stockRequests, setStockRequests] = useState<ApiStockRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<MovementType>('trans_in');

  const [form, setForm] = useState({
    ingredientId: '',
    quantity: '',
    reason: '',
    unitCost: '',
  });

  // Send Stock dialog - own dialog rather than folded into the generic
  // movement dialog, since it's cross-branch (needs the other branch to
  // confirm) unlike Receive/Remove/Delivery, which are same-branch and final.
  const [sendStockDialogOpen, setSendStockDialogOpen] = useState(false);
  const [sendSubmitting, setSendSubmitting] = useState(false);
  const [sendForm, setSendForm] = useState({
    toBranchId: '',
    ingredientId: '',
    quantity: '',
    notes: '',
  });

  // Request Stock dialog - separate ingredient list scoped to the chosen
  // source branch, since the requester doesn't know that branch's stock IDs.
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [sourceBranchIngredients, setSourceBranchIngredients] = useState<ApiIngredient[]>([]);
  const [requestForm, setRequestForm] = useState({
    sourceBranchId: '',
    ingredientId: '',
    quantity: '',
  });

  useEffect(() => {
    if (!user?.branchId) return;
    loadData();
  }, [user?.branchId]);

  const loadData = async () => {
    if (!user?.branchId) return;
    setLoading(true);
    try {
      const [inv, mov, trf, br, reqs] = await Promise.all([
        fetchInventory(user.branchId),
        fetchBranchInventoryMovements(user.branchId),
        fetchTransfers(user.branchId),
        fetchBranches(),
        fetchStockRequests(user.branchId),
      ]);
      setIngredients(inv);
      setMovements(mov);
      setTransfers(trf);
      setBranches(br);
      setStockRequests(reqs);
    } catch (error) {
      toast.error('Failed to load inventory movements');
    } finally {
      setLoading(false);
    }
  };

  const branchName = (branchId: string) => branches.find((b) => b.id === branchId)?.name ?? branchId;

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
        unit_cost: selectedType === 'delivery' && form.unitCost ? parseFloat(form.unitCost) : undefined,
      });
      toast.success('Movement recorded');
      setForm({ ingredientId: '', quantity: '', reason: '', unitCost: '' });
      setDialogOpen(false);
      loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to record movement');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitSendStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sendForm.toBranchId || !sendForm.ingredientId || !sendForm.quantity) {
      toast.error('Select a destination branch, an ingredient, and enter quantity');
      return;
    }
    setSendSubmitting(true);
    try {
      await createTransfer({
        from_branch_id: user.branchId!,
        to_branch_id: sendForm.toBranchId,
        ingredient_id: sendForm.ingredientId,
        quantity: parseFloat(sendForm.quantity),
        initiated_by: user.id,
        notes: sendForm.notes || undefined,
      });
      toast.success('Stock sent — the destination branch needs to confirm receipt');
      setSendForm({ toBranchId: '', ingredientId: '', quantity: '', notes: '' });
      setSendStockDialogOpen(false);
      loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send stock');
    } finally {
      setSendSubmitting(false);
    }
  };

  const handleOpenDialog = (type: MovementType) => {
    setSelectedType(type);
    setForm({ ingredientId: '', quantity: '', reason: '', unitCost: '' });
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

  const handleOpenRequestDialog = () => {
    setRequestForm({ sourceBranchId: '', ingredientId: '', quantity: '' });
    setSourceBranchIngredients([]);
    setRequestDialogOpen(true);
  };

  const handleSourceBranchChange = async (branchId: string) => {
    setRequestForm((f) => ({ ...f, sourceBranchId: branchId, ingredientId: '' }));
    try {
      const inv = await fetchInventory(branchId);
      setSourceBranchIngredients(inv);
    } catch (error) {
      toast.error('Failed to load that branch\'s stock');
    }
  };

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestForm.sourceBranchId || !requestForm.ingredientId || !requestForm.quantity) {
      toast.error('Select a branch, ingredient, and quantity');
      return;
    }
    setRequestSubmitting(true);
    try {
      await createStockRequest({
        requesting_branch_id: user.branchId!,
        source_branch_id: requestForm.sourceBranchId,
        ingredient_id: requestForm.ingredientId,
        quantity: parseFloat(requestForm.quantity),
        requested_by: user.id,
      });
      toast.success('Stock request sent');
      setRequestDialogOpen(false);
      loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send request');
    } finally {
      setRequestSubmitting(false);
    }
  };

  const handleFulfillRequest = async (requestId: string) => {
    try {
      await fulfillStockRequest(requestId);
      toast.success('Request fulfilled - transfer created');
      loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to fulfill request');
    }
  };

  const handleDeclineRequest = async (requestId: string) => {
    if (!confirm('Decline this stock request?')) return;
    try {
      await declineStockRequest(requestId);
      toast.success('Request declined');
      loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to decline request');
    }
  };

  const branchColor = user?.branch ? BRANCH_CONFIG[user.branch]?.color : '#14524B';
  // Excludes legacy/orphaned branches from before the location restructure
  // (e.g. old single-row "D'Den"/"D' Bar"/"Malaya's Cafe") — those rows stay
  // in the database for their historical transaction data, but shouldn't be
  // pickable as transfer/request destinations. BRANCH_CONFIG's keys are
  // exactly the current 12 real location theme_keys.
  const otherBranches = branches.filter((b) => b.id !== user?.branchId && b.theme_key in BRANCH_CONFIG);
  const pendingIncomingRequests = stockRequests.filter((r) => r.source_branch_id === user?.branchId && r.status === 'pending');

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
            <div className="flex flex-wrap items-start gap-4">
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
              </div>

              <div className="w-px self-stretch bg-border-regular hidden sm:block" />

              <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setSendStockDialogOpen(true)}
                    className="gap-2"
                  >
                    <Send className="w-4 h-4" />
                    <span className="font-corp-body">Send Stock</span>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleOpenRequestDialog}
                    className="gap-2"
                  >
                    <PackagePlus className="w-4 h-4" />
                    <span className="font-corp-body">Request Stock</span>
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground font-corp-body">
                  Between branches — the other branch must confirm
                </p>
              </div>

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
              {selectedType === 'delivery' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground font-corp-body">Cost per Unit (optional)</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.unitCost}
                    onChange={e => setForm({ ...form, unitCost: e.target.value })}
                    placeholder="Updates the ingredient's cost basis"
                    className="font-corp-body font-corp-mono"
                  />
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground font-corp-body">Reason (optional)</label>
                <Input
                  value={form.reason}
                  onChange={e => setForm({ ...form, reason: e.target.value })}
                  placeholder="Supplier, note, etc."
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

        {/* Send Stock Dialog */}
        <Dialog open={sendStockDialogOpen} onOpenChange={setSendStockDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="font-corp-display">Send Stock</DialogTitle>
              <DialogDescription className="font-corp-body">
                Send stock directly to another branch. It leaves your inventory immediately — they'll see it under
                Incoming Transfers and need to confirm before it's added to theirs.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmitSendStock} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground font-corp-body">Destination Branch</label>
                <Select value={sendForm.toBranchId} onValueChange={v => setSendForm({ ...sendForm, toBranchId: v })}>
                  <SelectTrigger className="font-corp-body">
                    <SelectValue placeholder="Select destination branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {otherBranches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground font-corp-body">Ingredient</label>
                <Select value={sendForm.ingredientId} onValueChange={v => setSendForm({ ...sendForm, ingredientId: v })}>
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
                  value={sendForm.quantity}
                  onChange={e => setSendForm({ ...sendForm, quantity: e.target.value })}
                  placeholder="Enter quantity"
                  className="font-corp-body font-corp-mono"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground font-corp-body">Notes (optional)</label>
                <Input
                  value={sendForm.notes}
                  onChange={e => setSendForm({ ...sendForm, notes: e.target.value })}
                  placeholder="Why it's being sent, etc."
                  className="font-corp-body"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setSendStockDialogOpen(false)} className="flex-1">
                  Cancel
                </Button>
                <Button type="submit" disabled={sendSubmitting} className="flex-1">
                  {sendSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Send Stock
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
                      const sign =
                        mov.type === 'count_adjustment' && mov.variance !== null
                          ? mov.variance > 0
                            ? '+'
                            : '-'
                          : mov.type.startsWith('trans_out') || mov.type === 'transfer_out'
                            ? '-'
                            : '+';
                      return (
                        <TableRow key={mov.id} className="font-corp-body">
                          <TableCell>
                            <Badge className={getMovementColor(mov)} variant="outline">
                              <div className="flex items-center gap-1">
                                {getMovementIcon(mov)}
                                <span>{getMovementLabel(mov.type)}</span>
                              </div>
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">
                            {ingredient?.name ?? 'Unknown'}
                            {mov.type === 'count_adjustment' && mov.previous_stock !== null && mov.counted_stock !== null && (
                              <p className="text-xs text-muted-foreground font-normal">
                                {mov.previous_stock} → {mov.counted_stock}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-corp-mono">
                            {sign}{mov.quantity}
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

        {/* Pending Transfers - incoming queue for this branch to confirm/reject */}
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
                      <TableHead>Sent By</TableHead>
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
                          <TableCell>{branchName(t.from_branch_id)}</TableCell>
                          <TableCell>{t.ingredient_name ?? t.ingredient_id}</TableCell>
                          <TableCell className="text-right font-corp-mono">{t.quantity}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{t.initiated_by_name ?? '—'}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={TRANSFER_STATUS_COLORS[t.status]}>
                              {t.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm font-corp-mono">{new Date(t.initiated_at).toLocaleString()}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button size="sm" variant="default" onClick={() => handleConfirmTransfer(t.id)}>
                                <RefreshCw className="w-3 h-3 mr-1" /> Receive
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => handleRejectTransfer(t.id)}>
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

        {/* Requests to Fulfill - stock requests where this branch is the source */}
        {pendingIncomingRequests.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="font-corp-display">Requests to Fulfill</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="font-corp-body">
                      <TableHead>Requesting Branch</TableHead>
                      <TableHead>Ingredient</TableHead>
                      <TableHead className="text-right w-24">Qty</TableHead>
                      <TableHead>Requested By</TableHead>
                      <TableHead className="w-40">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingIncomingRequests.map((r) => (
                      <TableRow key={r.id} className="font-corp-body">
                        <TableCell>{branchName(r.requesting_branch_id)}</TableCell>
                        <TableCell>{r.ingredient_name ?? r.ingredient_id}</TableCell>
                        <TableCell className="text-right font-corp-mono">{r.quantity}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.requested_by_name ?? '—'}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button size="sm" variant="default" onClick={() => handleFulfillRequest(r.id)}>
                              <CheckCircle2 className="w-3 h-3 mr-1" /> Convert to Transfer
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => handleDeclineRequest(r.id)}>
                              <AlertCircle className="w-3 h-3 mr-1" /> Decline
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

        {/* Request Stock Dialog */}
        <Dialog open={requestDialogOpen} onOpenChange={setRequestDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="font-corp-display">Request Stock</DialogTitle>
              <DialogDescription className="font-corp-body">
                Ask another branch to send you stock. They'll see this as a pending request to fulfill.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmitRequest} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground font-corp-body">Source Branch</label>
                <Select value={requestForm.sourceBranchId} onValueChange={handleSourceBranchChange}>
                  <SelectTrigger className="font-corp-body">
                    <SelectValue placeholder="Select branch to request from" />
                  </SelectTrigger>
                  <SelectContent>
                    {otherBranches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground font-corp-body">Ingredient</label>
                <Select
                  value={requestForm.ingredientId}
                  onValueChange={v => setRequestForm({ ...requestForm, ingredientId: v })}
                  disabled={!requestForm.sourceBranchId}
                >
                  <SelectTrigger className="font-corp-body">
                    <SelectValue placeholder={requestForm.sourceBranchId ? 'Select ingredient' : 'Select a branch first'} />
                  </SelectTrigger>
                  <SelectContent>
                    {sourceBranchIngredients.map((ing) => (
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
                  value={requestForm.quantity}
                  onChange={e => setRequestForm({ ...requestForm, quantity: e.target.value })}
                  placeholder="Enter quantity"
                  className="font-corp-body font-corp-mono"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground font-corp-body">Requested By</label>
                <Input value={user?.name ?? ''} disabled className="font-corp-body" />
              </div>
              <div className="flex gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setRequestDialogOpen(false)} className="flex-1">
                  Cancel
                </Button>
                <Button type="submit" disabled={requestSubmitting} className="flex-1">
                  {requestSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Send Request
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}