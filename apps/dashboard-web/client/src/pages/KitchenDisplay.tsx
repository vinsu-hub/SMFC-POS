import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2,
  ClipboardList,
  ChefHat,
  Bell,
  AlertTriangle,
  TrendingUp,
  Hourglass,
  Volume2,
  VolumeX,
  Users,
  ShoppingBag,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  ApiTransaction,
  ApiProduct,
  ApiKitchenSummary,
  KitchenStation,
  KitchenStatus,
  fetchTransactions,
  fetchProducts,
  fetchKitchenSummary,
  updateKitchenStatus,
} from '@/lib/api';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { OwnerRequestBadge } from '@/components/shared/OwnerRequestBadge';
import { ModifierTag } from '@/components/shared/ModifierTag';
import { NEW_ORDER_SOUND, playOrderSound } from '@/lib/orderSounds';

const STATIONS: { value: KitchenStation; label: string }[] = [
  { value: 'grill', label: 'Grill' },
  { value: 'fryer', label: 'Fryer' },
  { value: 'bar', label: 'Bar' },
  { value: 'coffee', label: 'Coffee' },
  { value: 'dessert', label: 'Dessert' },
];

// Hardcoded for v1 -- a per-branch settings surface for these thresholds is
// a reasonable future addition, not required now.
const DELAYED_THRESHOLD_SECONDS: Record<KitchenStatus, number> = {
  queued: 15 * 60,
  preparing: 15 * 60,
  ready: 10 * 60,
  completed: Infinity,
};
const FALLBACK_AVG_PREP_SECONDS = 15 * 60;

const COLUMN_CONFIG: { status: KitchenStatus; label: string; action: string | null; next: KitchenStatus | null; actionClass: string }[] = [
  { status: 'queued', label: 'Queued', action: 'Accept', next: 'preparing', actionClass: 'bg-warning hover:bg-warning/90 text-warning-foreground' },
  { status: 'preparing', label: 'Preparing', action: 'Mark as Ready', next: 'ready', actionClass: 'bg-accent-foreground hover:bg-accent-foreground/90 text-white' },
  { status: 'ready', label: 'Ready', action: 'Ready for Pickup', next: 'completed', actionClass: 'bg-success hover:bg-success/90 text-success-foreground' },
  { status: 'completed', label: 'Completed', action: null, next: null, actionClass: '' },
];

const VISIBLE_PER_COLUMN = 2;

function elapsedLabel(iso: string): { text: string; seconds: number } {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  const minutes = Math.round(seconds / 60);
  return { text: minutes < 1 ? 'just now' : `${minutes}m ago`, seconds };
}

export default function KitchenDisplay() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<ApiTransaction[]>([]);
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [summary, setSummary] = useState<ApiKitchenSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [stationFilter, setStationFilter] = useState<'all' | KitchenStation>('all');
  const [soundOn, setSoundOn] = useState(true);
  const [now, setNow] = useState(new Date());
  const [expandedColumns, setExpandedColumns] = useState<Set<KitchenStatus>>(new Set());
  const [transitioningId, setTransitioningId] = useState<string | null>(null);

  // Refs, not state, so the 20s poll interval (set up once on mount) always
  // reads the latest soundOn toggle and the previous-poll snapshot without
  // needing to be torn down and recreated every time either changes.
  const soundOnRef = useRef(soundOn);
  useEffect(() => {
    soundOnRef.current = soundOn;
  }, [soundOn]);
  const seenQueuedIdsRef = useRef<Set<string> | null>(null);

  const loadData = () => {
    if (!user?.branchId) return;
    setLoading(true);
    Promise.all([fetchTransactions(user.branchId), fetchProducts(user.branchId), fetchKitchenSummary(user.branchId)])
      .then(([txData, productData, summaryData]) => {
        setTransactions(txData);
        setProducts(productData);
        setSummary(summaryData);

        // Alert every active tab watching this board when a brand-new order
        // lands in Queued -- but never on first load, or every pre-existing
        // order would chime at once.
        const currentQueuedIds = new Set(
          txData.filter((t) => t.status !== 'voided' && t.kitchen_status === 'queued').map((t) => t.id)
        );
        const previouslySeen = seenQueuedIdsRef.current;
        if (previouslySeen) {
          const hasNewOrder = Array.from(currentQueuedIds).some((id) => !previouslySeen.has(id));
          if (hasNewOrder && soundOnRef.current) playOrderSound(NEW_ORDER_SOUND);
        }
        seenQueuedIdsRef.current = currentQueuedIds;
      })
      .catch(() => toast.error('Could not load kitchen orders. Check your connection.'))
      .finally(() => setLoading(false));
  };

  useEffect(loadData, [user?.branchId]);

  // Live clock + periodic refresh so elapsed-time chips and the progress
  // bar keep moving without a manual reload.
  useEffect(() => {
    const clock = setInterval(() => setNow(new Date()), 1000);
    const poll = setInterval(loadData, 20000);
    return () => {
      clearInterval(clock);
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.branchId]);

  const productStation = (productId: string) => products.find((p) => p.id === productId)?.station ?? null;
  const productName = (productId: string) => products.find((p) => p.id === productId)?.name ?? 'Unknown item';

  const activeOrders = useMemo(() => {
    let list = transactions.filter((t) => t.status !== 'voided');
    if (stationFilter !== 'all') {
      list = list.filter((t) => t.items.some((i) => productStation(i.product_id) === stationFilter));
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, stationFilter, products]);

  const columns = useMemo(() => {
    const grouped: Record<KitchenStatus, ApiTransaction[]> = { queued: [], preparing: [], ready: [], completed: [] };
    for (const t of activeOrders) grouped[t.kitchen_status].push(t);
    for (const key of Object.keys(grouped) as KitchenStatus[]) {
      grouped[key].sort((a, b) => new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime());
    }
    return grouped;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrders, now]);

  if (!user || user.role !== 'employee' || !user.branchId) {
    return (
      <DashboardLayout>
        <div className="p-6 text-center">
          <p className="text-destructive">Access denied. This page is for employees only.</p>
        </div>
      </DashboardLayout>
    );
  }

  const toggleColumnExpanded = (status: KitchenStatus) => {
    setExpandedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  const handleTransition = async (transactionId: string, nextStatus: KitchenStatus) => {
    setTransitioningId(transactionId);
    try {
      await updateKitchenStatus(transactionId, nextStatus);
      loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update order status');
    } finally {
      setTransitioningId(null);
    }
  };

  const delayedCounts = {
    queued: columns.queued.filter((t) => elapsedLabel(t.kitchen_status_updated_at ?? t.opened_at).seconds > DELAYED_THRESHOLD_SECONDS.queued).length,
    preparing: columns.preparing.filter((t) => elapsedLabel(t.kitchen_status_updated_at ?? t.opened_at).seconds > DELAYED_THRESHOLD_SECONDS.preparing).length,
    ready: columns.ready.filter((t) => elapsedLabel(t.kitchen_status_updated_at ?? t.opened_at).seconds > DELAYED_THRESHOLD_SECONDS.ready).length,
  };

  const longestOrder = summary?.longest_order_id ? transactions.find((t) => t.id === summary.longest_order_id) : null;

  const statCards = [
    { label: 'Queued', sub: 'New orders', value: columns.queued.length, icon: ClipboardList, color: 'text-warning' },
    { label: 'Preparing', sub: 'In progress', value: columns.preparing.length, icon: ChefHat, color: 'text-accent-foreground' },
    { label: 'Ready', sub: 'For pickup', value: columns.ready.length, icon: Bell, color: 'text-success' },
    { label: 'Delayed', sub: 'Over 15 min', value: summary?.delayed_count ?? 0, icon: AlertTriangle, color: 'text-destructive' },
    {
      label: 'Avg Prep Time',
      sub: 'Today',
      value: summary?.avg_prep_time_seconds != null ? `${Math.round(summary.avg_prep_time_seconds / 60)}m ${Math.round(summary.avg_prep_time_seconds % 60)}s` : '—',
      icon: TrendingUp,
      color: 'text-foreground',
    },
    {
      label: 'Longest Order',
      sub: longestOrder ? `#${longestOrder.id.slice(0, 6).toUpperCase()}` : '—',
      value: summary?.longest_order_elapsed_seconds != null ? `${Math.round(summary.longest_order_elapsed_seconds / 60)}m` : '—',
      icon: Hourglass,
      color: 'text-foreground',
    },
  ];

  return (
    <DashboardLayout title="Kitchen Display">
      <div className="p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="flex items-center gap-1.5 text-success font-medium">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" /> Live
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Select value={stationFilter} onValueChange={(v) => setStationFilter(v as 'all' | KitchenStation)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stations</SelectItem>
                {STATIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => setSoundOn((s) => !s)} title="Toggle sound">
              {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </Button>
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground font-corp-mono">
              <Clock className="w-4 h-4" /> {now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
        </div>

        {/* Stat cards */}
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

        {/* Kanban board */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {COLUMN_CONFIG.map((col) => {
              const orders = columns[col.status];
              const expanded = expandedColumns.has(col.status);
              const visibleOrders = expanded ? orders : orders.slice(0, VISIBLE_PER_COLUMN);
              return (
                <div key={col.status} className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <p className="text-sm font-corp-display font-semibold text-foreground uppercase">{col.label}</p>
                    <span className="text-xs bg-muted rounded-full px-2 py-0.5">{orders.length}</span>
                  </div>
                  <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
                    {visibleOrders.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-6">No orders</p>
                    ) : (
                      visibleOrders.map((t) => {
                        const elapsed = elapsedLabel(t.kitchen_status_updated_at ?? t.opened_at);
                        const isDelayed = elapsed.seconds > DELAYED_THRESHOLD_SECONDS[col.status];
                        const avgPrep = summary?.avg_prep_time_seconds || FALLBACK_AVG_PREP_SECONDS;
                        const progressPct = col.status === 'preparing' ? Math.min(100, Math.round((elapsed.seconds / avgPrep) * 100)) : null;
                        return (
                          <Card key={t.id} className="border-l-4" style={{ borderLeftColor: t.is_owner_request ? 'var(--destructive)' : undefined }}>
                            <CardContent className="p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="font-corp-display font-semibold text-sm">#{t.id.slice(0, 6).toUpperCase()}</span>
                                <span className={`text-xs font-corp-mono ${isDelayed ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                                  {elapsed.text}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                {t.table_number && <span>Table {t.table_number}</span>}
                                <span className="flex items-center gap-1">
                                  {t.order_type === 'dine_in' ? <Users className="w-3 h-3" /> : <ShoppingBag className="w-3 h-3" />}
                                  {t.order_type === 'dine_in' ? 'Dine In' : 'Take Out'}
                                </span>
                              </div>
                              <div className="space-y-1">
                                {t.items.map((item) => (
                                  <div key={item.id} className="text-xs flex items-center gap-1.5 flex-wrap">
                                    <span>{item.quantity}x {productName(item.product_id)}</span>
                                    {item.held_ingredient_names.map((name) => (
                                      <ModifierTag key={name} label={name} variant="removed" />
                                    ))}
                                    {item.note && <ModifierTag label={item.note} variant="note" />}
                                  </div>
                                ))}
                              </div>
                              {t.is_owner_request && <OwnerRequestBadge />}
                              {progressPct !== null && (
                                <div>
                                  <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                                    <div className="h-full bg-accent-foreground" style={{ width: `${progressPct}%` }} />
                                  </div>
                                  <p className="text-[10px] text-muted-foreground mt-0.5">Progress {progressPct}%</p>
                                </div>
                              )}
                              {col.status === 'completed' ? (
                                <p className="text-xs text-muted-foreground">Completed</p>
                              ) : (
                                col.action &&
                                col.next && (
                                  <Button
                                    size="sm"
                                    className={`w-full ${col.actionClass}`}
                                    disabled={transitioningId === t.id}
                                    onClick={() => handleTransition(t.id, col.next!)}
                                  >
                                    {transitioningId === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : col.action}
                                  </Button>
                                )
                              )}
                            </CardContent>
                          </Card>
                        );
                      })
                    )}
                    {orders.length > VISIBLE_PER_COLUMN && (
                      <button
                        onClick={() => toggleColumnExpanded(col.status)}
                        className="w-full text-xs text-primary text-center py-1"
                      >
                        {expanded ? 'Show less' : `+ ${orders.length - VISIBLE_PER_COLUMN} more orders`}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Bottom status bar */}
        <div className="flex flex-wrap items-center gap-4 px-1 py-2 border-t border-border-regular text-xs text-muted-foreground">
          <span>Queued &gt;15min: {delayedCounts.queued}</span>
          <span>Preparing &gt;15min: {delayedCounts.preparing}</span>
          <span>Ready &gt;10min: {delayedCounts.ready}</span>
          <span>Owner Request: {summary?.owner_request_pending_count ?? 0}</span>
          <span className="ml-auto flex items-center gap-1.5 text-success">
            <span className="w-2 h-2 rounded-full bg-success" /> Live
          </span>
        </div>
      </div>
    </DashboardLayout>
  );
}
