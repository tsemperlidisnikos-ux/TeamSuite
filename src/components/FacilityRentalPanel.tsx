import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { ClipboardCopy, Download, ExternalLink, ImagePlus, Trash2 } from 'lucide-react';
import * as rentalBookingsService from '../api/services/rentalBookingsService';
import * as facilitiesService from '../api/services/facilitiesService';
import { getSession } from '../auth/auth';
import { getClubById, getClubPublicRegistration, slugifyClubName } from '../auth/clubs';
import { Button } from './ui/Button';
import { useAppData } from '../hooks/useAppData';
import { useT } from '../i18n/LocaleContext';
import { getPreviewClubId } from '../platform/platformConfig';
import type { FacilityInput, RentalBookingInput } from '../schemas';
import type { Facility, FacilityRentalRule, RentalCourtShare, RentalSettings } from '../types';
import { localDateIso } from '../utils/dates';
import { formatCurrency } from '../utils/labels';
import { listActiveFacilities } from '../utils/facilityHours';
import { optimizeCoverImageDataUrl } from '../utils/clubLogoFile';
import {
  RENTAL_SLOT_OPTIONS,
  RENTAL_WEEKDAYS,
  bookingAmount,
  courtShareLabel,
  defaultRuleForFacility,
  emptyRentalSettings,
  listRentalSlots,
  lockerRoomFeeAmount,
  occupancyForDate,
  ruleForFacility,
} from '../shared/facilityRentalAvailability';

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
  const { t } = useT();
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
  const qrImageUrl = rentUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=10&data=${encodeURIComponent(rentUrl)}`
    : '';

  const facilities = useMemo(() => listActiveFacilities(data.facilities), [data.facilities]);
  const settings = data.rentalSettings ?? emptyRentalSettings();

  const [draft, setDraft] = useState<RentalSettings>(settings);
  const [date, setDate] = useState(localDateIso());
  const [facilityId, setFacilityId] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<{ startTime: string; endTime: string } | null>(
    null,
  );
  const [courtShare, setCourtShare] = useState<RentalCourtShare>('full');
  const [useLockerRoom, setUseLockerRoom] = useState(false);
  const [customerLastName, setCustomerLastName] = useState('');
  const [customerFirstName, setCustomerFirstName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [specialDiscount, setSpecialDiscount] = useState('');
  const [saving, setSaving] = useState(false);
  const [booking, setBooking] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [panelTab, setPanelTab] = useState<'public' | 'availability' | 'bookings'>('availability');
  const heroFileRef = useRef<HTMLInputElement>(null);
  const facilityPhotoRefs = useRef<Record<string, HTMLInputElement | null>>({});

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
  const baseAmount =
    selectedSlot && selectedRule
      ? bookingAmount(selectedRule, selectedSlot.startTime, selectedSlot.endTime, courtShare) +
        lockerRoomFeeAmount(selectedRule, useLockerRoom)
      : 0;
  const discountValue = Math.max(0, Number(specialDiscount.replace(',', '.')) || 0);
  const payableAmount = Math.max(0, Math.round((baseAmount - discountValue) * 100) / 100);
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
    const result = await rentalBookingsService.saveRentalSettings({ ...draft, photoLook: 'g' });
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Αποτυχία αποθήκευσης.');
      return;
    }
    setMessage('Οι ρυθμίσεις ενοικίασης αποθηκεύτηκαν.');
    refresh();
  }

  async function readCoverFile(file: File): Promise<string> {
    if (!file.type.startsWith('image/')) {
      throw new Error('Επιλέξτε εικόνα (JPG, PNG, WEBP).');
    }
    if (file.size > 2_000_000) {
      throw new Error('Η φωτογραφία πρέπει να είναι έως 2MB.');
    }
    return optimizeCoverImageDataUrl(file);
  }

  async function handleHeroFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await readCoverFile(file);
      setDraft((prev) => ({ ...prev, heroImageUrl: dataUrl }));
      setError('');
      setMessage('Η φωτογραφία δημόσιου link ενημερώθηκε — πατήστε Αποθήκευση διαθεσιμότητας.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Αποτυχία ανάγνωσης φωτογραφίας.');
    }
  }

  async function handleFacilityPhoto(facility: Facility, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await readCoverFile(file);
      const result = await facilitiesService.updateFacility(facility.id, {
        name: facility.name,
        active: facility.active,
        sports: facility.sports,
        timeLayout: (facility.timeLayout as FacilityInput['timeLayout']) || '08:00-00:00-15',
        sortOrder: facility.sortOrder,
        photoUrl: dataUrl,
      });
      if (!result.success) {
        setError(result.error ?? 'Αποτυχία αποθήκευσης φωτογραφίας γηπέδου.');
        return;
      }
      setError('');
      setMessage(`Η φωτογραφία του «${facility.name}» αποθηκεύτηκε.`);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Αποτυχία ανάγνωσης φωτογραφίας.');
    }
  }

  async function removeFacilityPhoto(facility: Facility) {
    const result = await facilitiesService.updateFacility(facility.id, {
      name: facility.name,
      active: facility.active,
      sports: facility.sports,
      timeLayout: (facility.timeLayout as FacilityInput['timeLayout']) || '08:00-00:00-15',
      sortOrder: facility.sortOrder,
      photoUrl: null,
    });
    if (!result.success) {
      setError(result.error ?? 'Αποτυχία αφαίρεσης φωτογραφίας.');
      return;
    }
    setMessage(`Αφαιρέθηκε η φωτογραφία του «${facility.name}».`);
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

  async function downloadQr() {
    if (!qrImageUrl) return;
    try {
      const response = await fetch(qrImageUrl);
      if (!response.ok) throw new Error('QR fetch failed');
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const slugPart = (slug || 'club').replace(/[^a-z0-9-]/gi, '-');
      anchor.href = objectUrl;
      anchor.download = `rent-${slugPart}-qr.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      setMessage('Το QR ενοικίασης κατέβηκε.');
    } catch {
      window.open(qrImageUrl, '_blank', 'noopener,noreferrer');
      setMessage('Άνοιξε το QR σε νέα καρτέλα — αποθήκευσέ το από εκεί.');
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
      useLockerRoom: useLockerRoom && Boolean(selectedRule?.lockerRoomAvailable),
      customerName: `${customerLastName.trim()} ${customerFirstName.trim()}`.trim(),
      customerPhone,
      customerEmail,
      notes,
      amount: payableAmount,
      specialDiscount: discountValue,
    };
    const result = await rentalBookingsService.createRentalBooking(payload, 'secretariat');
    setBooking(false);
    if (!result.success) {
      setError(result.error ?? 'Αποτυχία καταχώρησης.');
      return;
    }
    setMessage('Η κράτηση καταχωρήθηκε.');
    setCustomerLastName('');
    setCustomerFirstName('');
    setCustomerPhone('');
    setCustomerEmail('');
    setNotes('');
    setSpecialDiscount('');
    setSelectedSlot(null);
    setUseLockerRoom(false);
    refresh();
  }

  async function cancelBooking(id: string) {
    if (!confirm(t('Ακύρωση κράτησης;'))) return;
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

      <div className="tabs rental-panel-tabs">
        <button
          type="button"
          className={panelTab === 'public' ? 'tab active' : 'tab'}
          onClick={() => setPanelTab('public')}
        >
          {t('Δημόσιο link')}
        </button>
        <button
          type="button"
          className={panelTab === 'availability' ? 'tab active' : 'tab'}
          onClick={() => setPanelTab('availability')}
        >
          {t('Διαθεσιμότητα')}
        </button>
        <button
          type="button"
          className={panelTab === 'bookings' ? 'tab active' : 'tab'}
          onClick={() => setPanelTab('bookings')}
        >
          {t('Κρατήσεις')}
        </button>
      </div>

      {panelTab === 'public' ? (
      <div className="rental-public-box">
        <div className="rental-public-toolbar">
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={draft.publicEnabled}
            onChange={(e) => setDraft((prev) => ({ ...prev, publicEnabled: e.target.checked }))}
          />
          {t('Δημόσιο link ενεργό')}
        </label>
        <div className="rental-public-url">
          <input className="field-input" readOnly value={rentUrl || t('Ορίστε slug στις Ρυθμίσεις → Δημόσια εγγραφή')} />
          <Button type="button" variant="secondary" onClick={() => void copyLink()} disabled={!rentUrl}>
            <ClipboardCopy size={16} /> {t('Αντιγραφή')}
          </Button>
          {rentUrl ? (
            <a className="btn btn-secondary" href={rentUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={16} /> {t('Άνοιγμα')}
            </a>
          ) : null}
        </div>
        </div>
        <div className="rental-public-media">
        {qrImageUrl ? (
          <div className="rental-public-media-qr">
            <div className="public-reg-qr-preview">
              <img
                src={qrImageUrl}
                alt={`QR ενοικίασης ${club?.name ?? ''}`}
                width={132}
                height={132}
              />
            </div>
            <div className="public-reg-qr-actions">
              <p className="lede public-reg-inline-lede">
                {t(
                  'Σκάναρε με το κινητό για τη δημόσια κράτηση γηπέδου. Χρήσιμο για αφίσες / Viber / WhatsApp.',
                )}
              </p>
              <Button type="button" variant="secondary" onClick={() => void downloadQr()}>
                <Download size={16} /> {t('Λήψη PNG')}
              </Button>
              <p className="settings-hint">
                {t('Το QR δείχνει το δημόσιο URL ενοικίασης (το slug ορίζεται στις Ρυθμίσεις → Εγγραφή).')}
              </p>
            </div>
          </div>
        ) : null}
        <div className="public-reg-photo-row rental-public-media-photo">
          <div className="public-reg-photo-preview rental-hero-preview">
            {draft.heroImageUrl ? (
              <img src={draft.heroImageUrl} alt="Φωτογραφία δημόσιας ενοικίασης" />
            ) : (
              <span>{t('Χωρίς φωτογραφία κεφαλίδας')}</span>
            )}
          </div>
          <div className="public-reg-photo-actions">
            <input
              ref={heroFileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(e) => void handleHeroFile(e)}
            />
            <Button type="button" variant="secondary" onClick={() => heroFileRef.current?.click()}>
              <ImagePlus size={16} /> {t('Φωτογραφία δημόσιου link')}
            </Button>
            {draft.heroImageUrl ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setDraft((prev) => ({ ...prev, heroImageUrl: null }));
                  setMessage('Η φωτογραφία αφαιρέθηκε — πατήστε Αποθήκευση διαθεσιμότητας.');
                }}
              >
                <Trash2 size={16} /> {t('Αφαίρεση')}
              </Button>
            ) : null}
            <p className="settings-hint">
              {t('Εμφανίζεται στην κεφαλίδα του /rent. JPG / PNG / WEBP · οριζόντια φωτογραφία γηπέδου.')}
            </p>
          </div>
        </div>
        </div>
        <div className="rental-public-footer">
        <label className="field">
          <span className="field-label">{t('Σημείωση στο δημόσιο link')}</span>
          <input
            className="field-input"
            value={draft.notes}
            onChange={(e) => setDraft((prev) => ({ ...prev, notes: e.target.value }))}
            placeholder={t('π.χ. Ελάχιστη διάρκεια 1 ώρα. Πληρωμή στη γραμματεία.')}
          />
        </label>
        <div className="prints-filter-actions">
          <Button type="button" onClick={() => void saveSettings()} disabled={saving}>
            {saving ? t('Αποθήκευση…') : t('Αποθήκευση')}
          </Button>
        </div>
        </div>
      </div>
      ) : null}

      {panelTab === 'availability' ? (
      <>
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
              <div className="rental-facility-photo-row">
                <div className="rental-facility-photo-preview">
                  {facility.photoUrl ? (
                    <img src={facility.photoUrl} alt={facility.name} />
                  ) : (
                    <span>{t('Χωρίς φωτο')}</span>
                  )}
                </div>
                <div className="public-reg-photo-actions">
                  <input
                    ref={(el) => {
                      facilityPhotoRefs.current[facility.id] = el;
                    }}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    hidden
                    onChange={(e) => void handleFacilityPhoto(facility, e)}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => facilityPhotoRefs.current[facility.id]?.click()}
                  >
                    <ImagePlus size={16} /> {t('Φωτογραφία γηπέδου')}
                  </Button>
                  {facility.photoUrl ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void removeFacilityPhoto(facility)}
                    >
                      <Trash2 size={16} /> {t('Αφαίρεση')}
                    </Button>
                  ) : null}
                </div>
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
                    {t(day.label)}
                  </button>
                ))}
              </div>
              <div className="rental-hours-row">
                <label className="field">
                  <span className="field-label">{t('Από')}</span>
                  <input
                    className="field-input"
                    type="time"
                    value={window.startTime}
                    disabled={!rule.enabled}
                    onChange={(e) => patchWindow(facility.id, { startTime: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span className="field-label">{t('Έως')}</span>
                  <input
                    className="field-input"
                    type="time"
                    value={window.endTime === '00:00' ? '23:59' : window.endTime}
                    disabled={!rule.enabled}
                    onChange={(e) => patchWindow(facility.id, { endTime: e.target.value || '00:00' })}
                  />
                </label>
                <label className="field">
                  <span className="field-label">{t('Διάρκεια')}</span>
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
                        {n} {t('λεπτά')}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">{t('€/ώρα ολόκληρο')}</span>
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
                  <span className="field-label">{t('€/ώρα μισό')}</span>
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
                <label className="checkbox-row rental-locker-setting">
                  <input
                    type="checkbox"
                    checked={Boolean(rule.lockerRoomAvailable)}
                    disabled={!rule.enabled}
                    onChange={(e) =>
                      patchRule(facility.id, { lockerRoomAvailable: e.target.checked })
                    }
                  />
                  {t('Χρήση αποδυτηρίου')}
                </label>
                <label className="field">
                  <span className="field-label">{t('€ αποδυτήριο')}</span>
                  <input
                    className="field-input"
                    type="number"
                    min={0}
                    step="0.01"
                    value={rule.lockerRoomFee || ''}
                    disabled={!rule.enabled || !rule.lockerRoomAvailable}
                    onChange={(e) =>
                      patchRule(facility.id, { lockerRoomFee: Number(e.target.value) || 0 })
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
          {saving ? t('Αποθήκευση…') : t('Αποθήκευση διαθεσιμότητας')}
        </Button>
      </div>
      </>
      ) : null}

      {panelTab === 'bookings' ? (
      <>
      <h3 className="rental-subhead">{t('Καταχώρηση κράτησης')}</h3>
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
        <div className="rental-book-top">
        <label className="field">
          <span className="field-label">{t('Γήπεδο')}</span>
          <select
            className="field-input"
            value={facilityId}
            onChange={(e) => {
              setFacilityId(e.target.value);
              setSelectedSlot(null);
              setUseLockerRoom(false);
            }}
          >
            {facilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <div className="field rental-share-field">
          <span className="field-label">{t('Τμήμα γηπέδου')}</span>
          <div className="rental-day-row">
            <button
              type="button"
              className={courtShare === 'full' ? 'rental-day is-on' : 'rental-day'}
              onClick={() => {
                setCourtShare('full');
                setSelectedSlot(null);
              }}
            >
              {t('Ολόκληρο')}
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
              {t('Μισό')}
              {selectedRule?.hourlyRateHalf
                ? ` · ${formatCurrency(selectedRule.hourlyRateHalf)}/ώρα`
                : ''}
            </button>
          </div>
        </div>
        {selectedRule?.lockerRoomAvailable ? (
          <label className="checkbox-row rental-locker-row">
            <input
              type="checkbox"
              checked={useLockerRoom}
              onChange={(e) => setUseLockerRoom(e.target.checked)}
            />
            {t('Χρήση αποδυτηρίου')}
            {selectedRule.lockerRoomFee
              ? ` · +${formatCurrency(selectedRule.lockerRoomFee)}`
              : ''}
          </label>
        ) : null}
        </div>
        <div className="rental-book-contact">
        <label className="field">
          <span className="field-label">{t('Επώνυμο')}</span>
          <input
            className="field-input"
            value={customerLastName}
            onChange={(e) => setCustomerLastName(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">{t('Όνομα')}</span>
          <input
            className="field-input"
            value={customerFirstName}
            onChange={(e) => setCustomerFirstName(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">{t('Τηλέφωνο')}</span>
          <input
            className="field-input"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
          />
        </label>
        <label className="field rental-book-email">
          <span className="field-label">Email</span>
          <input
            className="field-input"
            type="email"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
          />
        </label>
        </div>
      </div>

      <div className="rental-slots-discount-row">
        <div className="rental-slots-col">
          <span className="field-label">{t('Διαθέσιμες ώρες')}</span>
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
        </div>
        <label className="field rental-special-discount">
          <span className="field-label">{t('Ειδική έκπτωση (€)')}</span>
          <input
            className="field-input"
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={specialDiscount}
            onChange={(e) => setSpecialDiscount(e.target.value)}
            placeholder="π.χ. 10"
          />
        </label>
      </div>
      {occupied.length > 0 ? (
        <p className="muted">
          Κλειστά λόγω προγράμματος:{' '}
          {occupied
            .map((b) => `${b.reason} ${String(Math.floor(b.startMin / 60)).padStart(2, '0')}:${String(b.startMin % 60).padStart(2, '0')}`)
            .join(' · ')}
        </p>
      ) : null}

      <label className="field">
        <span className="field-label">{t('Σημείωση κράτησης')}</span>
        <input className="field-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      {selectedSlot && selectedRule ? (
        <p>
          Ποσό:{' '}
          {discountValue > 0
            ? `${formatCurrency(payableAmount)} (${formatCurrency(baseAmount)} − ${formatCurrency(discountValue)})`
            : formatCurrency(payableAmount)}
        </p>
      ) : null}
      <div className="prints-filter-actions">
        <Button type="button" onClick={() => void submitBooking()} disabled={booking}>
          {booking ? t('Καταχώρηση…') : t('Καταχώρηση κράτησης')}
        </Button>
      </div>

      <h3 className="rental-subhead">Επερχόμενες κρατήσεις</h3>
      <div className="table-wrap">
        <table className="page-table">
          <thead>
            <tr>
              <th>{t('Ημερομηνία')}</th>
              <th>{t('Ώρα')}</th>
              <th>{t('Γήπεδο')}</th>
              <th>{t('Τμήμα')}</th>
              <th>{t('Αποδυτήρια')}</th>
              <th>{t('Όνομα')}</th>
              <th>{t('Τηλ.')}</th>
              <th>{t('Πηγή')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {upcoming.length === 0 ? (
              <tr>
                <td colSpan={9}>Δεν υπάρχουν κρατήσεις.</td>
              </tr>
            ) : (
              upcoming.map((row) => (
                <tr key={row.id}>
                  <td>{row.date}</td>
                  <td>
                    {row.startTime}–{row.endTime}
                  </td>
                  <td>{row.facilityName}</td>
                  <td>{t(courtShareLabel(row.courtShare))}</td>
                  <td>{row.useLockerRoom ? 'Ναι' : '—'}</td>
                  <td>{row.customerName}</td>
                  <td>{row.customerPhone}</td>
                  <td>{row.source === 'public' ? t('Δημόσιο link') : t('Γραμματεία')}</td>
                  <td>
                    <Button type="button" variant="ghost" onClick={() => void cancelBooking(row.id)}>
                      {t('Ακύρωση')}
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      </>
      ) : null}
    </div>
  );
}
