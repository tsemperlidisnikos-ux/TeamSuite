import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  Megaphone,
  User,
  XCircle,
} from 'lucide-react';
import * as vivaService from '../api/services/vivaService';
import { getSession } from '../auth/auth';
import { getClubViva } from '../auth/clubs';
import { Button } from '../components/ui/Button';
import { useAppData } from '../hooks/useAppData';
import { getPreviewClubId } from '../platform/platformConfig';
import { localDateIso } from '../utils/dates';
import { formatCurrency, formatDate, dayNames } from '../utils/labels';
import { announcementVisibleToAthlete } from '../utils/announcementAudience';
import { studentClassIds } from '../utils/studentClasses';

function athleteBalance(
  athleteId: string,
  transactions: { athleteId: string; type: string; amount: number }[],
): number {
  return transactions
    .filter((t) => t.athleteId === athleteId)
    .reduce((sum, t) => sum + (t.type === 'charge' ? t.amount : -t.amount), 0);
}

function greetingName(fullName?: string | null): string {
  const first = (fullName ?? '').trim().split(/\s+/)[0];
  if (!first) return 'αθλητή';
  return first.charAt(0).toLocaleUpperCase('el') + first.slice(1).toLocaleLowerCase('el');
}

function shortDayBadge(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const day = dayNames[d.getDay()].slice(0, 3).toUpperCase();
  const months = [
    'ΙΑΝ',
    'ΦΕΒ',
    'ΜΑΡ',
    'ΑΠΡ',
    'ΜΑΙ',
    'ΙΟΥΝ',
    'ΙΟΥΛ',
    'ΑΥΓ',
    'ΣΕΠ',
    'ΟΚΤ',
    'ΝΟΕ',
    'ΔΕΚ',
  ];
  return `${day} ${d.getDate()} ${months[d.getMonth()]}`;
}

export function AthletePortalPage() {
  const { data } = useAppData();
  const session = getSession();
  const clubId = getPreviewClubId() ?? session?.clubId ?? null;
  const viva = clubId ? getClubViva(clubId) : null;
  const [payError, setPayError] = useState('');
  const [paying, setPaying] = useState(false);

  const athlete = useMemo(() => {
    if (session?.athleteId) {
      return data.students.find((s) => s.id === session.athleteId) ?? null;
    }
    const email = session?.email?.toLowerCase() ?? '';
    return (
      data.students.find((s) => s.email.toLowerCase() === email && s.status !== 'inactive') ?? null
    );
  }, [data.students, session]);

  const balance = athlete ? athleteBalance(athlete.id, data.transactions ?? []) : 0;
  const today = localDateIso();

  const upcoming = useMemo(() => {
    if (!athlete) return [];
    const ids = new Set(studentClassIds(athlete));
    if (ids.size === 0) return [];
    return (data.trainings ?? [])
      .filter((t) => t.date >= today && t.classId && ids.has(t.classId))
      .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`))
      .slice(0, 5);
  }, [data.trainings, athlete, today]);

  const attendanceAll = useMemo(() => {
    if (!athlete) return [];
    return (data.attendance ?? [])
      .filter((a) => a.studentId === athlete.id)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [data.attendance, athlete]);

  const attendanceStats = useMemo(() => {
    const present = attendanceAll.filter((a) => a.present).length;
    const absent = attendanceAll.filter((a) => !a.present).length;
    const total = present + absent;
    const rate = total === 0 ? 0 : Math.round((present / total) * 100);
    return { present, absent, rate };
  }, [attendanceAll]);

  const attendance = attendanceAll.slice(0, 6);

  const announcements = useMemo(() => {
    if (!athlete) return [];
    const ids = studentClassIds(athlete);
    const classSport =
      ids
        .map((id) => data.classes.find((c) => c.id === id)?.sport)
        .find(Boolean) || null;
    return (data.announcements ?? [])
      .filter((a) =>
        announcementVisibleToAthlete(a, {
          athleteId: athlete.id,
          classId: athlete.classId,
          classIds: ids,
          sport: athlete.sport,
          clubName: athlete.clubName,
          classSport,
        }),
      )
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, 5);
  }, [data.announcements, data.classes, athlete]);

  const className = studentClassIds(athlete ?? { classId: null, classIds: [] })
    .map((id) => data.classes.find((c) => c.id === id)?.name)
    .filter(Boolean)
    .join(', ');

  async function handlePay() {
    if (!clubId || !athlete || balance <= 0) return;
    setPaying(true);
    setPayError('');
    const result = await vivaService.createVivaCheckout({
      clubId,
      amountEuro: balance,
      athleteId: athlete.id,
      athleteName: `${athlete.lastName} ${athlete.firstName}`,
      customerEmail: athlete.email || session?.email || undefined,
      customerFullName: `${athlete.lastName} ${athlete.firstName}`,
      merchantTrns: `Οφειλή ${athlete.lastName} ${athlete.firstName}`,
    });
    setPaying(false);
    if (!result.success || !result.data?.checkoutUrl) {
      setPayError(result.error ?? 'Αποτυχία Viva');
      return;
    }
    window.location.href = result.data.checkoutUrl;
  }

  return (
    <div className="aport">
      <header className="aport-welcome">
        <h1>Καλωσήρθες στο SportSuite 360, {greetingName(session?.fullName)}!</h1>
        {className ? <p className="aport-class">Τμήμα · {className}</p> : null}
        {athlete ? (
          <Link className="aport-profile-link" to={`/athletes/${athlete.id}`}>
            <User size={16} /> Το προφίλ μου
          </Link>
        ) : null}
      </header>

      {!athlete ? (
        <section className="panel aport-card">
          <p className="muted">
            Δεν βρέθηκε συνδεδεμένο προφίλ αθλητή. Ζητήστε από τη γραμματεία να συνδέσει τον
            λογαριασμό σας με καρτέλα αθλητή.
          </p>
        </section>
      ) : (
        <>
          <div className="aport-top">
            <section className="aport-balance" id="finance">
              <span className="aport-balance-label">Υπόλοιπο λογαριασμού</span>
              <strong className="aport-balance-value">{formatCurrency(balance)}</strong>
              <em>
                Ενημερώθηκε:{' '}
                {new Date().toLocaleString('el-GR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </em>
              {payError ? <p className="form-error">{payError}</p> : null}
              {balance > 0 && viva?.enabled ? (
                <Button type="button" disabled={paying} onClick={() => void handlePay()}>
                  <CreditCard size={16} /> {paying ? 'Μετάβαση…' : 'Πληρωμή με Viva'}
                </Button>
              ) : (
                <p className="aport-balance-hint">
                  {balance <= 0 ? 'Δεν υπάρχει οφειλή.' : 'Το Viva δεν είναι ενεργό.'}
                </p>
              )}
              <Link to="/fees" className="aport-history-link">
                Ιστορικό Συναλλαγών
              </Link>
            </section>

            <section className="aport-card panel" id="trainings">
              <div className="aport-card-head">
                <h2>
                  <CalendarDays size={16} /> Πρόγραμμα προπονήσεων
                </h2>
                <Link to="/schedule">Προβολή όλων</Link>
              </div>
              {upcoming.length === 0 ? (
                <p className="muted">Δεν υπάρχουν προσεχείς προπονήσεις.</p>
              ) : (
                <ul className="aport-trainings">
                  {upcoming.map((t) => (
                    <li key={t.id}>
                      <span className="aport-day-badge">{shortDayBadge(t.date)}</span>
                      <div>
                        <strong>
                          {t.startTime}
                          {t.endTime ? ` - ${t.endTime}` : ''}
                        </strong>
                        <span>Προπόνηση ομάδας</span>
                        <em>{t.location || '—'}</em>
                      </div>
                      <span className="aport-pill">Προγραμματισμένη</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="aport-card panel" id="attendance">
              <div className="aport-card-head">
                <h2>
                  <ClipboardCheck size={16} /> Ιστορικό παρουσιών
                </h2>
                <Link to="/attendance">Προβολή όλων</Link>
              </div>
              <div className="aport-att-stats">
                <div>
                  <strong>{attendanceStats.present}</strong>
                  <span>Παρουσίες</span>
                </div>
                <div>
                  <strong>{attendanceStats.absent}</strong>
                  <span>Απουσίες</span>
                </div>
                <div>
                  <strong>{attendanceStats.rate}%</strong>
                  <span>Συμμετοχή</span>
                </div>
              </div>
              {attendance.length === 0 ? (
                <p className="muted">Δεν υπάρχουν καταχωρήσεις.</p>
              ) : (
                <ul className="aport-att-list">
                  {attendance.map((row) => (
                    <li key={row.id}>
                      <span>{formatDate(row.date)}</span>
                      <span className="aport-att-type">Προπόνηση</span>
                      <span className={`aport-att-status ${row.present ? 'is-ok' : 'is-bad'}`}>
                        {row.present ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                        {row.present ? 'Παρουσία' : 'Απουσία'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="aport-card panel aport-ann" id="announcements">
            <div className="aport-card-head">
              <h2>
                <Megaphone size={16} /> Ανακοινώσεις
              </h2>
              <Link to="/announcements">Προβολή όλων</Link>
            </div>
            {announcements.length === 0 ? (
              <p className="muted">Δεν υπάρχουν ανακοινώσεις.</p>
            ) : (
              <ul className="aport-ann-list">
                {announcements.map((a) => (
                  <li key={a.id}>
                    <i aria-hidden />
                    <div>
                      <strong>{a.title}</strong>
                      <span>
                        {(a.message || '').slice(0, 110)}
                        {(a.message || '').length > 110 ? '…' : ''}
                      </span>
                    </div>
                    <em>{a.createdAt ? formatDate(a.createdAt.slice(0, 10)) : ''}</em>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
