import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { supabase } from '@/lib/supabaseClient';
import { STATUS_STYLE, statusLabel } from '@/lib/procurement';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface Ingredient { id: string; name: string; unit: string }
interface Row { ingredientId: string; itemName: string; unit: string; quantity: string }
interface RequestRow {
  id: string; week_of: string; status: string; notes: string | null; created_at: string;
  purchase_request_items: { item_name: string; quantity: number; unit: string }[];
}

const emptyRow = (): Row => ({ ingredientId: '', itemName: '', unit: 'kg', quantity: '' });

export default function RequestStock() {
  const { user } = useAuth();
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [week, setWeek] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [saving, setSaving] = useState(false);

  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user?.branchId) { setLoading(false); return; }
    const [ing, reqs] = await Promise.all([
      supabase.from('ingredients').select('id, name, unit').eq('branch_id', user.branchId).order('name'),
      supabase
        .from('purchase_requests')
        .select('id, week_of, status, notes, created_at, purchase_request_items(item_name, quantity, unit)')
        .eq('branch_id', user.branchId)
        .order('created_at', { ascending: false })
        .limit(30),
    ]);
    setIngredients(ing.data ?? []);
    setRequests((reqs.data as RequestRow[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { void load(); }, [user?.branchId]);

  if (!user || !['employee', 'manager'].includes(user.role)) {
    return (
      <DashboardLayout>
        <p className="p-6 text-center text-red-600">Access denied.</p>
      </DashboardLayout>
    );
  }

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const pick = (i: number, id: string) => {
    const ing = ingredients.find((x) => x.id === id);
    if (ing) setRow(i, { ingredientId: id, itemName: ing.name, unit: ing.unit });
  };

  const submit = async () => {
    const items = rows
      .filter((r) => r.itemName.trim() && Number(r.quantity) > 0)
      .map((r) => ({
        ingredient_id: r.ingredientId || null,
        item_name: r.itemName.trim(),
        unit: r.unit.trim() || 'pcs',
        quantity: Number(r.quantity),
      }));
    if (items.length === 0) return void toast.error('Add at least one item with a quantity');
    setSaving(true);
    const { error } = await supabase.rpc('submit_purchase_request', { p_week: week, p_notes: notes || null, p_items: items });
    setSaving(false);
    if (error) return void toast.error(error.message);
    toast.success('Request sent to Procurement');
    setRows([emptyRow()]);
    setNotes('');
    void load();
  };

  return (
    <DashboardLayout title="Request Stock">
      <div className="min-w-0 p-4 sm:p-6 space-y-6 max-w-4xl">
        {loading && <p role="status" className="py-4 text-sm text-muted-foreground">Loading...</p>}
        <Card className="min-w-0">
          <CardHeader><CardTitle className="leading-snug font-corp-display">New request to Procurement</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <label className="text-sm text-gray-600">Needed for week of</label>
              <Input type="date" value={week} onChange={(e) => setWeek(e.target.value)} className="w-44" />
            </div>
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 items-center rounded-lg border p-3 sm:grid-cols-12 sm:border-0 sm:p-0">
                <div className="col-span-2 min-w-0 sm:col-span-4">
                  <Select value={r.ingredientId} onValueChange={(v) => pick(i, v)}>
                    <SelectTrigger><SelectValue placeholder="Pick from inventory" /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      {ingredients.map((x) => <SelectItem key={x.id} value={x.id}>{x.name} ({x.unit})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Input className="col-span-2 sm:col-span-3" placeholder="or type item name" value={r.itemName}
                  onChange={(e) => setRow(i, { itemName: e.target.value, ingredientId: '' })} />
                <Input className="col-span-1 sm:col-span-2" type="number" min="0" placeholder="Qty" value={r.quantity}
                  onChange={(e) => setRow(i, { quantity: e.target.value })} />
                <Input className="col-span-1 sm:col-span-2" placeholder="Unit" value={r.unit} onChange={(e) => setRow(i, { unit: e.target.value })} />
                <Button variant="ghost" size="sm" aria-label="Remove item" className="col-span-2 min-h-9 justify-self-end text-red-600 sm:col-span-1"
                  onClick={() => setRows(rows.length > 1 ? rows.filter((_, idx) => idx !== i) : [emptyRow()])}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="min-h-9" onClick={() => setRows([...rows, emptyRow()])}>
              <Plus className="w-4 h-4 mr-1" /> Add item
            </Button>
            <Input placeholder="Notes for procurement (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <Button onClick={submit} disabled={saving} >Send request</Button>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader><CardTitle className="leading-snug font-corp-display">Your branch requests</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {!loading && requests.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">No requests yet.</p>}
            {requests.map((r) => (
              <div key={r.id} className="border rounded p-3">
                <div className="flex flex-col items-start gap-2 mb-2 sm:flex-row sm:justify-between sm:items-center">
                  <span className="text-sm text-gray-600">Week of {r.week_of}</span>
                  <Badge className={`shrink-0 ${STATUS_STYLE[r.status]}`}>{statusLabel(r.status)}</Badge>
                </div>
                <p className="text-sm">
                  {r.purchase_request_items.map((i) => `${i.quantity} ${i.unit} ${i.item_name}`).join(' • ')}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
