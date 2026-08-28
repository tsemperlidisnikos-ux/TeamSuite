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
import { formatCurrency } from '../utils/labels';
import { listActiveFacilities } from '../utils/facilityHours';
import {
  bookingAmount,
  courtShareLabel,
  emptyRentalSettings,
  listRentalSlots,
  ruleForFacility,
  slotIsFree,
} from '../shared/facilityRentalAvailability';

type RentClubView = {
  source: 'local' | 'remote';
  clubId: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  notes: string;
  publicEnabled: boolean;
  facilities: Facility[];
  prices: Array<{ facilityId: string; hourlyRateFull: number; hourlyRateHalf: number }>;
};

function formatDayChip(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  const name = d.toLocaleDateString('el-GR', { weekday: 'short' });
  return `${name} ${d.getDate()}/${d.getMonth() + 1}`;
}

export function PublicRentPage() {
  const { slug = '' } = useParams();
  const [club, setClub] = useState<RentClubView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [date, setDate] = useState(localDateIso());
  const [facilityId, setFacilityId] = useState('');
  const [slot, setSlot] = useState<{ startTime: string; endTime: string } | null>(null);
  const [courtShare, setCourtShare] = useState<RentalCourtShare>('full');
  const [customerName, setCustomerName] = useState('');
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
            notes: rental.notes,
            publicEnabled: rental.publicEnabled,
            facilities: listActiveFacilities(data.facilities).filter((f) =>
              ruleForFacility(rental, f.id, f).enabled,
            ),
            prices: listActiveFacilities(data.facilities).map((f) => {
              const rule = ruleForFacility(rental, f.id, f);
              return {
                facilityId: f.id,
                hourlyRateFull: rule.hourlyRateFull,
                hourlyRateHalf: rule.hourlyRateHalf,
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
        setClub({ ...body.club, source: 'remote', prices: body.club.prices ?? [] });
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
        amount: bookingAmount(rule, slot.startTime, slot.endTime, courtShare),
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
      setCustomerName('');
      setCustomerPhone('');
      setCustomerEmail('');
      setNotes('');
      setSlot(null);
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
        }),
      });
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !body.ok) {
        setError(body.error ?? 'Αποτυχία κράτησης.');
      } else {
        setDone(`Η κράτηση καταχωρήθηκε για ${date}, ${slot.startTime}–${slot.endTime}.`);
        setCustomerName('');
        setCustomerPhone('');
        setCustomerEmail('');
        setNotes('');
        setSlot(null);
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
          <p className="muted">Φόρτωση…</p>
        </div>
      </div>
    );
  }

  if (!club) {
    return (
      <div className="public-join-page">
        <div className="public-join-card">
          <p>{loadError || 'Ο σύνδεσμος δεν βρέθηκε.'}</p>
          <Link to="/">Επιστροφή</Link>
        </div>
      </div>
    );
  }

  if (!club.publicEnabled) {
    return (
      <div className="public-join-page">
        <div className="public-join-card">
          <h1>{club.name}</h1>
          <p>Η δημόσια ενοικίαση δεν είναι ενεργή.</p>
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
  const amount =
    selectedFacility && slot
      ? club.source === 'local' && selectedRule
        ? bookingAmount(selectedRule, slot.startTime, slot.endTime, courtShare)
        : (() => {
            const start = slot.startTime.split(':').map(Number);
            const end = slot.endTime.split(':').map(Number);
            const hours =
              ((end[0] || 0) * 60 + (end[1] || 0) - ((start[0] || 0) * 60 + (start[1] || 0))) / 60;
            const rate =
              courtShare === 'half' ? priceRow?.hourlyRateHalf ?? 0 : priceRow?.hourlyRateFull ?? 0;
            return Math.round(Math.max(0, hours) * rate * 100) / 100;
          })()
      : null;

  return (
    <div className="public-join-page">
      <div className="public-join-shell">
        <header className="public-join-hero">
          {club.logoUrl ? (
            <img className="public-join-hero-img" src={club.logoUrl} alt={club.name} />
          ) : (
            <div className="public-join-hero-fallback">{club.name.slice(0, 1)}</div>
          )}
          <div className="public-join-hero-copy">
            <p className="public-join-eyebrow">Ενοικίαση γηπέδου</p>
            <h1>{club.name}</h1>
            {club.notes ? <p>{club.notes}</p> : null}
          </div>
        </header>

        {done ? <p className="muted">{done}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}

        {club.facilities.length === 0 ? (
          <div className="public-join-card">
            <p>Δεν έχουν δηλωθεί γήπεδα προς ενοικίαση.</p>
          </div>
        ) : (
          <form className="public-join-card" onSubmit={(e) => void handleSubmit(e)}>
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
            <label className="field">
              <span className="field-label">Γήπεδο</span>
              <select
                className="field-input"
                value={facilityId}
                onChange={(e) => {
                  setFacilityId(e.target.value);
                  setSlot(null);
                }}
              >
                {club.facilities.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="field">
              <span className="field-label">Τμήμα γηπέδου</span>
              <div className="rental-day-row">
                <button
                  type="button"
                  className={courtShare === 'full' ? 'rental-day is-on' : 'rental-day'}
                  onClick={() => {
                    setCourtShare('full');
                    setSlot(null);
                  }}
                >
                  Ολόκληρο
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
                  Μισό
                  {priceRow?.hourlyRateHalf
                    ? ` · ${formatCurrency(priceRow.hourlyRateHalf)}/ώρα`
                    : ''}
                </button>
              </div>
            </div>
            <p className="field-label">Ώρα</p>
            <div className="rental-slot-grid">
              {slots.filter((s) => s.available).length === 0 ? (
                <p className="muted">Δεν υπάρχουν διαθέσιμες ώρες.</p>
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
            <label className="field">
              <span className="field-label">Ονοματεπώνυμο</span>
              <input
                className="field-input"
                required
                minLength={2}
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">Τηλέφωνο</span>
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
              <span className="field-label">Σημείωση</span>
              <input className="field-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            {amount != null && amount > 0 ? (
              <p>
                Εκτιμώμενο ποσό ({courtShareLabel(courtShare)}): {formatCurrency(amount)}
              </p>
            ) : null}
            <div className="rental-submit-row">
              <Button type="submit" disabled={saving}>
                {saving ? 'Αποστολή…' : 'Κράτηση'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
