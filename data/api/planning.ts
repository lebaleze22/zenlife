import { apiClient } from './client';

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type ToBuyStatus = 'IDEA' | 'RESEARCHING' | 'PLANNED' | 'ORDERED' | 'DELIVERED' | 'INSTALLED' | 'RETURNED';
export type TodoStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED';
export type PlanningPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ToBuyItemDto {
  id: number;
  project: number | null;
  name: string;
  category: string;
  priority: PlanningPriority;
  status: ToBuyStatus;
  quantity: number;
  estimated_cost: string | null;
  actual_cost: string | null;
  preferred_store: string;
  preferred_link: string;
  target_date: string | null;
  notes: string;
  warranty_until: string | null;
  payer_split_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface TodoItemDto {
  id: number;
  project: number | null;
  title: string;
  description: string;
  priority: PlanningPriority;
  status: TodoStatus;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface ToBuyReservationDto {
  id: number;
  to_buy_item: number;
  budget_period: number;
  amount: string;
  status: 'ACTIVE' | 'RELEASED' | 'CONSUMED';
  note: string;
  released_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateToBuyInput {
  project?: number | null;
  name: string;
  category?: string;
  priority?: PlanningPriority;
  status?: ToBuyStatus;
  quantity?: number;
  estimated_cost?: string;
  target_date?: string;
  notes?: string;
}

export interface CreateTodoInput {
  project?: number | null;
  title: string;
  description?: string;
  priority?: PlanningPriority;
  status?: TodoStatus;
  due_date?: string;
}

export interface UpdateToBuyInput extends Partial<CreateToBuyInput> {
  actual_cost?: string | null;
}

export interface UpdateTodoInput extends Partial<CreateTodoInput> {}

export interface CategoryDto {
  id: number;
  name: string;
  type: 'INCOME' | 'EXPENSE';
}

export const listToBuyItems = async (): Promise<PaginatedResponse<ToBuyItemDto>> =>
  apiClient.get<PaginatedResponse<ToBuyItemDto>>('/to-buy-items/?page_size=20');

export const createToBuyItem = async (payload: CreateToBuyInput): Promise<ToBuyItemDto> =>
  apiClient.post<ToBuyItemDto, CreateToBuyInput>('/to-buy-items/', payload);

export const updateToBuyItem = async (id: number, payload: UpdateToBuyInput): Promise<ToBuyItemDto> =>
  apiClient.patch<ToBuyItemDto, UpdateToBuyInput>(`/to-buy-items/${id}/`, payload);

export const deleteToBuyItem = async (id: number): Promise<void> =>
  apiClient.del<void>(`/to-buy-items/${id}/`);

export const listTodos = async (): Promise<PaginatedResponse<TodoItemDto>> =>
  apiClient.get<PaginatedResponse<TodoItemDto>>('/todos/?page_size=20');

export const createTodo = async (payload: CreateTodoInput): Promise<TodoItemDto> =>
  apiClient.post<TodoItemDto, CreateTodoInput>('/todos/', payload);

export const updateTodo = async (id: number, payload: UpdateTodoInput): Promise<TodoItemDto> =>
  apiClient.patch<TodoItemDto, UpdateTodoInput>(`/todos/${id}/`, payload);

export const deleteTodo = async (id: number): Promise<void> =>
  apiClient.del<void>(`/todos/${id}/`);

export const listCategories = async (): Promise<PaginatedResponse<CategoryDto>> =>
  apiClient.get<PaginatedResponse<CategoryDto>>('/categories/?page_size=300');

export const listReservations = async (params?: { status?: 'ACTIVE' | 'RELEASED' | 'CONSUMED'; to_buy_item_id?: number; budget_period_id?: number }) => {
  const search = new URLSearchParams();
  if (params?.status) search.set('status', params.status);
  if (params?.to_buy_item_id) search.set('to_buy_item_id', String(params.to_buy_item_id));
  if (params?.budget_period_id) search.set('budget_period_id', String(params.budget_period_id));
  search.set('page_size', '200');
  return apiClient.get<PaginatedResponse<ToBuyReservationDto>>(`/reservations/?${search.toString()}`);
};

export const createReservation = async (payload: { to_buy_item: number; budget_period: number; amount: string; note?: string }) =>
  apiClient.post<ToBuyReservationDto, { to_buy_item: number; budget_period: number; amount: string; note?: string }>('/reservations/', payload);

export const releaseReservation = async (reservationId: number) =>
  apiClient.post<ToBuyReservationDto, Record<string, never>>(`/reservations/${reservationId}/release/`, {});

export const markToBuyRecorded = async (
  toBuyItemId: number,
  payload?: { account_id?: number; category_id?: number; amount?: string; entry_date?: string; note?: string }
) =>
  apiClient.post<
    {
      to_buy_item_id: number;
      ledger_entry_id: number;
      amount: string;
      reservation_consumed: boolean;
    },
    { account_id?: number; category_id?: number; amount?: string; entry_date?: string; note?: string }
  >(`/to-buy-items/${toBuyItemId}/mark-recorded/`, payload || {});
