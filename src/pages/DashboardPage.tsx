import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, HeartPulse, Layers, Banknote, Percent, UserCog } from 'lucide-react';
import { getSession } from '../auth/auth';
import { AthletesIcon } from '../components/icons/AthletesIcon';
import { Button } from '../components/ui/Button';
import { PageHeader } from '../components/ui/PageHeader';
import { StatCard } from '../components/ui/StatCard';
import { getAccountBalances } from '../api/services/cashAccountsService';
import { clubOutstandingOwed } from '../api/services/feeChargesService';
import { useAppData } from '../hooks/useAppData';
import type { Coach, Student } from '../types';
import { formatAmkaForViewer } from '../utils/amkaAccess';
import { guardianDisplayName } from '../utils/greekSurname';
import { localDateIso } from '../utils/dates';
import { openAthleteHealthCardPreview } from '../utils/healthCardPreview';
import { formatCurrency, studentStatusLabels } from '../utils/labels';
import { athleteHealthCardValid, isClassListedActive } from '../utils/classHelpers';
import { getActiveSeason, seasonDisplayName } from '../utils/clubSeasons';
import { studentClassIds, studentInClass } from '../utils/studentClasses';
import { studentSports } from '../utils/studentSports';
import { clubSportsMatch, listActiveClubSportNames } from '../utils/clubSports';
import {
  filterOwnFinanceEntries,
  sessionSeesOnlyOwnFinance,
} from '../utils/financeOwnEntries';

type SportBucket = { key: string; label: string };

function pathWithSport(path: string, sportKey: string | null): string {
  if (!sportKey) return path;
  return `${path}?sport=${encodeURIComponent(sportKey)}`;
}

function createdOnLocalDay(iso: string, day: string): boolean {
  const parsed = new Date(iso);
  if (!Number.isNaN(parsed.getTime())) {
    return localDateIso(parsed) === day;
  }
  return iso.slice(0, 10) === day;
}

function resolveStudentSport(
  student: Student,
  classSportById: Map<string, string>,
): string {
  const own = studentSports(student)[0];
  if (own) return own;
  const ids = [
    ...(student.classIds ?? []),
    ...(student.classId ? [student.classId] : []),
  ];
  for (const id of ids) {
    const sport = classSportById.get(id)?.trim();
    if (sport) return sport;
  }
  return '';
}

function matchesSport(value: string | undefined | null, sportKey: string): boolean {
  return clubSportsMatch(value, sportKey);
}

function DoctorDashboard() {
  const { data } = useAppData();
  const [busyId, setBusyId] = useState<string | null>(null);

  const athletes = useMemo(
    () =>
      [...data.students]
        .filter((s) => s.status !== 'inactive')
        .sort((a, b) =>
          `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'el'),
        ),
    [data.students],
  );

  const withAmka = athletes.filter((s) => Boolean((s.amka ?? '').trim())).length;
  const withHealthCard = athletes.filter((s) => athleteHealthCardValid(s)).length;

  async function handleHealthCard(student: Student) {
    setBusyId(student.id);
    const result = await openAthleteHealthCardPreview(student);
    setBusyId(null);
    if (!result.success) {
      window.alert(result.error ?? 'Αποτυχία προεπισκόπησης κάρτας υγείας');
    }
  }

  return (
    <div className="stack-lg doctor-dashboard">
      <PageHeader
        title="Επισκόπηση ιατρού"
        subtitle="Αθλητές και κάρτα υγείας — χωρίς οικονομικά ή διαχείριση συλλόγου."
        actions={
          <Link className="btn btn-primary" to="/athletes">
            Όλοι οι αθλητές
          </Link>
        }
      />

      <div className="stats-grid cols-3">
        <StatCard
          label="Ενεργοί αθλητές"
          value={String(athletes.length)}
          hint="Διαθέσιμοι για κάρτα υγείας"
          icon={AthletesIcon}
        />
        <StatCard
          label="Με ΑΜΚΑ"
          value={String(withAmka)}
          hint={`${athletes.length - withAmka} χωρίς ΑΜΚΑ`}
          icon={HeartPulse}
        />
        <StatCard
          label="Κάρτα υγείας"
          value={String(withHealthCard)}
          hint="Σημειωμένη ως έγκυρη"
          icon={HeartPulse}
        />
      </div>

      <article className="panel">
        <div className="panel-head">
          <h2>Αθλητές</h2>
          <Link to="/athletes" className="text-link">
            Πλήρης λίστα →
          </Link>
        </div>
        {athletes.length === 0 ? (
          <p className="muted">Δεν υπάρχουν ενεργοί αθλητές.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Επώνυμο</th>
                  <th>Όνομα</th>
                  <th>ΑΜΚΑ</th>
                  <th>Γονέας</th>
                  <th>Κατάσταση</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {athletes.slice(0, 12).map((student) => (
                  <tr key={student.id}>
                    <td>
                      <strong>{student.lastName}</strong>
                    </td>
                    <td>
                      <strong>{student.firstName}</strong>
                    </td>
                    <td>{formatAmkaForViewer(student.amka, true)}</td>
                    <td>{guardianDisplayName(student) || '—'}</td>
                    <td>
                      <span className={`badge badge-${student.status}`}>
                        {studentStatusLabels[student.status]}
                      </span>
                    </td>
                    <td className="row-actions">
                      <Button
                        type="button"
                        variant="ghost"
                        title="Προεπισκόπηση / εκτύπωση κάρτας υγείας"
                        disabled={busyId === student.id}
                        onClick={() => void handleHealthCard(student)}
                      >
                        <HeartPulse size={16} />
                        <span className="btn-label-inline">
                          {busyId === student.id ? '…' : 'Κάρτα υγείας'}
                        </span>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {athletes.length > 12 ? (
          <p className="lede" style={{ marginTop: '0.75rem' }}>
            Εμφανίζονται οι πρώτοι 12. Δες όλους από{' '}
            <Link to="/athletes">Αθλητές</Link>.
          </p>
        ) : null}
      </article>
    </div>
  );
}

export function DashboardPage() {
  const { data } = useAppData();
  const isDoctor = getSession()?.role === 'doctor';
  const today = localDateIso();

  const classSportById = useMemo(() => {
    const map = new Map<string, string>();
    for (const cls of data.classes) {
      map.set(cls.id, cls.sport ?? '');
    }
    return map;
  }, [data.classes]);

  const sports = useMemo(() => {
    return listActiveClubSportNames(data.sports).map((label) => ({
      key: label,
      label,
    })) as SportBucket[];
  }, [data.sports]);

  const activeSeason = useMemo(
    () => getActiveSeason(data.clubSeasons, today),
    [data.clubSeasons, today],
  );

  const dashboardClasses = useMemo(
    () => data.classes.filter((cls) => isClassListedActive(cls, data.clubSeasons, today)),
    [data.classes, data.clubSeasons, today],
  );

  const dashboardClassNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const cls of dashboardClasses) {
      map.set(cls.id, cls.name);
    }
    return map;
  }, [dashboardClasses]);

  function classesForSport(sportKey: string | null) {
    return dashboardClasses
      .filter((cls) => {
        if (!sportKey) return true;
        return matchesSport(cls.sport, sportKey);
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'el'));
  }

  function statsForSport(sportKey: string | null) {
    const students = data.students.filter((student) => {
      if (!sportKey) return true;
      return matchesSport(resolveStudentSport(student, classSportById), sportKey);
    });
    const coaches = data.coaches.filter((coach: Coach) => {
      if (!sportKey) return true;
      return matchesSport(coach.sport, sportKey);
    });
    const classes = classesForSport(sportKey);

    const studentIds = new Set(students.map((s) => s.id));
    const activeStudents = students.filter((s) => s.status === 'active').length;
    const activeCoaches = coaches.filter((c) => c.active !== false).length;

    const ownOnly = sessionSeesOnlyOwnFinance();
    const fromTransactions = ownOnly
      ? 0
      : (data.transactions ?? [])
          .filter(
            (t) =>
              t.type === 'payment' &&
              createdOnLocalDay(t.createdAt, today) &&
              (!sportKey || studentIds.has(t.athleteId)),
          )
          .reduce((sum, t) => sum + t.amount, 0);

    const fromAthleteRevenues = filterOwnFinanceEntries(data.revenues)
      .filter((r) => {
        if (r.linkedTransactionId) return false;
        if (r.date !== today || r.paymentStatus !== 'paid') return false;
        if (!r.studentId && !r.surname && !r.firstName) return false;
        if (!sportKey) return true;
        if (r.sport && matchesSport(r.sport, sportKey)) return true;
        if (r.studentId && studentIds.has(r.studentId)) return true;
        return false;
      })
      .reduce((sum, r) => sum + r.amount, 0);

    return {
      activeStudents,
      totalStudents: students.length,
      activeCoaches,
      totalCoaches: coaches.length,
      classCount: classes.length,
      dailyAthletePayments: fromTransactions + fromAthleteRevenues,
    };
  }

  const showBySport = sports.length > 1;
  const sportRows: Array<{ key: string; label: string | null; sportKey: string | null }> =
    showBySport
      ? sports.map((sport) => ({
          key: sport.key,
          label: sport.label,
          sportKey: sport.key,
        }))
      : [
          {
            key: 'all',
            label: sports[0]?.label ?? null,
            sportKey: sports[0]?.key ?? null,
          },
        ];

  const moneyStrip = useMemo(() => {
    const ownOnly = sessionSeesOnlyOwnFinance();
    if (ownOnly) {
      const monthPrefix = today.slice(0, 7);
      const monthCollections = filterOwnFinanceEntries(data.revenues)
        .filter((r) => r.paymentStatus === 'paid' && r.date.slice(0, 7) === monthPrefix)
        .reduce((sum, r) => sum + r.amount, 0);
      return { monthCollections, outstanding: 0, cashBalance: 0 };
    }
    const monthPrefix = today.slice(0, 7);
    const payments = (data.transactions ?? []).filter((t) => t.type === 'payment');
    const monthCollections = payments
      .filter((t) => String(t.createdAt || '').slice(0, 7) === monthPrefix)
      .reduce((sum, t) => sum + t.amount, 0);
    const outstanding = clubOutstandingOwed(data.students ?? [], data.transactions ?? []);
    const cashBalance = getAccountBalances().reduce((sum, account) => sum + account.balance, 0);
    return { monthCollections, outstanding, cashBalance };
  }, [data.transactions, data.revenues, data.expenses, data.cashAccounts, today]);

  const adminKpis = useMemo(() => {
    const activeAthletes = data.students.filter((s) => s.status === 'active').length;
    const monthPrefix = today.slice(0, 7);
    const monthAttendance = (data.attendance ?? []).filter((a) => a.date.startsWith(monthPrefix));
    const attendancePct =
      monthAttendance.length > 0
        ? Math.round(
            (monthAttendance.filter((a) => a.present).length / monthAttendance.length) * 100,
          )
        : null;
    const expiredHealth = data.students.filter((s) => {
      if (s.status === 'inactive') return false;
      const exp = s.healthCardExpires?.trim();
      return Boolean(exp && exp < today);
    }).length;
    const pendingRegs = (data.registrationApplications ?? []).filter(
      (a) => a.status === 'pending',
    ).length;
    return { activeAthletes, attendancePct, expiredHealth, pendingRegs };
  }, [data.students, data.attendance, data.registrationApplications, today]);

  if (isDoctor) {
    return <DoctorDashboard />;
  }

  return (
    <div className="stack-lg">
      <PageHeader
        title="Επισκόπηση"
        subtitle={
          activeSeason
            ? `Διαχείριση ακαδημίας · τρέχουσα σεζόν ${seasonDisplayName(activeSeason)}`
            : 'Διαχείριση ακαδημίας σε μία οθόνη.'
        }
      />

      <div className="stats-grid cols-5 dashboard-kpi-row">
        <StatCard
          label="Ενεργοί αθλητές"
          value={String(adminKpis.activeAthletes)}
          hint="Κατάσταση active"
          icon={AthletesIcon}
        />
        <StatCard
          label="Παρουσία μήνα"
          value={adminKpis.attendancePct !== null ? `${adminKpis.attendancePct}%` : '—'}
          hint={
            adminKpis.attendancePct !== null
              ? 'Από καταχωρημένες παρουσίες'
              : 'Χωρίς καταχωρήσεις'
          }
          icon={Percent}
          tone={
            adminKpis.attendancePct !== null && adminKpis.attendancePct >= 80
              ? 'positive'
              : adminKpis.attendancePct !== null && adminKpis.attendancePct < 60
                ? 'warn'
                : 'default'
          }
        />
        <StatCard
          label="Εκκρεμείς οφειλές"
          value={formatCurrency(moneyStrip.outstanding)}
          hint="Ανοιχτές χρεώσεις αθλητών · ανάλυση στις Συνδρομές"
          icon={Banknote}
          tone={moneyStrip.outstanding > 0 ? 'warn' : 'positive'}
          to="/fees"
        />
        <StatCard
          label="Ληγμένες ιατρικές"
          value={String(adminKpis.expiredHealth)}
          hint="Ημερομηνία λήξης περασμένη"
          icon={HeartPulse}
          tone={adminKpis.expiredHealth > 0 ? 'negative' : 'positive'}
        />
        <StatCard
          label="Αιτήσεις εγγραφής"
          value={String(adminKpis.pendingRegs)}
          hint="Εκκρεμεί έγκριση"
          icon={ClipboardList}
          tone={adminKpis.pendingRegs > 0 ? 'warn' : 'default'}
        />
      </div>

      <div className="money-strip" aria-label="Οικονομική σύνοψη">
        <div className="money-strip-item">
          <span>Ταμείο</span>
          <strong>{formatCurrency(moneyStrip.cashBalance)}</strong>
        </div>
        <Link to="/fees" className="money-strip-item is-warn">
          <span>Οφειλές</span>
          <strong>{formatCurrency(moneyStrip.outstanding)}</strong>
        </Link>
        <div className="money-strip-item is-accent">
          <span>Εισπράξεις μήνα</span>
          <strong>{formatCurrency(moneyStrip.monthCollections)}</strong>
        </div>
      </div>

      {sportRows.map((row) => {
        const stats = statsForSport(row.sportKey);
        const classes = classesForSport(row.sportKey);
                const athletes = data.students
          .filter((s) => s.status !== 'inactive')
          .filter((s) => {
            if (!row.sportKey) return true;
            return matchesSport(resolveStudentSport(s, classSportById), row.sportKey);
          })
          .sort((a, b) =>
            `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'el'),
          );
        const classesScroll = classes.length > 5;
        const athletesScroll = athletes.length > 5;

        return (
          <section key={row.key} className="dashboard-sport-block">
            {row.label ? <h2 className="dashboard-sport-title">{row.label}</h2> : null}
            <div className="stats-grid cols-4">
              <StatCard
                label="Ενεργοί αθλητές"
                value={String(stats.activeStudents)}
                hint={`${stats.totalStudents} συνολικά`}
                icon={AthletesIcon}
              />
              <StatCard
                label="Προπονητές"
                value={String(stats.activeCoaches)}
                hint={`${stats.totalCoaches} συνολικά`}
                icon={UserCog}
              />
              <StatCard
                label="Τμήματα"
                value={String(stats.classCount)}
                hint={`${stats.activeStudents} ενεργοί αθλητές`}
                icon={Layers}
              />
              <StatCard
                label="Ημερίσια Έσοδα"
                value={formatCurrency(stats.dailyAthletePayments)}
                hint="Πληρωμές αθλητών σήμερα"
                icon={Banknote}
                tone="positive"
              />
            </div>

            <div className="grid-2">
              <article className="panel">
                <div className="panel-head">
                  <h2>Τμήματα{row.label ? ` · ${row.label}` : ''}</h2>
                  <Link to={pathWithSport('/classes', row.sportKey)} className="text-link">
                    Διαχείριση →
                  </Link>
                </div>
                <div className={classesScroll ? 'table-wrap dashboard-preview-scroll' : 'table-wrap'}>
                  <table>
                    <thead>
                      <tr>
                        <th>Όνομα</th>
                        <th>Ηλικίες</th>
                        <th>Αθλητές</th>
                      </tr>
                    </thead>
                    <tbody>
                      {classes.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="muted">
                            Δεν υπάρχουν ενεργά τμήματα τρέχουσας σεζόν.
                          </td>
                        </tr>
                      ) : (
                        classes.map((cls) => {
                          const count = data.students.filter(
                            (s) => studentInClass(s, cls.id) && s.status !== 'inactive',
                          ).length;
                          return (
                            <tr key={cls.id}>
                              <td>
                                <strong>{cls.name}</strong>
                                {!showBySport && cls.sport ? (
                                  <div className="muted">{cls.sport}</div>
                                ) : null}
                              </td>
                              <td>{cls.ageGroup || '—'}</td>
                              <td>{count}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="panel">
                <div className="panel-head">
                  <h2>Κατάσταση αθλητών{row.label ? ` · ${row.label}` : ''}</h2>
                  <Link to={pathWithSport('/athletes', row.sportKey)} className="text-link">
                    Όλοι →
                  </Link>
                </div>
                {athletes.length === 0 ? (
                  <p className="muted">Δεν υπάρχουν ενεργοί αθλητές.</p>
                ) : (
                  <div className={athletesScroll ? 'table-wrap dashboard-preview-scroll' : 'table-wrap'}>
                    <table>
                      <thead>
                        <tr>
                          <th>Επώνυμο</th>
                          <th>Όνομα</th>
                          <th>Τμήμα</th>
                          <th>Κατάσταση</th>
                        </tr>
                      </thead>
                      <tbody>
                        {athletes.map((student) => {
                          const names = studentClassIds(student)
                            .map((id) => dashboardClassNameById.get(id))
                            .filter(Boolean);
                          const clsLabel = names.join(', ') || 'Χωρίς τμήμα';
                          return (
                            <tr key={student.id}>
                              <td>
                                <strong>{student.lastName}</strong>
                              </td>
                              <td>
                                <strong>{student.firstName}</strong>
                              </td>
                              <td>{clsLabel}</td>
                              <td>
                                <span className={`badge badge-${student.status}`}>
                                  {studentStatusLabels[student.status]}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="quick-links">
                  <Link to={pathWithSport('/schedule', row.sportKey)}>Πρόγραμμα</Link>
                  <Link to={pathWithSport('/attendance', row.sportKey)}>Παρουσίες</Link>
                  <Link to={pathWithSport('/classes', row.sportKey)}>Τμήματα</Link>
                </div>
              </article>
            </div>
          </section>
        );
      })}
    </div>
  );
}
