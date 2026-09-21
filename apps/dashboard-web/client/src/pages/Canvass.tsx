import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { supabase } from '@/lib/supabaseClient';
import { PO_SELECT, PurchaseOrder, STATUS_STYLE, peso, statusLabel } from '@/lib/procurement';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Camera } from 'lucide-react';
import { toast } from 'sonner';

interface Supplier { id: string; name: string; contact_number: string | null; location: string | null; notes: string | null }
interface Ticket {
  id: string; item_name: string; unit: string; total_quantity: number; status: string; week_of: string;
  canvass_quotes: { id: string; unit_cost: number; suppliers: { name: string } | null }[];
}
interface QuoteRow { supplierId: string; name: string; contact: string; location: string; cost: string; notes: string }
const emptyQuote = (): QuoteRow => ({ supplierId: '', name: '', contact: '', location: '', cost: '', notes: '' });

export default function Canvass() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [active, setActive] = useState<Ticket | null>(null);
  const [quotes, setQuotes] = useState<QuoteRow[]>([emptyQuote()]);
  const [search, setSearch] = useState('');
  const [newSup, setNewSup] = useState({ name: '', contact: '', location: '' });
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null);
  const [recv, setRecv] = useState({ qty: '', cost: '', notes: '' });
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [t, s, p] = await Promise.all([
      supabase.from('canvass_tickets')
        .select('id, item_name, unit, total_quantity, status, week_of, canvass_quotes(id, unit_cost, suppliers(name))')
        .in('status', ['open', 'submitted', 'selected']).order('created_at', { ascending: false }),
      supabase.from('suppliers').select('id, name, contact_number, location, notes').eq('active', true).order('name'),
      supabase.from('purchase_orders').select(PO_SELECT).in('status', ['approved', 'received']).order('created_at', { ascending: false }).limit(40),
    ]);
    const err = t.error ?? s.error ?? p.error;
    if (err) toast.error(err.message);
    setTickets((t.data as unknown as Ticket[]) ?? []);
    setSuppliers(s.data ?? []);
    setPos((p.data as unknown as PurchaseOrder[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  if (!user || !['canvasser', 'finance_admin'].includes(user.role)) {
    return <DashboardLayout><p className="p-6 text-center text-red-600">Access denied.</p></DashboardLayout>;
  }
  const canAct = user.role === 'canvasser'; // finance admin can view tickets, receiving and suppliers

  const setQ = (i: number, patch: Partial<QuoteRow>) => setQuotes(quotes.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  const pickSupplier = (i: number, id: string) => {
    const s = suppliers.find((x) => x.id === id);
    if (s) setQ(i, { supplierId: id, name: s.name, contact: s.contact_number ?? '', location: s.location ?? '' });
  };

  const openTicket = (t: Ticket) => { setActive(t); setQuotes([emptyQuote()]); };

  const submitCanvass = async () => {
    if (!active) return;
    const payload = quotes.filter((q) => (q.supplierId || q.name.trim()) && q.cost !== '').map((q) => ({
      supplier_id: q.supplierId || null, supplier_name: q.name, contact_number: q.contact, location: q.location,
      unit_cost: Number(q.cost), notes: q.notes || null,
    }));
    if (payload.length === 0) return void toast.error('Add at least one supplier with a unit price');
    if (payload.some((p) => !p.supplier_id && (!p.contact_number || !p.location)))
      return void toast.error('New suppliers need a contact number and location');
    setBusy(true);
    const { error } = await supabase.rpc('submit_canvass', { p_ticket_id: active.id, p_quotes: payload });
    setBusy(false);
    if (error) return void toast.error(error.message);
    toast.success('Canvass submitted to Procurement');
    setActive(null);
    void load();
  };

  const addSupplier = async () => {
    if (!newSup.name.trim()) return void toast.error('Supplier name required');
    const { error } = await supabase.from('suppliers').insert({
      name: newSup.name.trim(), contact_number: newSup.contact || null, location: newSup.location || null, created_by: user.id,
    });
    if (error) return void toast.error(error.message.includes('duplicate') ? 'Supplier already exists' : error.message);
    setNewSup({ name: '', contact: '', location: '' });
    void load();
  };

  const startReceive = (p: PurchaseOrder) => {
    setReceiving(p); setPhoto(null);
    setRecv({ qty: String(p.quantity), cost: String(p.unit_cost), notes: '' });
  };

  const submitReceive = async () => {
    if (!receiving) return;
    if (!photo) return void toast.error('Take or attach a photo of the receipt');
    if (!(Number(recv.qty) > 0) || recv.cost === '') return void toast.error('Enter quantity received and actual unit price');
    setBusy(true);
    const ext = (photo.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${receiving.id}/${Date.now()}.${ext}`;
    const up = await supabase.storage.from('receipts').upload(path, photo, { contentType: photo.type || 'image/jpeg' });
    if (up.error) { setBusy(false); return void toast.error(`Photo upload failed: ${up.error.message}`); }
    const { error } = await supabase.rpc('receive_purchase_order', {
      p_po_id: receiving.id, p_qty: Number(recv.qty), p_actual_cost: Number(recv.cost), p_photo_path: path, p_notes: recv.notes || null,
    });
    setBusy(false);
    if (error) { await supabase.storage.from('receipts').remove([path]); return void toast.error(error.message); }
    toast.success('Received. Stock and unit cost updated.');
    setReceiving(null);
    void load();
  };

  const filtered = suppliers.filter((s) => `${s.name} ${s.location ?? ''}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <DashboardLayout title="Canvass">
      <div className="min-w-0 p-4 sm:p-6">
        {loading && <p role="status" className="py-4 text-sm text-muted-foreground">Loading...</p>}
        <Tabs defaultValue="requests">
          <TabsList className="mb-4">
            <TabsTrigger value="requests">Canvass Requests ({tickets.filter((t) => t.status === 'open').length})</TabsTrigger>
            <TabsTrigger value="receiving">Receiving ({pos.filter((p) => p.status === 'approved').length})</TabsTrigger>
            <TabsTrigger value="suppliers">Supplier Database ({suppliers.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="requests" className="space-y-3">
            {!loading && tickets.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">No canvass requests assigned to you.</p>}
            {tickets.map((t) => (
              <Card className="min-w-0" key={t.id}>
                <CardContent className="p-4 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                  <div>
                    <p className="font-corp-display font-semibold">{t.total_quantity} {t.unit} — {t.item_name}</p>
                    <p className="text-xs text-gray-500">Week of {t.week_of} · {t.canvass_quotes.length} quote(s) submitted</p>
                  </div>
                  <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:shrink-0">
                    <Badge className={`shrink-0 ${STATUS_STYLE[t.status]}`}>{statusLabel(t.status)}</Badge>
                    {canAct && ['open', 'submitted'].includes(t.status) && (
                      <Button size="sm" className="min-h-9 " onClick={() => openTicket(t)}>
                        {t.status === 'open' ? 'Fill up canvass' : 'Add quotes'}
                      </Button>)}
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="receiving" className="space-y-3">
            {!loading && pos.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">No signed purchase orders yet.</p>}
            {pos.map((p) => (
              <Card className="min-w-0" key={p.id}>
                <CardContent className="p-4 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                  <div>
                    <p className="font-corp-display font-semibold">{p.po_number} — {p.quantity} {p.unit} {p.item_name}</p>
                    <p className="text-xs text-gray-500">{p.suppliers?.name} · {p.suppliers?.location} · {peso(p.unit_cost)}/{p.unit} · total {peso(p.total)}</p>
                  </div>
                  <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:shrink-0">
                    <Badge className={`shrink-0 ${STATUS_STYLE[p.status]}`}>{statusLabel(p.status)}</Badge>
                    {canAct && p.status === 'approved' && <Button size="sm" className="min-h-9 " onClick={() => startReceive(p)}>Receive</Button>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="suppliers" className="space-y-4">
            <Card className="min-w-0"><CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-2">
              <Input placeholder="Shop / supplier name" value={newSup.name} onChange={(e) => setNewSup({ ...newSup, name: e.target.value })} />
              <Input placeholder="Contact number" value={newSup.contact} onChange={(e) => setNewSup({ ...newSup, contact: e.target.value })} />
              <Input placeholder="Location" value={newSup.location} onChange={(e) => setNewSup({ ...newSup, location: e.target.value })} />
              <Button onClick={addSupplier}><Plus className="w-4 h-4 mr-1" />Add supplier</Button>
            </CardContent></Card>
            <Input placeholder="Search suppliers" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
            <Card className="min-w-0"><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Contact</TableHead><TableHead>Location</TableHead></TableRow></TableHeader>
                <TableBody>
                  {filtered.map((s) => (
                    <TableRow key={s.id}><TableCell className="font-medium">{s.name}</TableCell><TableCell>{s.contact_number}</TableCell><TableCell>{s.location}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
              {!loading && filtered.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">No suppliers found.</p>}
            </CardContent></Card>
          </TabsContent>
        </Tabs>

        {/* Canvass fill-up form */}
        <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
          <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="pr-6 font-corp-display leading-snug">Canvass: {active?.total_quantity} {active?.unit} {active?.item_name}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              {quotes.map((q, i) => (
                <div key={i} className="border rounded p-3 space-y-2">
                  <div className="flex gap-2">
                    <Select value={q.supplierId} onValueChange={(v) => pickSupplier(i, v)}>
                      <SelectTrigger className="min-w-0 flex-1 [&>span]:truncate"><SelectValue placeholder="Existing supplier (or type a new one below)" /></SelectTrigger>
                      <SelectContent className="max-h-64">{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button variant="ghost" size="sm" aria-label="Remove supplier quote" className="min-h-9 shrink-0 text-red-600" onClick={() => setQuotes(quotes.length > 1 ? quotes.filter((_, x) => x !== i) : [emptyQuote()])}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <Input placeholder="Shop / supplier name" value={q.name} onChange={(e) => setQ(i, { name: e.target.value, supplierId: '' })} />
                    <Input placeholder="Contact number" value={q.contact} onChange={(e) => setQ(i, { contact: e.target.value })} disabled={!!q.supplierId} />
                    <Input placeholder="Location" value={q.location} onChange={(e) => setQ(i, { location: e.target.value })} disabled={!!q.supplierId} />
                    <Input type="number" min="0" placeholder={`Price per ${active?.unit ?? 'unit'}`} value={q.cost} onChange={(e) => setQ(i, { cost: e.target.value })} />
                    <Input className="md:col-span-2" placeholder="Notes (quality, minimum order, etc.)" value={q.notes} onChange={(e) => setQ(i, { notes: e.target.value })} />
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" className="min-h-9" onClick={() => setQuotes([...quotes, emptyQuote()])}><Plus className="w-4 h-4 mr-1" />Add another supplier</Button>
              <Button className="w-full " disabled={busy} onClick={submitCanvass}>Submit canvass</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Receiving form */}
        <Dialog open={!!receiving} onOpenChange={(o) => !o && setReceiving(null)}>
          <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="pr-6 font-corp-display leading-snug">Receive {receiving?.po_number}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-gray-600">{receiving?.quantity} {receiving?.unit} {receiving?.item_name} from {receiving?.suppliers?.name}. Agreed price {peso(receiving?.unit_cost)}.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div><label className="text-xs text-gray-600">Quantity received ({receiving?.unit})</label>
                  <Input type="number" min="0" value={recv.qty} onChange={(e) => setRecv({ ...recv, qty: e.target.value })} /></div>
                <div><label className="text-xs text-gray-600">Actual price per {receiving?.unit}</label>
                  <Input type="number" min="0" value={recv.cost} onChange={(e) => setRecv({ ...recv, cost: e.target.value })} /></div>
              </div>
              <Input placeholder="Notes (optional)" value={recv.notes} onChange={(e) => setRecv({ ...recv, notes: e.target.value })} />
              <label className="flex items-center gap-2 break-all border rounded p-3 cursor-pointer text-sm">
                <Camera className="w-5 h-5" />
                {photo ? photo.name : 'Take / attach photo of the receipt (required)'}
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
              </label>
              <p className="text-xs text-gray-500">Date and time are recorded automatically when you confirm.</p>
              <Button className="w-full " disabled={busy} onClick={submitReceive}>Confirm received</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
