import { Badge } from '@/components/ui/badge';
import { CheckCircle2, ChefHat, Clock, PackageCheck } from 'lucide-react';
import type { KitchenStatus } from '@/lib/api';

// Canonical color mapping used everywhere kitchen_status is shown (POS
// ticket, Order Queue, Kitchen Display) — orange=queued, blue=preparing,
// green=ready/done, grey=completed. One implementation so the three
// screens can never visually disagree about what a status means.
const STATUS_CONFIG: Record<KitchenStatus, { label: string; className: string; icon: React.ReactNode }> = {
  queued: { label: 'Queued', className: 'bg-warning-bg text-warning', icon: <Clock className="w-3 h-3" /> },
  preparing: { label: 'Preparing', className: 'bg-accent-soft text-accent-foreground', icon: <ChefHat className="w-3 h-3" /> },
  ready: { label: 'Ready', className: 'bg-success-bg text-success', icon: <PackageCheck className="w-3 h-3" /> },
  completed: { label: 'Completed', className: 'bg-muted text-muted-foreground', icon: <CheckCircle2 className="w-3 h-3" /> },
};

export function StatusBadge({ status }: { status: KitchenStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <Badge variant="outline" className={`${config.className} gap-1 uppercase text-xs`}>
      {config.icon}
      {config.label}
    </Badge>
  );
}
