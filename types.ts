
export enum Priority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export enum Status {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  ON_HOLD = 'ON_HOLD'
}

export enum BudgetType {
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE',
  LOAN = 'LOAN',
  SAVINGS = 'SAVINGS'
}

export interface Task {
  id: string;
  title: string;
  status: Status;
}

export interface ProjectSection {
  id: string;
  name: string;
  checklist: Task[];
}

export interface Goal {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: Priority;
  progress: number;
  targetAmount: number;
  savedAmount: number;
  deadline: string;
  status: Status;
  createdAt: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  status: Status;
  priority: Priority;
  deadline: string;
  tasks: Task[];
  sections?: ProjectSection[];
  createdAt: number;
  completedAt?: number;
}

export interface BudgetItem {
  id: string;
  type: BudgetType;
  category: string;
  amount: number;
  date: string;
  description: string;
  recurring: boolean;
  interestRate?: number;
  repaymentSchedule?: string; // Monthly, Quarterly, Annually
  loanDurationMonths?: number; // Total duration for bank loans
  linkedGoalId?: string;
  paidAmount?: number; // Total amount paid back to the bank
  usedAmount?: number; // Total amount of principal spent/used
  sourceLoanId?: string; // For expenses, which loan funded this?
}

export type Language = 'en' | 'fr';
export type Theme = 'light' | 'dark';

export interface AppState {
  goals: Goal[];
  projects: Project[];
  budget: BudgetItem[];
  language: Language;
  theme: Theme;
}
