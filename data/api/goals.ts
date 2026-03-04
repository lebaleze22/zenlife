import { apiClient } from './client';

export type GoalPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type GoalStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD';

export interface GoalDto {
  id: number;
  title: string;
  description: string;
  category: string;
  priority: GoalPriority;
  progress: number;
  target_amount: string;
  saved_amount: string;
  deadline: string | null;
  status: GoalStatus;
  created_at: string;
  updated_at: string;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface CreateGoalInput {
  title: string;
  description?: string;
  category?: string;
  priority?: GoalPriority;
  progress?: number;
  target_amount?: string;
  saved_amount?: string;
  deadline?: string | null;
  status?: GoalStatus;
}

export interface UpdateGoalInput extends Partial<CreateGoalInput> {}

export const listGoals = async (): Promise<PaginatedResponse<GoalDto>> =>
  apiClient.get<PaginatedResponse<GoalDto>>('/goals/?page_size=300');

export const createGoal = async (payload: CreateGoalInput): Promise<GoalDto> =>
  apiClient.post<GoalDto, CreateGoalInput>('/goals/', payload);

export const updateGoal = async (id: number, payload: UpdateGoalInput): Promise<GoalDto> =>
  apiClient.patch<GoalDto, UpdateGoalInput>(`/goals/${id}/`, payload);

export const deleteGoal = async (id: number): Promise<void> =>
  apiClient.del<void>(`/goals/${id}/`);
