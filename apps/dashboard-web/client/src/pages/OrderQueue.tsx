import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Loader2,
  RefreshCw,
  Ban,
  AlertTriangle,
  Pencil,
  CheckCircle2,
  Search,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  ChefHat,
  Bell,
  Flag,
  Clock,
  Users,
  ShoppingBag,
  CheckCircle,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';
import {
  ApiTransaction,
  ApiProduct,
  ApiRecipeItem,
  ApiKitchenSummary,
  KitchenStatus,
  fetchTransactions,
  fetchProducts,
  fetchRecipe,
  fetchKitchenSummary,
  voidTransaction,
  updateTransactionItem,
  fulfillTransaction,
} from '@/lib/api';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { OwnerRequestBadge } from '@/components/shared/OwnerRequestBadge';
import { ModifierTag } from '@/components/shared/ModifierTag';
import { ORDER_READY_SOUND, playOrderSound } from '@/lib/orderSounds';

interface EditItemForm {
  quantity: string;
  held: Set<string>;
}

type StatusFilter = 'all' | KitchenStatus | 'voided';
type SortOrder = 'newest' | 'oldest';

const PAGE_SIZE = 10;

function orderNumber(id: string): string {
  return `#${id.slice(0, 6).toUpperCase()}`;
}

export default function OrderQueue() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<ApiTransaction[]>([]);
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [summary, setSummary] = useState<ApiKitchenSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [voidDialogId, setVoidDialogId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);

  const [editDialogId, setEditDialogId] = useState<string | null>(null);
  const [editItemsForm, setEditItemsForm] = useState<Record<string, EditItemForm>>({});
  const [recipesByProduct, setRecipesByProduct] = useState<Record<string, ApiRecipeItem[]>>({});
  const [editLoadingRecipes, setEditLoadingRecipes] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [fulfillingId, setFulfillingId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dateFilter, setDateFilter] = useState(() => new Date().toISOString().slice(0, 10));
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(true);

  // Refs, not state, so the poll interval (set up once on mount) always
  // reads the latest soundOn toggle and the previous-poll snapshot without
  // needing to be torn down and recreated every time either changes.
  const soundOnRef = useRef(soundOn);
  useEffect(() => {
    soundOnRef.current = soundOn;
  }, [soundOn]);
  const seenReadyIdsRef = useRef<Set<string> | null>(null);

  const loadData = () => {
    if (!user?.branchId) return;
    setLoading(true);
    Promise.all([
      fetchTransactions(user.branchId, dateFilter),
      fetchProducts(user.branchId),
      fetchKitchenSummary(user.branchId),
    ])
      .then(([txData, productData, summaryData]) => {
        setTransactions(txData);
        setProducts(productData);
        setSummary(summaryData);
        setLastUpdated(new Date());

        // Alert the front-of-house/kiosk whenever an order the kitchen just
        // marked Ready shows up -- skip on first load so pre-existing Ready
        // orders don't all chime at once.
        const currentReadyIds = new Set(
          txData.filter((t) => t.status !== 'voided' && t.kitchen_status === 'ready').map((t) => t.id)
        );
        const previouslySeen = seenReadyIdsRef.current;
        if (previouslySeen) {
          const hasNewlyReady = Array.from(currentReadyIds).some((id) => !previouslySeen.has(id));
          if (hasNewlyReady && soundOnRef.current) playOrderSound(ORDER_READY_SOUND);
        }
        seenReadyIdsRef.current = currentReadyIds;
      })
      .catch(() => toast.error("Could not load today's orders. Check your connection."))
      .finally(() => setLoading(false));
  };

  useEffect(loadData, [user?.branchId, dateFilter]);

  // Poll so the kiosk/front-of-house tab picks up a kitchen-side Ready
  // transition (and the sound alert above) without a manual refresh.
  useEffect(() => {
    const poll = setInterval(loadData, 20000);
    return () => clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.branchId, dateFilter]);

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? 'Unknown item';
  const productAvailability = (id: string) => products.find((p) => p.id === id)?.availability ?? 'available';

  // useMemo must run on every render regardless of the access-denied early
  // return below -- Rules of Hooks requires the same hooks in the same
  // order every render, so this stays above that guard.
  const filtered = useMemo(() => {
    let list = transactions;
    if (statusFilter === 'voided') list = list.filter((t) => t.status === 'voided');
    else if (statusFilter !== 'all') list = list.filter((t) => t.status !== 'voided' && t.kitchen_status === statusFilter);

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (t) =>
          orderNumber(t.id).toLowerCase().includes(q) ||
          t.items.some((i) => productName(i.product_id).toLowerCase().includes(q))
      );
    }

    const sorted = [...list].sort((a, b) => {
      const diff = new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime();
      return sortOrder === 'newest' ? -diff : diff;
    });
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, statusFilter, searchQuery, sortOrder, products]);

  if (!user || (user.role !== 'employee' && user.role !== 'manager' && user.role !== 'executive') || !user.branchId) {
    return (
      <DashboardLayout>
        <div className="p-6 text-center">
          <p className="text-destructive">Access denied.</p>
        </div>
      </DashboardLayout>
    );
  }

  const canModify = (t: ApiTransaction) => {
    if (t.status === 'voided') return false;
    if (user.role === 'employee') return t.employee_id === user.id;
    return true;
  };

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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

    const uncachedProductIds = Array.from(new Set(t.items.map((i) => i.product_id))).filter((id) => !recipesByProduct[id]);
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
        const heldChanged = newHeld.length !== oldHeld.size || newHeld.some((id) => !oldHeld.has(id));
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

  const secondsAgo = lastUpdated ? Math.max(0, Math.round((Date.now() - lastUpdated.getTime()) / 1000)) : null;

  const statCards = [
    { label: 'Open Orders', sub: 'Needs attention', value: summary?.queued_count ?? '—', icon: ClipboardList, color: 'text-warning' },
    { label: 'Preparing', sub: 'In progress', value: summary?.preparing_count ?? '—', icon: ChefHat, color: 'text-accent-foreground' },
    { label: 'Ready to Serve', sub: 'Waiting for pickup', value: summary?.ready_count ?? '—', icon: Bell, color: 'text-success' },
    { label: 'Completed Today', sub: 'All orders', value: summary?.completed_today_count ?? '—', icon: CheckCircle, color: 'text-muted-foreground' },
    { label: 'Flagged / Owner', sub: 'Requires approval', value: summary?.owner_request_pending_count ?? '—', icon: Flag, color: 'text-destructive' },
    {
      label: 'Avg Prep Time',
      sub: 'Today',
      value: summary?.avg_prep_time_seconds != null ? `${Math.round(summary.avg_prep_time_seconds / 60)}m` : '—',
      icon: Clock,
      color: 'text-foreground',
    },
  ];

  return (
    <DashboardLayout title="Order Queue">
      <div className="p-6 space-y-6">
        {/* Today's Overview */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-corp-display font-semibold text-foreground">Today's Overview</h2>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-success animate-pulse" /> Live
              </span>
              <span>Updated {secondsAgo ?? '—'}s ago</span>
              <Button variant="outline" size="sm" onClick={loadData} className="gap-1.5 h-7">
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </Button>
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setSoundOn((s) => !s)} title="Toggle ready-for-pickup sound">
                {soundOn ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {statCards.map((c) => (
              <Card key={c.label}>
                <CardContent className="p-3">
                  <c.icon className={`w-4 h-4 mb-1 ${c.color}`} />
                  <p className="text-2xl font-corp-display font-bold text-foreground">{c.value}</p>
                  <p className="text-xs font-corp-body text-foreground">{c.label}</p>
                  <p className="text-[10px] text-muted-foreground">{c.sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Filter row */}
        <Card>
          <CardContent className="p-4 flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by order no., item..."
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as StatusFilter); setPage(1); }}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="queued">Queued</SelectItem>
                <SelectItem value="preparing">Preparing</SelectItem>
                <SelectItem value="ready">Ready</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="voided">Voided</SelectItem>
              </SelectContent>
            </Select>
            <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="w-40" />
            <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as SortOrder)}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest First</SelectItem>
                <SelectItem value="oldest">Oldest First</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Order cards */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : pageItems.length === 0 ? (
          <p className="text-center text-muted-foreground py-12 font-corp-body">No orders match this view.</p>
        ) : (
          <div className="space-y-3">
            {pageItems.map((t) => {
              const expanded = expandedId === t.id;
              const anyLowStockOrUnavailable = t.items.some((i) => productAvailability(i.product_id) !== 'available');
              return (
                <Card
                  key={t.id}
                  className="border-l-4"
                  style={{
                    borderLeftColor:
                      t.status === 'voided'
                        ? 'var(--destructive)'
                        : t.is_owner_request
                          ? 'var(--destructive)'
                          : t.kitchen_status === 'queued'
                            ? 'var(--color-warning)'
                            : t.kitchen_status === 'preparing'
                              ? 'var(--accent-foreground)'
                              : t.kitchen_status === 'ready'
                                ? 'var(--color-success)'
                                : 'var(--muted-foreground)',
                  }}
                >
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-center gap-3 cursor-pointer" onClick={() => setExpandedId(expanded ? null : t.id)}>
                      <div className="text-xs text-muted-foreground w-20">
                        <p className="font-corp-mono">{new Date(t.opened_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}</p>
                        <p>{new Date(t.opened_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</p>
                      </div>
                      <p className="font-corp-display font-semibold text-foreground">{orderNumber(t.id)}</p>
                      {t.table_number && <span className="text-sm text-muted-foreground">Table {t.table_number}</span>}
                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                        {t.order_type === 'dine_in' ? (
                          <>
                            <Users className="w-3.5 h-3.5" /> Dine In{t.guest_count ? ` • ${t.guest_count} Guests` : ''}
                          </>
                        ) : (
                          <>
                            <ShoppingBag className="w-3.5 h-3.5" /> Takeout
                          </>
                        )}
                      </span>
                      {t.status === 'voided' ? (
                        <Badge variant="outline" className="bg-error-bg text-destructive">Voided</Badge>
                      ) : (
                        <StatusBadge status={t.kitchen_status} />
                      )}
                      {t.is_owner_request && <OwnerRequestBadge />}
                      <div className="ml-auto flex items-center gap-3">
                        <span className="font-corp-mono font-semibold">{formatCurrency(t.total_amount)}</span>
                        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>

                    {expanded && (
                      <div className="mt-4 pt-4 border-t border-border-regular grid md:grid-cols-3 gap-4">
                        <div className="md:col-span-2 space-y-2">
                          <p className="text-xs font-semibold text-muted-foreground uppercase">Items ({t.items.length})</p>
                          {t.items.map((item) => (
                            <div key={item.id} className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span>{item.quantity}x {productName(item.product_id)}</span>
                                {item.held_ingredient_names.map((name) => (
                                  <ModifierTag key={name} label={name} variant="removed" />
                                ))}
                                {item.note && <ModifierTag label={item.note} variant="note" />}
                              </div>
                              <span className="font-corp-mono">{formatCurrency(item.unit_price * item.quantity)}</span>
                            </div>
                          ))}
                          {t.discount_type_id && (
                            <p className="text-xs text-destructive">-{formatCurrency(t.discount_amount)} discount applied</p>
                          )}
                          {t.is_owner_request && (
                            <div className="text-xs bg-error-bg text-destructive rounded p-2 space-y-0.5">
                              <p>Revenue excluded from reports</p>
                              <p>Manager PIN verified</p>
                              {t.owner_request_note && <p className="italic">"{t.owner_request_note}"</p>}
                            </div>
                          )}
                        </div>
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-muted-foreground uppercase">Inventory Impact</p>
                          <div className={`text-xs rounded p-2 flex items-center gap-1.5 ${anyLowStockOrUnavailable ? 'bg-warning-bg text-warning' : 'bg-success-bg text-success'}`}>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {anyLowStockOrUnavailable ? 'Uses low-stock ingredients' : 'Sufficient stock'}
                          </div>
                          <p className="text-xs text-muted-foreground pt-2">
                            Created {new Date(t.opened_at).toLocaleString('en-PH')}
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                      {t.status === 'voided' ? (
                        <span className="text-xs text-muted-foreground">{t.void_reason || 'Voided'}</span>
                      ) : (
                        <>
                          {t.kitchen_status !== 'completed' && canModify(t) && (
                            <Button
                              size="sm"
                              onClick={() => handleMarkDone(t.id)}
                              disabled={fulfillingId === t.id}
                              className="gap-1 bg-success hover:bg-success/90 text-success-foreground"
                            >
                              {fulfillingId === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                              {t.kitchen_status === 'ready' ? 'Done' : 'Mark as Done'}
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
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {filtered.length > 0 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} orders
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Prev
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <Button key={p} size="sm" variant={p === page ? 'default' : 'outline'} onClick={() => setPage(p)}>
                  {p}
                </Button>
              ))}
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
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
