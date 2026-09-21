import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { supabase } from '@/lib/supabaseClient';
import { PO_SELECT, PurchaseOrder, STATUS_STYLE, peso, statusLabel } from '@/lib/procurement';
import { printPurchaseOrder } from '@/lib/poPrint';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';

interface ReqItem { id: string; item_name: string; unit: string; quantity: number; ticket_id: string | null }
interface Req {
  id: string; week_of: string; status: string; notes: string | null;
  branches: { name: string } | null; purchase_request_items: ReqItem[];
}
interface Quote { id: string; unit_cost: number; selected: boolean; suppliers: { name: string; contact_number: string | null; location: string | null } | null }
interface Ticket {
  id: string; item_name: string; unit: string; total_quantity: number; status: string;
  canvass_quotes: Quote[]; profiles: { full_name: string | null } | null;
}

export default function Procurement() {
  const { user } = useAuth();
  const [reqs, setReqs] = useState<Req[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [canvassers, setCanvassers] = useState<{ id: string; full_name: string | null }[]>([]);
  const [canvasser, setCanvasser] = useState('');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [r, t, p, c] = await Promise.all([
      supabase.from('purchase_requests')
        .select('id, week_of, status, notes, branches(name), purchase_request_items(id, item_name, unit, quantity, ticket_id)')
        .neq('status', 'cancelled').order('created_at', { ascending: false }).limit(60),
      supabase.from('canvass_tickets')
        .select('id, item_name, unit, total_quantity, status, profiles:assigned_to(full_name), canvass_quotes(id, unit_cost, selected, suppliers(name, contact_number, location))')
        .neq('status', 'cancelled').order('created_at', { ascending: false }).limit(60),
      supabase.from('purchase_orders').select(PO_SELECT).order('created_at', { ascending: false }).limit(60),
      supabase.from('profiles').select('id, full_name').eq('role', 'canvasser'),
    ]);
    const err = r.error ?? t.error ?? p.error ?? c.error;
    if (err) toast.error(err.message);
    setReqs((r.data as unknown as Req[]) ?? []);
    setTickets((t.data as unknown as Ticket[]) ?? []);
    setPos((p.data as unknown as PurchaseOrder[]) ?? []);
    setCanvassers(c.data ?? []);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  if (!user || !['procurement', 'finance_admin'].includes(user.role)) {
    return (
      <DashboardLayout><p className="p-6 text-center text-red-600">Access denied.</p></DashboardLayout>
    );
  }
  // finance admin sees everything here, but the procurement steps stay with the procurement head (separation of duties)
  const canAct = user.role === 'procurement';

  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) => {
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) return void toast.error(error.message);
    toast.success(ok);
    setChecked(new Set());
    void load();
  };

  const toggle = (id: string) => {
    const n = new Set(checked);
    n.has(id) ? n.delete(id) : n.add(id);
    setChecked(n);
  };

  const inbox = reqs.filter((r) => r.purchase_request_items.some((i) => !i.ticket_id));
  const selectedTickets = tickets.filter((t) => t.status === 'selected');
  const myPos = pos;

  return (
    <DashboardLayout title="Procurement">
      <div className="min-w-0 p-4 sm:p-6">
        {loading && <p role="status" className="py-4 text-sm text-muted-foreground">Loading...</p>}
        <Tabs defaultValue="inbox">
          <TabsList className="mb-4">
            <TabsTrigger value="inbox">Requests Inbox ({inbox.length})</TabsTrigger>
            <TabsTrigger value="canvass">Canvass Review ({tickets.filter((t) => t.status === 'submitted' || t.status === 'open').length})</TabsTrigger>
            <TabsTrigger value="po">Purchase Orders ({myPos.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="inbox" className="space-y-4">
            {canAct && <Card className="min-w-0">
              <CardContent className="p-4 flex flex-wrap gap-3 items-center">
                <span className="text-sm text-gray-600">Send selected items for canvassing to</span>
                <Select value={canvasser} onValueChange={setCanvasser}>
                  <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="Choose canvass personnel" /></SelectTrigger>
                  <SelectContent>
                    {canvassers.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name ?? c.id.slice(0, 8)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button disabled={busy || !canvasser || checked.size === 0} className="h-auto min-h-9 whitespace-normal "
                  onClick={() => run(() => supabase.rpc('create_canvass_tickets', { p_request_item_ids: Array.from(checked), p_canvasser: canvasser }), 'Canvass tickets created')}>
                  Create canvass tickets ({checked.size})
                </Button>
                <span className="text-xs text-gray-500">Same item + unit from different branches is merged into one ticket.</span>
              </CardContent>
            </Card>}
            {!loading && inbox.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">No new requests.</p>}
            {inbox.map((r) => (
              <Card className="min-w-0" key={r.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="leading-snug font-corp-display text-base flex flex-col items-start gap-2 sm:flex-row sm:justify-between">
                    <span>{r.branches?.name} — week of {r.week_of}</span>
                    <Badge className={`shrink-0 ${STATUS_STYLE[r.status]}`}>{statusLabel(r.status)}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {r.notes && <p className="text-xs text-gray-500 mb-1">Note: {r.notes}</p>}
                  {r.purchase_request_items.filter((i) => !i.ticket_id).map((i) => (
                    <label key={i.id} className="flex min-h-9 items-center gap-2 text-sm cursor-pointer">
                      {canAct && <input type="checkbox" checked={checked.has(i.id)} onChange={() => toggle(i.id)} />}
                      {i.quantity} {i.unit} — {i.item_name}
                    </label>
                  ))}
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="canvass" className="space-y-4">
            {!loading && tickets.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">No canvass tickets yet.</p>}
            {tickets.map((t) => (
              <Card className="min-w-0" key={t.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="leading-snug font-corp-display text-base flex flex-col items-start gap-2 sm:flex-row sm:justify-between">
                    <span>{t.total_quantity} {t.unit} — {t.item_name}
                      <span className="text-xs font-normal text-gray-500 ml-2">canvasser: {t.profiles?.full_name ?? '—'}</span></span>
                    <Badge className={`shrink-0 ${STATUS_STYLE[t.status]}`}>{statusLabel(t.status)}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {t.canvass_quotes.length === 0 ? (
                    <p className="text-sm text-gray-500">Waiting for canvass submission.</p>
                  ) : (
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Supplier</TableHead><TableHead>Location / Contact</TableHead>
                        <TableHead className="text-right">Unit price</TableHead><TableHead className="text-right">Total</TableHead><TableHead />
                      </TableRow></TableHeader>
                      <TableBody>
                        {[...t.canvass_quotes].sort((a, b) => a.unit_cost - b.unit_cost).map((q) => (
                          <TableRow key={q.id} className={q.selected ? 'bg-green-50' : ''}>
                            <TableCell className="font-medium">{q.suppliers?.name}</TableCell>
                            <TableCell className="text-sm text-gray-600">{q.suppliers?.location} {q.suppliers?.contact_number}</TableCell>
                            <TableCell className="text-right font-corp-mono">{peso(q.unit_cost)}</TableCell>
                            <TableCell className="text-right font-corp-mono">{peso(q.unit_cost * t.total_quantity)}</TableCell>
                            <TableCell className="text-right">
                              {q.selected ? <Badge className="bg-green-100 text-green-800">Selected</Badge>
                                : canAct && !['ordered'].includes(t.status) && (
                                  <Button size="sm" className="min-h-9" variant="outline" disabled={busy}
                                    onClick={() => run(() => supabase.rpc('select_quote', { p_quote_id: q.id }), 'Quote selected')}>Select</Button>)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="po" className="space-y-4">
            {canAct && <Button disabled={busy || selectedTickets.length === 0} className="h-auto min-h-9 whitespace-normal "
              onClick={() => run(() => supabase.rpc('compile_purchase_orders', { p_ticket_ids: null }), 'Purchase orders compiled')}>
              Compile purchase orders ({selectedTickets.length} item{selectedTickets.length === 1 ? '' : 's'} ready)
            </Button>}
            <Card className="min-w-0"><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>PO #</TableHead><TableHead>Item</TableHead><TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead><TableHead>Signatures</TableHead><TableHead />
                </TableRow></TableHeader>
                <TableBody>
                  {myPos.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-corp-mono">{p.po_number}</TableCell>
                      <TableCell>{p.item_name}</TableCell>
                      <TableCell>{p.suppliers?.name}</TableCell>
                      <TableCell className="text-right">{p.quantity} {p.unit}</TableCell>
                      <TableCell className="text-right font-corp-mono">{peso(p.total)}</TableCell>
                      <TableCell><Badge className={`shrink-0 ${STATUS_STYLE[p.status]}`}>{statusLabel(p.status)}</Badge></TableCell>
                      <TableCell className="text-xs">
                        Procurement: {p.procurement_signed_at ? '✓' : '—'}<br />Finance: {p.finance_signed_at ? '✓' : '—'}
                      </TableCell>
                      <TableCell className="space-x-2 text-right whitespace-nowrap">
                        {canAct && p.status === 'awaiting_signatures' && !p.procurement_signed_at && (
                          <Button size="sm" className="min-h-9" disabled={busy} onClick={() => run(() => supabase.rpc('sign_purchase_order', { p_po_id: p.id }), 'Signed')}>Sign</Button>)}
                        <Button size="sm" className="min-h-9" variant="outline" onClick={() => { printPurchaseOrder(p); supabase.rpc('mark_po_printed', { p_po_id: p.id }).then(() => load()); }}>Print</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!loading && myPos.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">No purchase orders yet.</p>}
            </CardContent></Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
