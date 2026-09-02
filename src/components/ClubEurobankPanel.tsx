import { useEffect, useState } from 'react';
import {
  clubAllowsOnlineProvider,
  getClubById,
  getClubEurobank,
  updateClubEurobank,
  type ClubEurobankSettings,
} from '../auth/clubs';
import { Button } from './ui/Button';
import { SettingsFormRow } from './ui/SettingsFormRow';

type Props = { clubId: string };

export function ClubEurobankPanel({ clubId }: Props) {
  const club = getClubById(clubId);
  const allowed = clubAllowsOnlineProvider(clubId, 'eurobank');
  const [form, setForm] = useState<ClubEurobankSettings>(() => getClubEurobank(clubId));
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(getClubEurobank(clubId));
    setMessage('');
    setError('');
  }, [clubId]);

  function handleSave() {
    setSaving(true);
    setError('');
    setMessage('');
    const result = updateClubEurobank(clubId, form);
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Σφάλμα αποθήκευσης');
      return;
    }
    setForm(getClubEurobank(clubId));
    setMessage('Οι ρυθμίσεις Eurobank αποθηκεύτηκαν.');
  }

  return (
    <section className="panel settings-panel">
      <h3>Eurobank (Cardlink / Nexi)</h3>
      <p className="lede">
        Hosted πληρωμή VPOS για τον σύλλογο «{club?.name ?? '—'}». Ζητήστε από την Eurobank Merchant
        ID και shared secret του e-commerce. Στο demo χρησιμοποιείται το test gateway της Cardlink.
      </p>
      {!allowed ? (
        <p className="form-error">
          Ο διαχειριστής πλατφόρμας δεν έχει επιτρέψει Eurobank για αυτόν τον σύλλογο.
        </p>
      ) : null}
      <div className="settings-form">
        <SettingsFormRow label="Ενεργές online πληρωμές" htmlFor="eb-enabled">
          <label className="public-reg-check">
            <input
              id="eb-enabled"
              type="checkbox"
              checked={form.enabled}
              disabled={!allowed}
              onChange={(e) => setForm((p) => ({ ...p, enabled: e.target.checked }))}
            />
            <span>Ενεργές</span>
          </label>
        </SettingsFormRow>
        <SettingsFormRow label="Merchant ID" htmlFor="eb-mid">
          <input
            id="eb-mid"
            className="field-input"
            value={form.merchantId}
            onChange={(e) => setForm((p) => ({ ...p, merchantId: e.target.value }))}
            autoComplete="off"
          />
        </SettingsFormRow>
        <SettingsFormRow label="Secret Key" htmlFor="eb-secret">
          <input
            id="eb-secret"
            className="field-input"
            type="password"
            value={form.secretKey}
            onChange={(e) => setForm((p) => ({ ...p, secretKey: e.target.value }))}
            autoComplete="new-password"
          />
        </SettingsFormRow>
        <SettingsFormRow label="Περιβάλλον" htmlFor="eb-env">
          <select
            id="eb-env"
            className="field-input"
            value={form.environment}
            onChange={(e) =>
              setForm((p) => ({ ...p, environment: e.target.value as ClubEurobankSettings['environment'] }))
            }
          >
            <option value="demo">Demo / δοκιμή</option>
            <option value="live">Live / παραγωγή</option>
          </select>
        </SettingsFormRow>
      </div>
      <div className="settings-form-actions">
        <Button type="button" disabled={saving} onClick={handleSave}>
          {saving ? 'Αποθήκευση…' : 'Αποθήκευση'}
        </Button>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="settings-success">{message}</p> : null}
    </section>
  );
}
