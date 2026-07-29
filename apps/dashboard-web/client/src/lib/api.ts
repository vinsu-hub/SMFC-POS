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
