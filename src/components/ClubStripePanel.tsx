import { useEffect, useState } from 'react';
import {
  clubAllowsOnlineProvider,
  getClubById,
  getClubStripe,
  updateClubStripe,
  type ClubStripeSettings,
} from '../auth/clubs';
import { Button } from './ui/Button';
import { SettingsFormRow } from './ui/SettingsFormRow';

type Props = { clubId: string };

export function ClubStripePanel({ clubId }: Props) {
  const club = getClubById(clubId);
  const allowed = clubAllowsOnlineProvider(clubId, 'stripe');
  const [form, setForm] = useState<ClubStripeSettings>(() => getClubStripe(clubId));
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(getClubStripe(clubId));
    setMessage('');
    setError('');
  }, [clubId]);

  function handleSave() {
    setSaving(true);
    setError('');
    setMessage('');
    const result = updateClubStripe(clubId, form);
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Σφάλμα αποθήκευσης');
      return;
    }
    setForm(getClubStripe(clubId));
    setMessage('Οι ρυθμίσεις Stripe αποθηκεύτηκαν.');
  }

  return (
    <section className="panel settings-panel">
      <h3>Stripe</h3>
      <p className="lede">
        Checkout Session για online κάρτα του συλλόγου «{club?.name ?? '—'}». Χρησιμοποιήστε
        pk_test_/sk_test_ στη δοκιμή και pk_live_/sk_live_ στην παραγωγή.
      </p>
      {!allowed ? (
        <p className="form-error">
          Ο διαχειριστής πλατφόρμας δεν έχει επιτρέψει Stripe για αυτόν τον σύλλογο.
        </p>
      ) : null}
      <div className="settings-form">
        <SettingsFormRow label="Ενεργές online πληρωμές" htmlFor="stripe-enabled">
          <label className="public-reg-check">
            <input
              id="stripe-enabled"
              type="checkbox"
              checked={form.enabled}
              disabled={!allowed}
              onChange={(e) => setForm((p) => ({ ...p, enabled: e.target.checked }))}
            />
            <span>Ενεργές</span>
          </label>
        </SettingsFormRow>
        <SettingsFormRow label="Publishable Key" htmlFor="stripe-pk">
          <input
            id="stripe-pk"
            className="field-input"
            value={form.publishableKey}
            onChange={(e) => setForm((p) => ({ ...p, publishableKey: e.target.value.trim() }))}
            placeholder="pk_test_… ή pk_live_…"
            autoComplete="off"
          />
        </SettingsFormRow>
        <SettingsFormRow label="Secret Key" htmlFor="stripe-sk">
          <input
            id="stripe-sk"
            className="field-input"
            type="password"
            value={form.secretKey}
            onChange={(e) => setForm((p) => ({ ...p, secretKey: e.target.value.trim() }))}
            placeholder="sk_test_… ή sk_live_…"
            autoComplete="new-password"
          />
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
