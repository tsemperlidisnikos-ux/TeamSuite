import { type FormEvent, useEffect, useMemo, useState } from 'react';
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
  AMKA_CONSENT_CHECKBOX,
  DEFAULT_TERMS_OF_USE_HTML,
} from '../shared/termsDefaults';
import {
  collectClubSportOptions,
  gdprItemsFromPublicConsent,
  validatePublicJoinRequiredFields,
} from '../shared/publicJoinPayload';
import type { RegistrationApplicationKind, SizeChart } from '../types';
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
  allowTrial: boolean;
  allowWaitlist: boolean;
  classes: Array<{ id: string; name: string; sport?: string }>;
  sports: string[];
  sizeChart: SizeChart;
  termsHtml: string;
};

function defaultPublicJoinKind(
  allowTrial: boolean,
  allowWaitlist: boolean,
): RegistrationApplicationKind {
  if (allowTrial) return 'trial';
  if (allowWaitlist) return 'waitlist';
  return 'full';
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
    allowTrial: club.allowTrial,
    allowWaitlist: club.allowWaitlist,
    classes: club.classes ?? [],
    sports: club.sports ?? [],
    sizeChart: club.sizeChart ?? { kids: [], men: [], women: [] },
    termsHtml: club.termsHtml?.trim() || DEFAULT_TERMS_OF_USE_HTML,
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
  const [kind, setKind] = useState<RegistrationApplicationKind>('trial');
  const [notes, setNotes] = useState('');
  const [acceptedPersonalData, setAcceptedPersonalData] = useState(false);
  const [acceptedAmka, setAcceptedAmka] = useState(false);
  const [guardianSignature, setGuardianSignature] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [saving, setSaving] = useState(false);

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
            allowTrial: settings.allowTrial,
            allowWaitlist: settings.allowWaitlist,
            classes: (data.classes ?? []).filter((c) => c.name),
            sports: collectClubSportOptions(data),
            sizeChart: data.sizeChart ?? EMPTY_SIZE_CHART,
            termsHtml: data.termsOfUseHtml?.trim() || DEFAULT_TERMS_OF_USE_HTML,
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
    if (!club) return;
    setKind(defaultPublicJoinKind(club.allowTrial, club.allowWaitlist));
  }, [club?.allowTrial, club?.allowWaitlist, club?.clubId]);

  const hero = useMemo(
    () => club?.heroImageUrl || club?.logoUrl || null,
    [club?.heroImageUrl, club?.logoUrl],
  );

  const uniformSizeGroups = useMemo(
    () => sizeChartOptGroups(club?.sizeChart ?? EMPTY_SIZE_CHART),
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
    setNotes('');
    setAcceptedPersonalData(false);
    setAcceptedAmka(false);
    setGuardianSignature('');
    if (club) {
      setKind(defaultPublicJoinKind(club.allowTrial, club.allowWaitlist));
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!club || !club.enabled) return;

    if (!acceptedPersonalData) {
      setError('Πρέπει να αποδεχτείτε τη συγκατάθεση επεξεργασίας προσωπικών δεδομένων.');
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
    });
    if (fieldError) {
      setError(fieldError);
      return;
    }

    setSaving(true);
    setError('');
    setDone('');

    const guardianName = fatherFirstName.trim();
    const amkaTrim = amka.trim();
    const gdprItems = gdprItemsFromPublicConsent(acceptedPersonalData, acceptedAmka);
    const amkaConsentAt = acceptedAmka ? new Date().toISOString().slice(0, 10) : '';

    const payload = {
      firstName,
      lastName,
      birthDate,
      gender,
      guardianName,
      guardianPhone,
      email: fatherEmail.trim(),
      classId: null,
      kind,
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
      gdprItems,
      amkaConsentAt,
      guardianSignature,
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
              <input
                className="field-input"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">Επώνυμο *</span>
              <input
                className="field-input"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
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
              <input
                className="field-input"
                value={fatherFirstName}
                onChange={(e) => setFatherFirstName(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">Μητρώνυμο *</span>
              <input
                className="field-input"
                value={motherFirstName}
                onChange={(e) => setMotherFirstName(e.target.value)}
                required
              />
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
              <input
                className="field-input"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                required
              />
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
              <input
                className="field-input"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">Νομός *</span>
              <input
                className="field-input"
                value={county}
                onChange={(e) => setCounty(e.target.value)}
                required
              />
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
                {uniformSizeGroups.map((group) => (
                  <optgroup key={group.category} label={group.label}>
                    {group.sizes.map((size) => (
                      <option key={`${group.category}-${size}`} value={size}>
                        {size}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          </div>

          {club.allowTrial || club.allowWaitlist ? (
            <fieldset className="public-join-kind">
              <legend>Τύπος αίτησης</legend>
              {club.allowTrial ? (
                <label>
                  <input
                    type="radio"
                    name="kind"
                    checked={kind === 'trial'}
                    onChange={() => setKind('trial')}
                  />
                  Δοκιμαστική προπόνηση
                </label>
              ) : null}
              {club.allowWaitlist ? (
                <label>
                  <input
                    type="radio"
                    name="kind"
                    checked={kind === 'waitlist'}
                    onChange={() => setKind('waitlist')}
                  />
                  Λίστα αναμονής
                </label>
              ) : null}
            </fieldset>
          ) : null}

          <label className="field">
            <span className="field-label">Σχόλια</span>
            <textarea
              className="field-input"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>

          {club.termsHtml ? (
            <div className="public-join-terms">
              <details className="public-join-terms-details">
                <summary>Επιπλέον όροι χρήσης / πολιτική απορρήτου</summary>
                <div
                  className="public-join-terms-body"
                  dangerouslySetInnerHTML={{ __html: club.termsHtml }}
                />
              </details>
            </div>
          ) : null}

          <div className="public-join-signature">
            <div className="public-join-consent-checks">
              <label className="public-reg-check">
                <input
                  type="checkbox"
                  checked={acceptedPersonalData}
                  onChange={(e) => setAcceptedPersonalData(e.target.checked)}
                  required
                />
                <span>Συναινώ *</span>
              </label>
              <label className="public-reg-check">
                <input
                  type="checkbox"
                  checked={acceptedAmka}
                  onChange={(e) => setAcceptedAmka(e.target.checked)}
                  required
                />
                <span>
                  {AMKA_CONSENT_CHECKBOX} — συγκατάθεση ΑΜΚΑ <em>(γονέας)</em> *
                </span>
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

          <Button type="submit" disabled={saving}>
            {saving ? 'Υποβολή…' : 'Υποβολή αίτησης'}
          </Button>
        </form>
      </div>
    </div>
  );
}
