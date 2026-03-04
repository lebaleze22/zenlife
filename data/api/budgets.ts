import { apiClient } from './client';

export type BudgetPeriodType = 'WEEKLY' | 'MONTHLY';

export interface BudgetDto {
  id: number;
  name: string;
  period_type: BudgetPeriodType;
  currency: string;
  start_date: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BudgetPeriodDto {
  id: number;
  budget: number;
  period_start: string;
  period_end: string;
  planned_amount: string;
  recorded_amount: string;
  reserved_amount: string;
  status: 'OPEN' | 'CLOSED';
  created_at: string;
  updated_at: string;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface BudgetSummaryDto {
  budget_id: number;
  period_count: number;
  totals: {
    planned: string;
    recorded: string;
    reserved: string;
    available: string;
  };
  latest_period: null | {
    id: number;
    period_start: string;
    period_end: string;
    planned_amount: string;
    recorded_amount: string;
    reserved_amount: string;
    computed: {
      planned_expense: string;
      recorded_expense: string;
      planned_income: string;
      recorded_income: string;
      available: string;
    };
  };
}

export const listBudgets = async (): Promise<PaginatedResponse<BudgetDto>> =>
  apiClient.get<PaginatedResponse<BudgetDto>>('/budgets/?page_size=200');

export const createBudget = async (payload: {
  name: string;
  period_type: BudgetPeriodType;
  currency: string;
  start_date: string;
  is_active?: boolean;
}): Promise<BudgetDto> => apiClient.post<BudgetDto, typeof payload>('/budgets/', payload);

export const generateBudgetPeriods = async (budgetId: number, payload?: { count?: number; from_date?: string }) =>
  apiClient.post<{ created: number; requested: number }, { count?: number; from_date?: string }>(`/budgets/${budgetId}/generate-periods/`, payload || {});

export const getBudgetSummary = async (budgetId: number): Promise<BudgetSummaryDto> =>
  apiClient.get<BudgetSummaryDto>(`/budgets/${budgetId}/summary/`);

export const listBudgetPeriods = async (params?: { budget_id?: number; from?: string; to?: string; status?: 'OPEN' | 'CLOSED' }) => {
  const search = new URLSearchParams();
  if (params?.budget_id) search.set('budget_id', String(params.budget_id));
  if (params?.from) search.set('from', params.from);
  if (params?.to) search.set('to', params.to);
  if (params?.status) search.set('status', params.status);
  search.set('page_size', '200');
  const qs = search.toString();
  return apiClient.get<PaginatedResponse<BudgetPeriodDto>>(`/budget-periods/${qs ? `?${qs}` : ''}`);
};

export const computeBudgetPeriod = async (periodId: number) =>
  apiClient.post<{
    period_id: number;
    period_start: string;
    period_end: string;
    planned_amount: string;
    recorded_amount: string;
    reserved_amount: string;
    computed: {
      planned_expense: string;
      recorded_expense: string;
      planned_income: string;
      recorded_income: string;
      available: string;
    };
  }, Record<string, never>>(`/budget-periods/${periodId}/compute/`, {});
