import { useState, type FormEvent } from 'react';
import { upsertCloudUser } from '../api/services/accountSyncService';
import { changePassword, getSession, getUserById } from '../auth/auth';
import { Button } from './ui/Button';
import { SettingsFormRow } from './ui/SettingsFormRow';

export function ChangePasswordPanel() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    const result = await changePassword({
      currentPassword,
      newPassword,
      confirmPassword,
    });
    if (!result.success) {
      setSaving(false);
      setError(result.error ?? 'Σφάλμα ενημέρωσης κωδικού');
      return;
    }
    const session = getSession();
    const user = session ? getUserById(session.id) : null;
    if (user) {
      const cloud = await upsertCloudUser(user);
      if (!cloud.success) {
        setSaving(false);
        setError(
          cloud.error ??
            'Ο κωδικός άλλαξε σε αυτή τη συσκευή, αλλά όχι στο cloud. Δοκιμάστε ξανά.',
        );
        return;
      }
    }
    setSaving(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setMessage('Ο κωδικός ενημερώθηκε.');
  }

  return (
    <section className="panel settings-panel change-password-panel">
      <h3>Αλλαγή κωδικού</h3>
      <form className="settings-form" onSubmit={(e) => void handleSubmit(e)}>
        <SettingsFormRow label="Τρέχων κωδικός" htmlFor="pw-current">
          <input
            id="pw-current"
            className="field-input"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Τρέχων"
            autoComplete="current-password"
          />
        </SettingsFormRow>
        <SettingsFormRow label="Νέος κωδικός" htmlFor="pw-new">
          <input
            id="pw-new"
            className="field-input"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Νέος"
            autoComplete="new-password"
          />
        </SettingsFormRow>
        <SettingsFormRow label="Επιβεβαίωση" htmlFor="pw-confirm">
          <input
            id="pw-confirm"
            className="field-input"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Επιβεβαίωση"
            autoComplete="new-password"
          />
        </SettingsFormRow>

        {error ? <p className="form-error">{error}</p> : null}
        {message ? <p className="settings-success">{message}</p> : null}

        <div className="settings-form-actions">
          <Button type="submit" disabled={saving}>
            {saving ? 'Ενημέρωση…' : 'Ενημέρωση'}
          </Button>
        </div>
      </form>
    </section>
  );
}
