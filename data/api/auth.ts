import { apiClient } from './client';

export interface LoginInput {
  username: string;
  password: string;
}

export interface LoginResponse {
  access: string;
  refresh: string;
}

export const login = async (payload: LoginInput): Promise<LoginResponse> =>
  apiClient.post<LoginResponse, LoginInput>('/auth/login', payload);
