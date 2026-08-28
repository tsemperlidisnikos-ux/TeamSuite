import { useEffect, useMemo, useState } from 'react';
import { ClipboardCopy, ExternalLink } from 'lucide-react';
import * as rentalBookingsService from '../api/services/rentalBookingsService';
import { getSession } from '../auth/auth';
import { getClubById, getClubPublicRegistration, slugifyClubName } from '../auth/clubs';
import { Button } from './ui/Button';
import { useAppData } from '../hooks/useAppData';
import { getPreviewClubId } from '../platform/platformConfig';
import type { Facility, FacilityRentalRule, RentalCourtShare, RentalSettings } from '../types';
import { localDateIso } from '../utils/dates';
import { formatCurrency } from '../utils/labels';
import { listActiveFacilities } from '../utils/facilityHours';
import {
  RENTAL_SLOT_OPTIONS,
  RENTAL_WEEKDAYS,
  bookingAmount,
  courtShareLabel,
  defaultRuleForFacility,
  emptyRentalSettings,
  listRentalSlots,
  occupancyForDate,
  ruleForFacility,
} from '../shared/facilityRentalAvailability';
import type { RentalBookingInput } from '../schemas';

function nextDays(count: number): string[] {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return localDateIso(d);
  });
}

function formatDayChip(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  const name = d.toLocaleDateString('el-GR', { weekday: 'short' });
  return `${name} ${d.getDate()}/${d.getMonth() + 1}`;
}

export function FacilityRentalPanel() {
  const { data, refresh } = useAppData();
  const session = getSession();
  const clubId = getPreviewClubId() ?? session?.clubId ?? null;
  const club = clubId ? getClubById(clubId) : null;
  const slug = club
    ? (getClubPublicRegistration(club.id).slug || slugifyClubName(club.name)).trim()
    : '';
  const rentPath = slug ? `/rent/${slug}` : '';
  const rentUrl =
    typeof window !== 'undefined' && rentPath ? `${window.location.origin}${rentPath}` : rentPath;

  const facilities = useMemo(() => listActiveFacilities(data.facilities), [data.facilities]);
  const settings = data.rentalSettings ?? emptyRentalSettings();

  const [draft, setDraft] = useState<RentalSettings>(settings);
  const [date, setDate] = useState(localDateIso());
  const [facilityId, setFacilityId] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<{ startTime: string; endTime: string } | null>(
    null,
  );
  const [courtShare, setCourtShare] = useState<RentalCourtShare>('full');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [booking, setBooking] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setDraft(data.rentalSettings ?? emptyRentalSettings());
  }, [data.rentalSettings]);

  useEffect(() => {
    if (!facilityId && facilities[0]) setFacilityId(facilities[0].id);
  }, [facilities, facilityId]);

  useEffect(() => {
    if (!clubId) return;
    const scopedClubId = clubId;
    let cancelled = false;
    async function pullRentals() {
      const result = await rentalBookingsService.pullRemoteRentalBookings(scopedClubId);
      if (!cancelled && result.merged > 0) refresh();
    }
    void pullRentals();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void pullRentals();
    };
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(() => void pullRentals(), 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [clubId, refresh]);

  const selectedFacility = facilities.find((f) => f.id === facilityId) ?? null;
  const slots = useMemo(
    () => (selectedFacility ? listRentalSlots(data, selectedFacility, date, courtShare) : []),
    [data, selectedFacility, date, courtShare],
  );
  const occupied = useMemo(
    () => (selectedFacility ? occupancyForDate(data, selectedFacility, date) : []),
    [data, selectedFacility, date],
  );
  const selectedRule = selectedFacility
    ? ruleForFacility(draft, selectedFacility.id, selectedFacility)
    : null;
  const upcoming = useMemo(
    () =>
      [...(data.rentalBookings ?? [])]
        .filter((item) => item.status !== 'cancelled' && item.date >= localDateIso())
        .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`)),
    [data.rentalBookings],
  );

  function ruleOf(facility: Facility): FacilityRentalRule {
    return ruleForFacility(draft, facility.id, facility);
  }

  function patchRule(facilityIdToPatch: string, patch: Partial<FacilityRentalRule>) {
    setDraft((prev) => {
      const facility = facilities.find((f) => f.id === facilityIdToPatch);
      const current = ruleForFacility(prev, facilityIdToPatch, facility);
      const nextRule = { ...current, ...patch };
      const others = prev.rules.filter((r) => r.facilityId !== facilityIdToPatch);
      return { ...prev, rules: [...others, nextRule] };
    });
  }

  function patchWindow(facilityIdToPatch: string, patch: Partial<FacilityRentalRule['windows'][0]>) {
    const facility = facilities.find((f) => f.id === facilityIdToPatch);
    const current = ruleForFacility(draft, facilityIdToPatch, facility);
    const window = { ...(current.windows[0] ?? defaultRuleForFacility(facility!).windows[0]), ...patch };
    patchRule(facilityIdToPatch, { windows: [window] });
  }

  function toggleDay(facilityIdToPatch: string, day: number) {
    const facility = facilities.find((f) => f.id === facilityIdToPatch);
    const current = ruleForFacility(draft, facilityIdToPatch, facility);
    const window = current.windows[0] ?? defaultRuleForFacility(facility!).windows[0];
    const days = window.days.includes(day)
      ? window.days.filter((d) => d !== day)
      : [...window.days, day];
    patchWindow(facilityIdToPatch, { days });
  }

  async function saveSettings() {
    setSaving(true);
    setError('');
    setMessage('');
    const result = await rentalBookingsService.saveRentalSettings(draft);
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Αποτυχία αποθήκευσης.');
      return;
    }
    setMessage('Οι ρυθμίσεις ενοικίασης αποθηκεύτηκαν.');
    refresh();
  }

  async function copyLink() {
    if (!rentUrl) return;
    try {
      await navigator.clipboard.writeText(rentUrl);
      setMessage('Το δημόσιο link αντιγράφηκε.');
    } catch {
      setError('Δεν ήταν δυνατή η αντιγραφή.');
    }
  }

  async function submitBooking() {
    if (!selectedFacility || !selectedSlot) {
      setError('Επιλέξτε διαθέσιμη ώρα.');
      return;
    }
    setBooking(true);
    setError('');
    setMessage('');
    const payload: RentalBookingInput = {
      facilityId: selectedFacility.id,
      date,
      startTime: selectedSlot.startTime,
      endTime: selectedSlot.endTime,
      courtShare,
      customerName,
      customerPhone,
      customerEmail,
      notes,
      amount: selectedRule
        ? bookingAmount(selectedRule, selectedSlot.startTime, selectedSlot.endTime, courtShare)
        : 0,
    };
    const result = await rentalBookingsService.createRentalBooking(payload, 'secretariat');
    setBooking(false);
    if (!result.success) {
      setError(result.error ?? 'Αποτυχία καταχώρησης.');
      return;
    }
    setMessage('Η κράτηση καταχωρήθηκε.');
    setCustomerName('');
    setCustomerPhone('');
    setCustomerEmail('');
    setNotes('');
    setSelectedSlot(null);
    refresh();
  }

  async function cancelBooking(id: string) {
    if (!confirm('Ακύρωση κράτησης;')) return;
    const result = await rentalBookingsService.cancelRentalBooking(id);
    if (!result.success) {
      setError(result.error ?? 'Αποτυχία ακύρωσης.');
      return;
    }
    refresh();
  }

  if (facilities.length === 0) {
    return (
      <div className="prints-registry-section">
        <p className="prints-registry-desc">
          Δεν υπάρχουν ενεργά γήπεδα. Πρόσθεσε εγκαταστάσεις από Ρυθμίσεις → Γήπεδο.
        </p>
      </div>
    );
  }

  return (
    <div className="prints-registry-section rental-panel">
            <p className="prints-registry-desc">
        Δήλωσε ποια γήπεδα ενοικιάζονται και σε ποιες ώρες. Οι ώρες προπόνησης τμημάτων, έκτακτες
        προπονήσεις και αγώνες αφαιρούνται αυτόματα. Η γραμματεία καταχωρεί κράτηση εδώ· το δημόσιο
        link δείχνει τις ίδιες διαθέσιμες ώρες.
      </p>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="muted">{message}</p> : null}

      <div className="rental-public-box">
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={draft.publicEnabled}
            onChange={(e) => setDraft((prev) => ({ ...prev, publicEnabled: e.target.checked }))}
          />
          Δημόσιο link ενεργό
        </label>
        <div className="rental-public-url">
          <input className="field-input" readOnly value={rentUrl || 'Ορίστε slug στις Ρυθμίσεις → Δημόσια εγγραφή'} />
          <Button type="button" variant="secondary" onClick={() => void copyLink()} disabled={!rentUrl}>
            <ClipboardCopy size={16} /> Αντιγραφή
          </Button>
          {rentUrl ? (
            <a className="btn btn-secondary" href={rentUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={16} /> Άνοιγμα
            </a>
          ) : null}
        </div>
        <label className="field">
          <span className="field-label">Σημείωση στο δημόσιο link</span>
          <input
            className="field-input"
            value={draft.notes}
            onChange={(e) => setDraft((prev) => ({ ...prev, notes: e.target.value }))}
            placeholder="π.χ. Ελάχιστη διάρκεια 1 ώρα. Πληρωμή στη γραμματεία."
          />
        </label>
      </div>

      <div className="rental-facility-list">
        {facilities.map((facility) => {
          const rule = ruleOf(facility);
          const window = rule.windows[0] ?? defaultRuleForFacility(facility).windows[0];
          return (
            <article key={facility.id} className="rental-facility-card">
              <div className="rental-facility-head">
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={(e) => patchRule(facility.id, { enabled: e.target.checked })}
                  />
                  <strong>{facility.name}</strong>
                </label>
                <span className="muted">{facility.sports.join(', ')}</span>
              </div>
              <div className="rental-day-row">
                {RENTAL_WEEKDAYS.map((day) => (
                  <button
                    key={day.value}
                    type="button"
                    className={window.days.includes(day.value) ? 'rental-day is-on' : 'rental-day'}
                    onClick={() => toggleDay(facility.id, day.value)}
                    disabled={!rule.enabled}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
              <div className="rental-hours-row">
                <label className="field">
                  <span className="field-label">Από</span>
                  <input
                    className="field-input"
                    type="time"
                    value={window.startTime}
                    disabled={!rule.enabled}
                    onChange={(e) => patchWindow(facility.id, { startTime: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span className="field-label">Έως</span>
                  <input
                    className="field-input"
                    type="time"
                    value={window.endTime === '00:00' ? '23:59' : window.endTime}
                    disabled={!rule.enabled}
                    onChange={(e) => patchWindow(facility.id, { endTime: e.target.value || '00:00' })}
                  />
                </label>
                <label className="field">
                  <span className="field-label">Διάρκεια</span>
                  <select
                    className="field-input"
                    value={rule.slotMinutes}
                    disabled={!rule.enabled}
                    onChange={(e) =>
                      patchRule(facility.id, { slotMinutes: Number(e.target.value) || 60 })
                    }
                  >
                    {RENTAL_SLOT_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n} λεπτά
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">€/ώρα ολόκληρο</span>
                  <input
                    className="field-input"
                    type="number"
                    min={0}
                    step="0.01"
                    value={rule.hourlyRateFull || ''}
                    disabled={!rule.enabled}
                    onChange={(e) => {
                      const full = Number(e.target.value) || 0;
                      patchRule(facility.id, { hourlyRateFull: full, hourlyRate: full });
                    }}
                  />
                </label>
                <label className="field">
                  <span className="field-label">€/ώρα μισό</span>
                  <input
                    className="field-input"
                    type="number"
                    min={0}
                    step="0.01"
                    value={rule.hourlyRateHalf || ''}
                    disabled={!rule.enabled}
                    onChange={(e) =>
                      patchRule(facility.id, { hourlyRateHalf: Number(e.target.value) || 0 })
                    }
                  />
                </label>
              </div>
            </article>
          );
        })}
      </div>

      <div className="prints-filter-actions">
        <Button type="button" onClick={() => void saveSettings()} disabled={saving}>
          {saving ? 'Αποθήκευση…' : 'Αποθήκευση διαθεσιμότητας'}
        </Button>
      </div>

      <h3 className="rental-subhead">Καταχώρηση κράτησης</h3>
      <div className="rental-date-strip">
        {nextDays(14).map((iso) => (
          <button
            key={iso}
            type="button"
            className={date === iso ? 'rental-date-chip is-on' : 'rental-date-chip'}
            onClick={() => {
              setDate(iso);
              setSelectedSlot(null);
            }}
          >
            {formatDayChip(iso)}
          </button>
        ))}
      </div>
      <div className="rental-book-grid">
        <label className="field">
          <span className="field-label">Γήπεδο</span>
          <select
            className="field-input"
            value={facilityId}
            onChange={(e) => {
              setFacilityId(e.target.value);
              setSelectedSlot(null);
            }}
          >
            {facilities.map((f) => (
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
                setSelectedSlot(null);
              }}
            >
              Ολόκληρο
              {selectedRule?.hourlyRateFull
                ? ` · ${formatCurrency(selectedRule.hourlyRateFull)}/ώρα`
                : ''}
            </button>
            <button
              type="button"
              className={courtShare === 'half' ? 'rental-day is-on' : 'rental-day'}
              onClick={() => {
                setCourtShare('half');
                setSelectedSlot(null);
              }}
            >
              Μισό
              {selectedRule?.hourlyRateHalf
                ? ` · ${formatCurrency(selectedRule.hourlyRateHalf)}/ώρα`
                : ''}
            </button>
          </div>
        </div>
        <label className="field">
          <span className="field-label">Ονοματεπώνυμο</span>
          <input
            className="field-input"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Τηλέφωνο</span>
          <input
            className="field-input"
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
      </div>

      <p className="field-label">Διαθέσιμες ώρες</p>
      {slots.filter((s) => s.available).length === 0 ? (
        <p className="muted">Δεν υπάρχουν ελεύθερες ώρες ενοικίασης για αυτή την ημερομηνία.</p>
      ) : (
        <div className="rental-slot-grid">
          {slots.map((slot) => (
            <button
              key={`${slot.startTime}-${slot.endTime}`}
              type="button"
              disabled={!slot.available}
              className={
                selectedSlot?.startTime === slot.startTime && selectedSlot.endTime === slot.endTime
                  ? 'rental-slot is-on'
                  : slot.available
                    ? 'rental-slot'
                    : 'rental-slot is-busy'
              }
              title={slot.available ? '' : slot.reason}
              onClick={() => setSelectedSlot({ startTime: slot.startTime, endTime: slot.endTime })}
            >
              {slot.startTime}–{slot.endTime}
              {!slot.available ? <span>{slot.reason}</span> : null}
            </button>
          ))}
        </div>
      )}
      {occupied.length > 0 ? (
        <p className="muted">
          Κλειστά λόγω προγράμματος:{' '}
          {occupied
            .map((b) => `${b.reason} ${String(Math.floor(b.startMin / 60)).padStart(2, '0')}:${String(b.startMin % 60).padStart(2, '0')}`)
            .join(' · ')}
        </p>
      ) : null}

      <label className="field">
        <span className="field-label">Σημείωση κράτησης</span>
        <input className="field-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      {selectedSlot && selectedRule ? (
        <p>
          Ποσό: {formatCurrency(bookingAmount(selectedRule, selectedSlot.startTime, selectedSlot.endTime, courtShare))}
        </p>
      ) : null}
      <div className="prints-filter-actions">
        <Button type="button" onClick={() => void submitBooking()} disabled={booking}>
          {booking ? 'Καταχώρηση…' : 'Καταχώρηση κράτησης'}
        </Button>
      </div>

      <h3 className="rental-subhead">Επερχόμενες κρατήσεις</h3>
      <div className="table-wrap">
        <table className="page-table">
          <thead>
            <tr>
              <th>Ημερομηνία</th>
              <th>Ώρα</th>
              <th>Γήπεδο</th>
              <th>Τμήμα</th>
              <th>Όνομα</th>
              <th>Τηλ.</th>
              <th>Πηγή</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {upcoming.length === 0 ? (
              <tr>
                <td colSpan={8}>Δεν υπάρχουν κρατήσεις.</td>
              </tr>
            ) : (
              upcoming.map((row) => (
                <tr key={row.id}>
                  <td>{row.date}</td>
                  <td>
                    {row.startTime}–{row.endTime}
                  </td>
                  <td>{row.facilityName}</td>
                  <td>{courtShareLabel(row.courtShare)}</td>
                  <td>{row.customerName}</td>
                  <td>{row.customerPhone}</td>
                  <td>{row.source === 'public' ? 'Δημόσιο link' : 'Γραμματεία'}</td>
                  <td>
                    <Button type="button" variant="ghost" onClick={() => void cancelBooking(row.id)}>
                      Ακύρωση
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
