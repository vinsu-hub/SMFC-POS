import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { peso } from '@/lib/procurement';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface Cost { product_id: string; name: string; category: string; price: number; recipe_cost: number; margin: number; margin_pct: number; missing_costs: boolean }

/** Menu price vs. recipe cost (from latest supplier unit prices). */
export function MenuCosting() {
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [branchId, setBranchId] = useState('');
  const [rows, setRows] = useState<Cost[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    supabase.from('branches').select('id, name').order('name').then(({ data }) => {
      setBranches(data ?? []);
      if (data?.length) setBranchId(data[0].id);
      else setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!branchId) return;
    setLoading(true);
    supabase.from('product_costs').select('product_id, name, category, price, recipe_cost, margin, margin_pct, missing_costs')
      .eq('branch_id', branchId).order('name').then(({ data }) => {
        setRows((data as Cost[]) ?? []);
        setLoading(false);
      });
  }, [branchId]);

  const shown = rows.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <Card className="min-w-0">
      <CardHeader><CardTitle className="leading-snug font-corp-display">Menu Costing</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-3 flex-wrap">
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger className="w-full sm:w-72"><SelectValue placeholder="Branch" /></SelectTrigger>
            <SelectContent>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
          </Select>
          <Input className="w-full sm:w-56" placeholder="Search menu item" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {loading && <p role="status" className="py-4 text-sm text-muted-foreground">Loading...</p>}
        <Table>
          <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Category</TableHead>
            <TableHead className="text-right">Price</TableHead><TableHead className="text-right">Recipe cost</TableHead>
            <TableHead className="text-right">Margin</TableHead><TableHead className="text-right">Margin %</TableHead></TableRow></TableHeader>
          <TableBody>
            {shown.map((r) => (
              <TableRow key={r.product_id}>
                <TableCell>{r.name}{r.missing_costs && <span className="ml-2 text-xs text-amber-700">cost incomplete</span>}</TableCell>
                <TableCell className="capitalize">{r.category}</TableCell>
                <TableCell className="text-right font-corp-mono">{peso(r.price)}</TableCell>
                <TableCell className="text-right font-corp-mono">{peso(r.recipe_cost)}</TableCell>
                <TableCell className="text-right font-corp-mono">{peso(r.margin)}</TableCell>
                <TableCell className="text-right font-corp-mono">{r.margin_pct}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!loading && shown.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">No menu items found.</p>}
        <p className="text-xs text-gray-500">"Cost incomplete" means at least one recipe ingredient has no supplier price yet; it fills in as purchase orders are received.</p>
      </CardContent>
    </Card>
  );
}
