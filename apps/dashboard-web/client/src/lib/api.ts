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

// --- Inventory Movements ---
export type MovementType = 'trans_in' | 'trans_out' | 'delivery' | 'transfer_in' | 'transfer_out';

export interface ApiInventoryMovement {
  id: string;
  branch_id: string;
  ingredient_id: string;
  type: MovementType;
  quantity: number;
  reason: string | null;
  reference_id: string | null;
  employee_id: string;
  unit_cost_snapshot: number | null;
  created_at: string;
}

export interface CreateInventoryMovementRequest {
  branch_id: string;
  ingredient_id: string;
  type: MovementType;
  quantity: number;
  reason?: string | null;
  reference_id?: string | null;
  employee_id: string;
}

// --- Transfers ---
export interface ApiTransfer {
  id: string;
  from_branch_id: string;
  to_branch_id: string;
  ingredient_id: string;
  quantity: number;
  status: 'pending' | 'confirmed' | 'rejected' | 'cancelled';
  initiated_by: string;
  confirmed_by: string | null;
  initiated_at: string;
  confirmed_at: string | null;
  notes: string | null;
}

export interface CreateTransferRequest {
  from_branch_id: string;
  to_branch_id: string;
  ingredient_id: string;
  quantity: number;
  initiated_by: string;
  notes?: string | null;
}

// --- Utility ---
export type UtilityType = 'electricity' | 'water';

export interface ApiUtilityLog {
  id: string;
  branch_id: string;
  utility_type: UtilityType;
  business_date: string;
  reading_start: number;
  reading_end: number | null;
  unit_cost: number;
  recorded_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateUtilityLogRequest {
  branch_id: string;
  utility_type: UtilityType;
  business_date: string;
  reading_start: number;
  reading_end?: number | null;
  unit_cost: number;
  recorded_by: string;
}

export interface ApiUtilitySummary {
  branch_id: string;
  branch_name: string;
  period_start: string | null;
  period_end: string | null;
  electricity: {
    consumption: number;
    cost: number;
    readings_count: number;
  };
  water: {
    consumption: number;
    cost: number;
    readings_count: number;
  };
  total_cost: number;
}

// --- HR / Attendance / Payroll ---
export interface ApiAttendanceLog {
  id: string;
  employee_id: string;
  branch_id: string;
  clock_in: string;
  clock_out: string | null;
  date: string;
  hours_worked: number | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ClockInRequest {
  employee_id: string;
  branch_id: string;
}

export interface ClockOutRequest {
  employee_id: string;
}

export interface ApiEmployee {
  id: string;
  full_name: string;
  email: string;
  role: string;
  branch_id: string;
  pay_rate: number;
  position: string | null;
  payroll_schedule: string;
}

export interface UpdateEmployeeRequest {
  pay_rate?: number;
  position?: string | null;
  payroll_schedule?: string | null;
}

export interface ApiPayrollRow {
  employee_id: string;
  employee_name: string;
  position: string;
  branch_id: string;
  hours_worked: number;
  pay_rate: number;
  total_pay: number;
  period_start: string;
  period_end: string;
}

export interface ApiPayrollSummary {
  branch_id: string;
  period_start: string;
  period_end: string;
  rows: ApiPayrollRow[];
  total_hours: number;
  total_pay: number;
  employee_count: number;
}

export interface ApiHrFlag {
  id: string;
  employee_id: string;
  branch_id: string;
  pattern_type: 'lateness' | 'absence' | 'overtime' | 'other';
  description: string;
  resolved: boolean;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
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

export function fetchBranchSummary(branchId: string): Promise<ApiBranchSummary> {
  return request(`/branches/${branchId}/summary`);
}

export function fetchOrganizationSummary(organizationId: string): Promise<ApiOrganizationSummary> {
  return request(`/organizations/${organizationId}/summary`);
}

export function fetchMyOrganizationSummary(): Promise<ApiOrganizationSummary> {
  return request('/organizations/summary');
}

export function queryMalaya(question: string): Promise<ApiMalayaResponse> {
  return request('/malaya/query', {
    method: 'POST',
    body: JSON.stringify({ question }),
  });
}

// --- Inventory Movements ---
export function fetchInventoryMovements(
  branchId: string,
  ingredientId?: string,
  type?: MovementType
): Promise<ApiInventoryMovement[]> {
  const params = new URLSearchParams({ branch_id: branchId });
  if (ingredientId) params.append('ingredient_id', ingredientId);
  if (type) params.append('type', type);
  return request(`/inventory-movements?${params.toString()}`);
}

export function createInventoryMovement(body: CreateInventoryMovementRequest): Promise<ApiInventoryMovement> {
  return request('/inventory-movements', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function fetchBranchInventoryMovements(branchId: string): Promise<ApiInventoryMovement[]> {
  return request(`/branches/${branchId}/inventory-movements`);
}

// --- Transfers ---
export function fetchTransfers(
  branchId: string,
  status?: string
): Promise<ApiTransfer[]> {
  const params = new URLSearchParams({ branch_id: branchId });
  if (status) params.append('status', status);
  return request(`/transfers?${params.toString()}`);
}

export function fetchTransfer(transferId: string): Promise<ApiTransfer> {
  return request(`/transfers/${transferId}`);
}

export function createTransfer(body: CreateTransferRequest): Promise<ApiTransfer> {
  return request('/transfers', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function confirmTransfer(transferId: string): Promise<ApiTransfer> {
  return request(`/transfers/${transferId}/confirm`, { method: 'POST' });
}

export function rejectTransfer(transferId: string): Promise<ApiTransfer> {
  return request(`/transfers/${transferId}/reject`, { method: 'POST' });
}

// --- Utility ---
export function fetchUtilityLogs(
  branchId: string,
  utilityType?: UtilityType,
  fromDate?: string,
  toDate?: string
): Promise<ApiUtilityLog[]> {
  const params = new URLSearchParams({ branch_id: branchId });
  if (utilityType) params.append('utility_type', utilityType);
  if (fromDate) params.append('from_date', fromDate);
  if (toDate) params.append('to_date', toDate);
  return request(`/utility-logs?${params.toString()}`);
}

export function createUtilityLog(body: CreateUtilityLogRequest): Promise<ApiUtilityLog> {
  return request('/utility-logs', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function fetchUtilitySummary(
  branchId: string,
  fromDate?: string,
  toDate?: string
): Promise<ApiUtilitySummary> {
  const params = new URLSearchParams();
  if (fromDate) params.append('from_date', fromDate);
  if (toDate) params.append('to_date', toDate);
  return request(`/branches/${branchId}/utility-summary?${params.toString()}`);
}

export function fetchOrgUtilitySummary(
  fromDate?: string,
  toDate?: string
): Promise<ApiUtilitySummary[]> {
  const params = new URLSearchParams();
  if (fromDate) params.append('from_date', fromDate);
  if (toDate) params.append('to_date', toDate);
  return request(`/organizations/utility-summary?${params.toString()}`);
}

// --- HR / Attendance / Payroll ---
export function clockIn(body: ClockInRequest): Promise<ApiAttendanceLog> {
  return request('/attendance/clock-in', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function clockOut(body: ClockOutRequest): Promise<ApiAttendanceLog> {
  return request('/attendance/clock-out', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function fetchMyAttendance(): Promise<ApiAttendanceLog | null> {
  return request('/attendance/me');
}

export function fetchBranchAttendance(
  branchId: string,
  dateFrom?: string,
  dateTo?: string
): Promise<ApiAttendanceLog[]> {
  const params = new URLSearchParams();
  if (dateFrom) params.append('date_from', dateFrom);
  if (dateTo) params.append('date_to', dateTo);
  return request(`/branches/${branchId}/attendance?${params.toString()}`);
}

export function fetchPayrollSummary(
  branchId: string,
  dateFrom: string,
  dateTo: string
): Promise<ApiPayrollSummary> {
  return request(`/branches/${branchId}/attendance/summary?date_from=${dateFrom}&date_to=${dateTo}`);
}

async function requestBlob(path: string): Promise<Blob> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('Not signed in');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`API ${path} failed: ${response.status} ${body}`);
  }
  return response.blob();
}

export function fetchPayrollReceiptPdf(
  branchId: string,
  employeeId: string,
  periodStart: string,
  periodEnd: string
): Promise<Blob> {
  return requestBlob(
    `/branches/${branchId}/payroll/${employeeId}/receipt.pdf?period_start=${periodStart}&period_end=${periodEnd}`
  );
}

export function fetchPayrollReceiptsZip(
  branchId: string,
  periodStart: string,
  periodEnd: string
): Promise<Blob> {
  return requestBlob(`/branches/${branchId}/payroll/receipts.zip?period_start=${periodStart}&period_end=${periodEnd}`);
}

export function fetchEmployees(branchId: string): Promise<ApiEmployee[]> {
  return request(`/employees?branch_id=${branchId}`);
}

export function updateEmployee(employeeId: string, body: UpdateEmployeeRequest): Promise<ApiEmployee> {
  return request(`/employees/${employeeId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function fetchHrFlags(
  branchId?: string,
  resolved?: boolean
): Promise<ApiHrFlag[]> {
  const params = new URLSearchParams();
  if (branchId) params.append('branch_id', branchId);
  if (resolved !== undefined) params.append('resolved', String(resolved));
  return request(`/hr-flags?${params.toString()}`);
}

export function createHrFlag(body: { employee_id: string; branch_id: string; pattern_type: string; description: string }): Promise<ApiHrFlag> {
  return request('/hr-flags', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function resolveHrFlag(flagId: string): Promise<ApiHrFlag> {
  return request(`/hr-flags/${flagId}/resolve`, { method: 'PATCH' });
}