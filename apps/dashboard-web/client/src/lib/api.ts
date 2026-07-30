import { supabase } from '@/lib/supabaseClient';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string;

export interface ApiProduct {
  id: string;
  branch_id: string;
  name: string;
  category: string;
  price: number;
  active: boolean;
}

export interface CreateTransactionItem {
  product_id: string;
  quantity: number;
}

export interface ApiTransaction {
  id: string;
  branch_id: string;
  employee_id: string;
  status: string;
  opened_at: string;
  closed_at: string | null;
  total_amount: number;
  items: { id: string; product_id: string; quantity: number; unit_price: number }[];
}

export interface ApiIngredient {
  id: string;
  branch_id: string;
  name: string;
  unit: string;
  unit_cost: number;
  current_stock: number;
  reorder_threshold: number;
  expiry_date: string | null;
}

export type LossReason = 'spoilage' | 'breakage' | 'comp' | 'prep_error';

export interface CreateLossRecordRequest {
  branch_id: string;
  employee_id: string;
  ingredient_id: string;
  product_id?: string | null;
  reason: LossReason;
  quantity: number;
  photo_url?: string | null;
}

export interface ApiLossRecord {
  id: string;
  branch_id: string;
  ingredient_id: string;
  product_id: string | null;
  employee_id: string;
  reason: LossReason;
  quantity: number;
  cost_impact: number;
  photo_url: string | null;
  created_at: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('Not signed in');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    ...init,
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`API ${path} failed: ${response.status} ${body}`);
  }
  return response.json() as Promise<T>;
}

export function fetchProducts(branchId: string): Promise<ApiProduct[]> {
  return request(`/products?branch_id=${branchId}`);
}

export function createTransaction(
  branchId: string,
  employeeId: string,
  items: CreateTransactionItem[]
): Promise<ApiTransaction> {
  return request('/transactions', {
    method: 'POST',
    body: JSON.stringify({ branch_id: branchId, employee_id: employeeId, items }),
  });
}

export function closeTransaction(transactionId: string): Promise<ApiTransaction> {
  return request(`/transactions/${transactionId}/close`, { method: 'POST' });
}

export function fetchInventory(branchId: string): Promise<ApiIngredient[]> {
  return request(`/inventory?branch_id=${branchId}`);
}

export function submitInventoryCount(
  ingredientId: string,
  countedStock: number
): Promise<ApiIngredient> {
  return request(`/inventory/${ingredientId}/count`, {
    method: 'POST',
    body: JSON.stringify({ counted_stock: countedStock }),
  });
}

export function createLossRecord(body: CreateLossRecordRequest): Promise<ApiLossRecord> {
  return request('/loss-records', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function fetchBranchLosses(branchId: string): Promise<ApiLossRecord[]> {
  return request(`/branches/${branchId}/losses`);
}

/** Uploads to the private 'loss-photos' bucket and returns the storage path
 * (branch-scoped by RLS, see supabase/migrations/0003_loss_photos_storage.sql). */
export async function uploadLossPhoto(branchId: string, file: File): Promise<string> {
  const extension = file.name.split('.').pop() ?? 'jpg';
  const path = `${branchId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from('loss-photos').upload(path, file, {
    contentType: file.type,
  });
  if (error) {
    throw new Error(`Photo upload failed: ${error.message}`);
  }
  return path;
}

export async function getLossPhotoUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from('loss-photos').createSignedUrl(path, 300);
  if (error) return null;
  return data.signedUrl;
}

export interface HourlyRevenuePoint {
  hour: number;
  revenue: number;
}

export interface ApiBranchSummary {
  branch_id: string;
  branch_name: string;
  revenue: number;
  cogs: number;
  losses: number;
  margin: number;
  margin_percent: number;
  hourly_revenue: HourlyRevenuePoint[];
}

export interface ApiOrganizationSummary {
  organization_id: string;
  branches: ApiBranchSummary[];
  total_revenue: number;
  total_cogs: number;
  total_losses: number;
  total_margin: number;
  total_margin_percent: number;
  hourly_revenue: HourlyRevenuePoint[];
}

export function fetchBranchSummary(branchId: string): Promise<ApiBranchSummary> {
  return request(`/branches/${branchId}/summary`);
}

export function fetchOrganizationSummary(organizationId: string): Promise<ApiOrganizationSummary> {
  return request(`/organizations/${organizationId}/summary`);
}

/** Resolves the caller's own organization — use this from the Executive
 * Overview instead of fetchOrganizationSummary, since the frontend has no
 * organization_id to pass (profiles only carries branch_id/role). */
export function fetchMyOrganizationSummary(): Promise<ApiOrganizationSummary> {
  return request('/organizations/summary');
}

export interface ApiMalayaChartPoint {
  label: string;
  value: number;
}

export interface ApiMalayaChartSeries {
  name: string;
  data: ApiMalayaChartPoint[];
}

export interface ApiMalayaChartSpec {
  type: 'bar' | 'line';
  title: string;
  series: ApiMalayaChartSeries[];
}

export interface ApiMalayaResponse {
  answer: string;
  chart: ApiMalayaChartSpec | null;
}

export function queryMalaya(question: string): Promise<ApiMalayaResponse> {
  return request('/malaya/query', {
    method: 'POST',
    body: JSON.stringify({ question }),
  });
}
