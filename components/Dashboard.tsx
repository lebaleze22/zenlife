import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../AppContext';
import { translations } from '../i18n';
import {
  BarChart, Bar,
  XAxis, YAxis,
  CartesianGrid, Tooltip,
  ResponsiveContainer,
  PieChart, Pie, Cell,
  LineChart, Line, Legend
} from 'recharts';
import { TrendingUp, Target, Briefcase, Banknote, Eye, EyeOff, Landmark, PiggyBank } from 'lucide-react';
import { Status, BudgetType } from '../types';
import { listGoals, type GoalDto } from '../data/api/goals';
import { listProjects, type ProjectDto } from '../data/api/projects';
import { getCashflowReport, getNetWorthReport, getPlannedVsRecordedReport, type CashflowReportDto, type NetWorthReportDto, type PlannedVsRecordedReportDto } from '../data/api/reports';

const toNumber = (value: string | number | null | undefined): number => {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const Dashboard: React.FC = () => {
  const { goals, projects, budget, language, theme } = useApp();
  const t = translations[language];

  const [visibleBalances, setVisibleBalances] = useState({
    netBalance: true,
    loanBalance: true,
    totalSavings: true,
  });
  const [remoteGoals, setRemoteGoals] = useState<GoalDto[] | null>(null);
  const [remoteProjects, setRemoteProjects] = useState<ProjectDto[] | null>(null);
  const [cashflow, setCashflow] = useState<CashflowReportDto | null>(null);
  const [netWorth, setNetWorth] = useState<NetWorthReportDto | null>(null);
  const [plannedVsRecorded, setPlannedVsRecorded] = useState<PlannedVsRecordedReportDto | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const toggleVisibility = (field: keyof typeof visibleBalances) => {
    setVisibleBalances((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const hasToken = !!localStorage.getItem('zenlife_access_token');

  useEffect(() => {
    if (!hasToken) {
      setRemoteGoals(null);
      setRemoteProjects(null);
      setCashflow(null);
      setNetWorth(null);
      setPlannedVsRecorded(null);
      setDashboardError(null);
      return;
    }

    const load = async () => {
      try {
        const [goalsResp, projectsResp, cashflowResp, netWorthResp, pvrResp] = await Promise.all([
          listGoals(),
          listProjects(),
          getCashflowReport(),
          getNetWorthReport(),
          getPlannedVsRecordedReport(),
        ]);
        setRemoteGoals(goalsResp.results);
        setRemoteProjects(projectsResp.results);
        setCashflow(cashflowResp);
        setNetWorth(netWorthResp);
        setPlannedVsRecorded(pvrResp);
        setDashboardError(null);
      } catch {
        setDashboardError('Backend dashboard reports unavailable, showing local data.');
      }
    };

    load();
  }, [hasToken]);

  const sourceGoals = remoteGoals
    ? remoteGoals.map((g) => ({ title: g.title, status: g.status as Status, progress: g.progress, targetAmount: toNumber(g.target_amount), savedAmount: toNumber(g.saved_amount) }))
    : goals;
  const sourceProjects = remoteProjects
    ? remoteProjects.map((p) => ({ status: p.status as Status, name: p.name }))
    : projects;

  const calculateLoanInstalment = (principal: number, annualRate: number, durationMonths: number) => {
    if (!principal || !durationMonths) return 0;
    if (annualRate === 0) return principal / durationMonths;
    const r = (annualRate / 100) / 12;
    const n = durationMonths;
    return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  };

  const stats = useMemo(() => {
    const completedGoals = sourceGoals.filter((g) => g.status === Status.COMPLETED || g.progress >= 100).length;
    const totalGoals = sourceGoals.length;
    const completionRate = totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0;
    const goalsTarget = sourceGoals.reduce((sum, g) => sum + (g.targetAmount || 0), 0);
    const goalsSaved = sourceGoals.reduce((sum, g) => sum + (g.savedAmount || 0), 0);
    const goalsFundingRate = goalsTarget > 0 ? Math.round((goalsSaved / goalsTarget) * 100) : 0;
    const activeProjects = sourceProjects.filter((p) => p.status === Status.IN_PROGRESS).length;

    if (cashflow && netWorth && plannedVsRecorded) {
      const totalIncome = toNumber(cashflow.income);
      const totalExpense = toNumber(cashflow.expense);
      const net = toNumber(cashflow.net);
      const liabilities = toNumber(netWorth.liabilities);
      const reserved = toNumber(plannedVsRecorded.budget_periods.reserved);
      const savingsIncomeRatio = totalIncome > 0 ? Math.round((Math.max(0, net) / totalIncome) * 100) : 0;
      return {
        balance: net,
        loanCapitalBalance: liabilities,
        income: totalIncome,
        expenses: totalExpense,
        totalSavings: Math.max(0, net),
        activeProjects,
        completionRate,
        totalGoals,
        goalsTarget,
        goalsSaved,
        goalsFundingRate,
        loanRepaymentRate: 0,
        savingsIncomeRatio,
        reserved,
      };
    }

    const incomes = budget.filter((item) => item.type === BudgetType.INCOME);
    const expensesFromIncome = budget.filter((item) => item.type === BudgetType.EXPENSE && !item.sourceLoanId);
    const savings = budget.filter((item) => item.type === BudgetType.SAVINGS);
    const loans = budget.filter((item) => item.type === BudgetType.LOAN);

    const totalIncome = incomes.reduce((sum, item) => sum + item.amount, 0);
    const totalExpensesFromIncome = expensesFromIncome.reduce((sum, item) => sum + item.amount, 0);
    const totalSavings = savings.reduce((sum, item) => sum + item.amount, 0);

    const totalLoanInstalments = loans.reduce((sum, item) => {
      const monthly = calculateLoanInstalment(item.amount, item.interestRate || 0, item.loanDurationMonths || 12);
      return sum + monthly;
    }, 0);

    const loanCapitalBalance = loans.reduce((sum, item) => sum + (item.amount - (item.usedAmount || 0)), 0);
    const savingsIncomeRatio = totalIncome > 0 ? Math.round((totalSavings / totalIncome) * 100) : 0;

    return {
      balance: totalIncome - totalExpensesFromIncome - totalLoanInstalments - totalSavings,
      loanCapitalBalance,
      income: totalIncome,
      expenses: totalExpensesFromIncome,
      totalSavings,
      activeProjects,
      completionRate,
      totalGoals,
      goalsTarget,
      goalsSaved,
      goalsFundingRate,
      loanRepaymentRate: 0,
      savingsIncomeRatio,
      reserved: 0,
    };
  }, [budget, sourceProjects, sourceGoals, cashflow, netWorth, plannedVsRecorded]);

  const projectStatusData = useMemo(() => {
    const statuses = [Status.NOT_STARTED, Status.IN_PROGRESS, Status.COMPLETED, Status.ON_HOLD];
    return statuses.map((s) => ({
      name: t[s.toLowerCase() as keyof typeof t] || s,
      value: sourceProjects.filter((p) => p.status === s).length,
    }));
  }, [sourceProjects, t]);

  const budgetTrendData = useMemo(() => {
    if (cashflow) {
      return cashflow.monthly.map((m) => {
        const d = new Date(`${m.month}-01T00:00:00`);
        return {
          name: d.toLocaleDateString(language === 'en' ? 'en-US' : 'fr-FR', { month: 'short' }),
          income: toNumber(m.income),
          expense: toNumber(m.expense),
          savings: Math.max(0, toNumber(m.net)),
        };
      });
    }

    const now = new Date();
    const monthKeys: string[] = [];
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    const initial = monthKeys.map((key) => ({ key, name: key, income: 0, expense: 0, savings: 0 }));
    const map = new Map(initial.map((m) => [m.key, m]));

    budget.forEach((item) => {
      const d = new Date(item.date);
      if (Number.isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const bucket = map.get(key);
      if (!bucket) return;
      if (item.type === BudgetType.INCOME) bucket.income += item.amount;
      if (item.type === BudgetType.EXPENSE && !item.sourceLoanId) bucket.expense += item.amount;
      if (item.type === BudgetType.SAVINGS) bucket.savings += item.amount;
    });

    return initial.map((m) => {
      const d = new Date(`${m.key}-01T00:00:00`);
      const label = d.toLocaleDateString(language === 'en' ? 'en-US' : 'fr-FR', { month: 'short' });
      return { ...m, name: label };
    });
  }, [budget, language, cashflow]);

  const goalProgressData = useMemo(() => {
    return [...sourceGoals]
      .sort((a, b) => b.progress - a.progress)
      .slice(0, 6)
      .map((g) => ({ name: g.title.slice(0, 12), progress: g.progress }));
  }, [sourceGoals]);

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight">{t.dashboard}</h2>
          <p className="text-gray-500">Real-time planning overview from your current data.</p>
          {dashboardError && <p className="text-xs text-rose-500 mt-1">{dashboardError}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
        <StatCard label={t.totalGoals} value={stats.totalGoals.toString()} icon={<Target className="text-blue-500" />} trend={`${stats.completionRate}% complete`} theme={theme} />
        <StatCard label={t.activeProjects} value={stats.activeProjects.toString()} icon={<Briefcase className="text-emerald-500" />} trend="In Progress" theme={theme} />
        <StatCard
          label={t.netBalance}
          value={visibleBalances.netBalance ? `${stats.balance.toLocaleString()} FCFA` : '•••••• FCFA'}
          icon={<Banknote className="text-amber-500" />}
          trend={stats.balance >= 0 ? 'Healthy' : 'Deficit'}
          theme={theme}
          isTogglable
          isVisible={visibleBalances.netBalance}
          onToggle={() => toggleVisibility('netBalance')}
        />
        <StatCard
          label={t.loanBalance}
          value={visibleBalances.loanBalance ? `${stats.loanCapitalBalance.toLocaleString()} FCFA` : '•••••• FCFA'}
          icon={<Landmark className="text-orange-500" />}
          trend="Liabilities"
          theme={theme}
          isTogglable
          isVisible={visibleBalances.loanBalance}
          onToggle={() => toggleVisibility('loanBalance')}
        />
        <StatCard
          label="Reserved"
          value={visibleBalances.totalSavings ? `${stats.reserved.toLocaleString()} FCFA` : '•••••• FCFA'}
          icon={<PiggyBank className="text-pink-500" />}
          trend={`Goals funded ${stats.goalsFundingRate}%`}
          theme={theme}
          isTogglable
          isVisible={visibleBalances.totalSavings}
          onToggle={() => toggleVisibility('totalSavings')}
        />
        <StatCard label="Savings/Income" value={`${stats.savingsIncomeRatio}%`} icon={<TrendingUp className="text-cyan-500" />} trend="Savings to income ratio" theme={theme} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className={`p-6 rounded-2xl shadow-sm border ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
          <h3 className="text-lg font-bold mb-6">Last 6 Months Cashflow</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={budgetTrendData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `${Math.round(value / 1000)}k`} />
                <Tooltip formatter={(value: any) => [`${Number(value).toLocaleString()} FCFA`]} contentStyle={{ borderRadius: '12px', border: 'none' }} />
                <Legend />
                <Line type="monotone" dataKey="income" stroke="#10b981" strokeWidth={3} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="expense" stroke="#ef4444" strokeWidth={3} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="savings" stroke="#3b82f6" strokeWidth={3} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={`p-6 rounded-2xl shadow-sm border ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
          <h3 className="text-lg font-bold mb-6">{t.statusDistribution}</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={projectStatusData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
                  {projectStatusData.map((entry, index) => (
                    <Cell key={`cell-${entry.name}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className={`p-6 rounded-2xl shadow-sm border ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
        <h3 className="text-lg font-bold mb-6">Goals Progress Snapshot</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={goalProgressData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} axisLine={false} tickLine={false} />
              <Tooltip formatter={(value: any) => [`${value}%`]} />
              <Bar dataKey="progress" fill="#2563eb" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

interface StatCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  trend: string;
  theme: string;
  isTogglable?: boolean;
  isVisible?: boolean;
  onToggle?: () => void;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, icon, trend, theme, isTogglable, isVisible, onToggle }) => (
  <div className={`p-6 rounded-2xl shadow-sm border transition-transform hover:scale-[1.02] flex flex-col justify-between ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className={`p-3 rounded-xl shrink-0 ${theme === 'dark' ? 'bg-slate-700' : 'bg-gray-50'}`}>{icon}</div>
        <div className="flex items-center justify-end gap-2 text-right">
          <span className={`text-[10px] font-bold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-300' : 'text-gray-400'}`}>{label}</span>
          {isTogglable && (
            <button onClick={(e) => { e.stopPropagation(); onToggle?.(); }} className={`p-1 rounded-md transition-colors ${theme === 'dark' ? 'hover:bg-slate-600 text-gray-300' : 'hover:bg-gray-100 text-gray-400'}`}>
              {isVisible ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          )}
        </div>
      </div>
      <div className="space-y-1">
        <h4 className={`text-xl font-bold break-words ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{value}</h4>
        <p className={`text-xs font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-500'}`}>{trend}</p>
      </div>
    </div>
  </div>
);

export default Dashboard;
