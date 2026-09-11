import { useMemo, useState } from 'react';
import { Download, Printer, Receipt } from 'lucide-react';
import { getClubById } from '../auth/clubs';
import { getSession } from '../auth/auth';
import { useAppData } from '../hooks/useAppData';
import { getAppLogoUrl, getPreviewClubId } from '../platform/platformConfig';
import type { PaymentReceiptDraft } from '../utils/paymentReceiptEmail';
import { amountToGreekWords } from '../utils/amountToGreekWords';
import { localDateIso } from '../utils/dates';
import { formatCurrency, formatDate } from '../utils/labels';
import { normalizeReceiptIssues } from '../utils/receiptBook';
import {
  describeReceiptIssue,
  receiptKindLabel,
  type ReceiptIssueView,
} from '../utils/receiptIssueView';
import { PaymentReceiptModal } from './PaymentReceiptModal';
import { Button } from './ui/Button';
import { StatCard } from './ui/StatCard';
import type { ReceiptIssueKind } from '../types';

function toReceiptDate(isoOrEmpty: string): string {
  const raw = (isoOrEmpty || localDateIso()).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return raw;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function formatReceiptAmount(value: number): string {
  return (Number(value) || 0).toFixed(2).replace('.', ',');
}

function exportReceiptCsv(rows: ReceiptIssueView[]) {
  const headers = [
    'Ημερομηνία',
    'Σειρά',
    'Αριθμός',
    'Κατάσταση',
    'Είδος',
    'Παραλήπτης',
    'Αιτιολογία',
    'Ποσό',
    'Email',
  ];
  const lines = rows.map((row) =>
    [
      row.issuedDate,
      row.series,
      String(row.number),
      row.voidedAt ? 'Ακυρωμένη' : 'Εκδοθείσα',
      receiptKindLabel(row.kind),
      row.receivedFrom,
      row.reason,
      String(row.amount || 0).replace('.', ','),
      row.emailedAt ? 'Ναι' : 'Όχι',
    ]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(';'),
  );
  const blob = new Blob(['\uFEFF' + [headers.join(';'), ...lines].join('\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `apodeixeis_${localDateIso()}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ReceiptIssuesRegistry() {
  const { data } = useAppData();
  const session = getSession();
  const clubId = getPreviewClubId() ?? session?.clubId ?? null;
  const club = clubId ? getClubById(clubId) : null;
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [series, setSeries] = useState('');
  const [kind, setKind] = useState<'all' | ReceiptIssueKind>('all');
  const [status, setStatus] = useState<'all' | 'valid' | 'voided'>('all');
  const [search, setSearch] = useState('');
  const [openIssue, setOpenIssue] = useState<ReceiptIssueView | null>(null);

  const views = useMemo(
    () =>
      normalizeReceiptIssues(data.receiptIssues)
        .map((row) => describeReceiptIssue(row, data))
        .sort((a, b) => {
          const byDate = b.issuedAt.localeCompare(a.issuedAt);
          if (byDate !== 0) return byDate;
          if (a.series !== b.series) return a.series.localeCompare(b.series, 'el');
          return b.number - a.number;
        }),
    [data],
  );

  const seriesOptions = useMemo(
    () => [...new Set(views.map((row) => row.series))].sort((a, b) => a.localeCompare(b, 'el')),
    [views],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return views.filter((row) => {
      if (dateFrom && row.issuedDate && row.issuedDate < dateFrom) return false;
      if (dateTo && row.issuedDate && row.issuedDate > dateTo) return false;
      if (series && row.series !== series) return false;
      if (kind !== 'all' && row.kind !== kind) return false;
      if (status === 'valid' && row.voidedAt) return false;
      if (status === 'voided' && !row.voidedAt) return false;
      if (q) {
        const hay = `${row.label} ${row.receivedFrom} ${row.reason} ${receiptKindLabel(row.kind)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [views, dateFrom, dateTo, series, kind, status, search]);

  const valid = useMemo(() => filtered.filter((row) => !row.voidedAt), [filtered]);
  const voided = useMemo(() => filtered.filter((row) => row.voidedAt), [filtered]);
  const emailed = useMemo(() => valid.filter((row) => row.emailedAt), [valid]);
  const totalAmount = useMemo(
    () => valid.reduce((sum, row) => sum + (Number(row.amount) || 0), 0),
    [valid],
  );

  const bySeries = useMemo(() => {
    const map = new Map<string, { count: number; amount: number; voided: number }>();
    for (const row of filtered) {
      const cur = map.get(row.series) ?? { count: 0, amount: 0, voided: 0 };
      if (row.voidedAt) cur.voided += 1;
      else {
        cur.count += 1;
        cur.amount += Number(row.amount) || 0;
      }
      map.set(row.series, cur);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'el'));
  }, [filtered]);

  const byMonth = useMemo(() => {
    const map = new Map<string, { count: number; amount: number }>();
    for (const row of valid) {
      const month = row.issuedDate.slice(0, 7) || '—';
      const cur = map.get(month) ?? { count: 0, amount: 0 };
      cur.count += 1;
      cur.amount += Number(row.amount) || 0;
      map.set(month, cur);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [valid]);

  const byKind = useMemo(() => {
    const map = new Map<ReceiptIssueKind, { count: number; amount: number }>();
    for (const row of valid) {
      const cur = map.get(row.kind) ?? { count: 0, amount: 0 };
      cur.count += 1;
      cur.amount += Number(row.amount) || 0;
      map.set(row.kind, cur);
    }
    return (['subscription', 'rental', 'other'] as ReceiptIssueKind[])
      .map((key) => [key, map.get(key) ?? { count: 0, amount: 0 }] as const)
      .filter(([, val]) => val.count > 0);
  }, [valid]);

  const reprintDraft: PaymentReceiptDraft = openIssue
    ? {
        date: toReceiptDate(openIssue.issuedDate),
        series: openIssue.series,
        number: String(openIssue.number),
        amount: formatReceiptAmount(openIssue.amount),
        receivedFrom: openIssue.receivedFrom,
        address: '',
        amountWords: amountToGreekWords(openIssue.amount),
        reason: openIssue.reason,
      }
    : {
        date: '',
        series: '',
        number: '',
        amount: '',
        receivedFrom: '',
        address: '',
        amountWords: '',
        reason: '',
      };

  const extraEmails = useMemo(() => {
    if (!openIssue) return [];
    if (openIssue.transactionId?.startsWith('rent_')) {
      const booking = (data.rentalBookings ?? []).find(
        (row) => row.id === openIssue.transactionId!.slice(5),
      );
      return booking?.customerEmail ? [booking.customerEmail] : [];
    }
    return [];
  }, [openIssue, data.rentalBookings]);

  const athlete = openIssue?.athleteId
    ? data.students.find((row) => row.id === openIssue.athleteId)
    : undefined;

  return (
    <div className="receipt-registry receipt-registry-print">
      <div className="receipt-registry-toolbar">
        <p className="lede">
          Συγκεντρωτικά και αναλυτικά όλες οι αποδείξεις που έχουν κοπεί: ποσό, παραλήπτης και
          αιτιολογία. Οι ακυρωμένες αριθμήσεις μένουν στο μητρώο και δεν ξαναδίνονται.
        </p>
        <div className="receipt-registry-actions">
          <Button
            type="button"
            variant="secondary"
            disabled={filtered.length === 0}
            onClick={() => exportReceiptCsv(filtered)}
          >
            <Download size={16} /> CSV
          </Button>
          <Button type="button" variant="secondary" onClick={() => window.print()}>
            <Printer size={16} /> Εκτύπωση
          </Button>
        </div>
      </div>

      <div className="receipt-registry-filters">
        <label className="field">
          <span className="field-label">Από</span>
          <input
            className="field-input"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Έως</span>
          <input
            className="field-input"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Σειρά</span>
          <select className="field-input" value={series} onChange={(e) => setSeries(e.target.value)}>
            <option value="">Όλες</option>
            {seriesOptions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Είδος</span>
          <select
            className="field-input"
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            <option value="all">Όλα</option>
            <option value="subscription">Συνδρομές</option>
            <option value="rental">Ενοικιάσεις</option>
            <option value="other">Άλλο</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Κατάσταση</span>
          <select
            className="field-input"
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
          >
            <option value="all">Όλες</option>
            <option value="valid">Εκδοθείσες</option>
            <option value="voided">Ακυρωμένες</option>
          </select>
        </label>
        <label className="field receipt-registry-search">
          <span className="field-label">Αναζήτηση</span>
          <input
            className="field-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Όνομα, αιτιολογία, αριθμός…"
          />
        </label>
      </div>

      <div className="stats-grid cols-4 receipt-registry-stats">
        <StatCard icon={Receipt} label="Εκδοθείσες" value={String(valid.length)} />
        <StatCard icon={Receipt} label="Σύνολο ποσού" value={formatCurrency(totalAmount)} tone="positive" />
        <StatCard icon={Receipt} label="Με email" value={String(emailed.length)} />
        <StatCard icon={Receipt} label="Ακυρωμένες" value={String(voided.length)} tone="warn" />
      </div>

      <div className="receipt-registry-summary-grid">
        <section className="panel">
          <h4>Ανά σειρά</h4>
          {bySeries.length === 0 ? (
            <p className="muted">Δεν υπάρχουν αποδείξεις στα φίλτρα.</p>
          ) : (
            <div className="table-wrap">
              <table className="page-table">
                <thead>
                  <tr>
                    <th>Σειρά</th>
                    <th>Εκδοθείσες</th>
                    <th>Ακυρωμένες</th>
                    <th>Ποσό</th>
                  </tr>
                </thead>
                <tbody>
                  {bySeries.map(([key, val]) => (
                    <tr key={key}>
                      <td>{key}</td>
                      <td>{val.count}</td>
                      <td>{val.voided}</td>
                      <td>{formatCurrency(val.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="panel">
          <h4>Ανά μήνα έκδοσης</h4>
          {byMonth.length === 0 ? (
            <p className="muted">Δεν υπάρχουν εκδοθείσες αποδείξεις στα φίλτρα.</p>
          ) : (
            <div className="table-wrap">
              <table className="page-table">
                <thead>
                  <tr>
                    <th>Μήνας</th>
                    <th>Πλήθος</th>
                    <th>Ποσό</th>
                  </tr>
                </thead>
                <tbody>
                  {byMonth.map(([key, val]) => (
                    <tr key={key}>
                      <td>{key}</td>
                      <td>{val.count}</td>
                      <td>{formatCurrency(val.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="panel">
          <h4>Ανά είδος</h4>
          {byKind.length === 0 ? (
            <p className="muted">Δεν υπάρχουν εκδοθείσες αποδείξεις στα φίλτρα.</p>
          ) : (
            <div className="table-wrap">
              <table className="page-table">
                <thead>
                  <tr>
                    <th>Είδος</th>
                    <th>Πλήθος</th>
                    <th>Ποσό</th>
                  </tr>
                </thead>
                <tbody>
                  {byKind.map(([key, val]) => (
                    <tr key={key}>
                      <td>{receiptKindLabel(key)}</td>
                      <td>{val.count}</td>
                      <td>{formatCurrency(val.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className="panel">
        <h4>Αναλυτικό μητρώο</h4>
        <div className="table-wrap">
          <table className="page-table receipt-registry-table">
            <thead>
              <tr>
                <th>Ημ/νία</th>
                <th>Απόδειξη</th>
                <th>Είδος</th>
                <th>Παραλήπτης</th>
                <th>Αιτιολογία</th>
                <th>Ποσό</th>
                <th>Κατάσταση</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8}>Δεν έχουν κοπεί αποδείξεις (ή δεν ταιριάζουν τα φίλτρα).</td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className={row.voidedAt ? 'is-muted' : undefined}>
                    <td>{row.issuedDate ? formatDate(row.issuedDate) : '—'}</td>
                    <td>{row.label}</td>
                    <td>{receiptKindLabel(row.kind)}</td>
                    <td>{row.receivedFrom || '—'}</td>
                    <td>{row.reason || '—'}</td>
                    <td>{row.amount > 0 ? formatCurrency(row.amount) : '—'}</td>
                    <td>
                      {row.voidedAt
                        ? 'Ακυρωμένη'
                        : row.emailedAt
                          ? 'Εκδοθείσα · email'
                          : 'Εκδοθείσα'}
                    </td>
                    <td>
                      {!row.voidedAt ? (
                        <Button type="button" variant="ghost" onClick={() => setOpenIssue(row)}>
                          Προβολή
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {valid.length > 0 ? (
              <tfoot>
                <tr>
                  <td colSpan={5}>Σύνολο εκδοθεισών</td>
                  <td>{formatCurrency(totalAmount)}</td>
                  <td colSpan={2}>{valid.length} αποδείξεις</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </section>

      <PaymentReceiptModal
        open={Boolean(openIssue)}
        logoUrl={club?.logoUrl?.trim() || getAppLogoUrl() || null}
        clubName={club?.name?.trim() || 'Σύλλογος'}
        clubId={clubId}
        athleteId={openIssue?.athleteId}
        transactionId={openIssue?.transactionId || openIssue?.id || null}
        fatherEmail={athlete?.fatherEmail}
        motherEmail={athlete?.motherEmail}
        extraEmails={extraEmails}
        initial={reprintDraft}
        onClose={() => setOpenIssue(null)}
      />
    </div>
  );
}
