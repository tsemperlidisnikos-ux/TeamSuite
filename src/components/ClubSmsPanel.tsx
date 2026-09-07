import { useState } from 'react';
import {
  getClubById,
  getClubSms,
  isMaskedOrBlankSecret,
  smsHasStoredSecret,
  updateClubSms,
  type ClubSmsSettings,
} from '../auth/clubs';
import * as publicClubCloudService from '../api/services/publicClubCloudService';
import * as smsService from '../api/services/smsService';
import { Button } from './ui/Button';

export function ClubSmsPanel({ clubId }: { clubId: string }) {
  const [form, setForm] = useState<ClubSmsSettings>(() => getClubSms(clubId));
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function handleSave() {
    setSaving(true);
    setError('');
    setMessage('');
    const stored = getClubById(clubId)?.sms;
    const hasSecret = !isMaskedOrBlankSecret(form.apiKey) || smsHasStoredSecret(stored);
    const enabled = Boolean(form.enabled && hasSecret);
    const saved = updateClubSms(clubId, { ...form, enabled });
    if (!saved.success) {
      setSaving(false);
      setError(saved.error ?? 'Αποτυχία αποθήκευσης SMS');
      return;
    }
    const published = await publicClubCloudService.publishPublicClubCloud(clubId);
    setSaving(false);
    if (!published.success) {
      setError(
        `${published.error ?? 'Cloud sync απέτυχε'} Το SMS αποθηκεύτηκε τοπικά — δοκιμάστε ξανά από production.`,
      );
      return;
    }
    setMessage('Οι ρυθμίσεις SMS αποθηκεύτηκαν και συγχρονίστηκαν στο cloud.');
    setForm(getClubSms(clubId));
  }

  async function handleTest() {
    setError('');
    setMessage('');
    const club = getClubById(clubId);
    const to = (club?.phone ?? '').trim();
    if (!to) {
      setError('Συμπληρώστε τηλέφωνο συλλόγου στις Ρυθμίσεις για δοκιμή.');
      return;
    }
    const result = await smsService.sendClubSms({
      clubId,
      to,
      text: `Δοκιμή SMS TeamSuite — ${club?.name ?? ''}`,
      transactional: true,
    });
    if (!result.success) {
      setError(result.error ?? 'Αποτυχία δοκιμής SMS');
      return;
    }
    setMessage(`Επιτυχής δοκιμή SMS προς ${result.data?.to}.`);
  }

  return (
    <section className="set-card panel">
      <h2>SMS / Viber</h2>
      <p className="set-card-lede">
        Αποστολή SMS μέσω SMS.to (ή δικού σας HTTP endpoint). Το Viber Business API δεν είναι
        ενσωματωμένο — για Viber χρησιμοποιήστε το <code>viber://</code> από τη γραμματεία ή SMS
        που ανοίγει στο Viber του γονέα.
      </p>
      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="muted">{message}</p> : null}
      <div className="set-grid-2">
        <label className="set-field">
          <span>Ενεργό</span>
          <select
            value={form.enabled ? 'yes' : 'no'}
            onChange={(e) => setForm({ ...form, enabled: e.target.value === 'yes' })}
          >
            <option value="no">Όχι</option>
            <option value="yes">Ναι</option>
          </select>
        </label>
        <label className="set-field">
          <span>Πάροχος</span>
          <select
            value={form.provider}
            onChange={(e) =>
              setForm({ ...form, provider: e.target.value as ClubSmsSettings['provider'] })
            }
          >
            <option value="sms_to">SMS.to</option>
            <option value="http">Generic HTTP POST</option>
          </select>
        </label>
        <label className="set-field">
          <span>API key</span>
          <input
            type={showKey ? 'text' : 'password'}
            value={form.apiKey}
            onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
            autoComplete="new-password"
            placeholder={
              form.apiKeySet ? 'Αποθηκευμένο — συμπληρώστε μόνο για αλλαγή' : 'API key'
            }
          />
          <button type="button" className="set-eye" onClick={() => setShowKey((v) => !v)}>
            {showKey ? 'Απόκρυψη' : 'Εμφάνιση'}
          </button>
        </label>
        <label className="set-field">
          <span>Αποστολέας (έως 11 χαρακτήρες)</span>
          <input
            value={form.sender}
            onChange={(e) => setForm({ ...form, sender: e.target.value })}
            maxLength={11}
            placeholder="TeamSuite"
          />
        </label>
        {form.provider === 'http' ? (
          <label className="set-field set-field--full">
            <span>URL αποστολής</span>
            <input
              value={form.httpUrl}
              onChange={(e) => setForm({ ...form, httpUrl: e.target.value })}
              placeholder="https://example.com/sms"
            />
          </label>
        ) : null}
      </div>
      <div className="trainings-actions" style={{ marginTop: 12 }}>
        <Button type="button" disabled={saving} onClick={() => void handleSave()}>
          {saving ? 'Αποθήκευση…' : 'Αποθήκευση SMS'}
        </Button>
        <Button type="button" variant="secondary" onClick={() => void handleTest()}>
          Δοκιμή στο τηλέφωνο συλλόγου
        </Button>
      </div>
    </section>
  );
}
