import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { supabase } from '@/lib/supabaseClient';
import { PO_SELECT, PurchaseOrder, STATUS_STYLE, peso, statusLabel } from '@/lib/procurement';
import { printPurchaseOrder } from '@/lib/poPrint';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';

interface Receipt { id: string; received_qty: number; actual_unit_cost: number; received_at: string; photo_path: string; po_id: string }
interface Price { id: string; unit_cost: number; created_at: string; ingredients: { name: string; branches: { name: string } | null } | null }

export default function FinanceApprovals() {
  const { user } = useAuth();
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [prices, setPrices] = useState<Price[]>([]);
  const [busy, setBusy] = useState(false);

  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [p, r, h] = await Promise.all([
      supabase.from('purchase_orders').select(PO_SELECT).order('created_at', { ascending: false }).limit(80),
      supabase.from('po_receipts').select('id, received_qty, actual_unit_cost, received_at, photo_path, po_id').order('received_at', { ascending: false }).limit(80),
      supabase.from('ingredient_price_history').select('id, unit_cost, created_at, ingredients(name, branches(name))').order('created_at', { ascending: false }).limit(60),
    ]);
    const err = p.error ?? r.error ?? h.error;
    if (err) toast.error(err.message);
    setPos((p.data as unknown as PurchaseOrder[]) ?? []);
    setReceipts((r.data as Receipt[]) ?? []);
    setPrices((h.data as unknown as Price[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  if (!user || !['finance_admin', 'executive'].includes(user.role)) {
    return <DashboardLayout><p className="p-6 text-center text-red-600">Access denied. Finance only.</p></DashboardLayout>;
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

  const awaiting = pos.filter((p) => p.status === 'awaiting_signatures');
  const committed = pos.filter((p) => p.status !== 'cancelled').reduce((n, p) => n + Number(p.total), 0);
  const poNo = (id: string) => pos.find((p) => p.id === id)?.po_number ?? '';

  return (
    <DashboardLayout title="Finance: Purchase Orders">
      <div className="min-w-0 p-4 sm:p-6 space-y-4">
        {loading && <p role="status" className="py-4 text-sm text-muted-foreground">Loading...</p>}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="min-w-0"><CardContent className="p-4"><p className="text-xs text-gray-600">Awaiting signature</p><p className="text-3xl font-corp-display font-bold">{awaiting.length}</p></CardContent></Card>
          <Card className="min-w-0"><CardContent className="p-4"><p className="text-xs text-gray-600">Total PO value (loaded)</p><p className="text-3xl font-corp-display font-bold">{peso(committed)}</p></CardContent></Card>
          <Card className="min-w-0"><CardContent className="p-4"><p className="text-xs text-gray-600">Receipts on file</p><p className="text-3xl font-corp-display font-bold">{receipts.length}</p></CardContent></Card>
        </div>
        <Tabs defaultValue="po">
          <TabsList className="mb-2">
            <TabsTrigger value="po">Purchase Orders</TabsTrigger>
            <TabsTrigger value="receipts">Receipts</TabsTrigger>
            <TabsTrigger value="prices">Unit Price History</TabsTrigger>
          </TabsList>
          <TabsContent value="po"><Card className="min-w-0"><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>PO #</TableHead><TableHead>Item</TableHead><TableHead>Supplier</TableHead>
                <TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Status</TableHead><TableHead>Signed</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>{pos.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-corp-mono">{p.po_number}</TableCell><TableCell>{p.item_name}</TableCell><TableCell>{p.suppliers?.name}</TableCell>
                  <TableCell className="text-right">{p.quantity} {p.unit}</TableCell><TableCell className="text-right font-corp-mono">{peso(p.total)}</TableCell>
                  <TableCell><Badge className={`shrink-0 ${STATUS_STYLE[p.status]}`}>{statusLabel(p.status)}</Badge></TableCell>
                  <TableCell className="text-xs">Procurement: {p.procurement_signed_at ? '✓' : '—'}<br />Finance: {p.finance_signed_at ? '✓' : '—'}</TableCell>
                  <TableCell className="space-x-2 text-right whitespace-nowrap">
                    {canSign && p.status === 'awaiting_signatures' && !p.finance_signed_at && <Button size="sm" className="min-h-9" disabled={busy} onClick={() => sign(p.id)}>Sign</Button>}
                    <Button size="sm" className="min-h-9" variant="outline" onClick={() => { printPurchaseOrder(p); supabase.rpc('mark_po_printed', { p_po_id: p.id }).then(() => load()); }}>Print</Button>
                  </TableCell>
                </TableRow>))}</TableBody>
            </Table>
            {!loading && pos.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">No purchase orders yet.</p>}
          </CardContent></Card></TabsContent>
          <TabsContent value="receipts"><Card className="min-w-0"><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>PO #</TableHead><TableHead>Received</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Actual price</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>{receipts.map((r) => (
                <TableRow key={r.id}><TableCell className="font-corp-mono">{poNo(r.po_id)}</TableCell><TableCell>{new Date(r.received_at).toLocaleString()}</TableCell>
                  <TableCell className="text-right">{r.received_qty}</TableCell><TableCell className="text-right font-corp-mono">{peso(r.actual_unit_cost)}</TableCell>
                  <TableCell className="text-right"><Button size="sm" className="min-h-9" variant="outline" onClick={() => viewReceipt(r.photo_path)}>View photo</Button></TableCell></TableRow>))}</TableBody>
            </Table>
            {!loading && receipts.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">No receipts yet.</p>}
          </CardContent></Card></TabsContent>
          <TabsContent value="prices"><Card className="min-w-0"><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Branch</TableHead><TableHead>Ingredient</TableHead><TableHead className="text-right">New unit cost</TableHead></TableRow></TableHeader>
              <TableBody>{prices.map((p) => (
                <TableRow key={p.id}><TableCell>{new Date(p.created_at).toLocaleString()}</TableCell><TableCell>{p.ingredients?.branches?.name}</TableCell>
                  <TableCell>{p.ingredients?.name}</TableCell><TableCell className="text-right font-corp-mono">{peso(p.unit_cost)}</TableCell></TableRow>))}</TableBody>
            </Table>
            {!loading && prices.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">No price changes recorded yet.</p>}
          </CardContent></Card></TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
