import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CalendarPlus, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import * as rentalBookingsService from '../api/services/rentalBookingsService';
import { getSession } from '../auth/auth';
import { PageHeader } from '../components/ui/PageHeader';
import { useAppData } from '../hooks/useAppData';
import { getPreviewClubId } from '../platform/platformConfig';
import { courtShareLabel } from '../shared/facilityRentalAvailability';
import {
  classIdsOf,
  isClassInCoachScope,
  resolveCoachRecord,
  sportsMatch,
  visibleClassesForSession,
} from '../utils/coachScope';
import { localDateIso } from '../utils/dates';
import { listActiveFacilities, resolveFacilityForLocation } from '../utils/facilityHours';
import { dayNames } from '../utils/labels';

const MONTH_LABELS = [
  'Ιανουάριος',
  'Φεβρουάριος',
  'Μάρτιος',
  'Απρίλιος',
  'Μάιος',
  'Ιούνιος',
  'Ιούλιος',
  'Αύγουστος',
  'Σεπτέμβριος',
  'Οκτώβριος',
  'Νοέμβριος',
  'Δεκέμβριος',
];

type CalView = 'month' | 'week' | 'day';
type EventKind = 'training' | 'match' | 'rental' | 'other';

type CalEvent = {
  id: string;
  title: string;
  time: string;
  endTime: string;
  kind: EventKind;
  classId: string | null;
  location: string;
};

function eventOccupiesSlot(event: CalEvent, slot: string, nextSlot: string): boolean {
  const start = event.time || '';
  if (!start) return false;
  const slotEnd = nextSlot || '24:00';
  const end = event.endTime && event.endTime > start ? event.endTime : '';
  if (end) return start < slotEnd && end > slot;
  return start >= slot && start < slotEnd;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

const FACILITY_HOUR_COLUMNS: Array<{ start: string; end: string; label: string }> = Array.from(
  { length: 16 },
  (_, i) => {
    const hour = 8 + i;
    const start = `${pad(hour)}:00`;
    const endHour = hour + 1;
    const endLabel = endHour === 24 ? '00:00' : `${pad(endHour)}:00`;
    return { start, end: endHour === 24 ? '24:00' : endLabel, label: `${start}-${endLabel}` };
  },
);

/** 08:00 … 23:45, βήμα 15 λεπτά (64 κελιά / ημέρα). */
const DAY_QUARTER_SLOTS: string[] = Array.from({ length: 64 }, (_, i) => {
  const total = 8 * 60 + i * 15;
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
});

function quarterIndex(time: string): number {
  const value = time.slice(0, 5);
  if (value === '00:00' || value === '24:00') return DAY_QUARTER_SLOTS.length;
  return DAY_QUARTER_SLOTS.findIndex((slot, i) => {
    const next = DAY_QUARTER_SLOTS[i + 1] ?? '24:00';
    return value >= slot && value < next;
  });
}

function eventQuarterSpan(event: CalEvent): { start: number; span: number } | null {
  if (!event.time) return null;
  const start = quarterIndex(event.time);
  if (start < 0 || start >= DAY_QUARTER_SLOTS.length) return null;
  const endTime = event.endTime && event.endTime > event.time ? event.endTime : '';
  if (!endTime) return { start, span: 1 };
  const end = quarterIndex(endTime);
  const exclusive = end < 0 ? start + 1 : end;
  return { start, span: Math.max(1, exclusive - start) };
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function mondayFirstWeekday(year: number, monthIndex: number, day: number): number {
  const js = new Date(year, monthIndex, day).getDay();
  return (js + 6) % 7;
}

function buildMonthCells(year: number, monthIndex: number) {
  const totalDays = daysInMonth(year, monthIndex);
  const offset = mondayFirstWeekday(year, monthIndex, 1);
  const prevDays = daysInMonth(year, monthIndex - 1);
  const result: Array<{ day: number; iso: string; inMonth: boolean }> = [];

  for (let i = 0; i < offset; i += 1) {
    const day = prevDays - offset + i + 1;
    const d = new Date(year, monthIndex - 1, day);
    result.push({
      day,
      iso: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      inMonth: false,
    });
  }
  for (let day = 1; day <= totalDays; day += 1) {
    result.push({
      day,
      iso: `${year}-${pad(monthIndex + 1)}-${pad(day)}`,
      inMonth: true,
    });
  }
  let next = 1;
  while (result.length % 7 !== 0 || result.length < 42) {
    const d = new Date(year, monthIndex + 1, next);
    result.push({
      day: next,
      iso: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      inMonth: false,
    });
    next += 1;
    if (result.length >= 42) break;
  }
  return result;
}

export function CalendarPage() {
  const { data, refresh } = useAppData();
  const session = getSession();
  const clubId = getPreviewClubId() ?? session?.clubId ?? null;
  const isCoach = session?.role === 'coach';
  const coach = useMemo(
    () => resolveCoachRecord(data.coaches, session?.coachId),
    [data.coaches, session?.coachId],
  );
  const visibleClasses = useMemo(
    () => visibleClassesForSession(data.classes, data.coaches, session, { seasons: data.clubSeasons }),
    [data.classes, data.coaches, data.clubSeasons, session],
  );
  const allowedClassIds = useMemo(() => classIdsOf(visibleClasses), [visibleClasses]);
  const today = localDateIso();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [monthIndex, setMonthIndex] = useState(now.getMonth());
  const [view, setView] = useState<CalView>('month');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [selectedIso, setSelectedIso] = useState(today);

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

  const classById = useMemo(
    () => new Map(visibleClasses.map((cls) => [cls.id, cls])),
    [visibleClasses],
  );

  const locations = useMemo(() => {
    const set = new Set<string>();
    for (const facility of listActiveFacilities(data.facilities)) set.add(facility.name);
    for (const t of data.trainings ?? []) if (t.location) set.add(t.location);
    for (const m of data.matches ?? []) if (m.location) set.add(m.location);
    for (const b of data.rentalBookings ?? []) {
      if (b.status !== 'cancelled' && b.facilityName) set.add(b.facilityName);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'el'));
  }, [data.facilities, data.trainings, data.matches, data.rentalBookings]);

  const activeFacilities = useMemo(
    () => listActiveFacilities(data.facilities),
    [data.facilities],
  );

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalEvent[]>();

    const push = (date: string, event: CalEvent) => {
      const list = map.get(date) ?? [];
      list.push(event);
      map.set(date, list);
    };

    for (const training of data.trainings ?? []) {
      const date = training.date?.slice(0, 10);
      if (!date) continue;
      if (!isClassInCoachScope(training.classId, allowedClassIds, isCoach)) continue;
      const cls = training.classId ? classById.get(training.classId) : undefined;
      push(date, {
        id: training.id,
        title: cls?.name || training.location || 'Προπόνηση',
        time: training.startTime || '',
        endTime: training.endTime || '',
        kind: 'training',
        classId: training.classId,
        location: training.location || '',
      });
    }

    for (const match of data.matches ?? []) {
      const date = match.date?.slice(0, 10);
      if (!date) continue;
      const matchInScope = match.classId
        ? isClassInCoachScope(match.classId, allowedClassIds, isCoach)
        : !isCoach || sportsMatch(match.sport, coach?.sport);
      if (!matchInScope) continue;
      push(date, {
        id: match.id,
        title: `Αγώνας vs ${match.opponent}`,
        time: match.time || '',
        endTime: '',
        kind: 'match',
        classId: match.classId,
        location: match.location || '',
      });
    }

    for (const booking of data.rentalBookings ?? []) {
      if (booking.status === 'cancelled') continue;
      const date = booking.date?.slice(0, 10);
      if (!date) continue;
      const share = courtShareLabel(booking.courtShare);
      push(date, {
        id: booking.id,
        title: `Ενοικίαση · ${booking.facilityName || 'Γήπεδο'} (${share}${
          booking.useLockerRoom ? ' · αποδυτήρια' : ''
        })`,
        time: booking.startTime || '',
        endTime: booking.endTime || '',
        kind: 'rental',
        classId: null,
        location: booking.facilityName || '',
      });
    }

    for (const [, list] of map) {
      list.sort((a, b) => a.time.localeCompare(b.time));
    }
    return map;
  }, [data.trainings, data.matches, data.rentalBookings, classById, allowedClassIds, isCoach, coach]);

  function passesFilters(event: CalEvent) {
    if (categoryFilter && event.kind !== categoryFilter) return false;
    if (teamFilter && event.classId !== teamFilter) return false;
    if (locationFilter && event.location !== locationFilter) return false;
    return true;
  }

  const cells = useMemo(() => buildMonthCells(year, monthIndex), [year, monthIndex]);

  const miniCells = useMemo(() => buildMonthCells(year, monthIndex), [year, monthIndex]);

  function shiftMonth(delta: number) {
    const next = new Date(year, monthIndex + delta, 1);
    setYear(next.getFullYear());
    setMonthIndex(next.getMonth());
  }

  function shiftRange(delta: number) {
    if (view === 'month') {
      shiftMonth(delta);
      return;
    }
    const base = new Date(`${selectedIso}T12:00:00`);
    const step = view === 'week' ? 7 : 1;
    base.setDate(base.getDate() + delta * step);
    const iso = localDateIso(base);
    setSelectedIso(iso);
    setYear(base.getFullYear());
    setMonthIndex(base.getMonth());
  }

  function goToday() {
    const d = new Date();
    setYear(d.getFullYear());
    setMonthIndex(d.getMonth());
    setSelectedIso(localDateIso(d));
  }

  const weekdayHeaders = [...dayNames.slice(1), dayNames[0]].map((n) => n.slice(0, 3));

  const agendaDays = useMemo(() => {
    const start = new Date(`${selectedIso}T12:00:00`);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return {
        iso: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
        heading: d.toLocaleDateString('el-GR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
      };
    });
  }, [selectedIso]);

  const titleLabel =
    view === 'day'
      ? new Date(`${selectedIso}T12:00:00`).toLocaleDateString('el-GR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : view === 'week'
        ? agendaDays[0]?.heading ?? ''
        : `${MONTH_LABELS[monthIndex]} ${year}`;

  const facilityColumns = useMemo(() => {
    if (locationFilter) {
      return activeFacilities.filter((item) => item.name === locationFilter);
    }
    return activeFacilities;
  }, [activeFacilities, locationFilter]);

  function eventEditPath(event: CalEvent): string {
    if (event.kind === 'match') return '/matches';
    if (event.kind === 'rental') return '/rental';
    return '/trainings';
  }

  function renderFacilityEvent(event: CalEvent) {
    const end = event.endTime && event.endTime > event.time ? event.endTime : '';
    const timeLabel = event.time ? (end ? `${event.time} - ${end}` : event.time) : '';
    const title =
      event.kind === 'rental' || event.kind === 'match' || event.title.toLowerCase().startsWith('προπόνηση')
        ? event.title
        : `Προπόνηση - ${event.title}`;
    return (
      <Link
        key={event.id}
        to={eventEditPath(event)}
        className={`cal-block is-${event.kind}`}
        title={`${timeLabel} ${title}`.trim()}
      >
        {timeLabel ? <em>{timeLabel}</em> : null}
        <strong>{title}</strong>
        {event.location ? <span>{event.location}</span> : null}
      </Link>
    );
  }

  function renderEventList(iso: string, limit = 12) {
    const events = (eventsByDate.get(iso) ?? []).filter(passesFilters);
    if (events.length === 0) {
      return <p className="cal-empty-day">Δεν υπάρχουν γεγονότα.</p>;
    }
    return (
      <ul className="cal-agenda">
        {events.slice(0, limit).map((event) => (
          <li key={event.id} className={`cal-agenda-item is-${event.kind}`}>
            <i aria-hidden />
            <div>
              <strong>
                {event.time ? `${event.time} · ` : ''}
                {event.title}
              </strong>
              {event.location ? <span>{event.location}</span> : null}
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="cal-page">
      <PageHeader title="Ημερολόγιο" subtitle="Προπονήσεις, αγώνες και ενοικιάσεις γηπέδων." />

      <div className="cal-toolbar">
        <div className="cal-toolbar-left">
          <button type="button" className="cal-nav-btn" onClick={() => shiftRange(-1)} aria-label="Προηγούμενο">
            <ChevronLeft size={16} />
          </button>
          <button type="button" className="cal-nav-btn" onClick={() => shiftRange(1)} aria-label="Επόμενο">
            <ChevronRight size={16} />
          </button>
          <button type="button" className="cal-today-btn" onClick={goToday}>
            Σήμερα
          </button>
          {view === 'week' || view === 'day' ? (
            <input
              type="date"
              className="cal-date-input"
              value={selectedIso}
              onChange={(e) => {
                const iso = e.target.value;
                if (!iso) return;
                setSelectedIso(iso);
                const d = new Date(`${iso}T12:00:00`);
                setYear(d.getFullYear());
                setMonthIndex(d.getMonth());
              }}
            />
          ) : null}
          {view === 'week' || view === 'day' ? null : (
            <strong className="cal-month-title">{titleLabel}</strong>
          )}
        </div>

        <div className="cal-toolbar-right">
          <div className="cal-view-toggle" role="group" aria-label="Προβολή">
            {(
              [
                ['month', 'Μήνας'],
                ['week', 'Εβδομάδα'],
                ['day', 'Ημέρα'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={view === id ? 'is-active' : ''}
                onClick={() => setView(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <Link to="/trainings" className="cal-new-btn">
            <CalendarPlus size={16} /> Νέο Γεγονός
          </Link>
        </div>
      </div>

      <div className={`cal-layout${view === 'week' || view === 'day' ? ' is-agenda' : ''}`}>
        <section className="cal-main">
          {view === 'month' ? (
            <>
              <div className="cal-weekdays">
                {weekdayHeaders.map((name) => (
                  <div key={name} className="cal-weekday">
                    {name}
                  </div>
                ))}
              </div>
              <div className="cal-grid">
                {cells.map((cell) => {
                  const events = (eventsByDate.get(cell.iso) ?? []).filter(passesFilters);
                  const isToday = cell.iso === today;
                  const isSelected = cell.iso === selectedIso;
                  return (
                    <button
                      key={cell.iso}
                      type="button"
                      className={`cal-cell${!cell.inMonth ? ' is-out' : ''}${isToday ? ' is-today' : ''}${isSelected ? ' is-selected' : ''}`}
                      onClick={() => setSelectedIso(cell.iso)}
                    >
                      <span className="cal-day-num">{cell.day}</span>
                      <ul className="cal-events">
                        {events.slice(0, 3).map((event) => (
                          <li
                            key={event.id}
                            className={`cal-event is-${event.kind}`}
                            title={`${event.time} ${event.title}`}
                          >
                            <i aria-hidden />
                            <span>
                              {event.time ? `${event.time} ` : ''}
                              {event.title}
                            </span>
                          </li>
                        ))}
                        {events.length > 3 ? (
                          <li className="cal-more">+{events.length - 3} ακόμη</li>
                        ) : null}
                      </ul>
                    </button>
                  );
                })}
              </div>
            </>
          ) : view === 'week' ? (
            <div className="cal-agenda-view">
              {facilityColumns.length === 0 ? (
                <p className="cal-empty-day">
                  Δεν υπάρχουν ενεργά γήπεδα. Πρόσθεσέ τα στις Ρυθμίσεις → Γήπεδο.
                </p>
              ) : (
                <>
                  {agendaDays.map((day) => {
                    const dayEvents = (eventsByDate.get(day.iso) ?? []).filter(passesFilters);
                    return (
                      <section
                        key={day.iso}
                        className={`cal-agenda-day${day.iso === today ? ' is-today' : ''}`}
                      >
                        <h3 className="cal-agenda-day-title">{day.heading}</h3>
                        <div className="cal-agenda-scroll">
                          <div
                            className="cal-agenda-grid"
                            style={{
                              gridTemplateColumns: `minmax(180px, 240px) repeat(${FACILITY_HOUR_COLUMNS.length}, minmax(78px, 1fr))`,
                            }}
                          >
                            <div className="cal-agenda-corner" />
                            {FACILITY_HOUR_COLUMNS.map((col) => (
                              <div key={`${day.iso}-${col.start}`} className="cal-agenda-hour">
                                {col.label}
                              </div>
                            ))}
                            {facilityColumns.map((facility) => (
                              <div key={`${day.iso}-${facility.id}`} className="cal-agenda-row">
                                <div className="cal-agenda-room">{facility.name}</div>
                                {FACILITY_HOUR_COLUMNS.map((col) => {
                                  const cellEvents = dayEvents.filter(
                                    (event) =>
                                      (event.location === facility.name ||
                                        resolveFacilityForLocation(data.facilities, event.location)
                                          ?.id === facility.id) &&
                                      eventOccupiesSlot(event, col.start, col.end),
                                  );
                                  return (
                                    <div
                                      key={`${day.iso}-${facility.id}-${col.start}`}
                                      className="cal-agenda-cell"
                                    >
                                      {cellEvents.map((event) => renderFacilityEvent(event))}
                                    </div>
                                  );
                                })}
                              </div>
                            ))}
                          </div>
                        </div>
                      </section>
                    );
                  })}
                  <footer className="cal-agenda-foot">
                    <ul className="cal-agenda-legend">
                      <li>
                        <i className="is-training" /> Προπόνηση
                      </li>
                      <li>
                        <i className="is-match" /> Αγώνας
                      </li>
                      <li>
                        <i className="is-rental" /> Ενοικίαση
                      </li>
                    </ul>
                    <p>
                      <Info size={14} /> Κάντε κλικ σε ένα μπλοκ για επεξεργασία
                    </p>
                  </footer>
                </>
              )}
            </div>
          ) : view === 'day' ? (
            <div className="cal-agenda-view">
              {facilityColumns.length === 0 ? (
                <p className="cal-empty-day">
                  Δεν υπάρχουν ενεργά γήπεδα. Πρόσθεσέ τα στις Ρυθμίσεις → Γήπεδο.
                </p>
              ) : (
                <section className={`cal-agenda-day${selectedIso === today ? ' is-today' : ''}`}>
                  <h3 className="cal-agenda-day-title">{titleLabel}</h3>
                  <div className="cal-agenda-scroll">
                    <div
                      className="cal-agenda-grid cal-day-quarters"
                      style={{
                        gridTemplateColumns: `minmax(180px, 240px) repeat(${DAY_QUARTER_SLOTS.length}, minmax(18px, 1fr))`,
                      }}
                    >
                      <div className="cal-agenda-corner" />
                      {FACILITY_HOUR_COLUMNS.map((col) => (
                        <div
                          key={`day-h-${col.start}`}
                          className="cal-agenda-hour"
                          style={{ gridColumn: 'span 4' }}
                        >
                          {col.label}
                        </div>
                      ))}
                      {facilityColumns.map((facility) => {
                        const dayEvents = (eventsByDate.get(selectedIso) ?? [])
                          .filter(passesFilters)
                          .filter(
                            (event) =>
                              event.location === facility.name ||
                              resolveFacilityForLocation(data.facilities, event.location)?.id ===
                                facility.id,
                          );
                        const used = new Set<number>();
                        const cells: ReactNode[] = [];
                        for (let i = 0; i < DAY_QUARTER_SLOTS.length; i += 1) {
                          if (used.has(i)) continue;
                          const starting = dayEvents.filter((event) => eventQuarterSpan(event)?.start === i);
                          if (starting.length > 0) {
                            const span = Math.max(
                              ...starting.map((event) => eventQuarterSpan(event)?.span ?? 1),
                            );
                            const safeSpan = Math.min(span, DAY_QUARTER_SLOTS.length - i);
                            for (let k = 0; k < safeSpan; k += 1) used.add(i + k);
                            cells.push(
                              <div
                                key={`${facility.id}-q-${i}`}
                                className={`cal-agenda-cell is-quarter${(i + safeSpan) % 4 === 0 ? ' is-hour-end' : ''}`}
                                style={{ gridColumn: `span ${safeSpan}` }}
                              >
                                {starting.map((event) => renderFacilityEvent(event))}
                              </div>,
                            );
                          } else {
                            cells.push(
                              <div
                                key={`${facility.id}-q-${i}`}
                                className={`cal-agenda-cell is-quarter${(i + 1) % 4 === 0 ? ' is-hour-end' : ''}`}
                              />,
                            );
                          }
                        }
                        return (
                          <div key={facility.id} className="cal-agenda-row">
                            <div className="cal-agenda-room">{facility.name}</div>
                            {cells}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <footer className="cal-agenda-foot">
                    <ul className="cal-agenda-legend">
                      <li>
                        <i className="is-training" /> Προπόνηση
                      </li>
                      <li>
                        <i className="is-match" /> Αγώνας
                      </li>
                      <li>
                        <i className="is-rental" /> Ενοικίαση
                      </li>
                    </ul>
                    <p>
                      <Info size={14} /> Κάντε κλικ σε ένα μπλοκ για επεξεργασία
                    </p>
                  </footer>
                </section>
              )}
            </div>
          ) : (
            <div className="cal-day-view">{renderEventList(selectedIso)}</div>
          )}
        </section>

        {view === 'week' || view === 'day' ? null : (
          <aside className="cal-sidebar">
          <div className="cal-mini">
            <div className="cal-mini-head">
              <strong>
                {MONTH_LABELS[monthIndex].slice(0, 3)} {year}
              </strong>
              <div>
                <button type="button" onClick={() => shiftMonth(-1)} aria-label="Προηγούμενος">
                  <ChevronLeft size={14} />
                </button>
                <button type="button" onClick={() => shiftMonth(1)} aria-label="Επόμενος">
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
            <div className="cal-mini-weekdays">
              {weekdayHeaders.map((n) => (
                <span key={n}>{n.slice(0, 2)}</span>
              ))}
            </div>
            <div className="cal-mini-grid">
              {miniCells.map((cell) => {
                const hasEvents = (eventsByDate.get(cell.iso) ?? []).some(passesFilters);
                return (
                  <button
                    key={`mini-${cell.iso}`}
                    type="button"
                    className={`cal-mini-day${!cell.inMonth ? ' is-out' : ''}${cell.iso === today ? ' is-today' : ''}${cell.iso === selectedIso ? ' is-selected' : ''}`}
                    onClick={() => setSelectedIso(cell.iso)}
                  >
                    {cell.day}
                    {hasEvents ? <i className="cal-mini-dot" aria-hidden /> : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="cal-side-block">
            <h3>Φίλτρα</h3>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">Όλες οι Κατηγορίες</option>
              <option value="training">Προπόνηση</option>
              <option value="match">Αγώνας</option>
              <option value="rental">Ενοικίαση</option>
            </select>
            <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
              <option value="">Όλες οι Ομάδες</option>
              {visibleClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}>
              <option value="">Όλα τα γήπεδα</option>
              {locations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>

          <div className="cal-side-block">
            <h3>Υπόμνημα</h3>
            <ul className="cal-legend">
              <li>
                <i className="is-training" /> Προπόνηση
              </li>
              <li>
                <i className="is-match" /> Αγώνας
              </li>
              <li>
                <i className="is-rental" /> Ενοικίαση
              </li>
              <li>
                <i className="is-other" /> Άλλο
              </li>
            </ul>
          </div>
        </aside>
        )}
      </div>
    </div>
  );
}
