import { useEffect, useState } from 'react';
import { BookOpen, History, Send } from 'lucide-react';
import * as emailService from '../api/services/emailService';
import * as publicClubCloudService from '../api/services/publicClubCloudService';
import {
  getClubById,
  getClubSmtp,
  getClubSmtpSendLog,
  getDefaultClubSmtp,
  updateClubSmtp,
  type ClubSmtpSettings,
} from '../auth/clubs';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { SmtpSetupGuideModal } from './SmtpSetupGuideModal';
import { SettingsFormRow } from './ui/SettingsFormRow';

type Props = {
  clubId: string;
};

export function ClubEmailPanel({ clubId }: Props) {
  const club = getClubById(clubId);
  const [form, setForm] = useState<ClubSmtpSettings>(() => getClubSmtp(clubId));
  const [testTo, setTestTo] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState(() => getClubSmtpSendLog(clubId));

  useEffect(() => {
    setForm(getClubSmtp(clubId));
    setHistory(getClubSmtpSendLog(clubId));
    setMessage('');
    setError('');
  }, [clubId]);

  function setField<K extends keyof ClubSmtpSettings>(key: K, value: ClubSmtpSettings[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'provider' && value === 'gmail') {
        next.host = next.host.trim() || 'smtp.gmail.com';
        next.port = next.port.trim() || '587';
      }
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    setMessage('');
    const result = updateClubSmtp(clubId, {
      ...getDefaultClubSmtp(),
      ...form,
      fromEmail: form.fromEmail || '',
      security: form.security || 'starttls',
      requireAuth: form.requireAuth ?? true,
    });
    if (!result.success) {
      setSaving(false);
      setError(result.error ?? 'Σφάλμα αποθήκευσης');
      return;
    }
    setForm(getClubSmtp(clubId));
    const publish = await publicClubCloudService.publishPublicClubCloud(clubId);
    setSaving(false);
    if (!publish.success) {
      setMessage('Οι ρυθμίσεις email αποθηκεύτηκαν τοπικά. Cloud sync ειδοποιήσεων απέτυχε.');
      return;
    }
    setMessage('Οι ρυθμίσεις email συλλόγου αποθηκεύτηκαν και συγχρονίστηκαν για δημόσια εγγραφή.');
  }

  async function handleTestSend() {
    setError('');
    setMessage('');
    const to = testTo.trim();
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      setError('Συμπληρώστε έγκυρο παραλήπτη δοκιμής.');
      return;
    }

    const current = getClubSmtp(clubId);
    if (!current.enabled) {
      setError('Ενεργοποιήστε το SMTP και αποθηκεύστε πριν τη δοκιμή.');
      return;
    }
    if (
      !current.host ||
      !current.port ||
      !current.username ||
      (!current.password && !current.passwordSet)
    ) {
      setError('Αποθηκεύστε πλήρεις ρυθμίσεις SMTP πριν τη δοκιμή.');
      return;
    }

    setTesting(true);
    const result = await emailService.sendClubEmail({
      clubId,
      to,
      subject: `Δοκιμή SMTP — ${club?.name ?? 'SPORTSUITE 360'}`,
      text: `Αυτό είναι δοκιμαστικό μήνυμα από το SportSuite 360 για τον σύλλογο «${club?.name ?? '—'}».\n\nΑν το λαμβάνετε, οι ρυθμίσεις SMTP λειτουργούν.`,
    });
    setTesting(false);
    setHistory(getClubSmtpSendLog(clubId));
    if (!result.success) {
      setError(result.error ?? 'Αποτυχία αποστολής');
      return;
    }
    setMessage(`Το δοκιμαστικό email στάλθηκε επιτυχώς στο ${to}.`);
  }

  return (
    <section className="panel settings-panel club-email-panel">
      <div className="club-email-head">
        <div>
          <h3>Email συλλόγου (Gmail/SMTP)</h3>
          <p className="lede">
            Σύνδεσε Gmail μέσω App Password ή άλλο SMTP για προσκλήσεις, υπενθυμίσεις και αποδείξεις
            του συλλόγου «{club?.name ?? '—'}».
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={() => setShowHelp(true)}>
          <BookOpen size={15} /> Οδηγός SMTP
        </Button>
      </div>

      <div className="settings-form">
        <SettingsFormRow label="Ενεργό SMTP συλλόγου" htmlFor="smtp-enabled">
          <label className="public-reg-check">
            <input
              id="smtp-enabled"
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setField('enabled', e.target.checked)}
            />
            <span>Ενεργό</span>
          </label>
        </SettingsFormRow>

        <SettingsFormRow label="Πάροχος" htmlFor="smtp-provider">
          <select
            id="smtp-provider"
            className="field-input"
            value={form.provider}
            onChange={(e) =>
              setField('provider', e.target.value as ClubSmtpSettings['provider'])
            }
          >
            <option value="gmail">Gmail</option>
            <option value="custom">Προσαρμοσμένο SMTP</option>
          </select>
        </SettingsFormRow>

        <SettingsFormRow label="SMTP Host" htmlFor="smtp-host">
          <input
            id="smtp-host"
            className="field-input"
            value={form.host}
            onChange={(e) => setField('host', e.target.value)}
            placeholder="SMTP host"
          />
        </SettingsFormRow>

        <SettingsFormRow label="Port" htmlFor="smtp-port">
          <input
            id="smtp-port"
            className="field-input"
            value={form.port}
            onChange={(e) => setField('port', e.target.value)}
            placeholder="587"
          />
          <span className="settings-hint">
            587 → STARTTLS (recommended). 465 → SSL. Do not mix SSL with 587.
          </span>
        </SettingsFormRow>

        <SettingsFormRow label="Email / username" htmlFor="smtp-user">
          <input
            id="smtp-user"
            className="field-input"
            type="email"
            value={form.username}
            onChange={(e) => setField('username', e.target.value)}
            placeholder="Email / username"
            autoComplete="off"
          />
        </SettingsFormRow>

        <SettingsFormRow label="App Password / κωδικός SMTP" htmlFor="smtp-pass">
          <input
            id="smtp-pass"
            className="field-input"
            type="password"
            value={form.password}
            onChange={(e) => setField('password', e.target.value)}
            placeholder={
              form.passwordSet
                ? 'Αποθηκευμένος κωδικός — συμπληρώστε μόνο για αλλαγή'
                : 'App Password / κωδικός SMTP'
            }
            autoComplete="new-password"
          />
          <span className="settings-hint">
            {form.passwordSet && !form.password
              ? 'Υπάρχει αποθηκευμένος κωδικός στο cloud. Αφήστε κενό για να διατηρηθεί. Στο Gmail χρησιμοποιείτε App Password 16 χαρακτήρων, όχι τον κανονικό κωδικό.'
              : 'Στο Gmail χρησιμοποίησε App Password 16 χαρακτήρων από Google Security — όχι τον κανονικό κωδικό.'}
          </span>
        </SettingsFormRow>

        <SettingsFormRow label="Αποστολέας (From)" htmlFor="smtp-from">
          <input
            id="smtp-from"
            className="field-input"
            value={form.fromName}
            onChange={(e) => setField('fromName', e.target.value)}
            placeholder="Αποστολέας (From)"
          />
          <span className="settings-hint">
            Το όνομα είναι προαιρετικό (π.χ. «{club?.name ?? 'Όνομα συλλόγου'}»). Ως διεύθυνση
            χρησιμοποιείται το email του λογαριασμού.
          </span>
        </SettingsFormRow>

        <SettingsFormRow label="Δοκιμή αποστολής" htmlFor="smtp-test">
          <div className="club-email-test-row">
            <input
              id="smtp-test"
              className="field-input"
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="Παραλήπτης δοκιμής"
            />
            <Button type="button" disabled={testing} onClick={() => void handleTestSend()}>
              <Send size={15} /> {testing ? 'Αποστολή…' : 'Αποστολή δοκιμής'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setShowHistory(true)}>
              <History size={15} /> Ιστορικό
            </Button>
          </div>
          <p className="settings-hint">
            Η πραγματική αποστολή γίνεται στο production (`/api/send-email`).
          </p>
        </SettingsFormRow>
      </div>

      <div className="settings-form-actions">
        <Button type="button" disabled={saving} onClick={() => void handleSave()}>
          {saving ? 'Αποθήκευση…' : 'Αποθήκευση'}
        </Button>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="settings-success">{message}</p> : null}

      <SmtpSetupGuideModal open={showHelp} onClose={() => setShowHelp(false)} />

      <Modal
        open={showHistory}
        title="Ιστορικό αποστολών"
        onClose={() => setShowHistory(false)}
        wide
        footer={
          <Button type="button" variant="secondary" onClick={() => setShowHistory(false)}>
            Κλείσιμο
          </Button>
        }
      >
        {history.length === 0 ? (
          <p className="muted">Δεν υπάρχουν αποστολές ακόμα.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ημ/νία</th>
                  <th>Παραλήπτης</th>
                  <th>Κατάσταση</th>
                  <th>Μήνυμα</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => (
                  <tr key={item.id}>
                    <td>{item.at.replace('T', ' ').slice(0, 19)}</td>
                    <td>{item.to}</td>
                    <td>{item.status === 'ok' ? 'OK' : 'Σφάλμα'}</td>
                    <td>{item.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </section>
  );
}
