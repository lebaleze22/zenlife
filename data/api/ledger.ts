import { apiClient } from './client';

export type LedgerEntryType = 'INCOME' | 'EXPENSE' | 'TRANSFER';
export type LedgerEntryStatus = 'PLANNED' | 'RECORDED' | 'CANCELED';

export interface LedgerEntry {
  id: number;
  account: number;
  category: number | null;
  type: LedgerEntryType;
  status: LedgerEntryStatus;
  amount: string;
  currency: string;
  fx_rate: string | null;
  entry_date: string;
  note: string;
  linked_tobuy_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface AccountDto {
  id: number;
  name: string;
  type: string;
  currency: string;
  is_active: boolean;
}

export interface CreateAccountInput {
  name: string;
  type: 'CASH' | 'BANK' | 'CARD' | 'SAVINGS';
  currency: string;
  opening_balance?: string;
  current_balance?: string;
  is_active?: boolean;
}

export interface CreateLedgerEntryInput {
  account: number;
  category?: number | null;
  type: LedgerEntryType;
  status: LedgerEntryStatus;
  amount: string;
  currency: string;
  entry_date: string;
  note?: string;
}

export interface UpdateLedgerEntryInput {
  account?: number;
  category?: number | null;
  type?: LedgerEntryType;
  status?: LedgerEntryStatus;
  amount?: string;
  currency?: string;
  entry_date?: string;
  note?: string;
}

export interface LedgerCsvImportReport {
  created: number;
  skipped: number;
  total: number;
  errors: Array<{ line: number; error: string }>;
}

export const listLedgerEntries = async (params?: {
  from?: string;
  to?: string;
  status?: LedgerEntryStatus;
  category_id?: number;
  q?: string;
  page_size?: number;
}): Promise<PaginatedResponse<LedgerEntry>> => {
  const search = new URLSearchParams();
  if (params?.from) search.set('from', params.from);
  if (params?.to) search.set('to', params.to);
  if (params?.status) search.set('status', params.status);
  if (params?.category_id) search.set('category_id', String(params.category_id));
  if (params?.q) search.set('q', params.q);
  search.set('page_size', String(params?.page_size ?? 300));
  const qs = search.toString();
  return apiClient.get<PaginatedResponse<LedgerEntry>>(`/ledger-entries/${qs ? `?${qs}` : ''}`);
};

export const createLedgerEntry = async (payload: CreateLedgerEntryInput): Promise<LedgerEntry> =>
  apiClient.post<LedgerEntry, CreateLedgerEntryInput>('/ledger-entries/', payload);

export const updateLedgerEntry = async (id: number, payload: UpdateLedgerEntryInput): Promise<LedgerEntry> =>
  apiClient.patch<LedgerEntry, UpdateLedgerEntryInput>(`/ledger-entries/${id}/`, payload);

export const deleteLedgerEntry = async (id: number): Promise<void> =>
  apiClient.del<void>(`/ledger-entries/${id}/`);

export const listAccounts = async (): Promise<PaginatedResponse<AccountDto>> =>
  apiClient.get<PaginatedResponse<AccountDto>>('/accounts/');

export const createAccount = async (payload: CreateAccountInput): Promise<AccountDto> =>
  apiClient.post<AccountDto, CreateAccountInput>('/accounts/', payload);

export const importLedgerCsv = async (file: File): Promise<LedgerCsvImportReport> => {
  const token = localStorage.getItem('zenlife_access_token');
  const form = new FormData();
  form.append('file', file);

  const response = await fetch(`${(import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1')}/imports/ledger/csv`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error || 'CSV import failed');
  }
  return payload as LedgerCsvImportReport;
};
