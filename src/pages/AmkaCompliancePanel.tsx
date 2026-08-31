import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import * as amkaAuditService from '../api/services/amkaAuditService';
import * as gdprSubjectService from '../api/services/gdprSubjectService';
import * as legalComplianceService from '../api/services/legalComplianceService';
import { getSession, isPlatformAdmin } from '../auth/auth';
import { acceptClubDpa, getClubById } from '../auth/clubs';
import { getPreviewClubId } from '../platform/platformConfig';
import { Button } from '../components/ui/Button';
import { SettingsFormRow } from '../components/ui/SettingsFormRow';
import { useAppData } from '../hooks/useAppData';
import {
  AMKA_CHECKLIST_ITEMS,
  AMKA_DELETION_PROCEDURE_HTML,
  AMKA_DPIA_HTML,
  AMKA_SECURITY_POLICY_HTML,
  DEFAULT_DATA_RETENTION_MONTHS,
  DEFAULT_DPA_HTML,
  DEFAULT_RETENTION_POLICY_HTML,
  MEDICAL_ACCESS_HINT,
} from '../shared/termsDefaults';
import { canAccessMedical } from '../utils/amkaAccess';
import type { AmkaAccessLog } from '../types';

const ACTION_LABELS: Record<AmkaAccessLog['action'], string> = {
  view: 'Προβολή',
  edit: 'Επεξεργασία',
  delete: 'Διαγραφή',
  consent: 'Συγκατάθεση',
  seal: 'Σφράγιση / ολοκλήρωση',
};

export function AmkaCompliancePanel() {
  const session = getSession();
  const { data, refresh } = useAppData();
  const [logs, setLogs] = useState<AmkaAccessLog[]>([]);
  const [dpaHtml, setDpaHtml] = useState(DEFAULT_DPA_HTML);
  const [retentionPolicyHtml, setRetentionPolicyHtml] = useState(DEFAULT_RETENTION_POLICY_HTML);
  const [retentionMonths, setRetentionMonths] = useState(DEFAULT_DATA_RETENTION_MONTHS);
  const [saving, setSaving] = useState(false);
  const [runningRetention, setRunningRetention] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [dpaAcceptedAt, setDpaAcceptedAt] = useState<string | null>(null);
  const [acceptingDpa, setAcceptingDpa] = useState(false);
  const [deletingLogId, setDeletingLogId] = useState<string | null>(null);
  const [clearingLogs, setClearingLogs] = useState(false);
  const [dsarAthleteId, setDsarAthleteId] = useState('');
  const [dsarBusy, setDsarBusy] = useState(false);
  const allowed = canAccessMedical(session?.role);
  const canDeleteLogs = isPlatformAdmin();
  const clubId = getPreviewClubId() || session?.clubId || null;

  useEffect(() => {
    if (!allowed) return;
    void legalComplianceService.getLegalComplianceDocs().then((result) => {
      if (!result.success || !result.data) return;
      setDpaHtml(result.data.dpaHtml);
      setRetentionPolicyHtml(result.data.retentionPolicyHtml);
      setRetentionMonths(result.data.dataRetentionMonths);
    });
  }, [allowed, data.dpaHtml, data.retentionPolicyHtml, data.dataRetentionMonths]);

  useEffect(() => {
    if (!allowed) return;
    void amkaAuditService.listAmkaAccessLogs().then((result) => {
      if (result.success && result.data) {
        setLogs([...result.data].sort((a, b) => b.at.localeCompare(a.at)));
      }
    });
  }, [allowed, data.amkaAccessLogs]);

  useEffect(() => {
    function readDpaDate() {
      const club = getClubById(clubId);
      setDpaAcceptedAt(club?.dpaAcceptedAt ?? null);
    }
    readDpaDate();
    window.addEventListener('academyhub-clubs-updated', readDpaDate);
    return () => window.removeEventListener('academyhub-clubs-updated', readDpaDate);
  }, [clubId]);

  async function handleAcceptDpa() {
    if (!clubId || dpaAcceptedAt) return;
    setAcceptingDpa(true);
    setError('');
    setMessage('');
    const result = acceptClubDpa(clubId);
    setAcceptingDpa(false);
    if (!result.success || !result.data) {
      setError(result.error ?? 'Αποτυχία καταγραφής αποδοχής DPA');
      return;
    }
    setDpaAcceptedAt(result.data.dpaAcceptedAt ?? null);
    setMessage('Η αποδοχή της DPA καταγράφηκε.');
  }

  async function handleSaveRetention() {
    setSaving(true);
    setError('');
    setMessage('');
    const result = await legalComplianceService.saveLegalComplianceDocs({
      dpaHtml: data.dpaHtml?.trim() ? data.dpaHtml : DEFAULT_DPA_HTML,
      retentionPolicyHtml: data.retentionPolicyHtml?.trim()
        ? data.retentionPolicyHtml
        : DEFAULT_RETENTION_POLICY_HTML,
      dataRetentionMonths: retentionMonths,
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Αποτυχία αποθήκευσης');
      return;
    }
    refresh();
    setMessage('Η ρύθμιση διατήρησης αποθηκεύτηκε.');
  }

  async function handleRunRetention() {
    if (
      !confirm(
        `Καθαρισμός ΑΜΚΑ και ιατρικών πεδίων για ανενεργούς αθλητές με εγγραφή παλαιότερη από ${retentionMonths} μήνες;`,
      )
    ) {
      return;
    }
    setRunningRetention(true);
    setError('');
    setMessage('');
    await handleSaveRetention();
    const result = await legalComplianceService.applySensitiveDataRetention();
    setRunningRetention(false);
    if (!result.success || !result.data) {
      setError(result.error ?? 'Αποτυχία εφαρμογής διατήρησης');
      return;
    }
    refresh();
    setMessage(
      `Καθαρίστηκαν ευαίσθητα πεδία σε ${result.data.cleaned} ανενεργούς αθλητές (όριο: ${result.data.cutoff}).`,
    );
  }

  async function handleDeleteLog(id: string) {
    if (!canDeleteLogs || deletingLogId || clearingLogs) return;
    if (!confirm('Διαγραφή αυτής της καταγραφής ΑΜΚΑ;')) return;
    setDeletingLogId(id);
    setError('');
    setMessage('');
    const result = await amkaAuditService.deleteAmkaAccessLog(id);
    setDeletingLogId(null);
    if (!result.success) {
      setError(result.error ?? 'Αποτυχία διαγραφής');
      return;
    }
    refresh();
    setMessage('Η καταγραφή διαγράφηκε.');
  }

  async function handleClearLogs() {
    if (!canDeleteLogs || clearingLogs || deletingLogId || logs.length === 0) return;
    if (!confirm(`Διαγραφή και των ${logs.length} καταγραφών ΑΜΚΑ;`)) return;
    setClearingLogs(true);
    setError('');
    setMessage('');
    const result = await amkaAuditService.clearAmkaAccessLogs();
    setClearingLogs(false);
    if (!result.success) {
      setError(result.error ?? 'Αποτυχία διαγραφής');
      return;
    }
    refresh();
    setMessage(`Διαγράφηκαν ${result.data?.deleted ?? 0} καταγραφές.`);
  }

  async function handleDsarExport() {
    if (!dsarAthleteId) {
      setError('Επιλέξτε αθλητή για εξαγωγή.');
      return;
    }
    setDsarBusy(true);
    setError('');
    setMessage('');
    const result = await gdprSubjectService.exportSubjectData({
      athleteId: dsarAthleteId,
      actorUserId: session?.id,
      actorEmail: session?.email,
    });
    setDsarBusy(false);
    if (!result.success || !result.data) {
      setError(result.error ?? 'Αποτυχία εξαγωγής');
      return;
    }
    const blob = new Blob([JSON.stringify(result.data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gdpr-export-${dsarAthleteId}.json`;
    a.click();
    URL.revokeObjectURL(url);
    refresh();
    setMessage('Η εξαγωγή δεδομένων (DSAR) ολοκληρώθηκε.');
  }

  async function handleDsarErase() {
    if (!dsarAthleteId) {
      setError('Επιλέξτε αθλητή για διαγραφή.');
      return;
    }
    if (
      !confirm(
        'Οριστική ανωνυμοποίηση / διαγραφή προσωπικών δεδομένων του αθλητή (δικαίωμα διαγραφής);',
      )
    ) {
      return;
    }
    setDsarBusy(true);
    setError('');
    setMessage('');
    const result = await gdprSubjectService.eraseSubjectData({
      athleteId: dsarAthleteId,
      actorUserId: session?.id,
      actorEmail: session?.email,
    });
    setDsarBusy(false);
    if (!result.success || !result.data) {
      setError(result.error ?? 'Αποτυχία διαγραφής');
      return;
    }
    refresh();
    setMessage(`Διαγράφηκαν / ανωνυμοποιήθηκαν ${result.data.erased} εγγραφές.`);
  }

  async function handleDsarRevokeConsent() {
    if (!dsarAthleteId) {
      setError('Επιλέξτε αθλητή για ανάκληση συγκατάθεσης.');
      return;
    }
    setDsarBusy(true);
    setError('');
    setMessage('');
    const result = await gdprSubjectService.setSubjectConsent({
      athleteId: dsarAthleteId,
      items: {
        personalData: false,
        photoUse: false,
        gallery: false,
        communication: false,
        medical: false,
        amkaHealthCard: false,
      },
      revoke: true,
      actorUserId: session?.id,
      actorEmail: session?.email,
    });
    setDsarBusy(false);
    if (!result.success) {
      setError(result.error ?? 'Αποτυχία ανάκλησης');
      return;
    }
    refresh();
    setMessage('Η συγκατάθεση ανακλήθηκε.');
  }

  async function handleFullRetentionPass() {
    if (
      !confirm(
        'Πλήρης GDPR retention: ευαίσθητα ανενεργών + φωτογραφίες >24 μήνες + logs >12 μήνες;',
      )
    ) {
      return;
    }
    setRunningRetention(true);
    setError('');
    setMessage('');
    const result = await gdprSubjectService.applyFullRetentionPass();
    setRunningRetention(false);
    if (!result.success || !result.data) {
      setError(result.error ?? 'Αποτυχία retention');
      return;
    }
    refresh();
    setMessage(
      `Retention: αθλητές ${result.data.cleanedAthletes}, φωτο ${result.data.removedPhotos}, logs ${result.data.prunedLogs}.`,
    );
  }

  if (!allowed) {
    return (
      <section className="panel settings-panel">
        <p className="form-error">Η ενότητα ΑΜΚΑ / GDPR είναι διαθέσιμη μόνο σε διαχειριστή και ιατρό.</p>
      </section>
    );
  }

  return (
    <section className="panel settings-panel settings-amka-compliance">
      <header className="settings-terms-head">
        <h3>
          <ShieldCheck size={18} aria-hidden /> Συμμόρφωση GDPR
        </h3>
        <p className="lede">
          DPA, διατήρηση δεδομένων, ΑΜΚΑ/ιατρικά μέτρα, DPIA και audit logs.
        </p>
      </header>

      <p className="ap-field-hint">{MEDICAL_ACCESS_HINT}</p>

      <p className="lede">
        Δημόσια νομικά:{' '}
        <Link to="/legal/privacy">Απόρρητο</Link>
        {' · '}
        <Link to="/legal/cookies">Cookies</Link>
        {' · '}
        <Link to="/legal/breach">Παραβίαση</Link>
        {' · '}
        <Link to="/legal/ropa">RoPA</Link>
        {' · '}
        <Link to="/legal/payment">Πληρωμές</Link>
      </p>

      <div className="settings-amka-dsar panel" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <h4 style={{ marginTop: 0 }}>Δικαιώματα υποκειμένου (DSAR)</h4>
        <SettingsFormRow label="Αθλητής">
          <select
            className="ap-input"
            value={dsarAthleteId}
            onChange={(e) => setDsarAthleteId(e.target.value)}
          >
            <option value="">— Επιλογή —</option>
            {data.students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.lastName} {s.firstName}
              </option>
            ))}
          </select>
        </SettingsFormRow>
        <div className="settings-form-actions" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Button type="button" disabled={dsarBusy} onClick={() => void handleDsarExport()}>
            Εξαγωγή JSON
          </Button>
          <Button type="button" disabled={dsarBusy} onClick={() => void handleDsarRevokeConsent()}>
            Ανάκληση συγκατάθεσης
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={dsarBusy}
            onClick={() => void handleDsarErase()}
          >
            Διαγραφή δεδομένων
          </Button>
          <Button
            type="button"
            disabled={runningRetention}
            onClick={() => void handleFullRetentionPass()}
          >
            Πλήρες retention pass
          </Button>
        </div>
      </div>

      <div className="ap-amka-privacy" dangerouslySetInnerHTML={{ __html: dpaHtml }} />
      <div className="settings-form-actions" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {dpaAcceptedAt ? (
          <p className="settings-success" style={{ margin: 0 }}>
            DPA αποδεκτή στις {new Date(dpaAcceptedAt).toLocaleString('el-GR')}.
          </p>
        ) : (
          <Button type="button" disabled={acceptingDpa || !clubId} onClick={() => void handleAcceptDpa()}>
            {acceptingDpa ? 'Καταγραφή…' : 'Καταγραφή αποδοχής DPA'}
          </Button>
        )}
      </div>
      <div className="ap-amka-privacy" dangerouslySetInnerHTML={{ __html: retentionPolicyHtml }} />
      <div className="ap-amka-privacy" dangerouslySetInnerHTML={{ __html: AMKA_SECURITY_POLICY_HTML }} />
      <div className="ap-amka-privacy" dangerouslySetInnerHTML={{ __html: AMKA_DPIA_HTML }} />
      <div
        className="ap-amka-privacy"
        dangerouslySetInnerHTML={{ __html: AMKA_DELETION_PROCEDURE_HTML }}
      />

      <SettingsFormRow label="Μήνες διατήρησης ευαίσθητων (ανενεργοί)">
        <input
          type="number"
          min={1}
          max={120}
          className="ap-input"
          value={retentionMonths}
          onChange={(e) => setRetentionMonths(Number(e.target.value) || DEFAULT_DATA_RETENTION_MONTHS)}
        />
      </SettingsFormRow>

      <div className="settings-form-actions" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <Button type="button" disabled={saving} onClick={() => void handleSaveRetention()}>
          {saving ? 'Αποθήκευση…' : 'Αποθήκευση διατήρησης'}
        </Button>
        <Button type="button" disabled={runningRetention} onClick={() => void handleRunRetention()}>
          {runningRetention ? 'Εφαρμογή…' : 'Εφαρμογή διατήρησης τώρα'}
        </Button>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="settings-success">{message}</p> : null}

      <div className="settings-amka-checklist">
        <h4>Checklist κάλυψης</h4>
        <ul>
          {AMKA_CHECKLIST_ITEMS.map((item) => (
            <li key={item}>
              <label>
                <input type="checkbox" checked readOnly />
                <span>{item}</span>
              </label>
            </li>
          ))}
        </ul>
        <p className="lede">
          HTTPS παρέχεται από το hosting (Vercel). Τα εξερχόμενα email φιλτράρονται ώστε να μην
          περιέχουν ΑΜΚΑ σε plain text.
        </p>
      </div>

      <div className="settings-amka-logs">
        <div className="settings-amka-logs-head">
          <h4>Audit logs ΑΜΚΑ (12 μήνες)</h4>
          {canDeleteLogs && logs.length > 0 ? (
            <Button
              type="button"
              variant="danger"
              disabled={clearingLogs || Boolean(deletingLogId)}
              onClick={() => void handleClearLogs()}
            >
              {clearingLogs ? 'Διαγραφή…' : 'Διαγραφή όλων'}
            </Button>
          ) : null}
        </div>
        {logs.length === 0 ? (
          <p className="lede">Δεν υπάρχουν καταγραφές ακόμη.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ημ/νία</th>
                  <th>Χρήστης</th>
                  <th>Αθλητής</th>
                  <th>Ενέργεια</th>
                  {canDeleteLogs ? <th></th> : null}
                </tr>
              </thead>
              <tbody>
                {logs.slice(0, 100).map((row) => (
                  <tr key={row.id}>
                    <td>{new Date(row.at).toLocaleString('el-GR')}</td>
                    <td>{row.userName}</td>
                    <td>{row.athleteName}</td>
                    <td>{ACTION_LABELS[row.action]}</td>
                    {canDeleteLogs ? (
                      <td>
                        <Button
                          type="button"
                          variant="danger"
                          disabled={clearingLogs || deletingLogId === row.id}
                          onClick={() => void handleDeleteLog(row.id)}
                        >
                          {deletingLogId === row.id ? 'Διαγραφή…' : 'Διαγραφή'}
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
