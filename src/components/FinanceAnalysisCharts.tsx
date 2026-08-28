import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCurrency } from '../utils/labels';

type ChartColors = {
  pie: string[];
  revenue: string;
  expense: string;
  grid: string;
};

type ChartRow = { label: string; revenue: number; expense: number };
type PieRow = { name: string; value: number };

export function FinanceAnalysisCharts({
  monthlyChart,
  revenuePie,
  expensePie,
  colors,
}: {
  monthlyChart: ChartRow[];
  revenuePie: PieRow[];
  expensePie: PieRow[];
  colors: ChartColors;
}) {
  return (
    <>
      <section className="panel">
        <div className="panel-head"><h2>Μηνιαία σύγκριση εσόδων / εξόδων</h2></div>
        <div className="chart-box tall">
          {monthlyChart.length === 0 ? (
            <p className="muted" style={{ padding: '2rem', textAlign: 'center' }}>
              Δεν υπάρχουν ακόμη μηνιαία δεδομένα.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={monthlyChart}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => formatCurrency(Number(value ?? 0))} />
                <Legend />
                <Bar dataKey="revenue" name="Έσοδα" fill={colors.revenue} radius={[6, 6, 0, 0]} />
                <Bar dataKey="expense" name="Έξοδα" fill={colors.expense} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>
      <section className="grid-2">
        {[
          { title: 'Έσοδα ανά κατηγορία', data: revenuePie, offset: 0, empty: 'Δεν υπάρχουν έσοδα για εμφάνιση.' },
          { title: 'Έξοδα ανά κατηγορία', data: expensePie, offset: 2, empty: 'Δεν υπάρχουν έξοδα για εμφάνιση.' },
        ].map((chart) => (
          <article className="panel" key={chart.title}>
            <div className="panel-head"><h2>{chart.title}</h2></div>
            <div className="chart-box">
              {chart.data.length === 0 ? (
                <p className="muted" style={{ padding: '2rem', textAlign: 'center' }}>{chart.empty}</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={chart.data} dataKey="value" nameKey="name" outerRadius={95} label>
                      {chart.data.map((_, index) => (
                        <Cell key={index} fill={colors.pie[(index + chart.offset) % colors.pie.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatCurrency(Number(value ?? 0))} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
