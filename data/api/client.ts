export interface ApiErrorDetail {
  field?: string;
  issue?: string;
}

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetail[];
    request_id?: string;
  };
}

export class ApiClientError extends Error {
  code: string;
  status: number;
  details?: ApiErrorDetail[];
  requestId?: string;

  constructor(message: string, code: string, status: number, details?: ApiErrorDetail[], requestId?: string) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.requestId = requestId;
  }
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1';

const isApiEnvelope = (value: unknown): value is ApiErrorEnvelope => {
  if (!value || typeof value !== 'object') return false;
  const maybe = value as Record<string, unknown>;
  return typeof maybe.error === 'object' && maybe.error !== null;
};

const extractGenericApiError = (payload: unknown): { message: string; details?: ApiErrorDetail[] } | null => {
  if (typeof payload === 'string' && payload.trim()) {
    return { message: payload.trim() };
  }

  if (!payload || typeof payload !== 'object') return null;

  if (Array.isArray(payload)) {
    const first = payload.find((x) => typeof x === 'string') as string | undefined;
    return first ? { message: first } : null;
  }

  const obj = payload as Record<string, unknown>;
  const details: ApiErrorDetail[] = [];

  for (const [field, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      details.push({ field, issue: value });
      continue;
    }
    if (Array.isArray(value) && value.length > 0) {
      const first = value.find((v) => typeof v === 'string') as string | undefined;
      if (first) details.push({ field, issue: first });
    }
  }

  if (details.length > 0) {
    const first = details[0];
    const prefix = first.field && first.field !== 'detail' && first.field !== 'non_field_errors' ? `${first.field}: ` : '';
    return { message: `${prefix}${first.issue || 'Request failed'}`, details };
  }

  const detail = obj.detail;
  if (typeof detail === 'string' && detail.trim()) {
    return { message: detail.trim() };
  }

  return null;
};

const toApiClientError = (status: number, payload: unknown): ApiClientError => {
  if (isApiEnvelope(payload)) {
    const err = payload.error;
    const code = typeof err.code === 'string' ? err.code : 'UNKNOWN_ERROR';
    const message = typeof err.message === 'string' ? err.message : 'Unknown API error';
    const details = Array.isArray(err.details) ? (err.details as ApiErrorDetail[]) : undefined;
    const requestId = typeof err.request_id === 'string' ? err.request_id : undefined;
    return new ApiClientError(message, code, status, details, requestId);
  }

  const generic = extractGenericApiError(payload);
  if (generic) {
    return new ApiClientError(generic.message, 'HTTP_ERROR', status, generic.details);
  }

  return new ApiClientError('Request failed', 'HTTP_ERROR', status);
};

const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const token = localStorage.getItem('zenlife_access_token');
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init.headers || {}),
  };

  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });

  let payload: unknown = null;
  const isJson = response.headers.get('content-type')?.includes('application/json');
  if (isJson) payload = await response.json();

  if (!response.ok) {
    throw toApiClientError(response.status, payload);
  }

  return payload as T;
};

interface ApiClient {
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
  get: <T>(path: string) => Promise<T>;
  post: <T, B = unknown>(path: string, body: B) => Promise<T>;
  patch: <T, B = unknown>(path: string, body: B) => Promise<T>;
  del: <T>(path: string) => Promise<T>;
}

export const apiClient: ApiClient = {
  request,
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T, B = unknown>(path: string, body: B) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T, B = unknown>(path: string, body: B) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
