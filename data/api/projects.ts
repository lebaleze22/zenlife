import { apiClient } from './client';

export type ProjectPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ProjectStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD';

export interface ProjectDto {
  id: number;
  name: string;
  description: string;
  priority: ProjectPriority;
  status: ProjectStatus;
  deadline: string | null;
  tasks: Array<{ id: string; title: string; status: ProjectStatus }>;
  created_at: string;
  updated_at: string;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  priority?: ProjectPriority;
  status?: ProjectStatus;
  deadline?: string | null;
  tasks?: Array<{ id: string; title: string; status: ProjectStatus }>;
}

export interface UpdateProjectInput extends CreateProjectInput {}

export const listProjects = async (): Promise<PaginatedResponse<ProjectDto>> =>
  apiClient.get<PaginatedResponse<ProjectDto>>('/projects/?page_size=300');

export const createProject = async (payload: CreateProjectInput): Promise<ProjectDto> =>
  apiClient.post<ProjectDto, CreateProjectInput>('/projects/', payload);

export const updateProject = async (id: number, payload: UpdateProjectInput): Promise<ProjectDto> =>
  apiClient.patch<ProjectDto, UpdateProjectInput>(`/projects/${id}/`, payload);

export const deleteProject = async (id: number): Promise<void> =>
  apiClient.del<void>(`/projects/${id}/`);
