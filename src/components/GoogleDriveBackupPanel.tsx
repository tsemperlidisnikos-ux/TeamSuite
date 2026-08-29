import { useEffect, useState } from 'react';
import { getClubs } from '../auth/clubs';
import * as googleDriveBackupService from '../api/services/googleDriveBackupService';
import type { GoogleDriveStatus } from '../api/services/googleDriveBackupService';
import { Button } from './ui/Button';

export function GoogleDriveBackupPanel({ onSaved }: { onSaved: (text: string) => void }) {
  const clubs = getClubs();
  const [status, setStatus] = useState<GoogleDriveStatus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [folderId, setFolderId] = useState('');

  async function refresh() {
    const result = await googleDriveBackupService.getGoogleDriveStatus();
    if (!result.success || !result.data) {
      setError(result.error ?? 'Αποτυχία ανάγνωσης Drive.');
      return;
    }
    setError('');
    setStatus(result.data);
    setFolderId(result.data.rootFolderId);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function connect() {
    setBusy(true);
    const result = await googleDriveBackupService.startGoogleDriveConnect();
    setBusy(false);
    if (!result.success || !result.data) {
      setError(result.error ?? 'Αποτυχία σύνδεσης.');
      return;
    }
    window.location.href = result.data;
  }

  async function disconnect() {
    if (!window.confirm('Αποσύνδεση Google Drive; Τα νυχτερινά αντίγραφα θα σταματήσουν να ανεβαίνουν εκεί.')) {
      return;
    }
    setBusy(true);
    const result = await googleDriveBackupService.disconnectGoogleDrive();
    setBusy(false);
    if (!result.success || !result.data) {
      setError(result.error ?? 'Αποτυχία αποσύνδεσης.');
      return;
    }
    setStatus(result.data);
    setFolderId('');
    onSaved('Το Google Drive αποσυνδέθηκε.');
  }

  async function saveEnabled(enabled: boolean) {
    setBusy(true);
    const result = await googleDriveBackupService.saveGoogleDriveSettings({ enabled });
    setBusy(false);
    if (!result.success || !result.data) {
      setError(result.error ?? 'Αποτυχία αποθήκευσης.');
      return;
    }
    setStatus(result.data);
    onSaved(enabled ? 'Το ανέβασμα στο Drive ενεργοποιήθηκε.' : 'Το ανέβασμα στο Drive απενεργοποιήθηκε.');
  }

  async function toggleClub(clubId: string, include: boolean) {
    if (!status) return;
    const exclude = new Set(status.excludeClubIds);
    if (include) exclude.delete(clubId);
    else exclude.add(clubId);
    setBusy(true);
    const result = await googleDriveBackupService.saveGoogleDriveSettings({
      excludeClubIds: [...exclude],
    });
    setBusy(false);
    if (!result.success || !result.data) {
      setError(result.error ?? 'Αποτυχία αποθήκευσης συλλόγων.');
      return;
    }
    setStatus(result.data);
  }

  async function saveFolder() {
    setBusy(true);
    const result = await googleDriveBackupService.saveGoogleDriveSettings({
      rootFolderId: folderId.trim(),
    });
    setBusy(false);
    if (!result.success || !result.data) {
      setError(result.error ?? 'Αποτυχία αποθήκευσης φακέλου.');
      return;
    }
    setStatus(result.data);
    onSaved('Ο φάκελος Drive αποθηκεύτηκε.');
  }

  async function testNow() {
    setBusy(true);
    const result = await googleDriveBackupService.testGoogleDriveUpload();
    setBusy(false);
    if (!result.success || !result.data) {
      setError(result.error ?? 'Αποτυχία δοκιμής.');
      await refresh();
      return;
    }
    setStatus(result.data);
    onSaved(
      result.data.lastClubs?.length
        ? `Στάλθηκαν ${result.data.lastClubs.length} σύλλογοι στο Drive.`
        : 'Η σύνδεση Drive επαληθεύτηκε (δεν υπήρχαν mirrors για αποστολή).',
    );
  }

  return (
    <div className="entry-form admin-entry">
      <p className="admin-entry-note">
        Ένας φάκελος στο Google Drive (προεπιλογή <strong>TeamSuite-Backups</strong>) με υποφάκελο ανά
        σύλλογο και ένα JSON ανά ημέρα. Το νυχτερινό cron (02:00 UTC) ανεβάζει όσα club mirrors υπάρχουν
        ήδη στο cloud. Απαιτούνται στο Vercel: <code>GOOGLE_DRIVE_CLIENT_ID</code>,{' '}
        <code>GOOGLE_DRIVE_CLIENT_SECRET</code> και Redirect URI{' '}
        <code>{status?.redirectUri || 'https://teamsuite-seven.vercel.app/api/google-drive?op=callback'}</code>
        .
      </p>
      {error ? <p className="form-error">{error}</p> : null}
      {status && !status.oauthConfigured ? (
        <p className="form-error">
          Δεν έχουν οριστεί τα Google OAuth secrets στο Vercel. Η σύνδεση δεν μπορεί να ξεκινήσει ακόμα.
        </p>
      ) : null}

      <div className="admin-entry-actions">
        {status?.connected ? (
          <>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void testNow()}>
              {busy ? 'Αποστολή…' : 'Δοκιμή / αποστολή τώρα'}
            </Button>
            <Button type="button" variant="danger" disabled={busy} onClick={() => void disconnect()}>
              Αποσύνδεση
            </Button>
          </>
        ) : (
          <Button type="button" disabled={busy || status?.oauthConfigured === false} onClick={() => void connect()}>
            {busy ? 'Ανακατεύθυνση…' : 'Σύνδεση Google Drive'}
          </Button>
        )}
      </div>

      {status?.connected ? (
        <>
          <label className="admin-check" style={{ maxWidth: 360, marginTop: '0.85rem' }}>
            <span>Νυχτερινό ανέβασμα</span>
            <input
              type="checkbox"
              checked={status.enabled}
              disabled={busy}
              onChange={(e) => void saveEnabled(e.target.checked)}
            />
          </label>
          <label className="field" style={{ marginTop: '0.75rem' }}>
            <span>Folder ID (προαιρετικά)</span>
            <input
              className="field-input"
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
              placeholder="Αφήστε κενό για αυτόματο TeamSuite-Backups"
            />
          </label>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void saveFolder()}>
            Αποθήκευση φακέλου
          </Button>
          {status.lastUploadAt ? (
            <p className="admin-entry-note">Τελευταία αποστολή: {status.lastUploadAt}</p>
          ) : null}
          {status.lastError ? <p className="form-error">{status.lastError}</p> : null}
          {clubs.length > 0 ? (
            <div style={{ marginTop: '0.85rem' }}>
              <p className="admin-entry-note">Σύλλογοι στο Drive (αποεπιλέξτε όσους δεν θέλετε):</p>
              {clubs.map((club) => (
                <label key={club.id} className="admin-check" style={{ maxWidth: 420 }}>
                  <span>{club.name}</span>
                  <input
                    type="checkbox"
                    checked={!status.excludeClubIds.includes(club.id)}
                    disabled={busy}
                    onChange={(e) => void toggleClub(club.id, e.target.checked)}
                  />
                </label>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
