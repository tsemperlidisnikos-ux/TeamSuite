import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import * as financeService from '../api/services/financeService';
import { ExpenseEntryPanel } from '../components/ExpenseEntryPanel';
import { BudgetPanel } from '../components/BudgetPanel';
import { CashAccountsPanel } from '../components/CashAccountsPanel';
import { FinanceBalancePanel } from '../components/FinanceBalancePanel';
import { FinanceReportsPanel } from '../components/FinanceReportsPanel';
import { IncomeEntryPanel } from '../components/IncomeEntryPanel';
import { PageHeader } from '../components/ui/PageHeader';
import { StatCard } from '../components/ui/StatCard';
import { useAppData } from '../hooks/useAppData';
import {
  FINANCE_TABS,
  getAppearanceTheme,
  getEnabledFinanceTabs,
  type AppearanceTheme,
  type FinanceTabId,
} from '../platform/platformConfig';
import {
  expenseCategoryLabels,
  formatCurrency,
  formatMonth,
  revenueCategoryLabels,
} from '../utils/labels';

const FinanceAnalysisCharts = lazy(() =>
  import('../components/FinanceAnalysisCharts').then((module) => ({
    default: module.FinanceAnalysisCharts,
  })),
);

type Tab = FinanceTabId;

function chartColors(theme: AppearanceTheme) {
  if (theme === 'graphite-ember') {
    return {
      pie: ['#e85d2c', '#c44a20', '#ff7a45', '#8a8178', '#3dcf8e', '#f07167'],
      revenue: '#e85d2c',
      expense: '#c45c26',
      grid: 'rgba(244, 238, 232, 0.12)',
    };
  }
  return {
    pie: ['#1c2b3a', '#2a9bb5', '#c45c26', '#4a7c9b', '#64748b', '#067647'],
    revenue: '#2a9bb5',
    expense: '#c45c26',
    grid: 'rgba(28, 43, 58, 0.1)',
  };
}

export function FinancePage() {
  const { refresh, version } = useAppData();
  const [platformTick, setPlatformTick] = useState(0);
  const enabledTabs = useMemo(
    () => getEnabledFinanceTabs(),
    [platformTick],
  );

  const availableTabs = useMemo(
    () => FINANCE_TABS.filter((tab) => enabledTabs.includes(tab.id)),
    [enabledTabs],
  );

  const [tab, setTab] = useState<Tab>(() => enabledTabs[0] ?? 'analysis');
  const [appearance, setAppearance] = useState(() => getAppearanceTheme());
  const [summary, setSummary] = useState<Awaited<
    ReturnType<typeof financeService.getFinanceSummary>
  >['data']>();
  const colors = useMemo(() => chartColors(appearance), [appearance]);

  useEffect(() => {
    const sync = () => {
      setAppearance(getAppearanceTheme());
      setPlatformTick((n) => n + 1);
    };
    window.addEventListener('academyhub-platform-updated', sync);
    return () => window.removeEventListener('academyhub-platform-updated', sync);
  }, []);

  useEffect(() => {
    if (!availableTabs.some((item) => item.id === tab)) {
      setTab(availableTabs[0]?.id ?? 'analysis');
    }
  }, [availableTabs, tab]);

  useEffect(() => {
    void financeService.getFinanceSummary().then((res) => {
      if (res.success) setSummary(res.data);
    });
  }, [version]);

  const monthlyChart = useMemo(
    () =>
      summary?.monthly.map((m) => ({
        ...m,
        label: formatMonth(m.month),
      })) ?? [],
    [summary],
  );

  const revenuePie =
    summary?.revenueByCategory.map((item) => ({
      name: revenueCategoryLabels[item.category as keyof typeof revenueCategoryLabels] ?? item.category,
      value: item.amount,
    })) ?? [];

  const expensePie =
    summary?.expenseByCategory.map((item) => ({
      name: expenseCategoryLabels[item.category as keyof typeof expenseCategoryLabels] ?? item.category,
      value: item.amount,
    })) ?? [];

  return (
    <div className="stack-lg finance-page">
      <PageHeader
        title="Οικονομικά"
        subtitle="Έσοδα, έξοδα, προϋπολογισμός και αναφορές της ακαδημίας."
      />

      <div className="tabs">
        {availableTabs.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={`tab ${tab === id ? 'active' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'analysis' ? (
        <>
          <section className="stats-grid cols-3">
            <StatCard
              label="Συνολικά έσοδα"
              value={formatCurrency(summary?.totalRevenue ?? 0)}
              icon={TrendingUp}
              tone="positive"
            />
            <StatCard
              label="Συνολικά έξοδα"
              value={formatCurrency(summary?.totalExpenses ?? 0)}
              icon={TrendingDown}
              tone="negative"
            />
            <StatCard
              label="Καθαρό αποτέλεσμα"
              value={formatCurrency(summary?.net ?? 0)}
              hint={`Εκκρεμή: ${formatCurrency(summary?.pending ?? 0)}`}
              icon={Wallet}
              tone={(summary?.net ?? 0) >= 0 ? 'positive' : 'negative'}
            />
          </section>

          <Suspense fallback={<section className="panel chart-box tall"><p className="muted">Φόρτωση γραφημάτων…</p></section>}>
            <FinanceAnalysisCharts
              monthlyChart={monthlyChart}
              revenuePie={revenuePie}
              expensePie={expensePie}
              colors={colors}
            />
          </Suspense>
        </>
      ) : null}

      {tab === 'revenues' ? <IncomeEntryPanel onSaved={refresh} /> : null}
      {tab === 'expenses' ? <ExpenseEntryPanel onSaved={refresh} /> : null}
      {tab === 'accounts' ? <CashAccountsPanel onSaved={refresh} /> : null}
      {tab === 'balance' ? <FinanceBalancePanel /> : null}
      {tab === 'budget' ? <BudgetPanel onSaved={refresh} /> : null}
      {tab === 'reports' ? <FinanceReportsPanel /> : null}
    </div>
  );
}
