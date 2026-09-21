import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { supabase } from '@/lib/supabaseClient';
import { PO_SELECT, PurchaseOrder, STATUS_STYLE, peso, statusLabel } from '@/lib/procurement';
import { printPurchaseOrder } from '@/lib/poPrint';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';

interface Receipt { id: string; received_qty: number; actual_unit_cost: number; received_at: string; photo_path: string; po_id: string }
interface Price { id: string; unit_cost: number; created_at: string; ingredients: { name: string; branches: { name: string } | null } | null }
interface Supplier { id: string; name: string; contact_number: string | null; location: string | null; notes: string | null }
type PO = PurchaseOrder & { supplier_id: string; procurement_signed_by: string | null; finance_signed_by: string | null };

const ALL = 'all';
const monthKey = (iso: string) => iso.slice(0, 7);

export default function FinanceApprovals() {
  const { user } = useAuth();
  const [pos, setPos] = useState<PO[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [prices, setPrices] = useState<Price[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  // PO History filters
  const [q, setQ] = useState('');
  const [status, setStatus] = useState(ALL);
  const [supplier, setSupplier] = useState(ALL);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [detail, setDetail] = useState<PO | null>(null);

  const load = async () => {
    const [p, r, h, s, pr] = await Promise.all([
      supabase.from('purchase_orders').select(PO_SELECT).order('created_at', { ascending: false }).limit(500),
      supabase.from('po_receipts').select('id, received_qty, actual_unit_cost, received_at, photo_path, po_id').order('received_at', { ascending: false }).limit(500),
      supabase.from('ingredient_price_history').select('id, unit_cost, created_at, ingredients(name, branches(name))').order('created_at', { ascending: false }).limit(100),
      supabase.from('suppliers').select('id, name, contact_number, location, notes').order('name'),
      supabase.from('profiles').select('id, full_name').in('role', ['procurement', 'finance_admin', 'canvasser']),
    ]);
    const err = p.error ?? r.error ?? h.error ?? s.error;
    if (err) toast.error(err.message);
    setPos((p.data as unknown as PO[]) ?? []);
    setReceipts((r.data as Receipt[]) ?? []);
    setPrices((h.data as unknown as Price[]) ?? []);
    setSuppliers((s.data as Supplier[]) ?? []);
    setNames(Object.fromEntries((pr.data ?? []).map((x) => [x.id as string, (x.full_name as string) ?? '—'])));
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const active = pos.filter((p) => p.status !== 'cancelled');
  const poNo = (id: string) => pos.find((p) => p.id === id)?.po_number ?? '';

  const history = useMemo(() => {
    const term = q.trim().toLowerCase();
    return pos.filter((p) => {
      if (status !== ALL && p.status !== status) return false;
      if (supplier !== ALL && p.supplier_id !== supplier) return false;
      if (from && p.created_at.slice(0, 10) < from) return false;
      if (to && p.created_at.slice(0, 10) > to) return false;
      if (term && !`${p.po_number} ${p.item_name} ${p.suppliers?.name ?? ''}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [pos, q, status, supplier, from, to]);
  const historyTotal = history.reduce((n, p) => n + Number(p.total), 0);

  const byMonth = useMemo(() => {
    const m = new Map<string, { count: number; total: number }>();
    for (const p of active) {
      const k = monthKey(p.created_at); const e = m.get(k) ?? { count: 0, total: 0 };
      e.count++; e.total += Number(p.total); m.set(k, e);
    }
    return Array.from(m.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [active]);
  const bySupplier = useMemo(() => {
    const m = new Map<string, { count: number; total: number }>();
    for (const p of active) {
      const k = p.suppliers?.name ?? '—'; const e = m.get(k) ?? { count: 0, total: 0 };
      e.count++; e.total += Number(p.total); m.set(k, e);
    }
    return Array.from(m.entries()).sort((a, b) => b[1].total - a[1].total).slice(0, 10);
  }, [active]);

  if (!user || !['finance_admin', 'executive'].includes(user.role)) {
    return <DashboardLayout><p className="p-6 text-center text-destructive">Access denied. Finance only.</p></DashboardLayout>;
  }
  const canSign = user.role === 'finance_admin';

  const sign = async (id: string) => {
    setBusy(true);
    const { error } = await supabase.rpc('sign_purchase_order', { p_po_id: id });
    setBusy(false);
    if (error) return void toast.error(error.message);
    toast.success('Signed');
    void load();
  };

  const viewReceipt = async (path: string) => {
    const { data, error } = await supabase.storage.from('receipts').createSignedUrl(path, 300);
    if (error || !data) return void toast.error(error?.message ?? 'Could not open receipt');
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  const print = (p: PO) => {
    printPurchaseOrder(p);
    supabase.rpc('mark_po_printed', { p_po_id: p.id }).then(() => load());
  };

  const exportCsv = () => {
    const rows = [['PO number', 'Date', 'Supplier', 'Item', 'Qty', 'Unit', 'Unit price', 'Total', 'Status']].concat(
      history.map((p) => [p.po_number, p.created_at.slice(0, 10), p.suppliers?.name ?? '', p.item_name, String(p.quantity), p.unit, String(p.unit_cost), String(p.total), p.status])
    );
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `purchase-order-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const awaiting = pos.filter((p) => p.status === 'awaiting_signatures');
  const approved = pos.filter((p) => p.status === 'approved');
  const received = pos.filter((p) => p.status === 'received');
  const sum = (l: PO[]) => l.reduce((n, p) => n + Number(p.total), 0);
  const detailReceipts = detail ? receipts.filter((r) => r.po_id === detail.id) : [];

  const poTable = (list: PO[], showActions: boolean) => (
    <Card className="min-w-0"><CardContent className="p-0 overflow-x-auto">
      <Table className="min-w-[860px]">
        <TableHeader><TableRow><TableHead>PO #</TableHead><TableHead>Date</TableHead><TableHead>Item</TableHead><TableHead>Supplier</TableHead>
          <TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Status</TableHead><TableHead>Signed</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>{list.map((p) => (
          <TableRow key={p.id} className="cursor-pointer" onClick={() => setDetail(p)}>
            <TableCell className="font-corp-mono">{p.po_number}</TableCell><TableCell className="whitespace-nowrap">{p.created_at.slice(0, 10)}</TableCell>
            <TableCell>{p.item_name}</TableCell><TableCell>{p.suppliers?.name}</TableCell>
            <TableCell className="text-right">{p.quantity} {p.unit}</TableCell><TableCell className="text-right font-corp-mono">{peso(p.total)}</TableCell>
            <TableCell><Badge className={STATUS_STYLE[p.status]}>{statusLabel(p.status)}</Badge></TableCell>
            <TableCell className="text-xs">Procurement: {p.procurement_signed_at ? '✓' : '—'}<br />Finance: {p.finance_signed_at ? '✓' : '—'}</TableCell>
            <TableCell className="space-x-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
              {showActions && canSign && p.status === 'awaiting_signatures' && !p.finance_signed_at && <Button size="sm" disabled={busy} onClick={() => sign(p.id)}>Sign</Button>}
              <Button size="sm" variant="outline" onClick={() => print(p)}>Print</Button>
            </TableCell>
          </TableRow>))}</TableBody>
      </Table>
      {!loading && list.length === 0 && <p className="p-4 text-sm text-muted-foreground">No purchase orders match.</p>}
      {loading && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
    </CardContent></Card>
  );

  return (
    <DashboardLayout title="Finance: Purchase Orders">
      <div className="p-4 sm:p-6 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Awaiting signature</p><p className="text-3xl font-corp-display font-bold">{awaiting.length}</p><p className="text-xs text-muted-foreground">{peso(sum(awaiting))}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Approved, awaiting delivery</p><p className="text-3xl font-corp-display font-bold">{approved.length}</p><p className="text-xs text-muted-foreground">{peso(sum(approved))}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Received</p><p className="text-3xl font-corp-display font-bold">{received.length}</p><p className="text-xs text-muted-foreground">{peso(sum(received))}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total PO value</p><p className="text-3xl font-corp-display font-bold">{peso(sum(active))}</p><p className="text-xs text-muted-foreground">{active.length} orders</p></CardContent></Card>
        </div>
        <Tabs defaultValue="po">
          <TabsList className="mb-2 flex-wrap h-auto">
            <TabsTrigger value="po">Purchase Orders</TabsTrigger>
            <TabsTrigger value="history">PO History</TabsTrigger>
            <TabsTrigger value="overview">Spend Overview</TabsTrigger>
            <TabsTrigger value="receipts">Receipts</TabsTrigger>
            <TabsTrigger value="prices">Unit Price History</TabsTrigger>
            <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          </TabsList>

          <TabsContent value="po">{poTable(pos.filter((p) => ['awaiting_signatures', 'approved'].includes(p.status)), true)}</TabsContent>

          <TabsContent value="history" className="space-y-3">
            <Card><CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 items-end">
              <Input className="lg:col-span-2" placeholder="Search PO #, item or supplier" value={q} onChange={(e) => setQ(e.target.value)} />
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All statuses</SelectItem>
                  {['awaiting_signatures', 'approved', 'received', 'cancelled'].map((s) => <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={supplier} onValueChange={setSupplier}>
                <SelectTrigger><SelectValue placeholder="Supplier" /></SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value={ALL}>All suppliers</SelectItem>
                  {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input type="date" aria-label="From date" value={from} onChange={(e) => setFrom(e.target.value)} />
              <Input type="date" aria-label="To date" value={to} onChange={(e) => setTo(e.target.value)} />
            </CardContent></Card>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>{history.length} purchase order{history.length === 1 ? '' : 's'} · <b className="font-corp-mono">{peso(historyTotal)}</b></span>
              <Button size="sm" variant="outline" onClick={exportCsv} disabled={history.length === 0}>Export CSV</Button>
            </div>
            {poTable(history, false)}
          </TabsContent>

          <TabsContent value="overview" className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card><CardHeader><CardTitle className="text-base">By month</CardTitle></CardHeader><CardContent className="p-0">
              <Table><TableHeader><TableRow><TableHead>Month</TableHead><TableHead className="text-right">Orders</TableHead><TableHead className="text-right">Value</TableHead></TableRow></TableHeader>
                <TableBody>{byMonth.map(([m, v]) => <TableRow key={m}><TableCell>{m}</TableCell><TableCell className="text-right">{v.count}</TableCell><TableCell className="text-right font-corp-mono">{peso(v.total)}</TableCell></TableRow>)}</TableBody></Table>
              {byMonth.length === 0 && <p className="p-4 text-sm text-muted-foreground">No purchase orders yet.</p>}
            </CardContent></Card>
            <Card><CardHeader><CardTitle className="text-base">Top suppliers</CardTitle></CardHeader><CardContent className="p-0">
              <Table><TableHeader><TableRow><TableHead>Supplier</TableHead><TableHead className="text-right">Orders</TableHead><TableHead className="text-right">Value</TableHead></TableRow></TableHeader>
                <TableBody>{bySupplier.map(([n, v]) => <TableRow key={n}><TableCell>{n}</TableCell><TableCell className="text-right">{v.count}</TableCell><TableCell className="text-right font-corp-mono">{peso(v.total)}</TableCell></TableRow>)}</TableBody></Table>
              {bySupplier.length === 0 && <p className="p-4 text-sm text-muted-foreground">No purchase orders yet.</p>}
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="receipts"><Card className="min-w-0"><CardContent className="p-0 overflow-x-auto">
            <Table className="min-w-[640px]">
              <TableHeader><TableRow><TableHead>PO #</TableHead><TableHead>Received</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Actual price</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>{receipts.map((r) => (
                <TableRow key={r.id}><TableCell className="font-corp-mono">{poNo(r.po_id)}</TableCell><TableCell>{new Date(r.received_at).toLocaleString()}</TableCell>
                  <TableCell className="text-right">{r.received_qty}</TableCell><TableCell className="text-right font-corp-mono">{peso(r.actual_unit_cost)}</TableCell>
                  <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => viewReceipt(r.photo_path)}>View photo</Button></TableCell></TableRow>))}</TableBody>
            </Table>
            {receipts.length === 0 && <p className="p-4 text-sm text-muted-foreground">No receipts yet.</p>}
          </CardContent></Card></TabsContent>

          <TabsContent value="prices"><Card className="min-w-0"><CardContent className="p-0 overflow-x-auto">
            <Table className="min-w-[640px]">
              <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Branch</TableHead><TableHead>Ingredient</TableHead><TableHead className="text-right">New unit cost</TableHead></TableRow></TableHeader>
              <TableBody>{prices.map((p) => (
                <TableRow key={p.id}><TableCell>{new Date(p.created_at).toLocaleString()}</TableCell><TableCell>{p.ingredients?.branches?.name}</TableCell>
                  <TableCell>{p.ingredients?.name}</TableCell><TableCell className="text-right font-corp-mono">{peso(p.unit_cost)}</TableCell></TableRow>))}</TableBody>
            </Table>
            {prices.length === 0 && <p className="p-4 text-sm text-muted-foreground">No price changes recorded yet.</p>}
          </CardContent></Card></TabsContent>

          <TabsContent value="suppliers"><Card className="min-w-0"><CardContent className="p-0 overflow-x-auto">
            <Table className="min-w-[560px]">
              <TableHeader><TableRow><TableHead>Supplier</TableHead><TableHead>Contact</TableHead><TableHead>Location</TableHead><TableHead className="text-right">POs</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
              <TableBody>{suppliers.map((s) => {
                const mine = active.filter((p) => p.supplier_id === s.id);
                return <TableRow key={s.id}><TableCell className="font-medium">{s.name}</TableCell><TableCell>{s.contact_number}</TableCell><TableCell>{s.location}</TableCell>
                  <TableCell className="text-right">{mine.length}</TableCell><TableCell className="text-right font-corp-mono">{peso(sum(mine))}</TableCell></TableRow>;
              })}</TableBody>
            </Table>
            {suppliers.length === 0 && <p className="p-4 text-sm text-muted-foreground">No suppliers yet.</p>}
          </CardContent></Card></TabsContent>
        </Tabs>
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{detail?.po_number}</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Status</span><Badge className={STATUS_STYLE[detail.status]}>{statusLabel(detail.status)}</Badge></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span>{new Date(detail.created_at).toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Supplier</span><span>{detail.suppliers?.name} {detail.suppliers?.contact_number && `· ${detail.suppliers.contact_number}`}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Item</span><span>{detail.quantity} {detail.unit} {detail.item_name}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Unit price / total</span><span className="font-corp-mono">{peso(detail.unit_cost)} / {peso(detail.total)}</span></div>
              <div><p className="text-muted-foreground mb-1">Branch split</p>{detail.po_allocations.map((a, i) => <div key={i} className="flex justify-between"><span>{a.branches?.name}</span><span>{a.quantity} {detail.unit}</span></div>)}</div>
              <div><p className="text-muted-foreground mb-1">Signatures</p>
                <div>Procurement: {detail.procurement_signed_at ? `${names[detail.procurement_signed_by ?? ''] ?? 'signed'} · ${new Date(detail.procurement_signed_at).toLocaleString()}` : 'pending'}</div>
                <div>Finance: {detail.finance_signed_at ? `${names[detail.finance_signed_by ?? ''] ?? 'signed'} · ${new Date(detail.finance_signed_at).toLocaleString()}` : 'pending'}</div></div>
              <div><p className="text-muted-foreground mb-1">Receiving</p>
                {detailReceipts.length === 0 ? <p>Not received yet.</p> : detailReceipts.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-2"><span>{r.received_qty} {detail.unit} @ {peso(r.actual_unit_cost)} · {new Date(r.received_at).toLocaleString()}</span>
                    <Button size="sm" variant="outline" onClick={() => viewReceipt(r.photo_path)}>Photo</Button></div>))}</div>
              <div className="flex gap-2 justify-end">
                {canSign && detail.status === 'awaiting_signatures' && !detail.finance_signed_at && <Button disabled={busy} onClick={() => sign(detail.id).then(() => setDetail(null))}>Sign</Button>}
                <Button variant="outline" onClick={() => print(detail)}>Print</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
