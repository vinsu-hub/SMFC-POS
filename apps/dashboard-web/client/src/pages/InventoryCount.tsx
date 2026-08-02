import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, Loader2, Package } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';
import { ApiIngredient, fetchInventory, submitInventoryCount } from '@/lib/api';
import { BRANCH_CONFIG } from '@/lib/types';

type ItemStatus = 'pending' | 'counted' | 'variance';

function computeStatus(expected: number, counted: number | null): ItemStatus {
  if (counted === null) return 'pending';
  const variancePercent = expected === 0 ? 0 : ((counted - expected) / expected) * 100;
  return Math.abs(variancePercent) > 5 ? 'variance' : 'counted';
}

export default function InventoryCount() {
  const { user } = useAuth();
  const [ingredients, setIngredients] = useState<ApiIngredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [countedValues, setCountedValues] = useState<Record<string, string>>({});

  const loadInventory = () => {
    if (!user?.branchId) return;
    setLoading(true);
    fetchInventory(user.branchId)
      .then(setIngredients)
      .catch(() => toast.error('Could not load inventory. Check your connection.'))
      .finally(() => setLoading(false));
  };

  useEffect(loadInventory, [user?.branchId]);

  const updateCount = (id: string, value: string) => {
    setCountedValues({ ...countedValues, [id]: value });
  };

  const handleSubmit = async () => {
    const entries = Object.entries(countedValues).filter(([, v]) => v !== '' && !isNaN(parseFloat(v)));
    if (entries.length < ingredients.length) {
      toast.error(`Please count all items. ${ingredients.length - entries.length} remaining.`);
      return;
    }

    setSubmitting(true);
    try {
      await Promise.all(
        entries.map(([id, value]) => submitInventoryCount(id, parseFloat(value)))
      );
      toast.success('Inventory count saved. Stock levels updated.');
      setCountedValues({});
      loadInventory();
    } catch (error) {
      toast.error('Could not save the count. Try again.');
      console.error(error);
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusIcon = (status: ItemStatus) => {
    switch (status) {
      case 'counted':
        return <CheckCircle className="w-4 h-4 text-success" />;
      case 'variance':
        return <AlertCircle className="w-4 h-4 text-destructive" />;
      default:
        return <Package className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getVarianceColor = (variancePercent: number | null) => {
    if (variancePercent === null) return 'text-muted-foreground';
    if (Math.abs(variancePercent) <= 5) return 'text-success';
    return 'text-destructive';
  };

  const rows = ingredients.map((ingredient) => {
    const raw = countedValues[ingredient.id];
    const counted = raw !== undefined && raw !== '' && !isNaN(parseFloat(raw)) ? parseFloat(raw) : null;
    const variance = counted !== null ? counted - ingredient.current_stock : null;
    const variancePercent =
      counted !== null && ingredient.current_stock !== 0
        ? (variance! / ingredient.current_stock) * 100
        : counted !== null
          ? 0
          : null;
    const status = computeStatus(ingredient.current_stock, counted);
    return { ingredient, counted, variance, variancePercent, status };
  });

  const countedItems = rows.filter((r) => r.counted !== null).length;
  const varianceItems = rows.filter((r) => r.status === 'variance').length;
  const expectedTotalValue = ingredients.reduce(
    (sum, i) => sum + i.current_stock * i.unit_cost,
    0
  );

  return (
    <DashboardLayout title="Inventory Count">
      <div className="p-6 space-y-6">
        {/* Progress Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-l-4 border-l-success">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground font-corp-body mb-1">Items Counted</p>
              <p className="text-3xl font-corp-display font-bold text-foreground">
                {countedItems}/{ingredients.length}
              </p>
              <div className="w-full bg-secondary rounded-full h-2 mt-3">
                <div
                  className="bg-success h-2 rounded-full transition-all"
                  style={{
                    width: `${ingredients.length ? (countedItems / ingredients.length) * 100 : 0}%`,
                  }}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-warning">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground font-corp-body mb-1">Variance Detected</p>
              <p className="text-3xl font-corp-display font-bold text-warning">
                {varianceItems}
              </p>
              <p className="text-xs text-muted-foreground mt-2">Items with &gt;5% difference</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-primary">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground font-corp-body mb-1">Expected Total Value</p>
              <p className="text-3xl font-corp-display font-bold text-foreground">
                {formatCurrency(expectedTotalValue)}
              </p>
              <p className="text-xs text-muted-foreground mt-2">Based on each ingredient's unit cost</p>
            </CardContent>
          </Card>
        </div>

        {/* Inventory Table */}
        <Card
          className="border-l-4"
          style={{ borderLeftColor: user?.branch ? BRANCH_CONFIG[user.branch].color : '#B5651D' }}
        >
          <CardHeader>
            <CardTitle className="font-corp-display">Stock Count</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Loading inventory...
              </div>
            ) : ingredients.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 font-corp-body">
                No ingredients set up for this branch yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Expected</TableHead>
                    <TableHead className="text-right">Counted</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(({ ingredient, counted, variance, variancePercent, status }) => (
                    <TableRow key={ingredient.id}>
                      <TableCell className="font-corp-body">{ingredient.name}</TableCell>
                      <TableCell className="text-right font-corp-mono">
                        {ingredient.current_stock} {ingredient.unit}
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          placeholder="0"
                          value={countedValues[ingredient.id] ?? ''}
                          onChange={(e) => updateCount(ingredient.id, e.target.value)}
                          className="w-24 text-right font-corp-mono text-sm"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        {variance !== null ? (
                          <span className={`font-corp-mono font-semibold ${getVarianceColor(variancePercent)}`}>
                            {variance > 0 ? '+' : ''}
                            {variance.toFixed(1)} ({variancePercent?.toFixed(1)}%)
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">{getStatusIcon(status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Variance Items */}
        {varianceItems > 0 && (
          <Card className="border-l-4 border-l-destructive bg-error-bg">
            <CardHeader>
              <CardTitle className="font-corp-display text-destructive">Items with Variance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {rows
                  .filter((r) => r.status === 'variance')
                  .map(({ ingredient, counted, variancePercent }) => (
                    <div
                      key={ingredient.id}
                      className="flex justify-between items-center p-3 bg-card rounded-md border border-border-regular"
                    >
                      <div>
                        <p className="font-corp-body font-semibold text-foreground">{ingredient.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Expected: {ingredient.current_stock} {ingredient.unit} • Counted: {counted}{' '}
                          {ingredient.unit}
                        </p>
                      </div>
                      <Badge variant="destructive" className="text-sm">
                        {variancePercent?.toFixed(1)}% diff
                      </Badge>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Submit Button */}
        <Button
          onClick={handleSubmit}
          disabled={submitting || ingredients.length === 0 || countedItems < ingredients.length}
          className="w-full font-corp-display py-6"
        >
          {submitting ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : null}
          Save Inventory Count
        </Button>
      </div>
    </DashboardLayout>
  );
}
