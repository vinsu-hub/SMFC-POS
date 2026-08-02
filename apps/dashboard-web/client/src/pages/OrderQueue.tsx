import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Loader2, RefreshCw, Ban, AlertTriangle, Crown, Pencil, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';
import {
  ApiTransaction,
  ApiProduct,
  ApiRecipeItem,
  fetchTransactions,
  fetchProducts,
  fetchRecipe,
  voidTransaction,
  updateTransactionItem,
  fulfillTransaction,
} from '@/lib/api';

interface EditItemForm {
  quantity: string;
  held: Set<string>;
}

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-warning-bg text-warning',
  closed: 'bg-success-bg text-success',
  voided: 'bg-error-bg text-destructive',
};

export default function OrderQueue() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<ApiTransaction[]>([]);
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [voidDialogId, setVoidDialogId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);

  const [editDialogId, setEditDialogId] = useState<string | null>(null);
  const [editItemsForm, setEditItemsForm] = useState<Record<string, EditItemForm>>({});
  const [recipesByProduct, setRecipesByProduct] = useState<Record<string, ApiRecipeItem[]>>({});
  const [editLoadingRecipes, setEditLoadingRecipes] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [fulfillingId, setFulfillingId] = useState<string | null>(null);

  const loadData = () => {
    if (!user?.branchId) return;
    setLoading(true);
    Promise.all([fetchTransactions(user.branchId), fetchProducts(user.branchId)])
      .then(([txData, productData]) => {
        setTransactions(txData);
        setProducts(productData);
      })
      .catch(() => toast.error('Could not load today\'s orders. Check your connection.'))
      .finally(() => setLoading(false));
  };

  useEffect(loadData, [user?.branchId]);

  if (!user || (user.role !== 'employee' && user.role !== 'manager' && user.role !== 'executive') || !user.branchId) {
    return (
      <DashboardLayout>
        <div className="p-6 text-center">
          <p className="text-destructive">Access denied.</p>
        </div>
      </DashboardLayout>
    );
  }

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? 'Unknown item';

  const itemsSummary = (t: ApiTransaction) =>
    t.items.map((i) => `${i.quantity}x ${productName(i.product_id)}`).join(', ');

  const canModify = (t: ApiTransaction) => {
    if (t.status === 'voided') return false;
    if (user.role === 'employee') return t.employee_id === user.id;
    return true;
  };
  const canVoid = canModify;

  const visibleTransactions = showCompleted ? transactions : transactions.filter((t) => !t.fulfilled);

  const handleMarkDone = async (transactionId: string) => {
    setFulfillingId(transactionId);
    try {
      await fulfillTransaction(transactionId);
      toast.success('Order marked done');
      loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to mark order done');
    } finally {
      setFulfillingId(null);
    }
  };

  const handleOpenVoid = (transactionId: string) => {
    setVoidDialogId(transactionId);
    setVoidReason('');
  };

  const handleVoid = async () => {
    if (!voidDialogId) return;
    setVoiding(true);
    try {
      await voidTransaction(voidDialogId, voidReason || undefined);
      toast.success('Order voided, inventory restored');
      setVoidDialogId(null);
      loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to void order');
    } finally {
      setVoiding(false);
    }
  };

  const handleOpenEdit = async (t: ApiTransaction) => {
    setEditDialogId(t.id);
    const form: Record<string, EditItemForm> = {};
    for (const item of t.items) {
      form[item.id] = { quantity: String(item.quantity), held: new Set(item.held_ingredient_ids) };
    }
    setEditItemsForm(form);

    const uncachedProductIds = Array.from(new Set(t.items.map((i) => i.product_id))).filter(
      (id) => !recipesByProduct[id]
    );
    if (uncachedProductIds.length > 0) {
      setEditLoadingRecipes(true);
      try {
        const results = await Promise.all(uncachedProductIds.map((id) => fetchRecipe(id)));
        setRecipesByProduct((prev) => {
          const next = { ...prev };
          uncachedProductIds.forEach((id, idx) => (next[id] = results[idx]));
          return next;
        });
      } catch {
        toast.error('Could not load recipe details for hold options');
      } finally {
        setEditLoadingRecipes(false);
      }
    }
  };

  const toggleHeld = (itemId: string, ingredientId: string) => {
    setEditItemsForm((prev) => {
      const current = prev[itemId];
      const held = new Set(current.held);
      if (held.has(ingredientId)) held.delete(ingredientId);
      else held.add(ingredientId);
      return { ...prev, [itemId]: { ...current, held } };
    });
  };

  const handleSaveEdit = async () => {
    if (!editDialogId) return;
    const transaction = transactions.find((t) => t.id === editDialogId);
    if (!transaction) return;

    setEditSaving(true);
    let anyHeld = false;
    try {
      for (const item of transaction.items) {
        const form = editItemsForm[item.id];
        if (!form) continue;
        const newQuantity = parseFloat(form.quantity);
        const newHeld = Array.from(form.held);
        const oldHeld = new Set(item.held_ingredient_ids);
        const quantityChanged = !isNaN(newQuantity) && newQuantity !== item.quantity;
        const heldChanged =
          newHeld.length !== oldHeld.size || newHeld.some((id) => !oldHeld.has(id));
        if (!quantityChanged && !heldChanged) continue;

        if (isNaN(newQuantity) || newQuantity <= 0) {
          toast.error('Quantity must be greater than zero');
          setEditSaving(false);
          return;
        }
        if (heldChanged && newHeld.length > 0) anyHeld = true;

        await updateTransactionItem(editDialogId, item.id, {
          quantity: quantityChanged ? newQuantity : undefined,
          held_ingredient_ids: heldChanged ? newHeld : undefined,
        });
      }
      toast.success(anyHeld ? 'Order updated — held ingredients returned to stock' : 'Order updated');
      setEditDialogId(null);
      loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update order');
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <DashboardLayout title="Order Queue">
      <div className="p-6 space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
            <CardTitle className="font-corp-display">Today's Orders</CardTitle>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm font-corp-body text-muted-foreground cursor-pointer">
                <Switch checked={showCompleted} onCheckedChange={setShowCompleted} />
                Show completed
              </label>
              <Button variant="outline" size="sm" onClick={loadData} className="gap-2">
                <RefreshCw className="w-4 h-4" />
                <span className="font-corp-body">Refresh</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : visibleTransactions.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 font-corp-body">
                {transactions.length === 0 ? 'No orders placed yet today' : 'No active orders — all done for now'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="font-corp-body">
                      <TableHead className="w-24">Time</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead className="text-right w-28">Total</TableHead>
                      <TableHead>Flags</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-32">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleTransactions.map((t) => (
                      <TableRow key={t.id} className={`font-corp-body ${t.fulfilled ? 'opacity-60' : ''}`}>
                        <TableCell className="text-sm font-corp-mono">
                          {new Date(t.opened_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                        </TableCell>
                        <TableCell className="text-sm max-w-xs truncate" title={itemsSummary(t)}>
                          {itemsSummary(t)}
                        </TableCell>
                        <TableCell className="text-right font-corp-mono">{formatCurrency(t.total_amount)}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {t.discount_type_id && (
                              <Badge variant="outline" className="bg-accent-soft text-accent-foreground text-xs">
                                -{formatCurrency(t.discount_amount)} discount
                              </Badge>
                            )}
                            {t.is_owner_request && (
                              <Badge variant="outline" className="bg-warning-bg text-warning text-xs gap-1">
                                <Crown className="w-3 h-3" /> Owner's Request
                              </Badge>
                            )}
                            {t.fulfilled && (
                              <Badge variant="outline" className="bg-success-bg text-success text-xs gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Done
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={STATUS_COLORS[t.status] || 'bg-muted-foreground/50 text-muted-foreground'}>
                            {t.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {t.status === 'voided' ? (
                            <span className="text-xs text-muted-foreground">{t.void_reason || 'Voided'}</span>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {!t.fulfilled && canModify(t) && (
                                <Button
                                  size="sm"
                                  variant="default"
                                  onClick={() => handleMarkDone(t.id)}
                                  disabled={fulfillingId === t.id}
                                  className="gap-1 bg-success hover:bg-success/90 text-success-foreground"
                                >
                                  {fulfillingId === t.id ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="w-3 h-3" />
                                  )}
                                  Done
                                </Button>
                              )}
                              {canModify(t) && (
                                <>
                                  <Button size="sm" variant="outline" onClick={() => handleOpenEdit(t)} className="gap-1">
                                    <Pencil className="w-3 h-3" /> Edit
                                  </Button>
                                  <Button size="sm" variant="destructive" onClick={() => handleOpenVoid(t.id)} className="gap-1">
                                    <Ban className="w-3 h-3" /> Void
                                  </Button>
                                </>
                              )}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Void Confirmation Dialog */}
      <Dialog open={!!voidDialogId} onOpenChange={(open) => !open && setVoidDialogId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-corp-display flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Void Order
            </DialogTitle>
            <DialogDescription className="font-corp-body">
              This will restore the inventory deducted for this order and mark it voided. This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground font-corp-body">Reason (optional)</label>
              <Input
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="e.g. Customer changed mind, order error"
                className="font-corp-body"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setVoidDialogId(null)} className="flex-1">
                Cancel
              </Button>
              <Button type="button" variant="destructive" onClick={handleVoid} disabled={voiding} className="flex-1">
                {voiding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Void Order
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Order Dialog */}
      <Dialog open={!!editDialogId} onOpenChange={(open) => !open && setEditDialogId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-corp-display">Edit Order</DialogTitle>
            <DialogDescription className="font-corp-body">
              Adjust quantity or hold an ingredient the customer asked to skip — held ingredients
              are returned to stock.
            </DialogDescription>
          </DialogHeader>
          {editLoadingRecipes ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-5 max-h-[60vh] overflow-y-auto">
              {editDialogId &&
                transactions
                  .find((t) => t.id === editDialogId)
                  ?.items.map((item) => {
                    const recipe = recipesByProduct[item.product_id] ?? [];
                    const form = editItemsForm[item.id];
                    if (!form) return null;
                    return (
                      <div key={item.id} className="space-y-2 border rounded-lg p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-corp-body font-medium text-foreground">{productName(item.product_id)}</p>
                          <Input
                            type="number"
                            step="1"
                            min="1"
                            value={form.quantity}
                            onChange={(e) =>
                              setEditItemsForm((prev) => ({
                                ...prev,
                                [item.id]: { ...prev[item.id], quantity: e.target.value },
                              }))
                            }
                            className="font-corp-mono w-20"
                          />
                        </div>
                        {recipe.length > 0 && (
                          <div className="space-y-1 pt-1">
                            <p className="text-xs text-muted-foreground font-corp-body">Hold ingredients:</p>
                            {recipe.map((r) => (
                              <label
                                key={r.ingredient_id}
                                className="flex items-center gap-2 text-sm font-corp-body cursor-pointer"
                              >
                                <Checkbox
                                  checked={form.held.has(r.ingredient_id)}
                                  onCheckedChange={() => toggleHeld(item.id, r.ingredient_id)}
                                />
                                {r.ingredients.name}
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setEditDialogId(null)} className="flex-1">
              Cancel
            </Button>
            <Button type="button" onClick={handleSaveEdit} disabled={editSaving} className="flex-1">
              {editSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
