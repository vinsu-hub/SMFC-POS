import { Badge } from '@/components/ui/badge';
import { Crown } from 'lucide-react';

/** Same red owner-request treatment on POS ticket, Order Queue, and
 * Kitchen Display — one implementation. */
export function OwnerRequestBadge() {
  return (
    <Badge variant="outline" className="bg-error-bg text-destructive gap-1 text-xs">
      <Crown className="w-3 h-3" /> Owner Request
    </Badge>
  );
}
