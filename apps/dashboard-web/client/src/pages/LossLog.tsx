import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, AlertCircle, Loader2, ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';
import {
  ApiIngredient,
  ApiLossRecord,
  LossReason,
  createLossRecord,
  fetchBranchLosses,
  fetchInventory,
  getLossPhotoUrl,
  uploadLossPhoto,
} from '@/lib/api';

const REASONS: { value: LossReason; label: string }[] = [
  { value: 'spoilage', label: 'Spoilage' },
  { value: 'breakage', label: 'Breakage' },
  { value: 'comp', label: 'Complimentary' },
  { value: 'prep_error', label: 'Prep Error' },
];

function reasonLabel(reason: LossReason) {
  return REASONS.find((r) => r.value === reason)?.label ?? reason;
}

function getReasonColor(reason: LossReason) {
  switch (reason) {
    case 'spoilage':
      return 'bg-blue-100 text-blue-800';
    case 'breakage':
      return 'bg-red-100 text-red-800';
    case 'comp':
      return 'bg-green-100 text-green-800';
    case 'prep_error':
      return 'bg-yellow-100 text-yellow-800';
  }
}

export default function LossLog() {
  const { user } = useAuth();
  const [ingredients, setIngredients] = useState<ApiIngredient[]>([]);
  const [losses, setLosses] = useState<ApiLossRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    ingredientId: '',
    quantity: '',
    reason: 'spoilage' as LossReason,
    photo: null as File | null,
  });

  const loadData = () => {
    if (!user?.branchId) return;
    setLoading(true);
    Promise.all([fetchInventory(user.branchId), fetchBranchLosses(user.branchId)])
      .then(([ingredientData, lossData]) => {
        setIngredients(ingredientData);
        setLosses(lossData);
      })
      .catch(() => toast.error('Could not load loss log. Check your connection.'))
      .finally(() => setLoading(false));
  };

  useEffect(loadData, [user?.branchId]);

  const ingredientName = (id: string) => ingredients.find((i) => i.id === id)?.name ?? 'Unknown item';
  const ingredientUnit = (id: string) => ingredients.find((i) => i.id === id)?.unit ?? '';

  const handleViewPhoto = async (path: string) => {
    if (photoUrls[path]) return;
    const url = await getLossPhotoUrl(path);
    if (url) setPhotoUrls((prev) => ({ ...prev, [path]: url }));
  };

  const handleAddLoss = async () => {
    if (!form.ingredientId || !form.quantity) {
      toast.error('Please select an item and enter a quantity');
      return;
    }
    if (!user?.branchId) {
      toast.error('No branch assigned to this account');
      return;
    }

    setSubmitting(true);
    try {
      let photoPath: string | undefined;
      if (form.photo) {
        photoPath = await uploadLossPhoto(user.branchId, form.photo);
      }

      await createLossRecord({
        branch_id: user.branchId,
        employee_id: user.id,
        ingredient_id: form.ingredientId,
        reason: form.reason,
        quantity: parseFloat(form.quantity),
        photo_url: photoPath,
      });

      toast.success('Loss logged');
      setForm({ ingredientId: '', quantity: '', reason: 'spoilage', photo: null });
      setDialogOpen(false);
      loadData();
    } catch (error) {
      toast.error('Could not log loss. Try again.');
      console.error(error);
    } finally {
      setSubmitting(false);
    }
  };

  const todaysLosses = losses.filter(
    (l) => new Date(l.created_at).toDateString() === new Date().toDateString()
  );
  const totalLosses = todaysLosses.reduce((sum, l) => sum + l.cost_impact, 0);
  const reasonCounts = todaysLosses.reduce<Record<string, number>>((acc, l) => {
    acc[l.reason] = (acc[l.reason] ?? 0) + 1;
    return acc;
  }, {});
  const topReason = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0];

  return (
    <DashboardLayout title="Loss Log">
      <div className="p-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-l-4 border-l-red-500">
            <CardContent className="p-4">
              <p className="text-sm text-gray-600 font-corp-body mb-1">Total Losses Today</p>
              <p className="text-3xl font-corp-display font-bold text-red-600">
                {formatCurrency(totalLosses)}
              </p>
              <p className="text-xs text-gray-500 mt-2">{todaysLosses.length} items logged</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-yellow-500">
            <CardContent className="p-4">
              <p className="text-sm text-gray-600 font-corp-body mb-1">Logged (recent)</p>
              <p className="text-3xl font-corp-display font-bold text-yellow-600">
                {losses.length}
              </p>
              <p className="text-xs text-gray-500 mt-2">Most recent entries for this branch</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <p className="text-sm text-gray-600 font-corp-body mb-1">Top Loss Reason</p>
              <p className="text-3xl font-corp-display font-bold text-blue-600">
                {topReason ? reasonLabel(topReason[0] as LossReason) : '—'}
              </p>
              <p className="text-xs text-gray-500 mt-2">
                {topReason
                  ? `${Math.round((topReason[1] / todaysLosses.length) * 100)}% of today's losses`
                  : 'No losses logged today'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Add Loss Button */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#1B2A4A] hover:bg-[#13203A] font-corp-display gap-2">
              <Plus className="w-4 h-4" />
              Log Loss
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-corp-display">Log Loss or Defect</DialogTitle>
              <DialogDescription>
                Record spoilage, breakage, comps, or prep errors. Stock updates immediately.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Item</label>
                <Select
                  value={form.ingredientId}
                  onValueChange={(value) => setForm({ ...form, ingredientId: value })}
                >
                  <SelectTrigger className="font-corp-body">
                    <SelectValue placeholder="Select an ingredient" />
                  </SelectTrigger>
                  <SelectContent>
                    {ingredients.map((ingredient) => (
                      <SelectItem key={ingredient.id} value={ingredient.id}>
                        {ingredient.name} ({ingredient.unit})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">
                  Quantity {form.ingredientId && `(${ingredientUnit(form.ingredientId)})`}
                </label>
                <Input
                  type="number"
                  placeholder="0"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  className="font-corp-mono"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Reason</label>
                <Select
                  value={form.reason}
                  onValueChange={(value) => setForm({ ...form, reason: value as LossReason })}
                >
                  <SelectTrigger className="font-corp-body">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REASONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">
                  Photo (optional)
                </label>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setForm({ ...form, photo: e.target.files?.[0] ?? null })}
                  className="font-corp-body text-sm"
                />
              </div>

              <Button
                onClick={handleAddLoss}
                disabled={submitting}
                className="w-full bg-[#1B2A4A] hover:bg-[#13203A] font-corp-display"
              >
                {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Log Loss
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Loss Table */}
        <Card className={`border-l-4 ${
          user?.branch === 'danielito' ? 'border-l-[#1F2E28]' :
          user?.branch === 'malaya' ? 'border-l-[#6E8368]' :
          'border-l-[#B5651D]'
        }`}>
          <CardHeader>
            <CardTitle className="font-corp-display">Loss Log</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8 text-gray-500">
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Loading loss log...
              </div>
            ) : losses.length === 0 ? (
              <div className="text-center py-8">
                <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-600 font-corp-body">No losses logged today</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Logged</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead className="text-center">Photo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {losses.map((loss) => (
                    <TableRow key={loss.id}>
                      <TableCell>
                        <p className="font-corp-body font-semibold text-gray-900">
                          {ingredientName(loss.ingredient_id)}
                        </p>
                      </TableCell>
                      <TableCell className="text-right font-corp-mono">
                        {loss.quantity} {ingredientUnit(loss.ingredient_id)}
                      </TableCell>
                      <TableCell>
                        <Badge className={getReasonColor(loss.reason)}>
                          {reasonLabel(loss.reason)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-gray-500 font-corp-body">
                        {new Date(loss.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-corp-mono font-semibold">
                        {formatCurrency(loss.cost_impact)}
                      </TableCell>
                      <TableCell className="text-center">
                        {loss.photo_url ? (
                          photoUrls[loss.photo_url] ? (
                            <a
                              href={photoUrls[loss.photo_url]}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 underline text-xs"
                            >
                              View
                            </a>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewPhoto(loss.photo_url!)}
                            >
                              <ImageIcon className="w-4 h-4" />
                            </Button>
                          )
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
