import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { peso } from '@/lib/procurement';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface OrderMargin {
  id: string; branch_name: string; opened_at: string; order_type: string;
  gross_revenue: number; vat: number; cogs: number; gross_margin: number;
}

/** Live per-order revenue, VAT, cost of goods and gross margin. Refreshes on every new sale. */
export function LiveOrders() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderMargin[]>([]);
  const [live, setLive] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = async () => {
    const { data } = await supabase
      .from('transaction_margins')
      .select('id, branch_name, opened_at, order_type, gross_revenue, vat, cogs, gross_margin')
      .neq('status', 'voided')
      .order('opened_at', { ascending: false })
      .limit(25);
    setOrders((data as OrderMargin[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // debounce: a sale writes to transactions then transaction_items
    const refresh = () => { clearTimeout(timer.current); timer.current = setTimeout(load, 400); };
    const channel = supabase
      .channel('live-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, refresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transaction_items' }, refresh)
      .subscribe((status) => setLive(status === 'SUBSCRIBED'));
    return () => { clearTimeout(timer.current); void supabase.removeChannel(channel); };
  }, []);

  const totals = orders.reduce(
    (t, o) => ({ rev: t.rev + Number(o.gross_revenue), cogs: t.cogs + Number(o.cogs), margin: t.margin + Number(o.gross_margin) }),
    { rev: 0, cogs: 0, margin: 0 }
  );

  return (
    <Card className="min-w-0">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="leading-snug font-corp-display">Live Orders</CardTitle>
        <span className={`text-xs px-2 py-1 rounded ${live ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
          {live ? '● Live' : 'Connecting…'}
        </span>
      </CardHeader>
      <CardContent>
        {loading && <p role="status" className="py-4 text-sm text-muted-foreground">Loading...</p>}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 text-sm">
          <div><p className="text-gray-600">Revenue (last {orders.length})</p><p className="text-xl font-bold font-corp-display">{peso(totals.rev)}</p></div>
          <div><p className="text-gray-600">Cost of goods</p><p className="text-xl font-bold font-corp-display">{peso(totals.cogs)}</p></div>
          <div><p className="text-gray-600">Gross margin</p><p className="text-xl font-bold font-corp-display text-green-700">{peso(totals.margin)}</p></div>
        </div>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Time</TableHead><TableHead>Branch</TableHead>
            <TableHead className="text-right">Gross revenue</TableHead><TableHead className="text-right">VAT</TableHead>
            <TableHead className="text-right">COGS</TableHead><TableHead className="text-right">Margin</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {orders.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="whitespace-nowrap">{new Date(o.opened_at).toLocaleString()}</TableCell>
                <TableCell>{o.branch_name}</TableCell>
                <TableCell className="text-right font-corp-mono">{peso(o.gross_revenue)}</TableCell>
                <TableCell className="text-right font-corp-mono text-gray-500">{peso(o.vat)}</TableCell>
                <TableCell className="text-right font-corp-mono">{peso(o.cogs)}</TableCell>
                <TableCell className={`text-right font-corp-mono font-semibold ${Number(o.gross_margin) < 0 ? 'text-red-600' : 'text-green-700'}`}>{peso(o.gross_margin)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!loading && orders.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">No orders yet.</p>}
        <p className="text-xs text-gray-500 mt-3">Margin = gross revenue − VAT − cost of goods. Cost of goods is snapshotted at the time of sale from the latest supplier price.</p>
      </CardContent>
    </Card>
  );
}
