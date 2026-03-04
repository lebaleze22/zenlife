import { apiClient } from './client';

export interface CashflowReportDto {
  from: string;
  to: string;
  income: string;
  expense: string;
  net: string;
  monthly: Array<{
    month: string;
    income: string;
    expense: string;
    net: string;
  }>;
}

export interface NetWorthReportDto {
  assets: string;
  liabilities: string;
  net_worth: string;
}

export interface PlannedVsRecordedReportDto {
  from: string;
  to: string;
  ledger: {
    planned_expense: string;
    recorded_expense: string;
    variance: string;
  };
  budget_periods: {
    planned: string;
    recorded: string;
    reserved: string;
    available: string;
  };
}

export const getCashflowReport = async (params?: { from?: string; to?: string }): Promise<CashflowReportDto> => {
  const search = new URLSearchParams();
  if (params?.from) search.set('from', params.from);
  if (params?.to) search.set('to', params.to);
  const qs = search.toString();
  return apiClient.get<CashflowReportDto>(`/reports/cashflow${qs ? `?${qs}` : ''}`);
};

export const getNetWorthReport = async (): Promise<NetWorthReportDto> =>
  apiClient.get<NetWorthReportDto>('/reports/net-worth');

export const getPlannedVsRecordedReport = async (params?: { from?: string; to?: string }): Promise<PlannedVsRecordedReportDto> => {
  const search = new URLSearchParams();
  if (params?.from) search.set('from', params.from);
  if (params?.to) search.set('to', params.to);
  const qs = search.toString();
  return apiClient.get<PlannedVsRecordedReportDto>(`/reports/planned-vs-recorded${qs ? `?${qs}` : ''}`);
};
