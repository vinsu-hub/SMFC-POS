// Supabase RPC adapter for the POS terminal (menu, delivery, business day, sale).
// Server logic lives in Postgres (pos_menu, create_pos_transaction, ... see supabase/migrations).
// Company-wide roles (executive, finance_admin) pass an explicit branch id.
import { supabase } from '@/lib/supabaseClient';

export type Availability = 'available' | 'low_stock' | 'unavailable';
export type PosOrderType = 'dine_in' | 'takeout' | 'delivery';
export type PosPayment = 'cash' | 'gcash' | 'card';

export interface PosProduct { id: string; name: string; category: string; price: number; availability: Availability }
export interface PosDeliveryFee { barangay: string; zone: string; fee: number }
export interface BusinessDay { business_date: string; is_open: boolean; opened_at: string | null }
export interface PosSaleRequest {
  branch_id?: string;
  order_type: PosOrderType;
  items: { product_id: string; quantity: number; note?: string }[];
  discount_type_id?: string | null;
  force_vat_exempt?: boolean;
  table_number?: string | null;
  guest_count?: number | null;
  payment_method: PosPayment;
  card_type?: 'debit' | 'credit' | null;
  is_owner_request?: boolean;
  owner_request_employee_number?: string | null;
  owner_request_pin?: string | null;
  owner_request_note?: string | null;
  delivery?: { customer_name: string; customer_phone: string; address: string; landmark?: string | null; barangay: string } | null;
  idempotency_key?: string;
}
export interface PosSaleResult {
  id: string; order_number: number | null; total_amount: number; discount_amount: number; tax_amount: number; delivery_fee: number;
}

/** Strips the server's 'CODE: ' prefix so toasts read as plain sentences. */
function fail(error: { message: string }): never {
  const m = error.message.match(/^([A-Z_]+): ([\s\S]*)$/);
  const err = new Error(m ? m[2] : error.message) as Error & { code?: string };
  err.code = m?.[1];
  throw err;
}

export async function fetchPosMenu(branchId: string): Promise<PosProduct[]> {
  const { data, error } = await supabase.rpc('pos_menu', { p_branch: branchId });
  if (error) fail(error);
  return (data ?? []).map((p: PosProduct) => ({ ...p, price: Number(p.price) }));
}

export async function fetchDeliveryFees(): Promise<PosDeliveryFee[]> {
  const { data, error } = await supabase.from('delivery_fees').select('barangay, zone, fee').order('barangay');
  if (error) fail(error);
  return (data ?? []).map((f) => ({ ...f, fee: Number(f.fee) }));
}

export async function fetchRequireBusinessDay(): Promise<boolean> {
  const { data } = await supabase.from('business_settings').select('require_business_day').eq('id', 1).maybeSingle();
  return !!data?.require_business_day;
}

export async function fetchTodayBusinessDay(): Promise<BusinessDay> {
  const { data, error } = await supabase.rpc('today_business_day');
  if (error) fail(error);
  return data as BusinessDay;
}

export async function openBusinessDay(employeeNumber: string, pin: string): Promise<BusinessDay> {
  const { data, error } = await supabase.rpc('open_business_day', { p_employee_number: employeeNumber, p_pin: pin, p_menu_confirmed: true });
  if (error) fail(error);
  return data as BusinessDay;
}

export async function createPosSale(body: PosSaleRequest): Promise<PosSaleResult> {
  const payload = {
    branch_id: body.branch_id ?? null,
    idempotency_key: body.idempotency_key ?? crypto.randomUUID(),
    order_type: body.order_type === 'takeout' ? 'take_out' : body.order_type,
    items: body.items.map((i) => ({ product_id: i.product_id, quantity: i.quantity, note: i.note ?? null, addons: [], held_ingredient_ids: [] })),
    discount_type_id: body.discount_type_id ?? null,
    is_owner_request: !!body.is_owner_request,
    owner_request_employee_number: body.owner_request_employee_number ?? null,
    owner_request_pin: body.owner_request_pin ?? null,
    owner_request_note: body.owner_request_note ?? null,
    table_number: body.table_number ?? null,
    guest_count: body.guest_count ?? null,
    payment_method: body.payment_method,
    card_type: body.payment_method === 'card' ? body.card_type ?? null : null,
    force_vat_exempt: !!body.force_vat_exempt,
    delivery: body.delivery ?? null,
  };
  const { data, error } = await supabase.rpc('create_pos_transaction', { p: payload });
  if (error) fail(error);
  const r = data as PosSaleResult;
  return { ...r, total_amount: Number(r.total_amount), discount_amount: Number(r.discount_amount), tax_amount: Number(r.tax_amount), delivery_fee: Number(r.delivery_fee ?? 0) };
}
