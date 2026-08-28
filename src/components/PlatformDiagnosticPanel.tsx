import { useMemo, useState } from 'react';
import {
  runPlatformDiagnostics,
  type DiagnosticFinding,
  type DiagnosticReport,
  type DiagnosticSeverity,
} from '../api/services/platformDiagnosticService';
import { Button } from './ui/Button';

const SEVERITY_ORDER: DiagnosticSeverity[] = ['critical', 'warning', 'info', 'ok'];

const SEVERITY_LABEL: Record<DiagnosticSeverity, string> = {
  critical: 'Κρίσιμα',
  warning: 'Προειδοποιήσεις',
  info: 'Πληροφορίες',
  ok: 'OK',
};

function severityClass(severity: DiagnosticSeverity): string {
  if (severity === 'critical') return 'diag-sev diag-sev--critical';
  if (severity === 'warning') return 'diag-sev diag-sev--warning';
  if (severity === 'info') return 'diag-sev diag-sev--info';
  return 'diag-sev diag-sev--ok';
}

function downloadReport(report: DiagnosticReport) {
  const lines = [
    `TeamSuite — Diagnostic Report`,
    `Ran at: ${report.ranAt}`,
    `Duration: ${report.durationMs} ms`,
    `Critical: ${report.summary.critical} | Warning: ${report.summary.warning} | Info: ${report.summary.info} | OK: ${report.summary.ok}`,
    '',
    ...report.findings.map(
      (f, i) =>
        `${i + 1}. [${f.severity.toUpperCase()}] (${f.category}) ${f.title}\n` +
        `   Λεπτομέρεια: ${f.detail}\n` +
        `   Διόρθωση: ${f.fix}`,
    ),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `teamsuite-diagnostic-${report.ranAt.slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export function PlatformDiagnosticPanel({
  onSaved,
}: {
  onSaved?: (message: string) => void;
}) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [percent, setPercent] = useState(0);
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [filter, setFilter] = useState<'all' | DiagnosticSeverity>('all');

  const filtered = useMemo(() => {
    if (!report) return [] as DiagnosticFinding[];
    if (filter === 'all') return report.findings;
    return report.findings.filter((f) => f.severity === filter);
  }, [report, filter]);

  async function handleRun() {
    setRunning(true);
    setReport(null);
    setProgress('Έναρξη…');
    setPercent(0);
    try {
      const result = await runPlatformDiagnostics((label, pct) => {
        setProgress(label);
        setPercent(pct);
      });
      setReport(result);
      const crit = result.summary.critical;
      const warn = result.summary.warning;
      onSaved?.(
        crit > 0
          ? `Τεστ ολοκληρώθηκε: ${crit} κρίσιμα, ${warn} προειδοποιήσεις.`
          : warn > 0
            ? `Τεστ ολοκληρώθηκε: ${warn} προειδοποιήσεις.`
            : 'Τεστ ολοκληρώθηκε χωρίς κρίσιμα προβλήματα.',
      );
    } catch (err) {
      onSaved?.(err instanceof Error ? err.message : 'Αποτυχία diagnostic');
    } finally {
      setRunning(false);
      setProgress('');
      setPercent(100);
    }
  }

  return (
    <div className="entry-form admin-entry platform-diagnostic">
      <p className="admin-entry-note">
        Εκτελεί αναλυτικό έλεγχο API, sync/Redis, localStorage, χρηστών, συλλόγων, SMTP/Viva,
        δεδομένων ανά σύλλογο, οικονομικών, συνδρομών, αγώνων και ρυθμίσεων. Για κάθε εύρημα
        εμφανίζεται και τρόπος διόρθωσης.
      </p>

      <div className="admin-entry-actions">
        <Button type="button" disabled={running} onClick={() => void handleRun()}>
          {running ? `Έλεγχος… ${percent}%` : 'Εκτέλεση πλήρους τεστ'}
        </Button>
        {report ? (
          <Button type="button" variant="secondary" onClick={() => downloadReport(report)}>
            Λήψη αναφοράς TXT
          </Button>
        ) : null}
      </div>

      {running ? (
        <div className="diag-progress">
          <div className="diag-progress-bar" style={{ width: `${percent}%` }} />
          <p className="settings-hint">Βήμα: {progress || '…'}</p>
        </div>
      ) : null}

      {report ? (
        <>
          <div className="diag-summary">
            <span className="diag-sev diag-sev--critical">
              Κρίσιμα {report.summary.critical}
            </span>
            <span className="diag-sev diag-sev--warning">
              Προειδοποιήσεις {report.summary.warning}
            </span>
            <span className="diag-sev diag-sev--info">Info {report.summary.info}</span>
            <span className="diag-sev diag-sev--ok">OK {report.summary.ok}</span>
            <span className="muted">
              {report.durationMs} ms · {report.ranAt}
            </span>
          </div>

          <label className="field" style={{ maxWidth: 280 }}>
            <span>Φίλτρο</span>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as 'all' | DiagnosticSeverity)}
            >
              <option value="all">Όλα</option>
              {SEVERITY_ORDER.map((s) => (
                <option key={s} value={s}>
                  {SEVERITY_LABEL[s]}
                </option>
              ))}
            </select>
          </label>

          <div className="diag-list">
            {filtered.length === 0 ? (
              <p className="muted">Κανένα εύρημα για αυτό το φίλτρο.</p>
            ) : (
              filtered.map((item) => (
                <article key={item.id + item.title} className="diag-card">
                  <header className="diag-card-head">
                    <span className={severityClass(item.severity)}>{item.severity}</span>
                    <span className="diag-cat">{item.category}</span>
                    <strong>{item.title}</strong>
                  </header>
                  <p className="diag-detail">{item.detail}</p>
                  <p className="diag-fix">
                    <strong>Διόρθωση:</strong> {item.fix}
                  </p>
                </article>
              ))
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
