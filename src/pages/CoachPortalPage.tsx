import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell,
  CalendarDays,
  ClipboardCheck,
  Layers,
  Users,
} from 'lucide-react';
import { upsertAttendance } from '../api/services/attendanceService';
import { getSession } from '../auth/auth';
import { Button } from '../components/ui/Button';
import { useAppData } from '../hooks/useAppData';
import { announcementVisibleToCoach } from '../utils/announcementAudience';
import {
  classIdsOf,
  resolveCoachRecord,
  visibleClassesForSession,
} from '../utils/coachScope';
import { localDateIso } from '../utils/dates';
import { dayNames, formatDate } from '../utils/labels';
import { studentInAnyClass, studentInClass } from '../utils/studentClasses';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export function CoachPortalPage() {
  const { data, refresh } = useAppData();
  const session = getSession();
  const [date, setDate] = useState(() => localDateIso());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [presentMap, setPresentMap] = useState<Record<string, boolean>>({});

  const coach = useMemo(
    () => resolveCoachRecord(data.coaches, session?.coachId),
    [data.coaches, session?.coachId],
  );

  const myClasses = useMemo(
    () => visibleClassesForSession(data.classes, data.coaches, session, { seasons: data.clubSeasons }),
    [data.classes, data.coaches, data.clubSeasons, session],
  );

  const classIds = useMemo(() => classIdsOf(myClasses), [myClasses]);

  const linkMissing = Boolean(session && !session.coachId);
  const linkBroken = Boolean(session?.coachId && !coach);

  const [classId, setClassId] = useState('');
  const activeClassId = classId && classIds.has(classId) ? classId : myClasses[0]?.id ?? '';

  const today = localDateIso();
  const upcoming = useMemo(
    () =>
      (data.trainings ?? [])
        .filter((t) => t.date >= today && t.classId && classIds.has(t.classId))
        .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`))
        .slice(0, 5),
    [data.trainings, classIds, today],
  );

  const nextTraining = upcoming[0] ?? null;

  const roster = useMemo(
    () =>
      (data.students ?? []).filter(
        (s) => studentInClass(s, activeClassId) && s.status !== 'inactive',
      ),
    [data.students, activeClassId],
  );

  const athleteCount = useMemo(
    () =>
      (data.students ?? []).filter(
        (s) => studentInAnyClass(s, classIds) && s.status !== 'inactive',
      ).length,
    [data.students, classIds],
  );

  const announcements = useMemo(() => {
    if (!coach) return [];
    return (data.announcements ?? [])
      .filter((a) => announcementVisibleToCoach(a, coach.id, coach.sport))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, 4);
  }, [data.announcements, coach]);

  const classNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const cls of data.classes ?? []) map.set(cls.id, cls.name);
    return map;
  }, [data.classes]);

  function isPresent(studentId: string): boolean {
    if (studentId in presentMap) return presentMap[studentId];
    const record = (data.attendance ?? []).find(
      (a) => a.classId === activeClassId && a.studentId === studentId && a.date === date,
    );
    return record?.present ?? false;
  }

  async function togglePresent(studentId: string) {
    if (!activeClassId) return;
    const next = !isPresent(studentId);
    setPresentMap((prev) => ({ ...prev, [studentId]: next }));
    setSavingId(studentId);
    setNotice('');
    const result = await upsertAttendance({
      classId: activeClassId,
      studentId,
      date,
      present: next,
    });
    setSavingId(null);
    if (!result.success) {
      setNotice(result.error ?? 'Αποτυχία αποθήκευσης παρουσίας');
      setPresentMap((prev) => {
        const copy = { ...prev };
        delete copy[studentId];
        return copy;
      });
      return;
    }
    refresh();
  }

  async function saveAllPresent() {
    if (!activeClassId) return;
    setNotice('');
    for (const student of roster) {
      const present = isPresent(student.id);
      await upsertAttendance({
        classId: activeClassId,
        studentId: student.id,
        date,
        present,
      });
    }
    setNotice('Οι παρουσίες αποθηκεύτηκαν.');
    refresh();
  }

  const dateLabel = new Date().toLocaleDateString('el-GR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="cport">
      <header className="cport-welcome">
        <div>
          <h1>Καλωσήρθες, Coach!</h1>
          <p className="cport-sub">Αρχική επισκόπηση</p>
        </div>
        <div className="cport-welcome-right">
          <span className="cport-role-pill">Προπονητής</span>
          <time>{dateLabel}</time>
        </div>
      </header>

      {linkMissing ? (
        <section className="panel cport-card">
          <p className="form-error">
            Ο λογαριασμός δεν είναι συνδεδεμένος με καρτέλα προπονητή. Ζητήστε από τον διαχειριστή
            (Ρυθμίσεις → Χρήστες) να ορίσει «Σύνδεση με προπονητή».
          </p>
        </section>
      ) : null}

      {linkBroken ? (
        <section className="panel cport-card">
          <p className="form-error">
            Η σύνδεση προπονητή δεν είναι έγκυρη (η καρτέλα δεν βρέθηκε ή είναι ανενεργή).
          </p>
        </section>
      ) : null}

      {!linkMissing && !linkBroken ? (
        <>
          <div className="cport-stats">
            <article className="cport-stat panel">
              <Layers size={18} />
              <div>
                <span>Τα Τμήματά μου</span>
                <strong>{myClasses.length} ενεργά τμήματα</strong>
                <Link to="/classes">Προβολή τμημάτων</Link>
              </div>
            </article>
            <article className="cport-stat panel">
              <CalendarDays size={18} />
              <div>
                <span>Επόμενη Προπόνηση</span>
                <strong>
                  {nextTraining
                    ? `${formatDate(nextTraining.date)}, ${nextTraining.startTime}${
                        nextTraining.endTime ? ` - ${nextTraining.endTime}` : ''
                      }`
                    : '—'}
                </strong>
                <em>{nextTraining?.location || '—'}</em>
                <Link to="/schedule">Προβολή προγράμματος</Link>
              </div>
            </article>
            <article className="cport-stat panel">
              <Bell size={18} />
              <div>
                <span>Ανακοινώσεις</span>
                <strong>{announcements.length} πρόσφατες</strong>
                <Link to="/announcements">Προβολή όλων</Link>
              </div>
            </article>
            <article className="cport-stat panel">
              <Users size={18} />
              <div>
                <span>Συνολικοί Αθλητές</span>
                <strong>{athleteCount} σε όλα τα τμήματα</strong>
                <Link to="/athletes">Προβολή αθλητών</Link>
              </div>
            </article>
          </div>

          <div className="cport-main">
            <section className="cport-card panel" id="attendance">
              <div className="cport-card-head">
                <h2>
                  <ClipboardCheck size={16} /> Τα Τμήματά μου — Απουσίες / Παρουσίες
                </h2>
                <div className="cport-att-filters">
                  <select value={activeClassId} onChange={(e) => setClassId(e.target.value)}>
                    {myClasses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
              </div>

              {notice ? (
                <p className={notice.includes('αποθηκεύτηκαν') ? 'settings-success' : 'form-error'}>
                  {notice}
                </p>
              ) : null}

              {myClasses.length === 0 ? (
                <p className="muted">Δεν βρέθηκαν τμήματα συνδεδεμένα με τον λογαριασμό σας.</p>
              ) : roster.length === 0 ? (
                <p className="muted">Δεν υπάρχουν ενεργοί αθλητές στο τμήμα.</p>
              ) : (
                <div className="table-wrap">
                  <table className="cport-att-table">
                    <thead>
                      <tr>
                        <th>Αθλητής</th>
                        <th>Παρουσία</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roster.map((student) => {
                        const name = `${student.lastName} ${student.firstName}`.trim();
                        const present = isPresent(student.id);
                        const busy = savingId === student.id;
                        return (
                          <tr key={student.id}>
                            <td>
                              <div className="cport-athlete">
                                <span className="cport-avatar" aria-hidden>
                                  {initials(name)}
                                </span>
                                {name}
                              </div>
                            </td>
                            <td>
                              <button
                                type="button"
                                className={`cport-toggle${present ? ' is-on' : ''}`}
                                disabled={busy}
                                onClick={() => void togglePresent(student.id)}
                                aria-pressed={present}
                              >
                                <i />
                                {present ? 'Παρουσία' : 'Απουσία'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="cport-att-footer">
                <Button type="button" onClick={() => void saveAllPresent()}>
                  Αποθήκευση Παρουσιών
                </Button>
                <Link to="/athletes">Προβολή όλων των αθλητών</Link>
              </div>
            </section>

            <aside className="cport-side">
              <section className="cport-card panel">
                <div className="cport-card-head">
                  <h2>Προσεχείς Προπονήσεις</h2>
                </div>
                {upcoming.length === 0 ? (
                  <p className="muted">Δεν υπάρχουν προσεχείς προπονήσεις.</p>
                ) : (
                  <ul className="cport-upcoming">
                    {upcoming.map((t) => {
                      const d = new Date(`${t.date}T12:00:00`);
                      return (
                        <li key={t.id}>
                          <strong>
                            {dayNames[d.getDay()].slice(0, 3)} {d.getDate()}/
                            {String(d.getMonth() + 1).padStart(2, '0')}
                          </strong>
                          <span>
                            {t.startTime}
                            {t.endTime ? ` - ${t.endTime}` : ''}
                          </span>
                          <em>
                            {(t.classId && classNameById.get(t.classId)) || 'Προπόνηση'} ·{' '}
                            {t.location || '—'}
                          </em>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <Link to="/schedule" className="cport-side-link">
                  Προβολή πλήρους προγράμματος
                </Link>
              </section>

              <section className="cport-card panel">
                <div className="cport-card-head">
                  <h2>Τελευταίες Ανακοινώσεις</h2>
                </div>
                {announcements.length === 0 ? (
                  <p className="muted">Δεν υπάρχουν ανακοινώσεις.</p>
                ) : (
                  <ul className="cport-ann">
                    {announcements.map((a) => (
                      <li key={a.id}>
                        <i aria-hidden />
                        <div>
                          <strong>{a.title}</strong>
                          <span>{a.createdAt ? formatDate(a.createdAt.slice(0, 10)) : ''}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <Link to="/announcements" className="cport-side-link">
                  Προβολή όλων των ανακοινώσεων
                </Link>
              </section>
            </aside>
          </div>
        </>
      ) : null}
    </div>
  );
}
