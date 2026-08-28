import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CalendarDays,
  ChevronDown,
  Download,
  Users,
} from 'lucide-react';
import { upsertAttendance } from '../api/services/attendanceService';
import * as notificationService from '../api/services/notificationService';
import { getSession } from '../auth/auth';
import { PageHeader } from '../components/ui/PageHeader';
import { useAppData } from '../hooks/useAppData';
import { sportsMatch, visibleClassesForSession } from '../utils/coachScope';
import { activeClubSportSelectOptions } from '../utils/clubSports';
import { localDateIso } from '../utils/dates';
import { studentInClass } from '../utils/studentClasses';

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localDateIso(d);
}

function formatDayLabel(iso: string): string {
  try {
    const raw = new Date(`${iso}T12:00:00`).toLocaleDateString('el-GR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    // "Σάββατο 17 Μαΐου 2025" → "Σάββατο, 17 Μαΐου 2025"
    return raw.replace(/^(\S+)\s+/, '$1, ');
  } catch {
    return iso;
  }
}

function formatShortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

export function AttendancePage() {
  const { data, refresh } = useAppData();
  const [searchParams, setSearchParams] = useSearchParams();
  const session = getSession();
  const visibleClasses = useMemo(
    () => visibleClassesForSession(data.classes, data.coaches, session, { seasons: data.clubSeasons }),
    [data.classes, data.coaches, data.clubSeasons, session],
  );
  const [sportFilter, setSportFilter] = useState(
    () => (searchParams.get('sport') ?? '').trim(),
  );
  const sportOptions = useMemo(
    () =>
      activeClubSportSelectOptions(data.sports, {
        includeEmpty: true,
        emptyLabel: 'Όλα τα αθλήματα',
        retain: sportFilter ? [sportFilter] : [],
      }),
    [data.sports, sportFilter],
  );
  const classesForSport = useMemo(() => {
    if (!sportFilter) return visibleClasses;
    return visibleClasses.filter((c) => sportsMatch(c.sport, sportFilter));
  }, [visibleClasses, sportFilter]);
  const [classId, setClassId] = useState('');
  const [date, setDate] = useState(() => localDateIso());
  const [notifyAbsence, setNotifyAbsence] = useState(false);
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const activeClassId =
    classId && classesForSport.some((c) => c.id === classId)
      ? classId
      : classesForSport[0]?.id ?? '';

  function handleSportChange(nextSport: string) {
    setSportFilter(nextSport);
    const next = new URLSearchParams(searchParams);
    if (nextSport.trim()) next.set('sport', nextSport.trim());
    else next.delete('sport');
    setSearchParams(next, { replace: true });
    setClassId('');
  }

  const students = useMemo(
    () =>
      data.students
        .filter((s) => studentInClass(s, activeClassId) && s.status !== 'inactive')
        .sort((a, b) =>
          `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'el'),
        ),
    [data.students, activeClassId],
  );

  const historyDates = useMemo(() => {
    const dates: string[] = [];
    for (let i = 10; i >= 0; i -= 1) {
      dates.push(shiftDate(date, -i));
    }
    return dates;
  }, [date]);

  const summary = useMemo(() => {
    let present = 0;
    let absent = 0;
    let unrecorded = 0;
    for (const student of students) {
      const record = data.attendance.find(
        (a) => a.classId === activeClassId && a.studentId === student.id && a.date === date,
      );
      if (!record) unrecorded += 1;
      else if (record.present) present += 1;
      else absent += 1;
    }
    return { present, absent, unrecorded, total: students.length };
  }, [students, data.attendance, activeClassId, date]);

  function statusFor(studentId: string, day: string): 'present' | 'absent' | 'none' {
    const record = data.attendance.find(
      (a) => a.classId === activeClassId && a.studentId === studentId && a.date === day,
    );
    if (!record) return 'none';
    return record.present ? 'present' : 'absent';
  }

  async function togglePresent(studentId: string, present: boolean) {
    if (!activeClassId) return;
    setNotice('');
    setSaving(true);
    await upsertAttendance({ classId: activeClassId, studentId, date, present });
    if (!present && notifyAbsence) {
      const clubId = getSession()?.clubId;
      const className = visibleClasses.find((c) => c.id === activeClassId)?.name;
      if (clubId) {
        const result = await notificationService.notifyAbsenceByEmail({
          clubId,
          studentId,
          date,
          className,
        });
        if (result.success) {
          setNotice(`Στάλθηκε ειδοποίηση απουσίας (${result.data?.sent.join(', ')}).`);
        } else {
          setNotice(result.error ?? 'Αποτυχία ειδοποίησης απουσίας');
        }
      }
    }
    refresh();
    setSaving(false);
  }

  function exportCsv() {
    const lines = [
      ['Α/Α', 'Αθλητής', 'Κατάσταση', 'Ημερομηνία', 'Τμήμα'].join(';'),
      ...students.map((student, index) => {
        const st = statusFor(student.id, date);
        const label =
          st === 'present' ? 'Παρών' : st === 'absent' ? 'Απών' : 'Μη καταχωρημένο';
        return [
          String(index + 1),
          `${student.lastName} ${student.firstName}`,
          label,
          date,
          classesForSport.find((c) => c.id === activeClassId)?.name ?? '',
        ].join(';');
      }),
    ];
    const blob = new Blob(['\uFEFF' + lines.join('\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `parousies-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="stack-lg attendance-page">
      <PageHeader
        title="Παρουσίες"
        subtitle={
          sportFilter
            ? `Καταγραφή παρουσίας για ${sportFilter}.`
            : 'Καταγραφή παρουσίας ανά τμήμα και ημερομηνία.'
        }
      />

      <div className="att-toolbar">
        <label className="att-field">
          <span>Άθλημα</span>
          <div className="att-select">
            <select
              value={sportFilter}
              onChange={(e) => handleSportChange(e.target.value)}
              aria-label="Άθλημα"
            >
              {sportOptions.map((opt) => (
                <option key={opt.value || 'all'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown size={16} className="att-select-chevron" aria-hidden />
          </div>
        </label>

        <label className="att-field">
          <span>Ομάδα / Τμήμα</span>
          <div className="att-select">
            <Users size={18} className="att-select-icon" aria-hidden />
            <select
              value={activeClassId}
              onChange={(e) => setClassId(e.target.value)}
              aria-label="Ομάδα / Τμήμα"
            >
              {classesForSport.length === 0 ? <option value="">—</option> : null}
              {classesForSport.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <ChevronDown size={16} className="att-select-chevron" aria-hidden />
          </div>
        </label>

        <div className="att-field att-field--date">
          <span>Ημερομηνία</span>
          <label className="att-select att-select--date">
            <CalendarDays size={18} className="att-select-icon" aria-hidden />
            <span className="att-select-value">{formatDayLabel(date)}</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Επιλογή ημερομηνίας"
            />
            <ChevronDown size={16} className="att-select-chevron" aria-hidden />
          </label>
        </div>

        <div className="att-toolbar-actions">
          <label className="att-check">
            <input
              type="checkbox"
              checked={notifyAbsence}
              onChange={(e) => setNotifyAbsence(e.target.checked)}
            />
            <span>Email σε απουσία</span>
          </label>
          <button
            type="button"
            className="att-btn att-btn-primary"
            disabled={saving}
            onClick={() => setNotice('Η καταγραφή αποθηκεύεται αυτόματα σε κάθε αλλαγή.')}
          >
            Αποθήκευση
          </button>
          <button type="button" className="att-btn att-btn-ghost" onClick={exportCsv}>
            <Download size={16} /> Εξαγωγή
          </button>
        </div>
      </div>

      {notice ? <p className="att-notice">{notice}</p> : null}

      <div className="att-layout">
        <section className="att-card">
          <header className="att-card-head">
            <h2>Λίστα Αθλητών ({students.length})</h2>
          </header>
          <div className="att-list">
            {students.length === 0 ? (
              <p className="att-empty">Δεν υπάρχουν αθλητές σε αυτό το τμήμα.</p>
            ) : (
              students.map((student, index) => {
                const st = statusFor(student.id, date);
                const present = st === 'present';
                return (
                  <div key={student.id} className="att-row">
                    <span className="att-index">{index + 1}</span>
                    <div className="att-avatar" aria-hidden>
                      {(student.firstName?.[0] ?? '?').toUpperCase()}
                      {(student.lastName?.[0] ?? '').toUpperCase()}
                    </div>
                    <div className="att-name">
                      <strong>
                        {student.lastName} {student.firstName}
                      </strong>
                      <span>
                        {st === 'present'
                          ? 'Παρών'
                          : st === 'absent'
                            ? 'Απών'
                            : 'Μη καταχωρημένο'}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={`att-toggle${present ? ' is-on' : ''}${st === 'none' ? ' is-empty' : ''}`}
                      onClick={() =>
                        void togglePresent(student.id, st === 'present' ? false : true)
                      }
                      aria-pressed={present}
                      aria-label={present ? 'Σήμανση ως απών' : 'Σήμανση ως παρών'}
                    >
                      <span className="att-toggle-knob" />
                      <span className="att-toggle-label">
                        {present ? 'Παρών' : st === 'absent' ? 'Απών' : '—'}
                      </span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="att-card att-history">
          <header className="att-card-head">
            <h2>Ιστορικό Παρουσιών</h2>
            <div className="att-legend">
              <span>
                <i className="att-dot is-present" /> Παρών
              </span>
              <span>
                <i className="att-dot is-absent" /> Απών
              </span>
              <span>
                <i className="att-dot is-none" /> —
              </span>
            </div>
          </header>
          <div className="att-history-wrap">
            <table className="att-history-table">
              <thead>
                <tr>
                  <th>Αθλητής</th>
                  {historyDates.map((day) => (
                    <th
                      key={day}
                      className={day === date ? 'is-current' : undefined}
                    >
                      {formatShortDate(day)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.id}>
                    <td>
                      {student.lastName} {student.firstName}
                    </td>
                    {historyDates.map((day) => {
                      const st = statusFor(student.id, day);
                      return (
                        <td
                          key={day}
                          className={day === date ? 'is-current' : undefined}
                        >
                          <i
                            className={`att-dot is-${st}`}
                            title={
                              st === 'present'
                                ? 'Παρών'
                                : st === 'absent'
                                  ? 'Απών'
                                  : 'Μη καταχωρημένο'
                            }
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <footer className="att-summary">
        <div>
          <i className="att-dot is-present" /> Παρόντες <strong>{summary.present}</strong>
        </div>
        <div>
          <i className="att-dot is-absent" /> Απόντες <strong>{summary.absent}</strong>
        </div>
        <div>
          <i className="att-dot is-none" /> Μη καταχωρημένο <strong>{summary.unrecorded}</strong>
        </div>
        <div>
          Σύνολο αθλητών <strong>{summary.total}</strong>
        </div>
      </footer>
      <p className="att-footnote">
        Η καταγραφή αποθηκεύεται αυτόματα όταν αλλάζει η κατάσταση παρουσίας.
      </p>
    </div>
  );
}
