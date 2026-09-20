export const peso = (n: number | string | null | undefined) =>
  `₱${Number(n ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const STATUS_STYLE: Record<string, string> = {
  submitted: 'bg-blue-100 text-blue-800',
  canvassing: 'bg-amber-100 text-amber-800',
  ready_for_po: 'bg-purple-100 text-purple-800',
  po_issued: 'bg-indigo-100 text-indigo-800',
  received: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-100 text-gray-600',
  open: 'bg-amber-100 text-amber-800',
  selected: 'bg-purple-100 text-purple-800',
  ordered: 'bg-indigo-100 text-indigo-800',
  awaiting_signatures: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
};

export const statusLabel = (s: string) => s.replace(/_/g, ' ');

export interface PurchaseOrder {
  id: string;
  po_number: string;
  item_name: string;
  unit: string;
  quantity: number;
  unit_cost: number;
  total: number;
  status: string;
  procurement_signed_at: string | null;
  finance_signed_at: string | null;
  printed_at: string | null;
  created_at: string;
  suppliers: { name: string; contact_number: string | null; location: string | null } | null;
  po_allocations: { quantity: number; branches: { name: string } | null }[];
}

export const PO_SELECT =
  '*, suppliers(name, contact_number, location), po_allocations(quantity, branches(name))';
