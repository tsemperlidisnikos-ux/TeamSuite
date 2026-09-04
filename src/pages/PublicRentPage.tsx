import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  getClubPublicRegistration,
  getClubs,
  slugifyClubName,
} from '../auth/clubs';
import { Button } from '../components/ui/Button';
import { createId, getClubData, mutateClubData } from '../data/repository';
import type { Facility, RentalBooking, RentalCourtShare } from '../types';
import { localDateIso, localDateTimeIso } from '../utils/dates';
import { useT } from '../i18n/LocaleContext';
import { formatCurrency } from '../utils/labels';
import { listActiveFacilities } from '../utils/facilityHours';
import {
  bookingAmount,
  emptyRentalSettings,
  listRentalSlots,
  lockerRoomFeeAmount,
  ruleForFacility,
  slotIsFree,
} from '../shared/facilityRentalAvailability';

type RentClubView = {
  source: 'local' | 'remote';
  clubId: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  heroImageUrl: string | null;
  notes: string;
  publicEnabled: boolean;
  facilities: Facility[];
  prices: Array<{
    facilityId: string;
    hourlyRateFull: number;
    hourlyRateHalf: number;
    lockerRoomAvailable?: boolean;
    lockerRoomFee?: number;
  }>;
  photoLook?: 'g';
};

function formatDayChip(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  const name = d.toLocaleDateString('el-GR', { weekday: 'short' });
  return `${name} ${d.getDate()}/${d.getMonth() + 1}`;
}

export function PublicRentPage() {
  const { t } = useT();
  const { slug = '' } = useParams();
  const [club, setClub] = useState<RentClubView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [date, setDate] = useState(localDateIso());
  const [facilityId, setFacilityId] = useState('');
  const [slot, setSlot] = useState<{ startTime: string; endTime: string } | null>(null);
  const [courtShare, setCourtShare] = useState<RentalCourtShare>('full');
  const [useLockerRoom, setUseLockerRoom] = useState(false);
  const [customerLastName, setCustomerLastName] = useState('');
  const [customerFirstName, setCustomerFirstName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [saving, setSaving] = useState(false);
  const [remoteSlots, setRemoteSlots] = useState<
    Array<{ startTime: string; endTime: string; available: boolean; reason: string }>
  >([]);

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
        const rental = data.rentalSettings ?? emptyRentalSettings();
        if (!cancelled) {
          setClub({
            source: 'local',
            clubId: local.id,
            slug: settings.slug || slugifyClubName(local.name),
            name: local.name,
            logoUrl: local.logoUrl ?? null,
            heroImageUrl: rental.heroImageUrl || settings.heroImageUrl || local.logoUrl || null,
            notes: rental.notes,
            publicEnabled: rental.publicEnabled,
            photoLook: 'g',
            facilities: listActiveFacilities(data.facilities).filter((f) =>
              ruleForFacility(rental, f.id, f).enabled,
            ),
            prices: listActiveFacilities(data.facilities).map((f) => {
              const rule = ruleForFacility(rental, f.id, f);
              return {
                facilityId: f.id,
                hourlyRateFull: rule.hourlyRateFull,
                hourlyRateHalf: rule.hourlyRateHalf,
                lockerRoomAvailable: Boolean(rule.lockerRoomAvailable),
                lockerRoomFee: Number(rule.lockerRoomFee) || 0,
              };
            }),
          });
          setLoading(false);
        }
        return;
      }

      try {
        const response = await fetch(`/api/public-rent?slug=${encodeURIComponent(normalized)}`);
        const body = (await response.json()) as {
          ok?: boolean;
          error?: string;
          club?: RentClubView;
        };
        if (cancelled) return;
        if (!response.ok || !body.ok || !body.club) {
          setClub(null);
          setLoadError(body.error ?? 'Ο σύνδεσμος δεν βρέθηκε.');
          setLoading(false);
          return;
        }
        setClub({
          ...body.club,
          source: 'remote',
          heroImageUrl: body.club.heroImageUrl || body.club.logoUrl || null,
          prices: body.club.prices ?? [],
        });
      } catch {
        if (!cancelled) {
          setLoadError('Αδυναμία φόρτωσης διαθεσιμότητας.');
        }
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!club?.facilities[0]) return;
    setFacilityId((prev) => prev || club.facilities[0]!.id);
  }, [club]);

  const selectedFacility = club?.facilities.find((f) => f.id === facilityId) ?? null;

  const localSlots = useMemo(() => {
    if (!club || club.source !== 'local' || !selectedFacility) return [];
    const data = getClubData(club.clubId);
    return listRentalSlots(data, selectedFacility, date, courtShare);
  }, [club, selectedFacility, date, done, courtShare]);

  useEffect(() => {
    if (!club || club.source !== 'remote' || !selectedFacility) {
      setRemoteSlots([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const params = new URLSearchParams({
        slug: club.slug,
        date,
        facilityId: selectedFacility.id,
        courtShare,
      });
      const response = await fetch(`/api/public-rent?${params.toString()}`);
      const body = (await response.json()) as { ok?: boolean; slots?: typeof remoteSlots };
      if (!cancelled && body.ok && body.slots) setRemoteSlots(body.slots);
    })();
    return () => {
      cancelled = true;
    };
  }, [club, selectedFacility, date, done, courtShare]);

  const slots = club?.source === 'local' ? localSlots : remoteSlots;
  const days = useMemo(() => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      return localDateIso(d);
    });
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!club || !club.publicEnabled || !selectedFacility || !slot) {
      setError('Επιλέξτε γήπεδο και διαθέσιμη ώρα.');
      return;
    }
    const customerName = `${customerLastName.trim()} ${customerFirstName.trim()}`.trim();
    if (customerLastName.trim().length < 2 || customerFirstName.trim().length < 2) {
      setError('Συμπληρώστε επώνυμο και όνομα.');
      return;
    }
    setSaving(true);
    setError('');
    setDone('');

    if (club.source === 'local') {
      const data = getClubData(club.clubId);
      const facility = (data.facilities ?? []).find((f) => f.id === selectedFacility.id);
      if (!facility) {
        setSaving(false);
        setError('Το γήπεδο δεν βρέθηκε.');
        return;
      }
      const check = slotIsFree(data, facility, date, slot.startTime, slot.endTime, courtShare);
      if (!check.ok) {
        setSaving(false);
        setError(check.reason);
        return;
      }
      const rule = ruleForFacility(data.rentalSettings, facility.id, facility);
      const booking: RentalBooking = {
        id: createId('rent'),
        facilityId: facility.id,
        facilityName: facility.name,
        date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        courtShare,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerEmail: customerEmail.trim(),
        notes,
        amount:
          bookingAmount(rule, slot.startTime, slot.endTime, courtShare) +
          lockerRoomFeeAmount(rule, useLockerRoom && Boolean(rule.lockerRoomAvailable)),
        useLockerRoom,
        source: 'public',
        status: 'confirmed',
        createdAt: localDateTimeIso(),
        createdByName: 'Δημόσιο link',
      };
      mutateClubData(club.clubId, (store) => {
        if (!store.rentalBookings) store.rentalBookings = [];
        store.rentalBookings.unshift(booking);
      });
      setSaving(false);
      setDone(`Η κράτηση καταχωρήθηκε για ${date}, ${slot.startTime}–${slot.endTime}.`);
      setCustomerLastName('');
      setCustomerFirstName('');
      setCustomerPhone('');
      setCustomerEmail('');
      setNotes('');
      setSlot(null);
      setUseLockerRoom(false);
      return;
    }

    try {
      const response = await fetch('/api/public-rent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: club.slug,
          facilityId: selectedFacility.id,
          date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          courtShare,
          customerName,
          customerPhone,
          customerEmail,
          notes,
          useLockerRoom,
        }),
      });
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !body.ok) {
        setError(body.error ?? 'Αποτυχία κράτησης.');
      } else {
        setDone(`Η κράτηση καταχωρήθηκε για ${date}, ${slot.startTime}–${slot.endTime}.`);
        setCustomerLastName('');
        setCustomerFirstName('');
        setCustomerPhone('');
        setCustomerEmail('');
        setNotes('');
        setSlot(null);
        setUseLockerRoom(false);
      }
    } catch {
      setError('Αποτυχία αποστολής.');
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="public-join-page">
        <div className="public-join-card">
          <p className="muted">{t('Φόρτωση…')}</p>
        </div>
      </div>
    );
  }

  if (!club) {
    return (
      <div className="public-join-page">
        <div className="public-join-card">
          <p>{loadError || t('Ο σύνδεσμος δεν βρέθηκε.')}</p>
          <Link to="/">{t('Επιστροφή')}</Link>
        </div>
      </div>
    );
  }

  if (!club.publicEnabled) {
    return (
      <div className="public-join-page">
        <div className="public-join-card">
          <h1>{club.name}</h1>
          <p>{t('Η δημόσια ενοικίαση δεν είναι ενεργή.')}</p>
        </div>
      </div>
    );
  }

  const selectedRule = selectedFacility
    ? ruleForFacility(
        club.source === 'local' ? getClubData(club.clubId).rentalSettings : emptyRentalSettings(),
        selectedFacility.id,
        selectedFacility,
      )
    : null;
  const priceRow = club.prices?.find((p) => p.facilityId === selectedFacility?.id);
  const lockerFee =
    club.source === 'local'
      ? Number(selectedRule?.lockerRoomFee) || 0
      : Number(priceRow?.lockerRoomFee) || 0;
  const hourlyRate =
    courtShare === 'half' ? priceRow?.hourlyRateHalf ?? 0 : priceRow?.hourlyRateFull ?? 0;
  const hero = club.heroImageUrl || club.logoUrl;
  const amount =
    selectedFacility && slot
      ? (club.source === 'local' && selectedRule
          ? bookingAmount(selectedRule, slot.startTime, slot.endTime, courtShare)
          : (() => {
              const start = slot.startTime.split(':').map(Number);
              const end = slot.endTime.split(':').map(Number);
              const hours =
                ((end[0] || 0) * 60 + (end[1] || 0) - ((start[0] || 0) * 60 + (start[1] || 0))) / 60;
              const rate =
                courtShare === 'half' ? priceRow?.hourlyRateHalf ?? 0 : priceRow?.hourlyRateFull ?? 0;
              return Math.round(Math.max(0, hours) * rate * 100) / 100;
            })()) + (useLockerRoom ? lockerFee : 0)
      : null;
  const totalDisplay = amount ?? hourlyRate + (useLockerRoom ? lockerFee : 0);

  return (
    <div className="public-join-page">
      <div className="public-join-shell public-rent-shell">
        <header className="public-join-hero public-rent-hero">
          {hero ? (
            <img className="public-join-hero-img public-rent-hero-img" src={hero} alt={club.name} />
          ) : (
            <div className="public-join-hero-fallback">{club.name.slice(0, 1)}</div>
          )}
        </header>
        {club.notes ? <p className="muted public-rent-notes">{club.notes}</p> : null}

        {done ? <p className="muted">{done}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}

        {club.facilities.length === 0 ? (
          <div className="public-join-card">
            <p>{t('Δεν έχουν δηλωθεί γήπεδα προς ενοικίαση.')}</p>
          </div>
        ) : (
          <form className="public-join-card public-rent-form" onSubmit={(e) => void handleSubmit(e)}>
            <div className="public-rent-section public-rent-look public-rent-look-g">
            <p className="field-label">{t('Επιλογή τοποθεσίας')}</p>
            <div className="public-rent-facilities">
              {club.facilities.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={
                    facilityId === f.id ? 'public-rent-facility is-on' : 'public-rent-facility'
                  }
                  onClick={() => {
                    setFacilityId(f.id);
                    setSlot(null);
                    setUseLockerRoom(false);
                  }}
                >
                  {f.photoUrl ? (
                    <img src={f.photoUrl} alt={f.name} />
                  ) : (
                    <div className="public-rent-facility-fallback">{f.name.slice(0, 1)}</div>
                  )}
                  <span>{f.name}</span>
                </button>
              ))}
            </div>
            </div>
            <div className="public-rent-section">
            <p className="field-label">{t('Ημερομηνία')}</p>
            <div className="rental-date-strip">
              {days.map((iso) => (
                <button
                  key={iso}
                  type="button"
                  className={date === iso ? 'rental-date-chip is-on' : 'rental-date-chip'}
                  onClick={() => {
                    setDate(iso);
                    setSlot(null);
                  }}
                >
                  {formatDayChip(iso)}
                </button>
              ))}
            </div>
            </div>
            <div className="public-rent-share-row">
            <div className="field">
              <span className="field-label">{t('Τμήμα γηπέδου')}</span>
              <div className="rental-day-row">
                <button
                  type="button"
                  className={courtShare === 'full' ? 'rental-day is-on' : 'rental-day'}
                  onClick={() => {
                    setCourtShare('full');
                    setSlot(null);
                  }}
                >
                  {t('Ολόκληρο')}
                  {priceRow?.hourlyRateFull
                    ? ` · ${formatCurrency(priceRow.hourlyRateFull)}/ώρα`
                    : ''}
                </button>
                <button
                  type="button"
                  className={courtShare === 'half' ? 'rental-day is-on' : 'rental-day'}
                  onClick={() => {
                    setCourtShare('half');
                    setSlot(null);
                  }}
                >
                  {t('Μισό')}
                  {priceRow?.hourlyRateHalf
                    ? ` · ${formatCurrency(priceRow.hourlyRateHalf)}/ώρα`
                    : ''}
                </button>
              </div>
            </div>
            <div className="field">
              <span className="field-label">{t('Χρήση αποδυτηρίου')}</span>
              <div className="rental-day-row">
                <button
                  type="button"
                  className={useLockerRoom ? 'rental-day is-on' : 'rental-day'}
                  onClick={() => setUseLockerRoom(true)}
                >
                  {t('Ναι')}
                  {lockerFee > 0 ? ` · +${formatCurrency(lockerFee)}` : ''}
                </button>
                <button
                  type="button"
                  className={!useLockerRoom ? 'rental-day is-on' : 'rental-day'}
                  onClick={() => setUseLockerRoom(false)}
                >
                  {t('Όχι')}
                </button>
              </div>
            </div>
            <div className="field public-rent-total">
              <span className="field-label">{t('Σύνολο')}</span>
              <div className="public-rent-total-value">{formatCurrency(totalDisplay)}</div>
            </div>
            </div>
            <div className="public-rent-section">
            <p className="field-label">{t('Ώρα')}</p>
            <div className="rental-slot-grid">
              {slots.filter((s) => s.available).length === 0 ? (
                <p className="muted">{t('Δεν υπάρχουν διαθέσιμες ώρες.')}</p>
              ) : (
                slots.map((item) => (
                  <button
                    key={`${item.startTime}-${item.endTime}`}
                    type="button"
                    disabled={!item.available}
                    className={
                      slot?.startTime === item.startTime && slot.endTime === item.endTime
                        ? 'rental-slot is-on'
                        : item.available
                          ? 'rental-slot'
                          : 'rental-slot is-busy'
                    }
                    onClick={() => setSlot({ startTime: item.startTime, endTime: item.endTime })}
                  >
                    {item.startTime}–{item.endTime}
                  </button>
                ))
              )}
            </div>
            </div>
            <div className="public-rent-details">
            <label className="field">
              <span className="field-label">{t('Επώνυμο')}</span>
              <input
                className="field-input"
                required
                minLength={2}
                value={customerLastName}
                onChange={(e) => setCustomerLastName(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">{t('Όνομα')}</span>
              <input
                className="field-input"
                required
                minLength={2}
                value={customerFirstName}
                onChange={(e) => setCustomerFirstName(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">{t('Τηλέφωνο')}</span>
              <input
                className="field-input"
                required
                minLength={6}
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">Email</span>
              <input
                className="field-input"
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">{t('Σημείωση')}</span>
              <input className="field-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            </div>
            <div className="rental-submit-row">
              <Button type="submit" disabled={saving}>
                {saving ? t('Αποστολή…') : t('Κράτηση')}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
