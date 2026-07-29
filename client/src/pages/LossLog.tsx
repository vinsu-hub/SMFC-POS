import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface Loss {
  id: string;
  item: string;
  quantity: number;
  unit: string;
  reason: string;
  notes: string;
  timestamp: Date;
  status: 'pending' | 'approved' | 'rejected';
  value: number;
}

export default function LossLog() {
  const { user } = useAuth();
  const [losses, setLosses] = useState<Loss[]>([
    {
      id: '1',
      item: 'Halibut Fillet',
      quantity: 2,
      unit: 'kg',
      reason: 'spoilage',
      notes: 'Discoloration detected during prep',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
      status: 'pending',
      value: 60,
    },
    {
      id: '2',
      item: 'Ribeye Steak',
      quantity: 1,
      unit: 'kg',
      reason: 'prep_error',
      notes: 'Overcooked, had to discard',
      timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000),
      status: 'approved',
      value: 35,
    },
    {
      id: '3',
      item: 'Duck Breast',
      quantity: 3,
      unit: 'kg',
      reason: 'breakage',
      notes: 'Dropped during service',
      timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000),
      status: 'pending',
      value: 90,
    },
  ]);

  const [newLoss, setNewLoss] = useState({
    item: '',
    quantity: '',
    unit: 'kg',
    reason: 'spoilage',
    notes: '',
  });

  const [dialogOpen, setDialogOpen] = useState(false);

  const handleAddLoss = () => {
    if (!newLoss.item || !newLoss.quantity) {
      toast.error('Please fill in item and quantity');
      return;
    }

    const loss: Loss = {
      id: Math.random().toString(36).substr(2, 9),
      item: newLoss.item,
      quantity: parseFloat(newLoss.quantity),
      unit: newLoss.unit,
      reason: newLoss.reason,
      notes: newLoss.notes,
      timestamp: new Date(),
      status: 'pending',
      value: parseFloat(newLoss.quantity) * 30, // Mock value calculation
    };

    setLosses([loss, ...losses]);
    setNewLoss({ item: '', quantity: '', unit: 'kg', reason: 'spoilage', notes: '' });
    setDialogOpen(false);
    toast.success('Loss logged successfully');
  };

  const handleDeleteLoss = (id: string) => {
    setLosses(losses.filter((l) => l.id !== id));
    toast.success('Loss removed');
  };

  const getReason = (reason: string) => {
    const reasons: Record<string, string> = {
      spoilage: 'Spoilage',
      breakage: 'Breakage',
      comp: 'Complimentary',
      prep_error: 'Prep Error',
      other: 'Other',
    };
    return reasons[reason] || reason;
  };

  const getReasonColor = (reason: string) => {
    switch (reason) {
      case 'spoilage':
        return 'bg-blue-100 text-blue-800';
      case 'breakage':
        return 'bg-red-100 text-red-800';
      case 'comp':
        return 'bg-green-100 text-green-800';
      case 'prep_error':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  const totalLosses = losses.reduce((sum, l) => sum + l.value, 0);
  const pendingLosses = losses.filter((l) => l.status === 'pending').length;

  return (
    <DashboardLayout title="Loss Log">
      <div className="p-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-l-4 border-l-red-500">
            <CardContent className="p-4">
              <p className="text-sm text-gray-600 font-corp-body mb-1">Total Losses Today</p>
              <p className="text-3xl font-corp-display font-bold text-red-600">
                ${totalLosses.toFixed(2)}
              </p>
              <p className="text-xs text-gray-500 mt-2">{losses.length} items logged</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-yellow-500">
            <CardContent className="p-4">
              <p className="text-sm text-gray-600 font-corp-body mb-1">Pending Approval</p>
              <p className="text-3xl font-corp-display font-bold text-yellow-600">
                {pendingLosses}
              </p>
              <p className="text-xs text-gray-500 mt-2">Awaiting manager review</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <p className="text-sm text-gray-600 font-corp-body mb-1">Top Loss Reason</p>
              <p className="text-3xl font-corp-display font-bold text-blue-600">
                Spoilage
              </p>
              <p className="text-xs text-gray-500 mt-2">45% of losses</p>
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
                Record spoilage, breakage, comps, or prep errors. 2 taps to complete.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">
                  Item
                </label>
                <Input
                  placeholder="e.g., Halibut Fillet"
                  value={newLoss.item}
                  onChange={(e) => setNewLoss({ ...newLoss, item: e.target.value })}
                  className="font-corp-body"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">
                    Quantity
                  </label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={newLoss.quantity}
                    onChange={(e) => setNewLoss({ ...newLoss, quantity: e.target.value })}
                    className="font-corp-mono"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">
                    Unit
                  </label>
                  <Select value={newLoss.unit} onValueChange={(value) => setNewLoss({ ...newLoss, unit: value })}>
                    <SelectTrigger className="font-corp-body">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kg">kg</SelectItem>
                      <SelectItem value="g">g</SelectItem>
                      <SelectItem value="ml">ml</SelectItem>
                      <SelectItem value="l">l</SelectItem>
                      <SelectItem value="pcs">pcs</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">
                  Reason
                </label>
                <Select value={newLoss.reason} onValueChange={(value) => setNewLoss({ ...newLoss, reason: value })}>
                  <SelectTrigger className="font-corp-body">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="spoilage">Spoilage</SelectItem>
                    <SelectItem value="breakage">Breakage</SelectItem>
                    <SelectItem value="comp">Complimentary</SelectItem>
                    <SelectItem value="prep_error">Prep Error</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">
                  Notes (optional)
                </label>
                <Textarea
                  placeholder="e.g., Discoloration detected during prep"
                  value={newLoss.notes}
                  onChange={(e) => setNewLoss({ ...newLoss, notes: e.target.value })}
                  className="font-corp-body text-sm"
                  rows={3}
                />
              </div>

              <Button
                onClick={handleAddLoss}
                className="w-full bg-[#1B2A4A] hover:bg-[#13203A] font-corp-display"
              >
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
            {losses.length === 0 ? (
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
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead className="text-center">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {losses.map((loss) => (
                    <TableRow key={loss.id}>
                      <TableCell>
                        <div>
                          <p className="font-corp-body font-semibold text-gray-900">{loss.item}</p>
                          {loss.notes && (
                            <p className="text-xs text-gray-500 mt-1">{loss.notes}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-corp-mono">
                        {loss.quantity} {loss.unit}
                      </TableCell>
                      <TableCell>
                        <Badge className={getReasonColor(loss.reason)}>
                          {getReason(loss.reason)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(loss.status)}>
                          {loss.status.charAt(0).toUpperCase() + loss.status.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-corp-mono font-semibold">
                        ${loss.value.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteLoss(loss.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
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
