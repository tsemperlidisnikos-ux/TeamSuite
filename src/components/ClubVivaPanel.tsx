import { useEffect, useMemo, useState } from 'react';
import {
  clubAllowsOnlineProvider,
  getClubById,
  getClubViva,
  updateClubViva,
  VIVA_WEBHOOK_URL,
  type ClubVivaSettings,
} from '../auth/clubs';
import { Button } from './ui/Button';
import { SettingsFormRow } from './ui/SettingsFormRow';

type Props = {
  clubId: string;
};

export function ClubVivaPanel({ clubId }: Props) {
  const club = getClubById(clubId);
  const allowed = clubAllowsOnlineProvider(clubId, 'viva');
  const [form, setForm] = useState<ClubVivaSettings>(() => getClubViva(clubId));
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const successUrlHint = useMemo(() => {
    const origin =
      typeof window !== 'undefined' ? window.location.origin : 'https://your-domain';
    return `${origin}/fees`;
  }, []);

  const webhookUrlHint = useMemo(() => {
    const origin =
      typeof window !== 'undefined' ? window.location.origin : 'https://your-domain';
    return `${origin}${VIVA_WEBHOOK_URL}`;
  }, []);

  useEffect(() => {
    setForm(getClubViva(clubId));
    setMessage('');
    setError('');
  }, [clubId]);

  function setField<K extends keyof ClubVivaSettings>(key: K, value: ClubVivaSettings[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    setSaving(true);
    setError('');
    setMessage('');
    const result = updateClubViva(clubId, form);
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Σφάλμα αποθήκευσης');
      return;
    }
    setForm(getClubViva(clubId));
    setMessage('Οι ρυθμίσεις Viva Wallet αποθηκεύτηκαν για τον σύλλογο.');
  }

  return (
    <section className="panel settings-panel club-viva-panel">
      <h3>Viva Wallet</h3>
      <p className="lede">
        Συνδέστε Client ID, Client Secret και Source Code από το Viva banking app για online πληρωμές
        (Smart Checkout) του συλλόγου «{club?.name ?? '—'}».
      </p>
      {!allowed ? (
        <p className="form-error">
          Ο διαχειριστής πλατφόρμας δεν έχει επιτρέψει Viva για αυτόν τον σύλλογο. Τα κλειδιά
          αποθηκεύονται, αλλά οι γονείς δεν θα βλέπουν πληρωμή Viva.
        </p>
      ) : null}

      <div className="settings-form">
        <SettingsFormRow label="Ενεργές online πληρωμές" htmlFor="viva-enabled">
          <label className="public-reg-check">
            <input
              id="viva-enabled"
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setField('enabled', e.target.checked)}
            />
            <span>Ενεργές</span>
          </label>
        </SettingsFormRow>

        <SettingsFormRow label="Client ID" htmlFor="viva-client">
          <input
            id="viva-client"
            className="field-input"
            value={form.clientId}
            onChange={(e) => setField('clientId', e.target.value)}
            placeholder="Client ID"
            autoComplete="off"
          />
        </SettingsFormRow>

        <SettingsFormRow label="Client Secret" htmlFor="viva-secret">
          <input
            id="viva-secret"
            className="field-input"
            type="password"
            value={form.clientSecret}
            onChange={(e) => setField('clientSecret', e.target.value)}
            placeholder="Client Secret"
            autoComplete="new-password"
          />
        </SettingsFormRow>

        <SettingsFormRow label="Merchant ID (προαιρετικό)" htmlFor="viva-merchant">
          <input
            id="viva-merchant"
            className="field-input"
            value={form.merchantId}
            onChange={(e) => setField('merchantId', e.target.value)}
            placeholder="Merchant ID"
            autoComplete="off"
          />
        </SettingsFormRow>

        <SettingsFormRow label="Source Code (4 ψηφία)" htmlFor="viva-source">
          <input
            id="viva-source"
            className="field-input"
            value={form.sourceCode}
            onChange={(e) =>
              setField('sourceCode', e.target.value.replace(/\D/g, '').slice(0, 4))
            }
            placeholder="π.χ. 1234"
            inputMode="numeric"
            maxLength={4}
          />
        </SettingsFormRow>

        <SettingsFormRow label="Περιβάλλον" htmlFor="viva-env">
          <select
            id="viva-env"
            className="field-input"
            value={form.environment}
            onChange={(e) =>
              setField('environment', e.target.value as ClubVivaSettings['environment'])
            }
          >
            <option value="demo">Demo / δοκιμή</option>
            <option value="live">Live / παραγωγή</option>
          </select>
        </SettingsFormRow>

        <SettingsFormRow label="Webhook URL">
          <code className="public-reg-link">{webhookUrlHint}</code>
        </SettingsFormRow>

        <SettingsFormRow label="Success URL">
          <code className="public-reg-link">{successUrlHint}</code>
          <span className="settings-hint">Στο Viva payment source (επιστρέφει ?t=transactionid).</span>
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
