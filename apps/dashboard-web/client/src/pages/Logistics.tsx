import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import {
  ApiBranch,
  ApiIngredient,
  ApiStockRequest,
  ApiTransfer,
  confirmTransfer,
  createTransfer,
  declineStockRequest,
  fetchBranches,
  fetchInventory,
  fetchStockRequests,
  fetchTransfers,
  fulfillStockRequest,
  rejectTransfer,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-green-100 text-green-800',
  fulfilled: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  declined: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-600',
};

/** Company-wide stock movement desk: dispatch transfers, confirm receipts, and answer inter-branch stock requests. */
export default function Logistics() {
  const { user } = useAuth();
  const [branches, setBranches] = useState<ApiBranch[]>([]);
  const [transfers, setTransfers] = useState<ApiTransfer[]>([]);
  const [requests, setRequests] = useState<ApiStockRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [fromBranch, setFromBranch] = useState('');
  const [toBranch, setToBranch] = useState('');
  const [ingredients, setIngredients] = useState<ApiIngredient[]>([]);
  const [ingredientId, setIngredientId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');

  const branchName = useMemo(() => {
    const m = new Map(branches.map((b) => [b.id, b.name]));
    return (id: string) => m.get(id) ?? id.slice(0, 8);
  }, [branches]);

  const load = useCallback(async () => {
    try {
      const b = await fetchBranches();
      setBranches(b);
      if (b.length === 0) return;
      // company-wide roles get every branch's rows regardless of the branch_id passed
      const [t, r] = await Promise.all([fetchTransfers(b[0].id), fetchStockRequests(b[0].id)]);
      setTransfers(t);
      setRequests(r);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load logistics data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  useEffect(() => {
    setIngredientId('');
    if (!fromBranch) return setIngredients([]);
    fetchInventory(fromBranch)
      .then(setIngredients)
      .catch(() => toast.error('Could not load that branch\'s inventory'));
  }, [fromBranch]);

  if (!user || user.role !== 'logistics') {
    return (
      <DashboardLayout>
        <p className="p-6 text-center text-destructive">Access denied. Logistics only.</p>
      </DashboardLayout>
    );
  }

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  async function dispatch() {
    const qty = Number(quantity);
    if (!fromBranch || !toBranch || !ingredientId || !(qty > 0)) {
      return void toast.error('Choose both branches, an item and a quantity');
    }
    if (fromBranch === toBranch) return void toast.error('Source and destination must differ');
    await run(
      () =>
        createTransfer({
          from_branch_id: fromBranch,
          to_branch_id: toBranch,
          ingredient_id: ingredientId,
          quantity: qty,
          initiated_by: user!.id,
          notes: notes.trim() || null,
        }),
      'Transfer dispatched. Source stock deducted; destination confirms receipt.'
    );
    setQuantity('');
    setNotes('');
  }

  const pendingTransfers = transfers.filter((t) => t.status === 'pending').length;
  const pendingRequests = requests.filter((r) => r.status === 'pending').length;
  const selectedIngredient = ingredients.find((i) => i.id === ingredientId);

  return (
    <DashboardLayout title="Logistics">
      <div className="p-4 sm:p-6">
        <Tabs defaultValue="transfers">
          <TabsList className="mb-4">
            <TabsTrigger value="transfers">Transfers ({pendingTransfers} in transit)</TabsTrigger>
            <TabsTrigger value="requests">Stock Requests ({pendingRequests} open)</TabsTrigger>
            <TabsTrigger value="dispatch">Dispatch</TabsTrigger>
          </TabsList>

          <TabsContent value="transfers">
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table className="min-w-[820px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead>To</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transfers.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="whitespace-nowrap">{new Date(t.initiated_at).toLocaleString()}</TableCell>
                        <TableCell>{t.ingredient_name}</TableCell>
                        <TableCell>{branchName(t.from_branch_id)}</TableCell>
                        <TableCell>{branchName(t.to_branch_id)}</TableCell>
                        <TableCell className="text-right font-corp-mono">{t.quantity}</TableCell>
                        <TableCell><Badge className={STATUS_STYLE[t.status]}>{t.status}</Badge></TableCell>
                        <TableCell className="space-x-2 text-right whitespace-nowrap">
                          {t.status === 'pending' && (
                            <>
                              <Button size="sm" disabled={busy} onClick={() => run(() => confirmTransfer(t.id), 'Receipt confirmed')}>
                                Confirm received
                              </Button>
                              <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => rejectTransfer(t.id), 'Transfer rejected')}>
                                Reject
                              </Button>
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {!loading && transfers.length === 0 && <p className="p-4 text-sm text-muted-foreground">No transfers yet.</p>}
                {loading && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="requests">
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table className="min-w-[820px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Requested by branch</TableHead>
                      <TableHead>Source branch</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requests.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</TableCell>
                        <TableCell>{r.ingredient_name}</TableCell>
                        <TableCell>{branchName(r.requesting_branch_id)}</TableCell>
                        <TableCell>{branchName(r.source_branch_id)}</TableCell>
                        <TableCell className="text-right font-corp-mono">{r.quantity}</TableCell>
                        <TableCell><Badge className={STATUS_STYLE[r.status]}>{r.status}</Badge></TableCell>
                        <TableCell className="space-x-2 text-right whitespace-nowrap">
                          {r.status === 'pending' && (
                            <>
                              <Button size="sm" disabled={busy} onClick={() => run(() => fulfillStockRequest(r.id), 'Request fulfilled (transfer created)')}>
                                Fulfill
                              </Button>
                              <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => declineStockRequest(r.id), 'Request declined')}>
                                Decline
                              </Button>
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {!loading && requests.length === 0 && <p className="p-4 text-sm text-muted-foreground">No stock requests yet.</p>}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="dispatch">
            <Card className="max-w-2xl">
              <CardHeader><CardTitle className="font-corp-display">Dispatch a transfer</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Select value={fromBranch} onValueChange={setFromBranch}>
                  <SelectTrigger><SelectValue placeholder="From branch" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={toBranch} onValueChange={setToBranch}>
                  <SelectTrigger><SelectValue placeholder="To branch" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {branches.filter((b) => b.id !== fromBranch).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={ingredientId} onValueChange={setIngredientId} disabled={!fromBranch}>
                  <SelectTrigger><SelectValue placeholder={fromBranch ? 'Item to move' : 'Pick the source branch first'} /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {ingredients.map((i) => (
                      <SelectItem key={i.id} value={i.id}>{i.name} ({i.current_stock} {i.unit} in stock)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input type="number" min="0" placeholder={`Quantity${selectedIngredient ? ` (${selectedIngredient.unit})` : ''}`} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                <Input placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
                <Button onClick={dispatch} disabled={busy}>Dispatch transfer</Button>
                <p className="text-xs text-muted-foreground">Source stock is deducted immediately. The destination branch's stock is added when the receipt is confirmed.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
