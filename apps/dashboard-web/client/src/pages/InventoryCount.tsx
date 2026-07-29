import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, Package } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';

interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  expectedStock: number;
  countedStock: number | null;
  variance: number | null;
  variancePercent: number | null;
  status: 'pending' | 'counted' | 'variance';
}

export default function InventoryCount() {
  const { user } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([
    {
      id: '1',
      name: 'Pork Pata',
      unit: 'kg',
      expectedStock: 12.5,
      countedStock: null,
      variance: null,
      variancePercent: null,
      status: 'pending',
    },
    {
      id: '2',
      name: 'Shrimp (Hipon)',
      unit: 'kg',
      expectedStock: 8.2,
      countedStock: null,
      variance: null,
      variancePercent: null,
      status: 'pending',
    },
    {
      id: '3',
      name: 'Kangkong',
      unit: 'kg',
      expectedStock: 6.0,
      countedStock: null,
      variance: null,
      variancePercent: null,
      status: 'pending',
    },
    {
      id: '4',
      name: 'Matcha Powder',
      unit: 'g',
      expectedStock: 500,
      countedStock: null,
      variance: null,
      variancePercent: null,
      status: 'pending',
    },
    {
      id: '5',
      name: 'Tanduay Rum',
      unit: 'ml',
      expectedStock: 1500,
      countedStock: null,
      variance: null,
      variancePercent: null,
      status: 'pending',
    },
  ]);

  const updateCount = (id: string, count: number) => {
    setItems(
      items.map((item) => {
        if (item.id === id) {
          const variance = count - item.expectedStock;
          const variancePercent = (variance / item.expectedStock) * 100;
          return {
            ...item,
            countedStock: count,
            variance,
            variancePercent,
            status: Math.abs(variancePercent) > 5 ? 'variance' : 'counted',
          };
        }
        return item;
      })
    );
  };

  const handleSubmit = () => {
    const uncounted = items.filter((i) => i.countedStock === null);
    if (uncounted.length > 0) {
      toast.error(`Please count all items. ${uncounted.length} remaining.`);
      return;
    }
    toast.success('Inventory count submitted for approval');
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'counted':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'variance':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      default:
        return <Package className="w-4 h-4 text-gray-400" />;
    }
  };

  const getVarianceColor = (variancePercent: number | null) => {
    if (variancePercent === null) return 'text-gray-400';
    if (Math.abs(variancePercent) <= 5) return 'text-green-600';
    return 'text-red-600';
  };

  const countedItems = items.filter((i) => i.countedStock !== null).length;
  const varianceItems = items.filter((i) => i.status === 'variance').length;

  return (
    <DashboardLayout title="Inventory Count">
      <div className="p-6 space-y-6">
        {/* Progress Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-4">
              <p className="text-sm text-gray-600 font-corp-body mb-1">Items Counted</p>
              <p className="text-3xl font-corp-display font-bold text-gray-900">
                {countedItems}/{items.length}
              </p>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-3">
                <div
                  className="bg-green-500 h-2 rounded-full transition-all"
                  style={{ width: `${(countedItems / items.length) * 100}%` }}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-yellow-500">
            <CardContent className="p-4">
              <p className="text-sm text-gray-600 font-corp-body mb-1">Variance Detected</p>
              <p className="text-3xl font-corp-display font-bold text-yellow-600">
                {varianceItems}
              </p>
              <p className="text-xs text-gray-500 mt-2">Items with &gt;5% difference</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <p className="text-sm text-gray-600 font-corp-body mb-1">Expected Total Value</p>
              <p className="text-3xl font-corp-display font-bold text-gray-900">
                {formatCurrency(items.reduce((sum, i) => sum + i.expectedStock * 220, 0))}
              </p>
              <p className="text-xs text-gray-500 mt-2">Estimated at ₱220/unit avg</p>
            </CardContent>
          </Card>
        </div>

        {/* Inventory Table */}
        <Card className={`border-l-4 ${
          user?.branch === 'danielito' ? 'border-l-[#1F2E28]' :
          user?.branch === 'malaya' ? 'border-l-[#6E8368]' :
          'border-l-[#B5651D]'
        }`}>
          <CardHeader>
            <CardTitle className="font-corp-display">Stock Count</CardTitle>
          </CardHeader>
          <CardContent>
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
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-corp-body">{item.name}</TableCell>
                    <TableCell className="text-right font-corp-mono">
                      {item.expectedStock} {item.unit}
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        placeholder="0"
                        value={item.countedStock ?? ''}
                        onChange={(e) => updateCount(item.id, parseFloat(e.target.value))}
                        className="w-24 text-right font-corp-mono text-sm"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      {item.variance !== null ? (
                        <span className={`font-corp-mono font-semibold ${getVarianceColor(item.variancePercent)}`}>
                          {item.variance > 0 ? '+' : ''}{item.variance.toFixed(1)} ({item.variancePercent?.toFixed(1)}%)
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {getStatusIcon(item.status)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Variance Items */}
        {varianceItems > 0 && (
          <Card className="border-l-4 border-l-red-500 bg-red-50">
            <CardHeader>
              <CardTitle className="font-corp-display text-red-900">Items with Variance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {items
                  .filter((i) => i.status === 'variance')
                  .map((item) => (
                    <div key={item.id} className="flex justify-between items-center p-3 bg-white rounded border border-red-200">
                      <div>
                        <p className="font-corp-body font-semibold text-gray-900">{item.name}</p>
                        <p className="text-xs text-gray-500">
                          Expected: {item.expectedStock} {item.unit} • Counted: {item.countedStock} {item.unit}
                        </p>
                      </div>
                      <Badge variant="destructive" className="text-sm">
                        {item.variancePercent?.toFixed(1)}% diff
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
          disabled={countedItems < items.length}
          className="w-full bg-[#1B2A4A] hover:bg-[#13203A] font-corp-display py-6"
        >
          Submit Inventory Count for Approval
        </Button>
      </div>
    </DashboardLayout>
  );
}
