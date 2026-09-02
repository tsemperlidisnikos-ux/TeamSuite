import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import * as publicClubCloudService from '../api/services/publicClubCloudService';
import * as publicJoinService from '../api/services/publicJoinService';
import type { RemotePublicClub } from '../api/services/publicClubCloudService';
import {
  getClubPublicRegistration,
  getClubs,
  slugifyClubName,
} from '../auth/clubs';
import { SignaturePad } from '../components/SignaturePad';
import { Button } from '../components/ui/Button';
import { getClubData } from '../data/repository';
import {
  collectClubSportOptions,
  gdprItemsFromJoinDeclarations,
  validatePublicJoinRequiredFields,
} from '../shared/publicJoinPayload';
import {
  CLOTHING_PACKAGE_OPTIONS,
  EMPTY_PUBLIC_JOIN_EXTRAS,
  HEALTH_OPTIONS,
  ISTOS_OPTIONS,
  LIABILITY_OPTIONS,
  MEDIA_OPTIONS,
  PAYMENT_OPTIONS,
  parsePublicJoinExtras,
} from '../shared/publicJoinExtras';
import type { SizeChart } from '../types';
import { renderPublicJoinFormSnapshot } from '../utils/publicJoinFormSnapshot';
import { toUpperEl } from '../utils/upperText';
import { sizeChartOptGroups } from '../utils/sizeChartOptions';

type JoinClubView = {
  source: 'local' | 'remote';
  clubId: string;
  slug: string;
  name: string;
  city: string;
  logoUrl: string | null;
  heroImageUrl: string | null;
  enabled: boolean;
  classes: Array<{ id: string; name: string; sport?: string }>;
  sports: string[];
  sizeChart: SizeChart;
};

function UpperJoinInput({
  value,
  onChange,
  required,
}: {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <input
      className="field-input field-input-upper"
      value={value}
      lang="el"
      autoCapitalize="characters"
      autoCorrect="off"
      spellCheck={false}
      required={required}
      onChange={(e) => onChange(toUpperEl(e.target.value))}
    />
  );
}

function fromRemote(club: RemotePublicClub): JoinClubView {
  return {
    source: 'remote',
    clubId: club.clubId,
    slug: club.slug,
    name: club.name,
    city: club.city || '',
    logoUrl: club.logoUrl,
    heroImageUrl: club.heroImageUrl,
    enabled: club.enabled,
    classes: club.classes ?? [],
    sports: club.sports ?? [],
    sizeChart: club.sizeChart ?? { kids: [], men: [], women: [] },
  };
}

const EMPTY_SIZE_CHART: SizeChart = { kids: [], men: [], women: [] };

export function PublicJoinPage() {
  const { slug = '' } = useParams();
  const [club, setClub] = useState<JoinClubView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [amka, setAmka] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState<'' | 'boy' | 'girl' | 'other'>('');
  const [athleteEmail, setAthleteEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [fatherFirstName, setFatherFirstName] = useState('');
  const [motherFirstName, setMotherFirstName] = useState('');
  const [fatherEmail, setFatherEmail] = useState('');
  const [motherEmail, setMotherEmail] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [motherPhone, setMotherPhone] = useState('');
  const [address, setAddress] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [city, setCity] = useState('');
  const [county, setCounty] = useState('');
  const [sport, setSport] = useState('');
  const [uniformSize, setUniformSize] = useState('');
  const [joinExtras, setJoinExtras] = useState(EMPTY_PUBLIC_JOIN_EXTRAS);
  const [notes, setNotes] = useState('');
  const [acceptedPersonalData, setAcceptedPersonalData] = useState(false);
  const [acceptedAmka, setAcceptedAmka] = useState(false);
  const [guardianSignature, setGuardianSignature] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError('');
      const normalized = slug.trim().toLowerCase();
      const local = getClubs().find((c) => {
        const s = (c.publicRegistration?.slug || slugifyClubName(c.name)).toLowerCase();
        return s === normalized;
      });
      if (local) {
        const settings = getClubPublicRegistration(local.id);
        const data = getClubData(local.id);
        if (!cancelled) {
          setClub({
            source: 'local',
            clubId: local.id,
            slug: settings.slug,
            name: local.name,
            city: local.city || '',
            logoUrl: local.logoUrl ?? null,
            heroImageUrl: settings.heroImageUrl ?? null,
            enabled: settings.enabled,
            classes: (data.classes ?? []).filter((c) => c.name),
            sports: collectClubSportOptions(data),
            sizeChart: data.sizeChart ?? EMPTY_SIZE_CHART,
          });
          setLoading(false);
        }
        return;
      }

      const remote = await publicClubCloudService.fetchPublicClubBySlug(normalized);
      if (cancelled) return;
      if (!remote.success || !remote.data?.club) {
        setClub(null);
        setLoadError(remote.error ?? 'Ο σύνδεσμος δεν βρέθηκε.');
        setLoading(false);
        return;
      }
      setClub(fromRemote(remote.data.club));
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const hero = useMemo(
    () => club?.heroImageUrl || club?.logoUrl || null,
    [club?.heroImageUrl, club?.logoUrl],
  );

  const uniformSizeOptions = useMemo(
    () => sizeChartOptGroups(club?.sizeChart ?? EMPTY_SIZE_CHART).flatMap((g) => g.sizes),
    [club?.sizeChart],
  );

  function resetForm() {
    setAmka('');
    setFirstName('');
    setLastName('');
    setBirthDate('');
    setGender('');
    setAthleteEmail('');
    setPhone('');
    setFatherFirstName('');
    setMotherFirstName('');
    setFatherEmail('');
    setMotherEmail('');
    setGuardianPhone('');
    setMotherPhone('');
    setAddress('');
    setPostalCode('');
    setCity('');
    setCounty('');
    setSport('');
    setUniformSize('');
    setJoinExtras(EMPTY_PUBLIC_JOIN_EXTRAS);
    setNotes('');
    setAcceptedPersonalData(false);
    setAcceptedAmka(false);
    setGuardianSignature('');
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!club || !club.enabled) return;

    if (!acceptedPersonalData) {
      setError('Απαιτείται «ΕΛΑΒΑ ΓΝΩΣΗ» για την προστασία προσωπικών δεδομένων.');
      return;
    }
    if (!acceptedAmka) {
      setError('Απαιτείται ρητή συγκατάθεση για τη συλλογή του ΑΜΚΑ.');
      return;
    }
    if (!guardianSignature.trim()) {
      setError('Απαιτείται υπογραφή γονέα ή κηδεμόνα.');
      return;
    }

    const fieldError = validatePublicJoinRequiredFields({
      amka,
      firstName,
      lastName,
      birthDate,
      gender,
      athleteEmail,
      phone,
      fatherFirstName,
      motherFirstName,
      fatherEmail,
      motherEmail,
      guardianPhone,
      motherPhone,
      address,
      postalCode,
      city,
      county,
      sport,
      uniformSize,
      notes,
      joinExtras,
    });
    if (fieldError) {
      setError(fieldError);
      return;
    }
    const extras = parsePublicJoinExtras(joinExtras);
    if (!extras) {
      setError('Συμπληρώστε πακέτο ρουχισμού, ΙΣΤΟΣ, πληρωμή και δηλώσεις.');
      return;
    }

    setSaving(true);
    setError('');
    setDone('');

    const guardianName = fatherFirstName.trim();
    const amkaTrim = amka.trim();
    const gdprItems = gdprItemsFromJoinDeclarations({
      gdprAcknowledged: acceptedPersonalData,
      mediaConsent: joinExtras.mediaConsent,
      healthDeclaration: joinExtras.healthDeclaration,
      amkaAccepted: acceptedAmka,
    });
    const amkaConsentAt = acceptedAmka ? new Date().toISOString().slice(0, 10) : '';

    let formSnapshotUrl: string | null = null;
    try {
      formSnapshotUrl = await renderPublicJoinFormSnapshot({
        clubName: club.name,
        submittedAt: new Date(),
        amka: amkaTrim,
        firstName,
        lastName,
        birthDate,
        gender,
        athleteEmail,
        phone,
        fatherFirstName,
        motherFirstName,
        fatherEmail,
        motherEmail,
        guardianPhone,
        motherPhone,
        address,
        postalCode,
        city,
        county,
        sport,
        uniformSize,
        notes,
        joinExtras: extras,
        guardianSignature,
      });
    } catch {
      formSnapshotUrl = null;
    }

    const payload = {
      firstName,
      lastName,
      birthDate,
      gender,
      guardianName,
      guardianPhone,
      email: fatherEmail.trim(),
      classId: null,
      kind: 'waitlist' as const,
      notes,
      acceptedTerms: acceptedPersonalData,
      amka: amkaTrim,
      phone: phone.trim(),
      athleteEmail: athleteEmail.trim(),
      fatherFirstName: fatherFirstName.trim(),
      motherFirstName: motherFirstName.trim(),
      fatherEmail: fatherEmail.trim(),
      motherEmail: motherEmail.trim(),
      motherPhone: motherPhone.trim(),
      address: address.trim(),
      postalCode: postalCode.trim(),
      city: city.trim(),
      county: county.trim(),
      sport: sport.trim(),
      uniformSize: uniformSize.trim(),
      joinExtras: extras,
      gdprItems,
      amkaConsentAt,
      guardianSignature,
      formSnapshotUrl,
    };

    let message = '';
    if (club.source === 'local') {
      const localResult = await publicJoinService.submitPublicJoin({
        clubId: club.clubId,
        ...payload,
      });
      if (!localResult.success) {
        setSaving(false);
        setError(localResult.error ?? 'Αποτυχία υποβολής');
        return;
      }
      message = localResult.data?.message ?? 'Η αίτηση καταχωρήθηκε.';
      if (localResult.data?.guardianEmailSent) {
        message += ' Στάλθηκε email επιβεβαίωσης.';
      }
      void publicClubCloudService.submitPublicJoinRemote({
        slug: club.slug,
        ...payload,
      });
    } else {
      const remoteResult = await publicClubCloudService.submitPublicJoinRemote({
        slug: club.slug,
        ...payload,
      });
      if (!remoteResult.success || !remoteResult.data) {
        setSaving(false);
        setError(remoteResult.error ?? 'Αποτυχία υποβολής');
        return;
      }
      message = remoteResult.data.message;
      if (remoteResult.data.guardianEmailSent) {
        message += ' Στάλθηκε email επιβεβαίωσης.';
      }
    }

    setSaving(false);
    setDone(message);
    resetForm();
  }

  if (loading) {
    return (
      <div className="public-join-page">
        <div className="public-join-card">
          <h1>Φόρτωση…</h1>
          <p className="muted">Ελέγχουμε τον σύνδεσμο εγγραφής.</p>
        </div>
      </div>
    );
  }

  if (!club) {
    return (
      <div className="public-join-page">
        <div className="public-join-card">
          <h1>Ο σύνδεσμος δεν βρέθηκε</h1>
          <p className="muted">{loadError || 'Ελέγξτε το URL ή επικοινωνήστε με τον σύλλογο.'}</p>
          <Link to="/login" className="text-link">
            Σύνδεση →
          </Link>
        </div>
      </div>
    );
  }

  if (!club.enabled) {
    return (
      <div className="public-join-page">
        <div className="public-join-card">
          <h1>{club.name}</h1>
          <p className="muted">Η δημόσια εγγραφή δεν είναι ενεργή αυτή τη στιγμή.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="public-join-page">
      <div className="public-join-shell">
        <header className="public-join-hero">
          {hero ? (
            <img className="public-join-hero-img" src={hero} alt={club.name} />
          ) : (
            <div className="public-join-hero-fallback">
              <span>{club.name.slice(0, 1)}</span>
            </div>
          )}
          <div className="public-join-hero-copy">
            <p className="public-join-eyebrow">Δημόσια εγγραφή</p>
            <h1>{club.name}</h1>
            {club.city ? <p className="muted">{club.city}</p> : null}
          </div>
        </header>

        <form className="public-join-card" onSubmit={(e) => void handleSubmit(e)}>
          <h2>Φόρμα εγγραφής αθλητή</h2>
          <p className="lede">
            Συμπληρώστε τα στοιχεία του αθλητή και του γονέα/κηδεμόνα. Θα ενημερωθείτε μετά τον
            έλεγχο από τον σύλλογο.
          </p>

          <div className="public-join-grid">
            <label className="field public-join-span-2">
              <span className="field-label">ΑΜΚΑ *</span>
              <input
                className="field-input"
                value={amka}
                onChange={(e) => setAmka(e.target.value)}
                inputMode="numeric"
                maxLength={11}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">Όνομα *</span>
              <UpperJoinInput value={firstName} onChange={setFirstName} required />
            </label>
            <label className="field">
              <span className="field-label">Επώνυμο *</span>
              <UpperJoinInput value={lastName} onChange={setLastName} required />
            </label>
            <label className="field">
              <span className="field-label">Ημερομηνία γέννησης *</span>
              <input
                className="field-input"
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">Φύλο *</span>
              <select
                className="field-input"
                value={gender}
                onChange={(e) => setGender(e.target.value as typeof gender)}
                required
              >
                <option value="" disabled>Επιλογή…</option>
                <option value="boy">Αγόρι</option>
                <option value="girl">Κορίτσι</option>
                <option value="other">Άλλο</option>
              </select>
            </label>
            <label className="field">
              <span className="field-label">Email αθλητή *</span>
              <input
                className="field-input"
                type="email"
                value={athleteEmail}
                onChange={(e) => setAthleteEmail(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">Τηλέφωνο αθλητή *</span>
              <input
                className="field-input"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">Πατρώνυμο *</span>
              <UpperJoinInput value={fatherFirstName} onChange={setFatherFirstName} required />
            </label>
            <label className="field">
              <span className="field-label">Μητρώνυμο *</span>
              <UpperJoinInput value={motherFirstName} onChange={setMotherFirstName} required />
            </label>
            <label className="field">
              <span className="field-label">Email πατρός *</span>
              <input
                className="field-input"
                type="email"
                value={fatherEmail}
                onChange={(e) => setFatherEmail(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">Email μητρός *</span>
              <input
                className="field-input"
                type="email"
                value={motherEmail}
                onChange={(e) => setMotherEmail(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">Τηλέφωνο πατρός *</span>
              <input
                className="field-input"
                type="tel"
                value={guardianPhone}
                onChange={(e) => setGuardianPhone(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">Τηλέφωνο μητρός *</span>
              <input
                className="field-input"
                type="tel"
                value={motherPhone}
                onChange={(e) => setMotherPhone(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">Διεύθυνση *</span>
              <UpperJoinInput value={address} onChange={setAddress} required />
            </label>
            <label className="field">
              <span className="field-label">Τ.Κ. *</span>
              <input
                className="field-input"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">Πόλη *</span>
              <UpperJoinInput value={city} onChange={setCity} required />
            </label>
            <label className="field">
              <span className="field-label">Νομός *</span>
              <UpperJoinInput value={county} onChange={setCounty} required />
            </label>
            <label className="field">
              <span className="field-label">Άθλημα *</span>
              <select
                className="field-input"
                value={sport}
                onChange={(e) => setSport(e.target.value)}
                required
              >
                <option value="" disabled>Επιλογή…</option>
                {club.sports.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Μέγεθος στολής *</span>
              <select
                className="field-input"
                value={uniformSize}
                onChange={(e) => setUniformSize(e.target.value)}
                required
              >
                <option value="" disabled>Επιλογή…</option>
                {uniformSizeOptions.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <label className="field public-join-span-2">
              <span className="field-label">Πακέτο ρουχισμού *</span>
              <select
                className="field-input"
                value={joinExtras.clothingPackage}
                onChange={(e) =>
                  setJoinExtras((prev) => ({
                    ...prev,
                    clothingPackage: e.target.value as typeof prev.clothingPackage,
                  }))
                }
                required
              >
                <option value="" disabled>
                  Επιλογή…
                </option>
                {CLOTHING_PACKAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Συμμετοχή στο πρόγραμμα «ΙΣΤΟΣ» *</span>
              <select
                className="field-input"
                value={joinExtras.istosProgram}
                onChange={(e) =>
                  setJoinExtras((prev) => ({
                    ...prev,
                    istosProgram: e.target.value as typeof prev.istosProgram,
                  }))
                }
                required
              >
                <option value="" disabled>
                  Επιλογή…
                </option>
                {ISTOS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Προτιμώμενη μέθοδος πληρωμής *</span>
              <select
                className="field-input"
                value={joinExtras.preferredPayment}
                onChange={(e) =>
                  setJoinExtras((prev) => ({
                    ...prev,
                    preferredPayment: e.target.value as typeof prev.preferredPayment,
                  }))
                }
                required
              >
                <option value="" disabled>
                  Επιλέξτε τον προτιμώμενο τρόπο πληρωμής
                </option>
                {PAYMENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="field">
            <span className="field-label">Σχόλια</span>
            <textarea
              className="field-input"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>

          <div className="public-join-choice-stack">
            <ChoiceCard title="Υπεύθυνη δήλωση υγείας">
              <p className="public-join-choice-body">
                Με την υποβολή της παρούσας αίτησης, ο υπογράφων γονέας/κηδεμόνας δηλώνω υπεύθυνα
                ότι:
              </p>
              <p className="public-join-choice-body">
                Ο συμμετέχων/ουσα είναι <strong>υγιής</strong> και του/της επιτρέπεται η πλήρης
                συμμετοχή σε αθλητικές δραστηριότητες.
              </p>
              {HEALTH_OPTIONS.map((option) => (
                <label key={option.value} className="public-join-choice-option">
                  <input
                    type="radio"
                    name="healthDeclaration"
                    checked={joinExtras.healthDeclaration === option.value}
                    onChange={() =>
                      setJoinExtras((prev) => ({ ...prev, healthDeclaration: option.value }))
                    }
                    required
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </ChoiceCard>

            <ChoiceCard title="Ευθύνη και ιατρική περίθαλψη">
              <p className="public-join-choice-body">
                Με την υποβολή της παρούσας αίτησης, ο υπογράφων γονέας/κηδεμόνας δηλώνω υπεύθυνα
                ότι:
              </p>
              <p className="public-join-choice-body">
                Ο Σύλλογος και οι προπονητές <strong>δεν φέρουν ευθύνη</strong> για τυχόν τραυματισμό
                που μπορεί να προκύψει κατά τη διάρκεια της προπόνησης, ο οποίος οφείλεται σε τυχαίο
                γεγονός ή σε μη συμμόρφωση του αθλητή / της αθλήτριας με τις υποδείξεις των
                υπευθύνων.
              </p>
              <p className="public-join-choice-body">
                Σε περίπτωση έκτακτου ιατρικού περιστατικού, παρέχω την άδεια στους υπεύθυνους να
                προβούν στις απαραίτητες ενέργειες για την παροχή πρώτων βοηθειών ή τη μεταφορά σε
                νοσοκομείο, εάν κριθεί απαραίτητο.
              </p>
              {LIABILITY_OPTIONS.map((option) => (
                <label key={option.value} className="public-join-choice-option">
                  <input
                    type="radio"
                    name="liabilityAcceptance"
                    checked={joinExtras.liabilityAcceptance === option.value}
                    onChange={() =>
                      setJoinExtras((prev) => ({ ...prev, liabilityAcceptance: option.value }))
                    }
                    required
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </ChoiceCard>

            <ChoiceCard title="Φωτογράφιση / βιντεοσκόπηση">
              <p className="public-join-choice-body">
                Συναινώ στη φωτογράφιση ή βιντεοσκόπηση του ΑΘΛΗΤΗ / ΑΘΛΗΤΡΙΑΣ κατά τη διάρκεια της
                προπονητικής περιόδου, με σκοπό την προβολή στα social media και την ιστοσελίδα του{' '}
                {club.name}.
              </p>
              {MEDIA_OPTIONS.map((option) => (
                <label key={option.value} className="public-join-choice-option">
                  <input
                    type="radio"
                    name="mediaConsent"
                    checked={joinExtras.mediaConsent === option.value}
                    onChange={() =>
                      setJoinExtras((prev) => ({ ...prev, mediaConsent: option.value }))
                    }
                    required
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </ChoiceCard>

            <ChoiceCard title="Προστασία προσωπικών δεδομένων (GDPR)">
              <p className="public-join-choice-body">
                Τα προσωπικά δεδομένα που συλλέγονται μέσω αυτής της φόρμας (ΑΜΚΑ, ονοματεπώνυμο,
                τηλέφωνα επικοινωνίας, ιατρικές πληροφορίες) θα χρησιμοποιηθούν αποκλειστικά για τις
                ανάγκες λειτουργίας και επικοινωνίας του {club.name} και την ασφάλεια των
                συμμετεχόντων. Ο Σύλλογος δεσμεύεται για την εμπιστευτικότητα των στοιχείων και τη
                μη κοινοποίησή τους σε τρίτους, σύμφωνα με τον Γενικό Κανονισμό Προστασίας
                Δεδομένων (ΕΕ 2016/679).
              </p>
              <label className="public-join-choice-option">
                <input
                  type="checkbox"
                  checked={acceptedPersonalData}
                  onChange={(e) => setAcceptedPersonalData(e.target.checked)}
                  required
                />
                <span>ΕΛΑΒΑ ΓΝΩΣΗ</span>
              </label>
            </ChoiceCard>
          </div>

          <div className="public-join-signature">
            <div className="public-join-consent-checks">
              <label className="public-reg-check">
                <input
                  type="checkbox"
                  checked={acceptedAmka}
                  onChange={(e) => setAcceptedAmka(e.target.checked)}
                  required
                />
                <span>Συγκατάθεση γονέα / κηδεμόνα *</span>
              </label>
            </div>
            <span className="field-label">Υπογραφή γονέα / κηδεμόνα *</span>
            <SignaturePad
              id="public-join-signature"
              value={guardianSignature}
              onChange={setGuardianSignature}
              disabled={saving}
            />
          </div>

          {error ? <p className="form-error">{error}</p> : null}
          {done ? <p className="settings-success">{done}</p> : null}

          <div className="public-join-submit-row">
            <Button type="submit" disabled={saving}>
              {saving ? 'Υποβολή…' : 'Υποβολή αίτησης'}
            </Button>
            <time className="public-join-now" dateTime={now.toISOString()}>
              {now.toLocaleString('el-GR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
              })}
            </time>
          </div>
        </form>
      </div>
    </div>
  );
}

function ChoiceCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="public-join-choice-card">
      <legend>
        {title}{' '}
        <span className="public-join-req" aria-hidden>
          *
        </span>
      </legend>
      {hint ? <p className="public-join-choice-hint">{hint}</p> : null}
      {children}
    </fieldset>
  );
}
