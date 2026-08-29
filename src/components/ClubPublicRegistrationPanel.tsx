import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { ClipboardCopy, Download, ImagePlus, QrCode, Trash2 } from 'lucide-react';
import * as publicClubCloudService from '../api/services/publicClubCloudService';
import {
  getClubById,
  getClubPublicRegistration,
  updateClubPublicRegistration,
  type ClubPublicRegistrationSettings,
} from '../auth/clubs';
import { Button } from './ui/Button';
import { SettingsFormRow } from './ui/SettingsFormRow';

const MAX_HERO_BYTES = 700_000;

type Props = {
  clubId: string;
  onOpenGdpr?: () => void;
};

export function ClubPublicRegistrationPanel({ clubId, onOpenGdpr }: Props) {
  const club = getClubById(clubId);
  const [form, setForm] = useState<ClubPublicRegistrationSettings>(() =>
    getClubPublicRegistration(clubId),
  );
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [dpaAcceptedAt, setDpaAcceptedAt] = useState<string | null>(
    () => getClubById(clubId)?.dpaAcceptedAt ?? null,
  );
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setForm(getClubPublicRegistration(clubId));
    setMessage('');
    setError('');
  }, [clubId]);

  useEffect(() => {
    function syncDpa() {
      setDpaAcceptedAt(getClubById(clubId)?.dpaAcceptedAt ?? null);
    }
    syncDpa();
    window.addEventListener('academyhub-clubs-updated', syncDpa);
    return () => window.removeEventListener('academyhub-clubs-updated', syncDpa);
  }, [clubId]);

  const joinPath = useMemo(() => {
    const slug = form.slug.trim() || 'club';
    return `/join/${slug}`;
  }, [form.slug]);

  const joinUrl = useMemo(() => {
    if (typeof window === 'undefined') return joinPath;
    return `${window.location.origin}${joinPath}`;
  }, [joinPath]);

  const qrImageUrl = useMemo(
    () =>
      `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=10&data=${encodeURIComponent(joinUrl)}`,
    [joinUrl],
  );

  const heroPreview = form.heroImageUrl || club?.logoUrl || null;

  function setField<K extends keyof ClubPublicRegistrationSettings>(
    key: K,
    value: ClubPublicRegistrationSettings[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    setMessage('');
    if (form.enabled && !dpaAcceptedAt) {
      setSaving(false);
      setError(
        'Απαιτείται αποδοχή DPA (Ρυθμίσεις → GDPR) πριν ενεργοποιηθεί η δημόσια εγγραφή.',
      );
      return;
    }
    const result = updateClubPublicRegistration(clubId, {
      ...form,
      autoApprove: false,
      notifyEmail: form.notifyEmail ?? '',
    });
    if (!result.success) {
      setSaving(false);
      setError(result.error ?? 'Σφάλμα αποθήκευσης');
      return;
    }
    setForm(getClubPublicRegistration(clubId));
    const publish = await publicClubCloudService.publishPublicClubCloud(clubId);
    setForm(getClubPublicRegistration(clubId));
    setSaving(false);
    if (!publish.success) {
      setMessage(
        'Οι ρυθμίσεις αποθηκεύτηκαν τοπικά. Cloud δημοσίευση απέτυχε — δοκιμάστε ξανά στο live (Vercel) με Redis.',
      );
      setError(publish.error ?? '');
      return;
    }
    setMessage(
      publish.data?.durable
        ? 'Αποθηκεύτηκε και δημοσιεύτηκε στο cloud. Το /join είναι διαθέσιμο από οποιαδήποτε συσκευή.'
        : 'Αποθηκεύτηκε. Cloud χωρίς Redis — το /join από άλλες συσκευές μπορεί να μην είναι διαθέσιμο.',
    );
  }

  function handleCopyLink() {
    void navigator.clipboard.writeText(joinUrl).then(
      () => setMessage('Ο σύνδεσμος αντιγράφηκε.'),
      () => setError('Αδυναμία αντιγραφής συνδέσμου.'),
    );
  }

  async function handleDownloadQr() {
    try {
      const response = await fetch(qrImageUrl);
      if (!response.ok) throw new Error('QR fetch failed');
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const slug = (form.slug.trim() || 'club').replace(/[^a-z0-9-]/gi, '-');
      anchor.href = objectUrl;
      anchor.download = `join-${slug}-qr.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      setMessage('Το QR κατέβηκε.');
    } catch {
      window.open(qrImageUrl, '_blank', 'noopener,noreferrer');
      setMessage('Άνοιξε το QR σε νέα καρτέλα — αποθήκευσέ το από εκεί.');
    }
  }

  function handleHeroFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Επιλέξτε εικόνα (JPG, PNG, WEBP).');
      return;
    }
    if (file.size > MAX_HERO_BYTES) {
      setError('Η φωτογραφία πρέπει να είναι έως ~700KB.');
      return;
    }
    setError('');
    const reader = new FileReader();
    reader.onload = () => {
      setField('heroImageUrl', String(reader.result ?? ''));
      setMessage('Η φωτογραφία φόρμας ενημερώθηκε — πατήστε Αποθήκευση.');
    };
    reader.readAsDataURL(file);
  }

  return (
    <section className="panel settings-panel public-reg-panel">
      <h3>Δημόσια εγγραφή αθλητή</h3>

      <div className="public-reg-info public-reg-info--banner">
        <span className="public-reg-info-icon" aria-hidden>
          i
        </span>
        <p>
          Ενεργοποίησε τη φόρμα και μοιράσου το link σε γονείς/αθλητές. Οι αιτήσεις εγκρίνονται από
          το προσωπικό.
        </p>
      </div>

      <div className="settings-form">
        <SettingsFormRow label="Ενεργή δημόσια εγγραφή" htmlFor="pub-reg-enabled">
          <label className="public-reg-check">
            <input
              id="pub-reg-enabled"
              type="checkbox"
              checked={form.enabled}
              disabled={!dpaAcceptedAt && !form.enabled}
              onChange={(e) => {
                if (e.target.checked && !dpaAcceptedAt) {
                  setError(
                    'Απαιτείται αποδοχή DPA στις Ρυθμίσεις → GDPR πριν ενεργοποιηθεί η δημόσια εγγραφή.',
                  );
                  return;
                }
                setError('');
                setField('enabled', e.target.checked);
              }}
            />
            <span>Ενεργή</span>
          </label>
          {!dpaAcceptedAt ? (
            <div className="public-reg-info">
              <span className="public-reg-info-icon" aria-hidden>
                i
              </span>
              <p>
                Πρώτα καταγράψτε αποδοχή DPA στο GDPR.{' '}
                {onOpenGdpr ? (
                  <button type="button" className="public-reg-link" onClick={onOpenGdpr}>
                    Μετάβαση στο GDPR
                  </button>
                ) : (
                  'Ρυθμίσεις → GDPR.'
                )}
              </p>
            </div>
          ) : null}
        </SettingsFormRow>

        <SettingsFormRow label="Άμεση εμφάνιση στη λίστα αθλητών" htmlFor="pub-reg-auto">
          <label className="public-reg-check">
            <input id="pub-reg-auto" type="checkbox" checked={false} disabled />
            <span>Ανενεργή</span>
          </label>
          <div className="public-reg-info">
            <span className="public-reg-info-icon" aria-hidden>
              i
            </span>
            <p>
              Κάθε δημόσια εγγραφή μένει σε αναμονή. Ο σύλλογος ενεργοποιεί τον αθλητή από Αθλητές →
              εκκρεμείς αιτήσεις (Έγκριση).
            </p>
          </div>
        </SettingsFormRow>

        <SettingsFormRow label="Δοκιμαστική προπόνηση" htmlFor="pub-reg-trial">
          <label className="public-reg-check">
            <input
              id="pub-reg-trial"
              type="checkbox"
              checked={form.allowTrial}
              onChange={(e) => setField('allowTrial', e.target.checked)}
            />
            <span>Στη δημόσια εγγραφή</span>
          </label>
        </SettingsFormRow>

        <SettingsFormRow label="Λίστα αναμονής" htmlFor="pub-reg-waitlist">
          <label className="public-reg-check">
            <input
              id="pub-reg-waitlist"
              type="checkbox"
              checked={form.allowWaitlist}
              onChange={(e) => setField('allowWaitlist', e.target.checked)}
            />
            <span>Στη δημόσια εγγραφή</span>
          </label>
          <div className="public-reg-info">
            <span className="public-reg-info-icon" aria-hidden>
              i
            </span>
            <p>
              Όταν γεμίσει ένα τμήμα ή επιλεγεί λίστα αναμονής, οι αιτήσεις μπαίνουν σε σειρά.
            </p>
          </div>
        </SettingsFormRow>

        <SettingsFormRow label="Σύνδεσμος (slug)" htmlFor="pub-reg-slug">
          <input
            id="pub-reg-slug"
            className="field-input"
            value={form.slug}
            onChange={(e) => setField('slug', e.target.value.toLowerCase())}
            placeholder="π.χ. promitheas-patras"
          />
          <div className="public-reg-info">
            <span className="public-reg-info-icon" aria-hidden>
              i
            </span>
            <p>
              Το URL θα είναι <code>/join/{'{slug}'}</code>. Αν μείνει κενό, δημιουργείται αυτόματα.
            </p>
          </div>
          <div className="public-reg-link-row">
            <code className="public-reg-link">{joinUrl}</code>
            <Button type="button" variant="secondary" onClick={handleCopyLink}>
              <ClipboardCopy size={16} /> Αντιγραφή
            </Button>
            <a className="text-link" href={joinPath} target="_blank" rel="noreferrer">
              Προεπισκόπηση →
            </a>
          </div>
        </SettingsFormRow>

        <SettingsFormRow label="QR κωδικός εγγραφής">
          <p className="lede public-reg-inline-lede">
            Σκάναρε με το κινητό για άμεσο άνοιγμα της δημόσιας φόρμας. Χρήσιμο για αφίσες / Viber /
            WhatsApp.
          </p>
          <div className="public-reg-qr-row">
            <div className="public-reg-qr-preview">
              <img
                src={qrImageUrl}
                alt={`QR εγγραφής ${club?.name ?? ''}`}
                width={180}
                height={180}
              />
            </div>
            <div className="public-reg-qr-actions">
              <Button type="button" variant="secondary" onClick={() => void handleDownloadQr()}>
                <Download size={16} /> Λήψη PNG
              </Button>
              <Button type="button" variant="secondary" onClick={() => window.print()}>
                <QrCode size={16} /> Εκτύπωση σελίδας
              </Button>
              <p className="settings-hint">
                Το QR δείχνει πάντα το τρέχον URL (μετά την αλλαγή slug πάτα Αποθήκευση).
              </p>
            </div>
          </div>
        </SettingsFormRow>

        <SettingsFormRow label="Email ειδοποίησης νέας αίτησης" htmlFor="pub-reg-notify">
          <input
            id="pub-reg-notify"
            className="field-input"
            type="email"
            value={form.notifyEmail ?? ''}
            onChange={(e) => setField('notifyEmail', e.target.value)}
            placeholder="π.χ. admin@club.gr"
          />
          <div className="public-reg-info">
            <span className="public-reg-info-icon" aria-hidden>
              i
            </span>
            <p>
              Αν το SMTP είναι ενεργό στις Ρυθμίσεις → Email, στέλνεται ειδοποίηση σε αυτό το address
              και επιβεβαίωση στον γονέα (αν δόθηκε email). Αν μείνει κενό, χρησιμοποιείται το
              email του διαχειριστή ή το SMTP username. Μετά την Αποθήκευση η φόρμα δημοσιεύεται στο
              cloud.
            </p>
          </div>
        </SettingsFormRow>

        <SettingsFormRow label="Φωτογραφία φόρμας εγγραφής">
          <p className="lede public-reg-inline-lede">
            Εμφανίζεται στην κεφαλίδα του δημόσιου συνδέσμου. Αν δεν οριστεί, χρησιμοποιείται το logo
            συλλόγου.
          </p>
          <div className="public-reg-photo-row">
            <div className="public-reg-photo-preview">
              {heroPreview ? (
                <img src={heroPreview} alt={`Φόρμα ${club?.name ?? ''}`} />
              ) : (
                <span>Χωρίς φωτογραφία</span>
              )}
            </div>
            <div className="public-reg-photo-actions">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                hidden
                onChange={handleHeroFile}
              />
              <Button type="button" onClick={() => fileRef.current?.click()}>
                <ImagePlus size={16} /> Ανέβασμα φωτογραφίας
              </Button>
              {form.heroImageUrl ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setField('heroImageUrl', null);
                    setMessage('Η φωτογραφία αφαιρέθηκε — πατήστε Αποθήκευση.');
                  }}
                >
                  <Trash2 size={16} /> Αφαίρεση
                </Button>
              ) : null}
              <p className="settings-hint">
                JPG / PNG / WEBP · έως ~700KB · οριζόντια αναλογία ιδανική
              </p>
            </div>
          </div>
        </SettingsFormRow>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="settings-success">{message}</p> : null}

      <div className="settings-form-actions">
        <Button type="button" disabled={saving} onClick={() => void handleSave()}>
          {saving ? 'Αποθήκευση…' : 'Αποθήκευση'}
        </Button>
      </div>
    </section>
  );
}
