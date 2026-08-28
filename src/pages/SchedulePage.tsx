import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Info, Pencil, Plus } from 'lucide-react';
import * as scheduleService from '../api/services/scheduleService';
import { getSession } from '../auth/auth';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Select } from '../components/ui/Select';
import { useAppData } from '../hooks/useAppData';
import type { ScheduleSlotInput } from '../schemas';
import type { ScheduleSlot } from '../types';
import {
  classIdsOf,
  isClassInCoachScope,
  resolveCoachRecord,
  sportsMatch,
  visibleClassesForSession,
} from '../utils/coachScope';
import { localDateIso } from '../utils/dates';
import { dayNames } from '../utils/labels';
import { listActiveClubSportNames } from '../utils/clubSports';
import { normalizeSportKey } from '../utils/sport';

const HOUR_START = 8;
/** Τέλος ημέρας (μεσάνυχτα) — exclusive. */
const HOUR_END = 24;
const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);
const PX_PER_HOUR = 56;

/** Monday-first weekday labels (Δευτέρα … Κυριακή). */
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

const emptyForm: ScheduleSlotInput = {
  classId: '',
  dayOfWeek: 1,
  startTime: '17:00',
  endTime: '18:30',
  location: 'Γήπεδο 1',
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function parseTimeToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function startOfWeekMonday(date: Date): Date {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDayHeader(date: Date): string {
  const name = dayNames[date.getDay()].toUpperCase();
  return `${name} ${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
}

function formatWeekRange(monday: Date): string {
  const sunday = addDays(monday, 6);
  const sameMonth = monday.getMonth() === sunday.getMonth();
  const month = sunday.toLocaleDateString('el-GR', { month: 'long' });
  const year = sunday.getFullYear();
  if (sameMonth) {
    return `${monday.getDate()} – ${sunday.getDate()} ${month} ${year}`;
  }
  const monthStart = monday.toLocaleDateString('el-GR', { month: 'long' });
  return `${monday.getDate()} ${monthStart} – ${sunday.getDate()} ${month} ${year}`;
}

type GridBlock = {
  id: string;
  kind: 'training' | 'match';
  dayIndex: number;
  startMin: number;
  endMin: number;
  title: string;
  location: string;
  slot?: ScheduleSlot;
};

export function SchedulePage() {
  const { data, refresh } = useAppData();
  const [searchParams, setSearchParams] = useSearchParams();
  const session = getSession();
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

  const sportOptions = useMemo(() => {
    const activeNames = listActiveClubSportNames(data.sports);
    const toItems = (names: string[]) =>
      names.map((name, i) => ({ id: `sport-${i}-${name}`, name, active: true }));
    if (isCoach && coach?.sport) {
      const key = normalizeSportKey(coach.sport);
      const matched = activeNames.filter((n) => normalizeSportKey(n) === key);
      return matched.length > 0
        ? toItems(matched)
        : [{ id: 'coach-sport', name: coach.sport, active: true }];
    }
    if (activeNames.length > 0) return toItems(activeNames);
    const fromClasses = new Map<string, string>();
    for (const cls of visibleClasses) {
      const name = (cls.sport ?? '').trim();
      if (!name) continue;
      const key = normalizeSportKey(name);
      if (!fromClasses.has(key)) fromClasses.set(key, name);
    }
    return toItems([...fromClasses.values()]);
  }, [data.sports, isCoach, coach, visibleClasses]);

  const [sportFilter, setSportFilter] = useState(() => {
    if (coach?.sport) return coach.sport;
    return (searchParams.get('sport') ?? '').trim();
  });

  const classesForSport = useMemo(() => {
    if (!sportFilter.trim()) return visibleClasses;
    return visibleClasses.filter((c) => sportsMatch(c.sport, sportFilter));
  }, [visibleClasses, sportFilter]);

  const [classId, setClassId] = useState('');
  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(new Date()));
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ScheduleSlotInput>({
    ...emptyForm,
    classId: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const activeClassId =
    classId && classesForSport.some((c) => c.id === classId)
      ? classId
      : isCoach
        ? classesForSport[0]?.id ?? ''
        : '';

  function handleSportChange(nextSport: string) {
    setSportFilter(nextSport);
    const next = new URLSearchParams(searchParams);
    if (nextSport.trim()) next.set('sport', nextSport.trim());
    else next.delete('sport');
    setSearchParams(next, { replace: true });
    const nextClasses = nextSport.trim()
      ? visibleClasses.filter((c) => sportsMatch(c.sport, nextSport))
      : visibleClasses;
    setClassId((prev) => {
      if (prev && nextClasses.some((c) => c.id === prev)) return prev;
      return isCoach ? nextClasses[0]?.id ?? '' : '';
    });
  }

  const weekDays = useMemo(
    () => WEEKDAY_ORDER.map((dow, index) => {
      const date = addDays(weekStart, index);
      return { dow, date, iso: localDateIso(date), label: formatDayHeader(date) };
    }),
    [weekStart],
  );

  const blocks = useMemo(() => {
    const result: GridBlock[] = [];
    const selectedClass = activeClassId || null;
    const sportKey = sportFilter.trim();

    function inSportFilter(cid: string | null | undefined): boolean {
      if (!sportKey) return true;
      if (!cid) return false;
      const cls =
        visibleClasses.find((c) => c.id === cid) ?? data.classes.find((c) => c.id === cid);
      return cls ? sportsMatch(cls.sport, sportKey) : false;
    }

    for (const slot of data.schedule ?? []) {
      if (!isClassInCoachScope(slot.classId, allowedClassIds, isCoach)) continue;
      if (selectedClass && slot.classId !== selectedClass) continue;
      if (!selectedClass && !inSportFilter(slot.classId)) continue;
      const dayIndex = WEEKDAY_ORDER.indexOf(slot.dayOfWeek as (typeof WEEKDAY_ORDER)[number]);
      if (dayIndex < 0) continue;
      const cls =
        visibleClasses.find((c) => c.id === slot.classId) ??
        data.classes.find((c) => c.id === slot.classId);
      result.push({
        id: `schedule:${slot.id}`,
        kind: 'training',
        dayIndex,
        startMin: parseTimeToMinutes(slot.startTime),
        endMin: parseTimeToMinutes(slot.endTime),
        title: cls?.name ? `Προπόνηση · ${cls.name}` : 'Προπόνηση',
        location: slot.location,
        slot,
      });
    }

    for (const training of data.trainings ?? []) {
      if (!isClassInCoachScope(training.classId, allowedClassIds, isCoach)) continue;
      if (selectedClass && training.classId !== selectedClass) continue;
      if (!selectedClass && !inSportFilter(training.classId)) continue;
      const iso = training.date?.slice(0, 10);
      if (!iso) continue;
      const dayIndex = weekDays.findIndex((d) => d.iso === iso);
      if (dayIndex < 0) continue;
      const cls = training.classId
        ? visibleClasses.find((c) => c.id === training.classId) ??
          data.classes.find((c) => c.id === training.classId)
        : undefined;
      const startMin = parseTimeToMinutes(training.startTime || '12:00');
      const endMin = training.endTime
        ? parseTimeToMinutes(training.endTime)
        : startMin + 60;
      result.push({
        id: `training:${training.id}`,
        kind: 'training',
        dayIndex,
        startMin,
        endMin: endMin > startMin ? endMin : startMin + 60,
        title: cls?.name ? `Προπόνηση · ${cls.name}` : 'Προπόνηση',
        location: training.location || '',
      });
    }

    for (const match of data.matches ?? []) {
      if (match.status === 'cancelled') continue;
      const matchInScope = match.classId
        ? isClassInCoachScope(match.classId, allowedClassIds, isCoach)
        : !isCoach || sportsMatch(match.sport, coach?.sport);
      if (!matchInScope) continue;
      if (selectedClass) {
        if (match.classId) {
          if (match.classId !== selectedClass) continue;
        } else {
          const cls =
            visibleClasses.find((c) => c.id === selectedClass) ??
            data.classes.find((c) => c.id === selectedClass);
          if (cls?.sport && match.sport && !sportsMatch(match.sport, cls.sport)) continue;
          if (cls && !match.classId && !match.sport) {
            continue;
          }
        }
      } else if (sportKey) {
        if (match.classId) {
          if (!inSportFilter(match.classId)) continue;
        } else if (!sportsMatch(match.sport, sportKey)) {
          continue;
        }
      }
      const iso = match.date?.slice(0, 10);
      const dayIndex = weekDays.findIndex((d) => d.iso === iso);
      if (dayIndex < 0) continue;
      const startMin = parseTimeToMinutes(match.time || '12:00');
      const endMin = startMin + 90;
      result.push({
        id: `match:${match.id}`,
        kind: 'match',
        dayIndex,
        startMin,
        endMin,
        title: `Αγώνας vs ${match.opponent}`,
        location:
          match.location ||
          (match.venue === 'home' ? 'Εντός' : match.venue === 'away' ? 'Εκτός' : ''),
      });
    }

    return result;
  }, [
    data.schedule,
    data.trainings,
    data.matches,
    data.classes,
    visibleClasses,
    activeClassId,
    sportFilter,
    weekDays,
    allowedClassIds,
    isCoach,
    coach,
  ]);

  function openCreate() {
    setEditingId(null);
    setForm({
      ...emptyForm,
      classId: activeClassId || classesForSport[0]?.id || '',
      dayOfWeek: 1,
    });
    setError('');
    setOpen(true);
  }

  function openEdit(slot: ScheduleSlot) {
    setEditingId(slot.id);
    setForm({
      classId: slot.classId,
      dayOfWeek: slot.dayOfWeek,
      startTime: slot.startTime,
      endTime: slot.endTime,
      location: slot.location,
    });
    setError('');
    setOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    const result = editingId
      ? await scheduleService.updateScheduleSlot(editingId, form)
      : await scheduleService.createScheduleSlot(form);
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Σφάλμα αποθήκευσης');
      return;
    }
    if (!editingId && form.classId) setClassId(form.classId);
    setOpen(false);
    refresh();
  }

  async function handleDelete() {
    if (!editingId) return;
    if (!confirm('Διαγραφή ώρας από το πρόγραμμα;')) return;
    await scheduleService.deleteScheduleSlot(editingId);
    setOpen(false);
    refresh();
  }

  function shiftWeek(delta: number) {
    setWeekStart((prev) => addDays(prev, delta * 7));
  }

  function goToday() {
    setWeekStart(startOfWeekMonday(new Date()));
  }

  const gridHeight = (HOUR_END - HOUR_START) * PX_PER_HOUR;
  const dayStartMin = HOUR_START * 60;

  return (
    <div className="prog-page">
      <div className="prog-toolbar panel">
        <label className="prog-field">
          <span>Άθλημα</span>
          <select
            value={isCoach && coach?.sport ? coach.sport : sportFilter}
            disabled={isCoach}
            onChange={(e) => handleSportChange(e.target.value)}
          >
            {isCoach ? null : <option value="">Όλα τα αθλήματα</option>}
            {sportOptions.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label className="prog-field">
          <span>Επιλογή Τμήματος</span>
          <select value={activeClassId} onChange={(e) => setClassId(e.target.value)}>
            {isCoach ? null : <option value="">Όλα τα τμήματα</option>}
            {classesForSport.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
                {cls.ageGroup ? ` · ${cls.ageGroup}` : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="prog-field prog-week-field">
          <span>Εβδομάδα</span>
          <div className="prog-week-nav">
            <button type="button" onClick={() => shiftWeek(-1)} aria-label="Προηγούμενη εβδομάδα">
              <ChevronLeft size={16} />
            </button>
            <strong>{formatWeekRange(weekStart)}</strong>
            <button type="button" onClick={() => shiftWeek(1)} aria-label="Επόμενη εβδομάδα">
              <ChevronRight size={16} />
            </button>
          </div>
        </label>

        <div className="prog-toolbar-actions">
          <button type="button" className="prog-today-btn" onClick={goToday}>
            Σήμερα
          </button>
          <Button type="button" onClick={openCreate}>
            <Plus size={16} /> Νέα Ώρα
          </Button>
        </div>
      </div>

      <section className="prog-board panel">
        <div className="prog-grid-head">
          <div className="prog-time-gutter" aria-hidden />
          {weekDays.map((day) => (
            <div key={day.iso} className="prog-day-head">
              {day.label}
            </div>
          ))}
        </div>

        <div className="prog-grid-body">
          <div className="prog-time-col" style={{ height: gridHeight }}>
            {HOURS.map((hour) => (
              <div key={hour} className="prog-hour-label" style={{ height: PX_PER_HOUR }}>
                {pad(hour % 24)}:00
              </div>
            ))}
          </div>

          <div className="prog-days" style={{ height: gridHeight }}>
            {weekDays.map((day, dayIndex) => (
              <div key={day.iso} className="prog-day-col">
                {HOURS.map((hour) => (
                  <div key={hour} className="prog-hour-line" style={{ height: PX_PER_HOUR }} />
                ))}
                {blocks
                  .filter((b) => b.dayIndex === dayIndex)
                  .map((block) => {
                    const top = ((block.startMin - dayStartMin) / 60) * PX_PER_HOUR;
                    const height = Math.max(
                      36,
                      ((block.endMin - block.startMin) / 60) * PX_PER_HOUR - 4,
                    );
                    const startHour = Math.floor(block.startMin / 60) % 24;
                    const endHour = Math.floor(block.endMin / 60) % 24;
                    const startLabel = `${pad(startHour)}:${pad(block.startMin % 60)}`;
                    const endLabel = `${pad(endHour)}:${pad(block.endMin % 60)}`;
                    return (
                      <button
                        key={block.id}
                        type="button"
                        className={`prog-block is-${block.kind}`}
                        style={{ top, height }}
                        onClick={() => {
                          if (block.slot) openEdit(block.slot);
                        }}
                        title={`${startLabel} – ${endLabel} · ${block.title}`}
                      >
                        <span className="prog-block-time">
                          {startLabel} - {endLabel}
                        </span>
                        <strong className="prog-block-title">{block.title}</strong>
                        {block.location ? (
                          <span className="prog-block-loc">{block.location}</span>
                        ) : null}
                        {block.slot ? (
                          <span className="prog-block-edit" aria-hidden>
                            <Pencil size={12} />
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="prog-footer">
        <ul className="prog-legend">
          <li>
            <i className="is-training" /> Προπόνηση
          </li>
          <li>
            <i className="is-match" /> Αγώνας
          </li>
        </ul>
        <p className="prog-hint">
          <Info size={15} aria-hidden /> Κάντε κλικ σε ένα μπλοκ για επεξεργασία
        </p>
      </div>

      <Modal
        open={open}
        title={editingId ? 'Επεξεργασία ώρας' : 'Νέα ώρα προγράμματος'}
        onClose={() => setOpen(false)}
        footer={
          <>
            {editingId ? (
              <Button variant="danger" type="button" onClick={() => void handleDelete()}>
                Διαγραφή
              </Button>
            ) : null}
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>
              Ακύρωση
            </Button>
            <Button type="button" disabled={saving} onClick={() => void handleSave()}>
              Αποθήκευση
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <Select
            label="Τμήμα"
            value={form.classId}
            onChange={(e) => setForm({ ...form, classId: e.target.value })}
            options={classesForSport.map((c) => ({ value: c.id, label: c.name }))}
          />
          <Select
            label="Ημέρα"
            value={String(form.dayOfWeek)}
            onChange={(e) => setForm({ ...form, dayOfWeek: Number(e.target.value) })}
            options={dayNames.map((label, value) => ({
              value: String(value),
              label,
            }))}
          />
          <Input
            label="Έναρξη"
            type="time"
            value={form.startTime}
            onChange={(e) => setForm({ ...form, startTime: e.target.value })}
          />
          <Input
            label="Λήξη"
            type="time"
            value={form.endTime}
            onChange={(e) => setForm({ ...form, endTime: e.target.value })}
          />
          <Input
            label="Χώρος"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
        </div>
        {error ? <p className="form-error">{error}</p> : null}
      </Modal>
    </div>
  );
}
