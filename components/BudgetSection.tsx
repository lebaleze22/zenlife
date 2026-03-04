
import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../AppContext';
import { translations } from '../i18n';
import {
  Plus,
  Trash2,
  Edit3,
  ArrowUpRight,
  ArrowDownRight,
  PieChart as PieIcon,
  TrendingUp,
  Landmark,
  PiggyBank,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Info,
  Repeat,
  Clock,
  ReceiptText,
  CircleDollarSign,
  HandCoins,
  History,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  Briefcase,
  Upload
} from 'lucide-react';
import { BudgetItem, BudgetType, Status } from '../types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { createLedgerEntry, deleteLedgerEntry, importLedgerCsv, listAccounts, listLedgerEntries, updateLedgerEntry, type LedgerEntry, type LedgerCsvImportReport } from '../data/api/ledger';
import { computeBudgetPeriod, createBudget, generateBudgetPeriods, getBudgetSummary, listBudgetPeriods, listBudgets, type BudgetSummaryDto } from '../data/api/budgets';
import { updateGoal } from '../data/api/goals';

const categorySuggestions: Record<BudgetType, string[]> = {
  [BudgetType.INCOME]: [
    'Salary',
    'Bonus',
    'Freelance',
    'Business Revenue',
    'Rental Income',
    'Dividend',
    'Interest Income',
    'Gift',
    'Tax Refund',
    'Other Income',
  ],
  [BudgetType.EXPENSE]: [
    'Rent',
    'Mortgage',
    'Groceries',
    'Utilities',
    'Internet',
    'Phone',
    'Transportation',
    'Fuel',
    'Healthcare',
    'Insurance',
    'Education',
    'Childcare',
    'Debt Payment',
    'Subscriptions',
    'Dining Out',
    'Shopping',
    'Travel',
    'Entertainment',
    'Maintenance',
    'Emergency',
    'Other Expense',
  ],
  [BudgetType.LOAN]: [
    'Mortgage',
    'Auto Loan',
    'Personal Loan',
    'Student Loan',
    'Business Loan',
    'Credit Card Loan',
    'Family Loan',
    'Bank Loan',
    'Microfinance Loan',
    'Other Loan',
  ],
  [BudgetType.SAVINGS]: [
    'Emergency Fund',
    'Retirement',
    'House Down Payment',
    'School Fees',
    'Travel Fund',
    'Investment',
    'Business Capital',
    'Car Purchase',
    'Medical Reserve',
    'General Savings',
  ]
};

const BudgetSection: React.FC = () => {
  const { budget, setBudget, goals, setGoals, language, theme } = useApp();
  const t = translations[language];
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'monthly' | 'quarterly' | 'annual'>('monthly');
  const [breakdownType, setBreakdownType] = useState<BudgetType>(BudgetType.EXPENSE);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [apiEntries, setApiEntries] = useState<LedgerEntry[]>([]);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [apiConnected, setApiConnected] = useState(false);
  const [tableTypeFilter, setTableTypeFilter] = useState<'ALL' | BudgetType>('ALL');
  const [tableSearch, setTableSearch] = useState('');
  const [tablePage, setTablePage] = useState(1);
  const tablePageSize = 10;
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [importReport, setImportReport] = useState<LedgerCsvImportReport | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [budgetSummary, setBudgetSummary] = useState<BudgetSummaryDto | null>(null);
  const [budgetSummaryLoading, setBudgetSummaryLoading] = useState(false);
  const [budgetSummaryError, setBudgetSummaryError] = useState<string | null>(null);
  const [activeBudgetId, setActiveBudgetId] = useState<number | null>(null);

  const [formData, setFormData] = useState<Partial<BudgetItem>>({
    type: BudgetType.EXPENSE,
    amount: undefined,
    category: '',
    date: new Date().toISOString().split('T')[0],
    description: '',
    recurring: false,
    interestRate: undefined,
    loanDurationMonths: 12,
    repaymentSchedule: 'Monthly',
    linkedGoalId: '',
    paidAmount: undefined,
    usedAmount: undefined,
    sourceLoanId: ''
  });

  const loans = useMemo(() => budget.filter(b => b.type === BudgetType.LOAN), [budget]);
  const formCategorySuggestions = useMemo(() => {
    const currentType = formData.type || BudgetType.EXPENSE;
    const historical = budget
      .filter((b) => b.type === currentType && !!b.category)
      .map((b) => b.category.trim())
      .filter(Boolean);
    return Array.from(new Set([...categorySuggestions[currentType], ...historical]));
  }, [budget, formData.type]);

  const getPeriodRange = (date: Date, mode: 'monthly' | 'quarterly' | 'annual') => {
    const start = new Date(date);
    const end = new Date(date);

    if (mode === 'monthly') {
      start.setDate(1);
      end.setMonth(end.getMonth() + 1, 0);
    } else if (mode === 'quarterly') {
      const quarterStartMonth = Math.floor(start.getMonth() / 3) * 3;
      start.setMonth(quarterStartMonth, 1);
      end.setMonth(quarterStartMonth + 3, 0);
    } else {
      start.setMonth(0, 1);
      end.setMonth(12, 0);
    }

    const toIsoDate = (d: Date) => d.toISOString().split('T')[0];
    return { from: toIsoDate(start), to: toIsoDate(end) };
  };

  const refreshApiEntries = async () => {
    setApiLoading(true);
    setApiError(null);
    try {
      const { from, to } = getPeriodRange(selectedDate, viewMode);
      const data = await listLedgerEntries({ from, to, page_size: 300 });
      setApiEntries(data.results);
      setApiConnected(true);
    } catch (error) {
      setApiConnected(false);
      setApiError(error instanceof Error ? error.message : 'Backend unreachable');
    } finally {
      setApiLoading(false);
    }
  };

  const ensureBackendBudget = async (): Promise<number | null> => {
    const token = localStorage.getItem('zenlife_access_token');
    if (!token) return null;

    const budgetsResp = await listBudgets();
    const active = budgetsResp.results.find((b) => b.is_active) || budgetsResp.results[0];
    if (active) return active.id;

    const start = new Date(selectedDate);
    start.setDate(1);
    const startIso = start.toISOString().split('T')[0];
    const created = await createBudget({
      name: 'Main Budget',
      period_type: 'MONTHLY',
      currency: 'XAF',
      start_date: startIso,
      is_active: true,
    });
    await generateBudgetPeriods(created.id, { count: 12, from_date: startIso });
    return created.id;
  };

  const refreshBudgetSummary = async () => {
    const token = localStorage.getItem('zenlife_access_token');
    if (!token) {
      setBudgetSummary(null);
      setBudgetSummaryError(null);
      return;
    }

    setBudgetSummaryLoading(true);
    setBudgetSummaryError(null);
    try {
      const budgetId = await ensureBackendBudget();
      if (!budgetId) return;
      setActiveBudgetId(budgetId);

      const { from, to } = getPeriodRange(selectedDate, viewMode);
      const periods = await listBudgetPeriods({ budget_id: budgetId, from, to });
      if (periods.results.length > 0) {
        await computeBudgetPeriod(periods.results[0].id);
      } else {
        await generateBudgetPeriods(budgetId, { count: 1, from_date: from });
      }

      const summary = await getBudgetSummary(budgetId);
      setBudgetSummary(summary);
    } catch (error) {
      setBudgetSummaryError(error instanceof Error ? error.message : 'Budget summary unavailable');
    } finally {
      setBudgetSummaryLoading(false);
    }
  };

  useEffect(() => {
    void refreshApiEntries();
    void refreshBudgetSummary();
  }, [selectedDate, viewMode]);

  const calculateLoanInstalment = (principal: number, annualRate: number, durationMonths: number) => {
    if (!principal || !durationMonths) return 0;
    if (annualRate === 0) return principal / durationMonths;
    const r = (annualRate / 100) / 12;
    const n = durationMonths;
    return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  };

  const parseOptionalNumber = (value: string): number | undefined => {
    if (value.trim() === '') return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const parseOptionalInteger = (value: string): number | undefined => {
    if (value.trim() === '') return undefined;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const calculateLoanTotalToPay = (loan: BudgetItem): number => {
    const duration = loan.loanDurationMonths || 12;
    const monthly = calculateLoanInstalment(loan.amount, loan.interestRate || 0, duration);
    return monthly * duration;
  };

  const parseApiLedgerId = (id: string): number | null => {
    if (!id.startsWith('api-')) return null;
    const n = Number(id.replace('api-', ''));
    return Number.isFinite(n) ? n : null;
  };

  const validateBudgetForm = (): string | null => {
    if (!formData.category || !String(formData.category).trim()) return 'Category is required.';
    if (!formData.amount || Number(formData.amount) <= 0) return 'Amount must be greater than 0.';
    if (!formData.date) return 'Date is required.';
    if (formData.type === BudgetType.LOAN && (!formData.loanDurationMonths || Number(formData.loanDurationMonths) <= 0)) {
      return 'Loan duration must be greater than 0.';
    }
    return null;
  };

  const handleEditItem = (item: BudgetItem) => {
    setEditingItemId(item.id);
    setFormError(null);
    setFormData({
      ...item,
      amount: Number(item.amount),
      date: item.date || new Date().toISOString().split('T')[0],
      recurring: item.recurring || false,
    });
    setIsModalOpen(true);
  };

  const applySavingsDeltaToGoal = async (goalId: string, delta: number, targetAmountOverride?: number) => {
    if (!goalId || delta === 0) return;

    const targetGoal = goals.find((g) => g.id === goalId);
    if (!targetGoal) return;

    const nextSaved = Math.max(0, (targetGoal.savedAmount || 0) + delta);
    const targetAmount = Math.max(0, targetAmountOverride ?? targetGoal.targetAmount ?? 0);
    const nextProgress = targetAmount > 0
      ? Math.max(0, Math.min(100, Math.floor((nextSaved / targetAmount) * 100)))
      : targetGoal.progress;

    setGoals((prev) =>
      prev.map((g) =>
        g.id === goalId
          ? { ...g, targetAmount, savedAmount: nextSaved, progress: nextProgress, status: nextProgress >= 100 ? Status.COMPLETED : g.status }
          : g
      )
    );

    const token = localStorage.getItem('zenlife_access_token');
    const goalApiId = Number(goalId);
    if (token && Number.isFinite(goalApiId)) {
      try {
        await updateGoal(goalApiId, {
          saved_amount: nextSaved.toFixed(2),
          target_amount: targetAmount.toFixed(2),
        });
      } catch {
        // local state already updated; backend sync can catch up later
      }
    }
  };

  const syncLoanRepaymentGoal = async (newLoan: BudgetItem | null, previousLoan: BudgetItem | null) => {
    if (previousLoan?.linkedGoalId && (!newLoan || newLoan.linkedGoalId !== previousLoan.linkedGoalId)) {
      await applySavingsDeltaToGoal(
        previousLoan.linkedGoalId,
        -(previousLoan.paidAmount || 0),
        calculateLoanTotalToPay(previousLoan),
      );
    }

    if (newLoan?.linkedGoalId) {
      const previousPaidSameGoal = previousLoan?.linkedGoalId === newLoan.linkedGoalId ? (previousLoan.paidAmount || 0) : 0;
      const delta = (newLoan.paidAmount || 0) - previousPaidSameGoal;
      await applySavingsDeltaToGoal(newLoan.linkedGoalId, delta, calculateLoanTotalToPay(newLoan));
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    const apiId = parseApiLedgerId(itemId);
    if (apiId) {
      try {
        await deleteLedgerEntry(apiId);
        await refreshApiEntries();
      } catch {
        setApiError('Failed to delete backend ledger entry.');
      }
      return;
    }
    const item = budget.find((b) => b.id === itemId);
    if (item && item.type === BudgetType.SAVINGS && item.linkedGoalId) {
      await applySavingsDeltaToGoal(item.linkedGoalId, -item.amount);
    }
    if (item && item.type === BudgetType.LOAN) {
      await syncLoanRepaymentGoal(null, item);
    }
    setBudget(prev => prev.filter(b => b.id !== itemId));
  };

  const handleSave = async () => {
    const validationMessage = validateBudgetForm();
    if (validationMessage) {
      setFormError(validationMessage);
      return;
    }
    setFormError(null);

    const newItem: BudgetItem = {
      id: editingItemId || Date.now().toString(),
      type: formData.type || BudgetType.EXPENSE,
      amount: Number(formData.amount),
      category: formData.category || 'General',
      date: formData.date || new Date().toISOString().split('T')[0],
      description: formData.description || '',
      recurring: formData.recurring || false,
      interestRate: formData.type === BudgetType.LOAN ? Number(formData.interestRate) : undefined,
      loanDurationMonths: formData.type === BudgetType.LOAN ? Number(formData.loanDurationMonths) : undefined,
      repaymentSchedule: (formData.type === BudgetType.LOAN || formData.type === BudgetType.SAVINGS || formData.recurring) ? formData.repaymentSchedule : undefined,
      linkedGoalId: (formData.type === BudgetType.SAVINGS || formData.type === BudgetType.LOAN) ? formData.linkedGoalId : undefined,
      paidAmount: formData.type === BudgetType.LOAN ? Number(formData.paidAmount || 0) : undefined,
      usedAmount: formData.type === BudgetType.LOAN ? Number(formData.usedAmount || 0) : undefined,
      sourceLoanId: formData.type === BudgetType.EXPENSE ? formData.sourceLoanId : undefined,
    };

    const editingApiId = editingItemId ? parseApiLedgerId(editingItemId) : null;
    const isEditing = !!editingItemId;

    if (editingApiId) {
      try {
        if (newItem.type !== BudgetType.INCOME && newItem.type !== BudgetType.EXPENSE) {
          setFormError('Backend ledger entries can only be INCOME or EXPENSE in this form.');
          return;
        }
        const existing = apiEntries.find((e) => e.id === editingApiId);
        const accounts = await listAccounts();
        const accountId = existing?.account || accounts.results[0]?.id;
        if (!accountId) {
          setFormError('No account available for backend update.');
          return;
        }
        await updateLedgerEntry(editingApiId, {
          account: accountId,
          type: newItem.type as 'INCOME' | 'EXPENSE',
          status: existing?.status || 'PLANNED',
          amount: newItem.amount.toFixed(2),
          currency: 'XAF',
          entry_date: newItem.date,
          note: `${newItem.category}${newItem.description ? ` - ${newItem.description}` : ''}`,
        });
        await refreshApiEntries();
      } catch {
        setFormError('Failed to update backend ledger entry.');
        return;
      }
    } else {
      const previousLocalItem = editingItemId ? budget.find((b) => b.id === editingItemId) : null;

      if (isEditing) {
        setBudget(prev => prev.map((b) => (b.id === editingItemId ? newItem : b)));
      } else {
        setBudget(prev => {
          let nextBudget = [newItem, ...prev];
          if (newItem.type === BudgetType.EXPENSE && newItem.sourceLoanId) {
            nextBudget = nextBudget.map(item =>
              item.id === newItem.sourceLoanId
                ? { ...item, usedAmount: (item.usedAmount || 0) + newItem.amount }
                : item
            );
          }
          return nextBudget;
        });
      }

      if (previousLocalItem && previousLocalItem.type === BudgetType.SAVINGS && previousLocalItem.linkedGoalId) {
        await applySavingsDeltaToGoal(previousLocalItem.linkedGoalId, -previousLocalItem.amount);
      }
      if (newItem.type === BudgetType.SAVINGS && newItem.linkedGoalId) {
        await applySavingsDeltaToGoal(newItem.linkedGoalId, newItem.amount);
      }
      await syncLoanRepaymentGoal(
        newItem.type === BudgetType.LOAN ? newItem : null,
        previousLocalItem && previousLocalItem.type === BudgetType.LOAN ? previousLocalItem : null,
      );

      if (!isEditing && (newItem.type === BudgetType.INCOME || newItem.type === BudgetType.EXPENSE)) {
        try {
          const accounts = await listAccounts();
          const accountId = accounts.results[0]?.id;
          if (accountId) {
            await createLedgerEntry({
              account: accountId,
              type: newItem.type,
              status: 'PLANNED',
              amount: newItem.amount.toFixed(2),
              currency: 'XAF',
              entry_date: newItem.date,
              note: `${newItem.category}${newItem.description ? ` - ${newItem.description}` : ''}`,
            });
            await refreshApiEntries();
          }
        } catch {
          // Keep local-only behavior if API is unavailable.
        }
      }
    }

    setIsModalOpen(false);
    setEditingItemId(null);
    resetForm();
  };

  const resetForm = () => {
    setFormError(null);
    setEditingItemId(null);
    setFormData({
      type: BudgetType.EXPENSE,
      amount: undefined,
      category: '',
      date: new Date().toISOString().split('T')[0],
      description: '',
      recurring: false,
      interestRate: undefined,
      loanDurationMonths: 12,
      repaymentSchedule: 'Monthly',
      linkedGoalId: '',
      paidAmount: undefined,
      usedAmount: undefined,
      sourceLoanId: ''
    });
  };

  const handleCsvImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportBusy(true);
    setImportReport(null);
    try {
      const report = await importLedgerCsv(file);
      setImportReport(report);
      await refreshApiEntries();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'CSV import failed');
    } finally {
      setImportBusy(false);
      event.target.value = '';
    }
  };

  const handleRecomputeBackendPeriod = async () => {
    if (!activeBudgetId) {
      await refreshBudgetSummary();
      return;
    }
    try {
      const { from, to } = getPeriodRange(selectedDate, viewMode);
      const periods = await listBudgetPeriods({ budget_id: activeBudgetId, from, to });
      if (periods.results.length > 0) {
        await computeBudgetPeriod(periods.results[0].id);
      } else {
        await generateBudgetPeriods(activeBudgetId, { count: 1, from_date: from });
      }
      await refreshBudgetSummary();
    } catch (error) {
      setBudgetSummaryError(error instanceof Error ? error.message : 'Recompute failed');
    }
  };

  const handleAddPayment = async (loanId: string, amount: number) => {
    const currentLoan = budget.find((b) => b.id === loanId && b.type === BudgetType.LOAN);
    if (!currentLoan) return;

    const nextLoan: BudgetItem = { ...currentLoan, paidAmount: (currentLoan.paidAmount || 0) + amount };
    setBudget(prev => prev.map(item => (item.id === loanId ? nextLoan : item)));
    await syncLoanRepaymentGoal(nextLoan, currentLoan);
  };

  const getOccurrencesInPeriod = (item: BudgetItem, periodStart: Date, periodType: 'monthly' | 'annual' | 'quarterly') => {
    const itemDate = new Date(item.date);
    const selYear = periodStart.getFullYear();
    const selMonth = periodStart.getMonth();

    const isRecurring = item.recurring || item.type === BudgetType.LOAN || item.type === BudgetType.SAVINGS;

    if (!isRecurring) {
      const matchYear = itemDate.getFullYear() === selYear;
      if (periodType === 'monthly') return matchYear && itemDate.getMonth() === selMonth;
      if (periodType === 'annual') return matchYear;
      if (periodType === 'quarterly') {
        const selQ = Math.floor(selMonth / 3);
        const itemQ = Math.floor(itemDate.getMonth() / 3);
        return matchYear && selQ === itemQ;
      }
      return false;
    }

    if (item.type === BudgetType.LOAN && item.loanDurationMonths) {
      const loanEndDate = new Date(itemDate);
      loanEndDate.setMonth(loanEndDate.getMonth() + item.loanDurationMonths);
      const periodEndOfMonth = new Date(selYear, selMonth + 1, 0);
      if (periodStart > loanEndDate || periodEndOfMonth < itemDate) return false;
    } else {
      if (itemDate > new Date(selYear, selMonth, 31)) return false;
    }

    const schedule = item.repaymentSchedule || 'Monthly';
    if (schedule === 'Monthly') return true;
    if (schedule === 'Quarterly') {
      const monthDiff = (selYear - itemDate.getFullYear()) * 12 + (selMonth - itemDate.getMonth());
      return monthDiff >= 0 && monthDiff % 3 === 0;
    }
    if (schedule === 'Annually' || schedule === 'Annual') {
      return selMonth === itemDate.getMonth() && selYear >= itemDate.getFullYear();
    }

    return false;
  };

  const transformedApiBudget = useMemo<BudgetItem[]>(() => {
    return apiEntries
      .filter((entry) => entry.type === 'INCOME' || entry.type === 'EXPENSE')
      .map((entry) => ({
        id: `api-${entry.id}`,
        type: entry.type === 'INCOME' ? BudgetType.INCOME : BudgetType.EXPENSE,
        category: entry.note?.split(' - ')[0] || 'Uncategorized',
        amount: Number(entry.amount),
        date: entry.entry_date,
        description: entry.note || '',
        recurring: false,
      }));
  }, [apiEntries]);

  const sourceBudget = useMemo(() => {
    if (!apiConnected) return budget;
    const localNonBase = budget.filter((item) => item.type === BudgetType.LOAN || item.type === BudgetType.SAVINGS);
    return [...transformedApiBudget, ...localNonBase];
  }, [apiConnected, budget, transformedApiBudget]);

  const filteredBudget = useMemo(() => {
    return sourceBudget.filter(item => getOccurrencesInPeriod(item, selectedDate, viewMode));
  }, [sourceBudget, selectedDate, viewMode]);

  const tableFilteredBudget = useMemo(() => {
    const query = tableSearch.trim().toLowerCase();
    return filteredBudget.filter((item) => {
      if (tableTypeFilter !== 'ALL' && item.type !== tableTypeFilter) return false;
      if (!query) return true;
      const searchable = `${item.category} ${item.description || ''}`.toLowerCase();
      return searchable.includes(query);
    });
  }, [filteredBudget, tableSearch, tableTypeFilter]);

  const tableTotalPages = Math.max(1, Math.ceil(tableFilteredBudget.length / tablePageSize));
  const tablePagedBudget = useMemo(() => {
    const start = (tablePage - 1) * tablePageSize;
    return tableFilteredBudget.slice(start, start + tablePageSize);
  }, [tableFilteredBudget, tablePage]);

  useEffect(() => {
    setTablePage(1);
  }, [tableTypeFilter, tableSearch, selectedDate, viewMode]);

  useEffect(() => {
    if (tablePage > tableTotalPages) {
      setTablePage(tableTotalPages);
    }
  }, [tablePage, tableTotalPages]);

  const totals = useMemo(() => {
    const income = filteredBudget.filter(b => b.type === BudgetType.INCOME).reduce((sum, b) => sum + b.amount, 0);
    // Only deduct expenses that are NOT from a loan (i.e., from main income)
    const incomeExpenses = filteredBudget.filter(b => b.type === BudgetType.EXPENSE && !b.sourceLoanId).reduce((sum, b) => sum + b.amount, 0);

    const loanDeductions = filteredBudget.filter(b => b.type === BudgetType.LOAN).reduce((sum, b) => {
      const instalment = calculateLoanInstalment(b.amount, b.interestRate || 0, b.loanDurationMonths || 12);
      return sum + instalment;
    }, 0);

    const savings = filteredBudget.filter(b => b.type === BudgetType.SAVINGS).reduce((sum, b) => sum + b.amount, 0);

    return {
      income,
      expenses: incomeExpenses,
      loans: loanDeductions,
      savings,
      // Formula: Income - (Expenses from Income) - (Bank Instalments) - (Savings)
      balance: income - incomeExpenses - loanDeductions - savings
    };
  }, [filteredBudget]);

  const chartData = useMemo(() => {
    const cats: Record<string, number> = {};
    filteredBudget.filter(b => b.type === breakdownType).forEach(b => {
      let val = b.amount;
      if (b.type === BudgetType.LOAN) {
        val = calculateLoanInstalment(b.amount, b.interestRate || 0, b.loanDurationMonths || 12);
      }
      cats[b.category] = (cats[b.category] || 0) + val;
    });
    return Object.entries(cats).map(([name, value]) => ({ name, value }));
  }, [filteredBudget, breakdownType]);

  const getLoanMonthStatus = (loan: BudgetItem) => {
    const startDate = new Date(loan.date);
    const instalment = calculateLoanInstalment(loan.amount, loan.interestRate || 0, loan.loanDurationMonths || 12);
    const monthDiff = (selectedDate.getFullYear() - startDate.getFullYear()) * 12 + (selectedDate.getMonth() - startDate.getMonth());
    if (monthDiff < 0) return 'Pending';
    const expectedPaidByNow = (monthDiff + 1) * instalment;
    const actualPaid = loan.paidAmount || 0;
    return actualPaid >= (expectedPaidByNow - 5) ? 'Paid' : 'Pending';
  };

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f43f5e'];

  const getTypeColor = (type: BudgetType) => {
    switch (type) {
      case BudgetType.INCOME: return 'text-green-500';
      case BudgetType.EXPENSE: return 'text-red-500';
      case BudgetType.LOAN: return 'text-orange-500';
      case BudgetType.SAVINGS: return 'text-blue-500';
      default: return 'text-gray-500';
    }
  };

  const changeDate = (offset: number) => {
    const newDate = new Date(selectedDate);
    if (viewMode === 'monthly') {
      newDate.setMonth(newDate.getMonth() + offset);
    } else if (viewMode === 'annual') {
      newDate.setFullYear(newDate.getFullYear() + offset);
    } else if (viewMode === 'quarterly') {
      newDate.setMonth(newDate.getMonth() + offset * 3);
    }
    setSelectedDate(newDate);
  };

  const formatSelectedPeriod = () => {
    if (viewMode === 'monthly') {
      return selectedDate.toLocaleDateString(language === 'en' ? 'en-US' : 'fr-FR', { month: 'long', year: 'numeric' });
    } else if (viewMode === 'annual') {
      return selectedDate.getFullYear().toString();
    } else {
      const quarter = Math.floor(selectedDate.getMonth() / 3) + 1;
      return `Q${quarter} ${selectedDate.getFullYear()}`;
    }
  };

  return (
    <div className="space-y-6 animate-in slide-in-from-top-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold">{t.budget}</h2>
          <p className="text-gray-500">Net balance is Income minus Expenses (from Income), Bank Repayments, and Savings.</p>
        </div>
        <div className="flex gap-2">
          <label className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl shadow-lg transition-all cursor-pointer">
            <Upload size={18} />
            {importBusy ? 'Importing...' : 'Import CSV'}
            <input type="file" accept=".csv,text/csv" onChange={handleCsvImport} className="hidden" disabled={importBusy} />
          </label>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl shadow-lg transition-all"
          >
            <Plus size={20} />
            {t.addBudget}
          </button>
        </div>
      </div>

      <div className={`p-3 rounded-xl border text-sm ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
        {apiLoading && <span className="text-blue-500 font-medium">Syncing planning entries from backend...</span>}
        {!apiLoading && apiConnected && <span className="text-emerald-600 font-medium">Connected to backend ledger entries.</span>}
        {!apiLoading && !apiConnected && (
          <span className="text-amber-600 font-medium">Backend not reachable, using local data only{apiError ? ` (${apiError})` : ''}.</span>
        )}
        {importReport && (
          <div className="mt-2 text-xs text-gray-600 dark:text-gray-300">
            Import report: created {importReport.created}, skipped {importReport.skipped}, total {importReport.total}
            {importReport.errors.length > 0 && (
              <div className="mt-1 text-rose-500">First error: line {importReport.errors[0].line} - {importReport.errors[0].error}</div>
            )}
          </div>
        )}
      </div>

      <div className={`p-4 rounded-2xl border shadow-sm ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <h3 className="font-bold text-base">Backend Budget Variance</h3>
          <button
            onClick={handleRecomputeBackendPeriod}
            disabled={budgetSummaryLoading}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 disabled:opacity-60"
          >
            {budgetSummaryLoading ? 'Computing...' : 'Recompute Period'}
          </button>
        </div>
        {budgetSummaryError && <p className="text-xs text-rose-500 mb-2">{budgetSummaryError}</p>}
        {budgetSummary ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className={`p-3 rounded-xl ${theme === 'dark' ? 'bg-slate-700' : 'bg-gray-50'}`}>
              <p className="text-[10px] uppercase font-bold text-gray-400">Planned</p>
              <p className="text-sm font-bold">{Number(budgetSummary.totals.planned).toLocaleString()} FCFA</p>
            </div>
            <div className={`p-3 rounded-xl ${theme === 'dark' ? 'bg-slate-700' : 'bg-gray-50'}`}>
              <p className="text-[10px] uppercase font-bold text-gray-400">Recorded</p>
              <p className="text-sm font-bold">{Number(budgetSummary.totals.recorded).toLocaleString()} FCFA</p>
            </div>
            <div className={`p-3 rounded-xl ${theme === 'dark' ? 'bg-slate-700' : 'bg-gray-50'}`}>
              <p className="text-[10px] uppercase font-bold text-gray-400">Reserved</p>
              <p className="text-sm font-bold">{Number(budgetSummary.totals.reserved).toLocaleString()} FCFA</p>
            </div>
            <div className={`p-3 rounded-xl ${theme === 'dark' ? 'bg-slate-700' : 'bg-gray-50'}`}>
              <p className="text-[10px] uppercase font-bold text-gray-400">Available</p>
              <p className={`text-sm font-bold ${Number(budgetSummary.totals.available) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {Number(budgetSummary.totals.available).toLocaleString()} FCFA
              </p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-500">No backend budget summary yet.</p>
        )}
      </div>

      <div className={`p-4 rounded-2xl border shadow-sm flex flex-col md:flex-row items-center justify-between gap-4 ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
        <div className="flex bg-gray-50 dark:bg-slate-700 p-1 rounded-xl w-full md:w-auto">
          {(['monthly', 'quarterly', 'annual'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-xs font-bold capitalize transition-all ${viewMode === mode ? 'bg-white dark:bg-slate-600 shadow-sm text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-300'}`}
            >
              {t[mode as keyof typeof t]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4 bg-gray-50 dark:bg-slate-700 px-4 py-2 rounded-xl">
          <button onClick={() => changeDate(-1)} className="p-1 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg transition-colors">
            <ChevronLeft size={20} />
          </button>
          <div className="flex items-center gap-2 min-w-[140px] justify-center font-bold text-sm text-gray-700 dark:text-gray-200">
            <Calendar size={16} className="text-blue-500" />
            <span>{formatSelectedPeriod()}</span>
          </div>
          <button onClick={() => changeDate(1)} className="p-1 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg transition-colors">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <BudgetSummaryCard label={t.income} value={totals.income} color="green" icon={<ArrowUpRight />} theme={theme} />
        <BudgetSummaryCard label={t.expense} value={totals.expenses} color="red" icon={<ArrowDownRight />} theme={theme} subtitle="Excludes loan spending" />
        <BudgetSummaryCard label={t.loan} value={totals.loans} color="orange" icon={<Landmark />} theme={theme} subtitle="Periodic Bank Repayment" />
        <BudgetSummaryCard label={t.savings} value={totals.savings} color="blue" icon={<PiggyBank />} theme={theme} subtitle="Priority Savings" />
      </div>

      {loans.length > 0 && (
        <div className={`p-6 rounded-2xl border shadow-sm ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
          <h3 className="text-xl font-bold mb-5 flex items-center gap-2">
            <HandCoins size={22} className="text-orange-500" /> Loan Repayment Tracker
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100 dark:border-slate-700">
                  <th className="py-3 pr-3">Loan</th>
                  <th className="py-3 pr-3">Monthly</th>
                  <th className="py-3 pr-3">Months Paid</th>
                  <th className="py-3 pr-3">Months Left</th>
                  <th className="py-3 pr-3">Paid Back</th>
                  <th className="py-3 pr-3">Remaining</th>
                  <th className="py-3 pr-3">Progress</th>
                  <th className="py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {loans.map((loan) => {
                  const duration = loan.loanDurationMonths || 12;
                  const monthly = calculateLoanInstalment(loan.amount, loan.interestRate || 0, duration);
                  const totalToPay = monthly * duration;
                  const paid = loan.paidAmount || 0;
                  const monthsPaid = Math.min(duration, Math.floor(paid / (monthly || 1)));
                  const monthsLeft = Math.max(0, duration - monthsPaid);
                  const remaining = Math.max(0, totalToPay - paid);
                  const progressPct = totalToPay > 0 ? Math.min(100, Math.round((paid / totalToPay) * 100)) : 0;

                  return (
                    <tr key={`repay-${loan.id}`} className="border-b border-gray-50 dark:border-slate-700/60">
                      <td className="py-3 pr-3 font-semibold">{loan.category}</td>
                      <td className="py-3 pr-3">{monthly.toLocaleString()} FCFA</td>
                      <td className="py-3 pr-3">{monthsPaid}/{duration}</td>
                      <td className="py-3 pr-3">{monthsLeft}</td>
                      <td className="py-3 pr-3">{paid.toLocaleString()} FCFA</td>
                      <td className="py-3 pr-3">{remaining.toLocaleString()} FCFA</td>
                      <td className="py-3 pr-3 min-w-[140px]">
                        <div className="h-2 w-full bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div className="h-full bg-orange-500" style={{ width: `${progressPct}%` }} />
                        </div>
                        <span className="text-[11px] text-gray-500">{progressPct}%</span>
                      </td>
                      <td className="py-3 text-right">
                        <button
                          onClick={() => handleAddPayment(loan.id, monthly)}
                          disabled={paid >= totalToPay}
                          className="px-3 py-1.5 rounded-lg bg-orange-50 dark:bg-orange-900/20 text-orange-600 text-xs font-bold hover:bg-orange-100 disabled:opacity-50"
                        >
                          Record Month
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* LOAN TRACKING SECTION */}
      <div className="grid grid-cols-1 gap-6">
        {loans.length > 0 && (
          <div className={`p-6 rounded-2xl border shadow-sm ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
            <h3 className="text-xl font-bold mb-6 flex items-center gap-2"><ReceiptText size={22} className="text-orange-500" /> Loan Repayment & Usage Tracking</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {loans.map(loan => {
                const instalment = calculateLoanInstalment(loan.amount, loan.interestRate || 0, loan.loanDurationMonths || 12);
                const totalToPayBank = instalment * (loan.loanDurationMonths || 12);
                const bankPaid = loan.paidAmount || 0;
                const bankProgress = Math.min(100, Math.round((bankPaid / totalToPayBank) * 100));

                const principal = loan.amount;
                const used = loan.usedAmount || 0;
                const usageProgress = Math.min(100, Math.round((used / principal) * 100));
                const remainingPrincipal = Math.max(0, principal - used);

                return (
                  <div key={loan.id} className="p-6 rounded-2xl border border-gray-100 dark:border-slate-700 space-y-6 hover:shadow-lg transition-all relative overflow-hidden group">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-bold text-lg">{loan.category}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5">{loan.repaymentSchedule} • {loan.loanDurationMonths} Months</div>
                      </div>
                      <span className="text-xs uppercase font-bold text-orange-500 bg-orange-50 dark:bg-orange-900/20 px-2 py-1 rounded-lg">{loan.interestRate}% APR</span>
                    </div>

                    {/* Repayment Progress (Bank Side) */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-bold uppercase text-gray-400">
                        <span className="flex items-center gap-1"><HandCoins size={12} /> {t.repaymentProgress}</span>
                        <span className="text-orange-500">{bankProgress}%</span>
                      </div>
                      <div className="h-2 w-full bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-orange-500 transition-all duration-700 shadow-sm" style={{ width: `${bankProgress}%` }} />
                      </div>
                      <div className="flex justify-between text-[10px] text-gray-500 font-medium">
                        <span>{bankPaid.toLocaleString()} / {totalToPayBank.toLocaleString()} FCFA</span>
                      </div>
                    </div>

                    {/* Usage Progress (Spending Side) */}
                    <div className="space-y-2 pt-2 border-t border-gray-50 dark:border-slate-700">
                      <div className="flex justify-between text-xs font-bold uppercase text-gray-400">
                        <span className="flex items-center gap-1"><History size={12} /> {t.usageProgress}</span>
                        <span className="text-blue-500">{usageProgress}%</span>
                      </div>
                      <div className="h-2 w-full bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 transition-all duration-700 shadow-sm" style={{ width: `${usageProgress}%` }} />
                      </div>
                      <div className="flex justify-between text-[10px] text-gray-500 font-medium">
                        <span>{used.toLocaleString()} Spent</span>
                        <span className="text-emerald-600 font-bold">{remainingPrincipal.toLocaleString()} FCFA Left to Use</span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleAddPayment(loan.id, instalment)}
                      disabled={bankPaid >= totalToPayBank}
                      className="w-full flex items-center justify-center gap-2 py-2 bg-orange-50 dark:bg-orange-900/20 text-orange-600 rounded-xl text-xs font-bold hover:bg-orange-100 transition-colors disabled:opacity-50"
                    >
                      <CircleDollarSign size={14} /> Record Monthly Repayment
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className={`lg:col-span-2 rounded-2xl border shadow-sm overflow-hidden ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
          <div className="p-6 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center">
            <h3 className="font-bold text-lg">Transactions ({formatSelectedPeriod()})</h3>
            <div className={`px-3 py-1 rounded-full text-xs font-bold ${totals.balance >= 0 ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
              Available Balance: {totals.balance.toLocaleString()} FCFA
            </div>
          </div>
          <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700 flex flex-col md:flex-row gap-3">
            <select
              value={tableTypeFilter}
              onChange={(e) => setTableTypeFilter(e.target.value as 'ALL' | BudgetType)}
              className={`px-3 py-2 rounded-lg border text-sm ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`}
            >
              <option value="ALL">All Types</option>
              <option value={BudgetType.INCOME}>{t.income}</option>
              <option value={BudgetType.EXPENSE}>{t.expense}</option>
              <option value={BudgetType.LOAN}>{t.loan}</option>
              <option value={BudgetType.SAVINGS}>{t.savings}</option>
            </select>
            <input
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              placeholder={t.search}
              className={`px-3 py-2 rounded-lg border text-sm w-full ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50/50 dark:bg-slate-800 text-xs font-bold text-gray-400 uppercase tracking-wider">
                  <th className="px-6 py-4">{t.date}</th>
                  <th className="px-6 py-4">{t.category}</th>
                  <th className="px-6 py-4 text-right">{t.amount}</th>
                  <th className="px-6 py-4">Status / {t.source}</th>
                  <th className="px-6 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {tablePagedBudget.map(item => {
                  const val = item.type === BudgetType.LOAN
                    ? calculateLoanInstalment(item.amount, item.interestRate || 0, item.loanDurationMonths || 12)
                    : item.amount;

                  const loanStatus = item.type === BudgetType.LOAN ? getLoanMonthStatus(item) : null;
                  const fundingSource = item.type === BudgetType.EXPENSE
                    ? (item.sourceLoanId ? budget.find(b => b.id === item.sourceLoanId)?.category : t.mainIncome)
                    : null;

                  return (
                    <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">
                      <td className="px-6 py-4 text-sm whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="font-medium">{item.date}</span>
                          {(item.recurring || item.type === BudgetType.LOAN || item.type === BudgetType.SAVINGS) && (
                            <span className="flex items-center gap-1 text-[10px] text-blue-500 font-bold uppercase mt-0.5">
                              <Repeat size={10} /> {item.repaymentSchedule || 'Monthly'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div className="flex flex-col">
                          <span className="font-bold">{item.category}</span>
                          <span className={`px-1.5 py-0.5 w-fit rounded text-[9px] font-bold uppercase mt-1 ${item.type === BudgetType.INCOME ? 'bg-green-100 text-green-600' :
                            item.type === BudgetType.EXPENSE ? 'bg-red-100 text-red-600' :
                              item.type === BudgetType.LOAN ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'
                            }`}>
                            {t[item.type.toLowerCase() as keyof typeof t]}
                          </span>
                        </div>
                      </td>
                      <td className={`px-6 py-4 text-sm font-bold text-right ${getTypeColor(item.type)}`}>
                        {item.type === BudgetType.INCOME ? '+' : '-'}{val.toLocaleString()} FCFA
                      </td>
                      <td className="px-6 py-4">
                        {item.type === BudgetType.LOAN ? (
                          <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase px-2 py-1 rounded-full w-fit ${loanStatus === 'Paid' ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'
                            }`}>
                            {loanStatus === 'Paid' ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                            {t[loanStatus?.toLowerCase() as keyof typeof t] || loanStatus}
                          </div>
                        ) : item.type === BudgetType.EXPENSE ? (
                          <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase">
                            <CreditCard size={12} /> {fundingSource}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => handleEditItem(item)}
                            className="p-2 hover:bg-blue-50 text-gray-400 hover:text-blue-500 rounded-lg transition-colors"
                          >
                            <Edit3 size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteItem(item.id)}
                            className="p-2 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-lg transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-6 py-3 border-t border-gray-100 dark:border-slate-700 flex items-center justify-between text-xs text-gray-500">
              <span>
                Showing {tablePagedBudget.length} / {tableFilteredBudget.length} items (page {tablePage}/{tableTotalPages})
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                  disabled={tablePage <= 1}
                  className="px-3 py-1 rounded border border-gray-200 dark:border-slate-600 disabled:opacity-50"
                >
                  Prev
                </button>
                <button
                  onClick={() => setTablePage((p) => Math.min(tableTotalPages, p + 1))}
                  disabled={tablePage >= tableTotalPages}
                  className="px-3 py-1 rounded border border-gray-200 dark:border-slate-600 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
            {tableFilteredBudget.length === 0 && (
              <div className="py-20 text-center text-gray-400 flex flex-col items-center gap-2">
                <TrendingUp size={48} className="opacity-20" />
                <p>No activity recorded for this period</p>
              </div>
            )}
          </div>
        </div>

        <div className={`p-6 rounded-2xl border shadow-sm ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-lg flex items-center gap-2"><PieIcon size={20} /> Allocation</h3>
            <div className="flex bg-gray-50 dark:bg-slate-700 p-1 rounded-lg">
              {[BudgetType.EXPENSE, BudgetType.INCOME, BudgetType.SAVINGS, BudgetType.LOAN].map(bt => (
                <button
                  key={bt}
                  onClick={() => setBreakdownType(bt)}
                  className={`p-1.5 rounded-md transition-all ${breakdownType === bt ? 'bg-white dark:bg-slate-600 shadow-sm text-blue-600' : 'text-gray-400'}`}
                >
                  {bt === BudgetType.EXPENSE ? <ArrowDownRight size={14} /> :
                    bt === BudgetType.INCOME ? <ArrowUpRight size={14} /> :
                      bt === BudgetType.SAVINGS ? <PiggyBank size={14} /> : <Landmark size={14} />}
                </button>
              ))}
            </div>
          </div>

          <div className="h-64">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={chartData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => `${v.toLocaleString()} FCFA`} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-50">
                <PieIcon size={40} className="mb-2" />
                <span className="text-xs">No entries for {t[breakdownType.toLowerCase() as keyof typeof t]}</span>
              </div>
            )}
          </div>

          <div className="mt-4 space-y-3 max-h-[140px] overflow-y-auto pr-2 custom-scrollbar">
            {chartData.map((cat, i) => (
              <div key={cat.name} className="flex items-center justify-between text-sm group">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-gray-500 truncate max-w-[110px]">{cat.name}</span>
                </div>
                <span className="font-bold">{cat.value.toLocaleString()} FCFA</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`w-full max-w-lg rounded-3xl shadow-2xl p-8 animate-in zoom-in-95 duration-200 ${theme === 'dark' ? 'bg-slate-800 text-white' : 'bg-white'}`}>
            <h3 className="text-2xl font-bold mb-6">{editingItemId ? 'Edit Entry' : t.addBudget}</h3>

            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-1 bg-gray-50 dark:bg-slate-700 rounded-xl mb-4">
                {[BudgetType.INCOME, BudgetType.EXPENSE, BudgetType.LOAN, BudgetType.SAVINGS].map(bt => (
                  <button
                    key={bt}
                    onClick={() => setFormData({ ...formData, type: bt, category: '', sourceLoanId: '', recurring: bt === BudgetType.LOAN || bt === BudgetType.SAVINGS })}
                    className={`py-2 rounded-lg font-bold transition-all text-[10px] uppercase ${formData.type === bt ? 'bg-white dark:bg-slate-600 shadow-sm text-blue-600' : 'text-gray-400'}`}
                  >
                    {t[bt.toLowerCase() as keyof typeof t]}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">{t.category}</label>
                  <input
                    type="text"
                    list="budget-categories"
                    placeholder="e.g. Monthly Salary"
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                    className={`w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-blue-500 ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`}
                  />
                  <datalist id="budget-categories">
                    {formCategorySuggestions.map(cat => (
                      <option key={cat} value={cat} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">
                    {formData.type === BudgetType.LOAN ? 'Loan Principal' : t.amount}
                  </label>
                  <input
                    type="number"
                    value={formData.amount ?? ''}
                    onChange={e => setFormData({ ...formData, amount: parseOptionalNumber(e.target.value) })}
                    className={`w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-blue-500 ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`}
                  />
                </div>
              </div>

              {formData.type === BudgetType.EXPENSE && (
                <div className="p-4 rounded-2xl bg-gray-50 dark:bg-slate-700/50 border border-gray-100 dark:border-slate-600 space-y-2">
                  <label className="block text-[10px] font-bold uppercase text-gray-400">{t.source}</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setFormData({ ...formData, sourceLoanId: '' })}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border transition-all text-xs font-bold ${!formData.sourceLoanId ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 dark:border-slate-600'}`}
                    >
                      <Briefcase size={14} /> {t.mainIncome}
                    </button>
                    <select
                      value={formData.sourceLoanId}
                      onChange={e => setFormData({ ...formData, sourceLoanId: e.target.value })}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border transition-all text-xs font-bold outline-none ${formData.sourceLoanId ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 dark:border-slate-600 bg-transparent'}`}
                    >
                      <option value="" disabled className="text-gray-900">{t.fromLoan}...</option>
                      {loans.map(l => (
                        <option key={l.id} value={l.id} className="text-gray-900">{l.category}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {formData.type === BudgetType.LOAN && (
                <div className="p-4 rounded-2xl bg-orange-50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-800 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-orange-600 mb-1">{t.interestRate}</label>
                      <input
                        type="number" step="0.01" value={formData.interestRate ?? ''}
                        onChange={e => setFormData({ ...formData, interestRate: parseOptionalNumber(e.target.value) })}
                        className={`w-full px-3 py-2 text-sm rounded-lg border outline-none focus:ring-2 focus:ring-orange-500 ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-white'}`}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-orange-600 mb-1">{t.duration} (m)</label>
                      <input
                        type="number" value={formData.loanDurationMonths ?? ''}
                        onChange={e => setFormData({ ...formData, loanDurationMonths: parseOptionalInteger(e.target.value) })}
                        className={`w-full px-3 py-2 text-sm rounded-lg border outline-none focus:ring-2 focus:ring-orange-500 ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-white'}`}
                      />
                    </div>
                  </div>
                  <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-orange-100 dark:border-slate-700">
                    <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Estimated {t.monthlyInstalment}</p>
                    <p className="text-lg font-black text-emerald-600">{calculateLoanInstalment(formData.amount || 0, formData.interestRate || 0, formData.loanDurationMonths || 12).toLocaleString()} FCFA</p>
                  </div>
                </div>
              )}

              {(formData.type === BudgetType.SAVINGS || formData.type === BudgetType.LOAN) && (
                <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800">
                  <label className="block text-[10px] font-bold uppercase text-blue-600 mb-1">
                    {formData.type === BudgetType.LOAN ? 'Repayment Goal' : t.linkedGoal}
                  </label>
                  <select
                    value={formData.linkedGoalId}
                    onChange={e => setFormData({ ...formData, linkedGoalId: e.target.value })}
                    className={`w-full px-3 py-2 text-sm rounded-lg border outline-none focus:ring-2 focus:ring-blue-500 ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-white'}`}
                  >
                    <option value="">{t.none}</option>
                    {goals.map(goal => <option key={goal.id} value={goal.id}>{goal.title}</option>)}
                  </select>
                  {formData.type === BudgetType.LOAN && (
                    <p className="text-[11px] text-blue-700 mt-1">Loan repayments will auto-update this goal.</p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">{t.date}</label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={e => setFormData({ ...formData, date: e.target.value })}
                    className={`w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-blue-500 ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`}
                  />
                </div>
                <div className="flex items-end pb-3 gap-2">
                  <input
                    type="checkbox"
                    id="recurring"
                    checked={formData.recurring || formData.type === BudgetType.LOAN || formData.type === BudgetType.SAVINGS}
                    onChange={e => setFormData({ ...formData, recurring: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded border-gray-300"
                  />
                  <label htmlFor="recurring" className="text-sm font-bold uppercase tracking-tight text-gray-400 cursor-pointer">{t.recurring}</label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Memo</label>
                <input
                  type="text"
                  placeholder="Optional notes"
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className={`w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-blue-500 ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`}
                />
              </div>
            </div>

            <div className="flex gap-4 mt-8">
              <button onClick={() => { setIsModalOpen(false); resetForm(); }} className={`flex-1 py-3 rounded-xl font-bold transition-all ${theme === 'dark' ? 'hover:bg-slate-700' : 'hover:bg-gray-100'}`}>{t.cancel}</button>
              <button onClick={handleSave} className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all">{editingItemId ? 'Update' : t.save}</button>
            </div>
            {formError && (
              <div className="mt-4 p-3 rounded-xl bg-red-50 text-red-600 text-sm font-medium">{formError}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const BudgetSummaryCard: React.FC<{ label: string, value: number, color: string, icon: React.ReactNode, theme: string, subtitle?: string }> = ({ label, value, color, icon, theme, subtitle }) => {
  const colorClasses: Record<string, string> = {
    green: 'bg-green-50 text-green-600 dark:bg-green-900/20',
    red: 'bg-red-50 text-red-600 dark:bg-red-900/20',
    orange: 'bg-orange-50 text-orange-600 dark:bg-orange-900/20',
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20'
  };

  return (
    <div className={`p-6 rounded-2xl shadow-sm border transition-all hover:scale-[1.02] ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
      <div className="flex items-center gap-3 mb-4">
        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>{icon}</div>
        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{label}</span>
      </div>
      <h4 className="text-lg font-extrabold">{value.toLocaleString()} FCFA</h4>
      {subtitle && <p className="text-[10px] text-gray-400 font-bold uppercase mt-1 flex items-center gap-1"><Info size={10} /> {subtitle}</p>}
    </div>
  );
};

export default BudgetSection;
