import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, HeartPulse, Layers, Banknote, AlertTriangle } from 'lucide-react';
import { getSession } from '../auth/auth';
import { AthletesIcon } from '../components/icons/AthletesIcon';
import { Button } from '../components/ui/Button';
import { PageHeader } from '../components/ui/PageHeader';
import { StatCard } from '../components/ui/StatCard';
import { getAccountBalances } from '../api/services/cashAccountsService';
import { clubOutstandingOwed } from '../api/services/feeChargesService';
import { getClubById } from '../auth/clubs';
import { getPreviewClubId } from '../platform/platformConfig';
import { useAppData } from '../hooks/useAppData';
import type { Student } from '../types';
import { formatAmkaForViewer } from '../utils/amkaAccess';
import { guardianDisplayName } from '../utils/greekSurname';
import { localDateIso } from '../utils/dates';
import { openAthleteHealthCardPreview } from '../utils/healthCardPreview';
import { formatCurrency, studentStatusLabels } from '../utils/labels';
import { athleteHealthCardValid, isClassListedActive } from '../utils/classHelpers';
import { getActiveSeason, seasonDisplayName } from '../utils/clubSeasons';
import { studentSports } from '../utils/studentSports';
import { clubSportsMatch, listActiveClubSportNames } from '../utils/clubSports';
import { listLowStockProducts } from '../utils/warehouseStock';
import { buildDailyTill } from '../utils/dailyTill';
import {
  isRentalBookingCollected,
  listUncollectedRentalBookings,
  rentalRevenueDate,
} from '../api/services/rentalRevenueBridge';
import {
  filterOwnFinanceEntries,
  sessionSeesOnlyOwnFinance,
} from '../utils/financeOwnEntries';

type SportBucket = { key: string; label: string };

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
  const session = getSession();
  const isDoctor = session?.role === 'doctor';
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

  const moneyStrip = useMemo(() => {
    const ownRevenues = filterOwnFinanceEntries(data.revenues).filter(
      (r) => r.paymentStatus === 'paid',
    );
    const todayRevenues = ownRevenues
      .filter((r) => r.date === today)
      .reduce((sum, r) => sum + r.amount, 0);
    const ownOnly = sessionSeesOnlyOwnFinance();
    if (ownOnly) {
      const monthPrefix = today.slice(0, 7);
      const monthCollections = ownRevenues
        .filter((r) => r.date.slice(0, 7) === monthPrefix)
        .reduce((sum, r) => sum + r.amount, 0);
      return {
        monthCollections,
        dailyIncome: todayRevenues,
        outstanding: 0,
        cashBalance: 0,
      };
    }
    const monthPrefix = today.slice(0, 7);
    const payments = (data.transactions ?? []).filter((t) => t.type === 'payment');
    const monthFromAthletes = payments
      .filter((t) => String(t.createdAt || '').slice(0, 7) === monthPrefix)
      .reduce((sum, t) => sum + t.amount, 0);
    const monthFromRevenues = ownRevenues
      .filter((r) => r.date.slice(0, 7) === monthPrefix && !r.linkedTransactionId)
      .reduce((sum, r) => sum + r.amount, 0);
    const outstanding = clubOutstandingOwed(data.students ?? [], data.transactions ?? []);
    const cashBalance = getAccountBalances().reduce((sum, account) => sum + account.balance, 0);
    const todayAthleteTx = payments
      .filter((t) => createdOnLocalDay(t.createdAt, today))
      .reduce((sum, t) => sum + t.amount, 0);
    const todayFromRevenues = ownRevenues
      .filter((r) => r.date === today && !r.linkedTransactionId)
      .reduce((sum, r) => sum + r.amount, 0);
    const countedRentalIds = new Set(
      ownRevenues
        .filter((r) => r.linkedRentalBookingId)
        .map((r) => r.linkedRentalBookingId as string),
    );
    const todayFromCollectedRentals = (data.rentalBookings ?? [])
      .filter(
        (b) =>
          isRentalBookingCollected(b) &&
          rentalRevenueDate(b) === today &&
          Number(b.amount) > 0 &&
          !countedRentalIds.has(b.id),
      )
      .reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
    return {
      monthCollections: monthFromAthletes + monthFromRevenues,
      dailyIncome: todayAthleteTx + todayFromRevenues + todayFromCollectedRentals,
      outstanding,
      cashBalance,
    };
  }, [data.transactions, data.revenues, data.expenses, data.cashAccounts, data.rentalBookings, today]);

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
    const pendingRegs = (data.registrationApplications ?? []).filter(
      (a) => a.status === 'pending',
    ).length;
    const till = buildDailyTill(data, today);
    const receiptGap = Math.round((till.collectionsTotal - till.receiptsTotal) * 100) / 100;
    return {
      activeAthletes,
      attendancePct,
      pendingRegs,
      tillCollections: till.collectionsTotal,
      tillReceiptGap: receiptGap,
      tillMissingReceipts: till.missingReceipts.length,
    };
  }, [
    data.students,
    data.attendance,
    data.registrationApplications,
    data.transactions,
    data.revenues,
    data.rentalBookings,
    data.receiptIssues,
    today,
  ]);

  const dashboardClub = getClubById(getPreviewClubId() ?? session?.clubId ?? '');
  const sportSummaryRows = useMemo(() => {
    const ownOnly = sessionSeesOnlyOwnFinance();
    const monthPrefix = today.slice(0, 7);
    const rows = sports.map((sport) => ({
      key: sport.key,
      label: sport.label,
      students: data.students.filter((student) =>
        matchesSport(resolveStudentSport(student, classSportById), sport.key)),
      classes: dashboardClasses.filter((cls) => matchesSport(cls.sport, sport.key)),
      coaches: data.coaches.filter((coach) =>
        coach.active !== false && matchesSport(coach.sport, sport.key)),
    }));
    const withoutSport = {
      key: '',
      label: 'Χωρίς άθλημα',
      students: data.students.filter(
        (student) => !resolveStudentSport(student, classSportById).trim(),
      ),
      classes: dashboardClasses.filter((cls) => !String(cls.sport ?? '').trim()),
      coaches: data.coaches.filter(
        (coach) => coach.active !== false && !String(coach.sport ?? '').trim(),
      ),
    };

    return [...rows, withoutSport].map((row) => {
      const studentIds = new Set(row.students.map((student) => student.id));
      const transactionCollections = ownOnly
        ? 0
        : (data.transactions ?? [])
            .filter(
              (transaction) =>
                transaction.type === 'payment' &&
                String(transaction.createdAt || '').slice(0, 7) === monthPrefix &&
                studentIds.has(transaction.athleteId),
            )
            .reduce((sum, transaction) => sum + transaction.amount, 0);
      const revenueCollections = filterOwnFinanceEntries(data.revenues)
        .filter((revenue) => {
          if (
            revenue.paymentStatus !== 'paid' ||
            revenue.linkedTransactionId ||
            revenue.date.slice(0, 7) !== monthPrefix
          ) {
            return false;
          }
          if (revenue.studentId) return studentIds.has(revenue.studentId);
          return row.key
            ? matchesSport(revenue.sport, row.key)
            : !String(revenue.sport ?? '').trim();
        })
        .reduce((sum, revenue) => sum + revenue.amount, 0);

      return {
        ...row,
        activeAthletes: row.students.filter((student) => student.status === 'active').length,
        monthCollections: transactionCollections + revenueCollections,
        outstanding: ownOnly
          ? 0
          : clubOutstandingOwed(row.students, data.transactions ?? []),
      };
    });
  }, [
    sports,
    data.students,
    data.coaches,
    data.transactions,
    data.revenues,
    dashboardClasses,
    classSportById,
    today,
  ]);
  const sportSummaryTotals = useMemo(
    () =>
      sportSummaryRows.reduce(
        (totals, row) => ({
          activeAthletes: totals.activeAthletes + row.activeAthletes,
          classes: totals.classes + row.classes.length,
          coaches: totals.coaches + row.coaches.length,
          monthCollections: totals.monthCollections + row.monthCollections,
          outstanding: totals.outstanding + row.outstanding,
        }),
        { activeAthletes: 0, classes: 0, coaches: 0, monthCollections: 0, outstanding: 0 },
      ),
    [sportSummaryRows],
  );
  const dailyTill = useMemo(() => buildDailyTill(data, today), [data, today]);
  const dailyRentalCollections = useMemo(
    () =>
      (data.rentalBookings ?? [])
        .filter(
          (booking) =>
            isRentalBookingCollected(booking) && rentalRevenueDate(booking) === today,
        )
        .reduce((sum, booking) => sum + (Number(booking.amount) || 0), 0),
    [data.rentalBookings, today],
  );
  const visibleSportRows = useMemo(
    () =>
      sportSummaryRows.filter(
        (row) =>
          row.key !== '' ||
          row.activeAthletes > 0 ||
          row.classes.length > 0 ||
          row.coaches.length > 0 ||
          row.monthCollections > 0 ||
          row.outstanding > 0,
      ),
    [sportSummaryRows],
  );
  const licenseLimit = dashboardClub?.athleteLicenseLimit ?? 0;
  const parentAutoApprove = Boolean(dashboardClub?.publicRegistration?.autoApprove);

  const lowStock = useMemo(() => listLowStockProducts(data.products), [data.products]);
  const showLowStock =
    lowStock.length > 0 &&
    (session?.role === 'admin' ||
      session?.role === 'secretariat' ||
      session?.role === 'platform_admin');
  const uncollectedRentals = useMemo(
    () => listUncollectedRentalBookings(data.rentalBookings),
    [data.rentalBookings],
  );
  const showRentalDue =
    uncollectedRentals.length > 0 &&
    (session?.role === 'admin' ||
      session?.role === 'secretariat' ||
      session?.role === 'platform_admin');
  const uncollectedRentalsTotal = uncollectedRentals.reduce(
    (sum, row) => sum + (Number(row.amount) || 0),
    0,
  );

  if (isDoctor) {
    return <DoctorDashboard />;
  }

  return (
    <div className="stack-lg">
      <PageHeader
        title="Επισκόπηση"
        subtitle={
          activeSeason
            ? `Τρέχουσα σεζόν ${seasonDisplayName(activeSeason)}`
            : 'Σύνοψη συλλόγου'
        }
      />

      {showRentalDue ? (
        <Link className="ops-alert-banner is-warn" to="/rental?tab=bookings">
          <span>
            <Banknote size={16} aria-hidden />{' '}
            {uncollectedRentals.length === 1
              ? '1 ενοικίαση χωρίς είσπραξη'
              : `${uncollectedRentals.length} ενοικιάσεις χωρίς είσπραξη`}
            {' · '}
            {formatCurrency(uncollectedRentalsTotal)} — άνοιγμα καρτέλας Κρατήσεις
          </span>
        </Link>
      ) : null}

      {showLowStock ? (
        <Link className="ops-alert-banner is-warn" to="/warehouse?status=low">
          <span>
            <AlertTriangle size={16} aria-hidden /> Χαμηλό απόθεμα: {lowStock.length} προϊόντα
            κάτω από το ελάχιστο.
          </span>
        </Link>
      ) : null}

      <div className="stats-grid cols-4 dashboard-kpi-row">
        <StatCard
          label="Ενεργοί αθλητές"
          value={String(adminKpis.activeAthletes)}
          hint="Στον σύλλογο"
          icon={AthletesIcon}
        />
        <StatCard
          label="Άδειες πακέτου"
          value={
            licenseLimit
              ? `${adminKpis.activeAthletes} / ${licenseLimit}`
              : String(adminKpis.activeAthletes)
          }
          hint={licenseLimit ? 'Ενεργοί / όριο πακέτου' : 'Δεν έχει οριστεί όριο'}
          icon={Layers}
          tone={
            licenseLimit > 0 && adminKpis.activeAthletes >= licenseLimit ? 'warn' : 'default'
          }
        />
        <StatCard
          label="Έγκριση γονέα"
          value={parentAutoApprove ? 'Ναι' : 'Όχι'}
          hint={
            parentAutoApprove
              ? 'Αυτόματη έγκριση ενεργή'
              : 'Καμία αίτηση σε αναμονή'
          }
          icon={ClipboardList}
        />
        <StatCard
          label="Αιτήσεις εγγραφής"
          value={String(adminKpis.pendingRegs)}
          hint="Σε αναμονή"
          icon={ClipboardList}
          tone={adminKpis.pendingRegs > 0 ? 'warn' : 'default'}
        />
      </div>

      <section className="panel dashboard-summary-panel">
        <div className="panel-head">
          <div>
            <h2>Ανά άθλημα</h2>
            <p>Σύνοψη ενεργών αθλητών και στελέχωσης</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Άθλημα</th>
                <th>Ενεργοί αθλητές</th>
                <th>Τμήματα</th>
                <th>Προπονητές</th>
              </tr>
            </thead>
            <tbody>
              {visibleSportRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="muted">
                    Δεν υπάρχουν δεδομένα αθλημάτων.
                  </td>
                </tr>
              ) : (
                <>
                  {visibleSportRows.map((row) => (
                    <tr key={row.key || 'without-sport'}>
                      <td>
                        <strong>{row.label}</strong>
                      </td>
                      <td>{row.activeAthletes}</td>
                      <td>{row.classes.length}</td>
                      <td>{row.coaches.length}</td>
                    </tr>
                  ))}
                  <tr className="dashboard-total-row">
                    <td>
                      <strong>Σύνολο</strong>
                    </td>
                    <td>
                      <strong>{sportSummaryTotals.activeAthletes}</strong>
                    </td>
                    <td>
                      <strong>{sportSummaryTotals.classes}</strong>
                    </td>
                    <td>
                      <strong>{sportSummaryTotals.coaches}</strong>
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="money-strip money-strip-4" aria-label="Οικονομική σύνοψη">
        <div className="money-strip-item">
          <span>Ταμείο</span>
          <strong>{formatCurrency(moneyStrip.cashBalance)}</strong>
        </div>
        <Link to="/fees" className="money-strip-item is-warn">
          <span>Οφειλές</span>
          <strong>{formatCurrency(moneyStrip.outstanding)}</strong>
        </Link>
        <Link to="/finance" className="money-strip-item is-accent">
          <span>Έσοδα ημέρας</span>
          <strong>{formatCurrency(moneyStrip.dailyIncome)}</strong>
        </Link>
        <div className="money-strip-item is-accent">
          <span>Εισπράξεις μήνα</span>
          <strong>{formatCurrency(moneyStrip.monthCollections)}</strong>
        </div>
      </div>

      <div className="grid-2 dashboard-bottom-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Οικονομικά ανά άθλημα</h2>
              <p>Τρέχων μήνας</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Άθλημα</th>
                  <th>Εισπράξεις μήνα</th>
                  <th>Ανοιχτές οφειλές</th>
                </tr>
              </thead>
              <tbody>
                {visibleSportRows.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="muted">
                      Δεν υπάρχουν οικονομικά ανά άθλημα.
                    </td>
                  </tr>
                ) : (
                  <>
                    {visibleSportRows.map((row) => (
                      <tr key={`${row.key || 'without-sport'}-finance`}>
                        <td>
                          <strong>{row.label}</strong>
                        </td>
                        <td>{formatCurrency(row.monthCollections)}</td>
                        <td>{formatCurrency(row.outstanding)}</td>
                      </tr>
                    ))}
                    <tr className="dashboard-total-row">
                      <td>
                        <strong>Σύνολο</strong>
                      </td>
                      <td>
                        <strong>{formatCurrency(sportSummaryTotals.monthCollections)}</strong>
                      </td>
                      <td>
                        <strong>{formatCurrency(sportSummaryTotals.outstanding)}</strong>
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Ταμείο ημέρας</h2>
              <p>{today}</p>
            </div>
            <Banknote size={20} aria-hidden />
          </div>
          <div className="dashboard-till-list">
            <div>
              <span>Εισπράξεις ημέρας</span>
              <strong>{formatCurrency(dailyTill.collectionsTotal)}</strong>
            </div>
            <div>
              <span>Έσοδα ημέρας</span>
              <strong>{formatCurrency(dailyTill.incomeTotal)}</strong>
            </div>
            <div>
              <span>Ενοικιάσεις ημέρας</span>
              <strong>{formatCurrency(dailyRentalCollections)}</strong>
            </div>
          </div>
          <Link to="/finance" className="dashboard-finance-link">
            Οικονομικά →
          </Link>
        </section>
      </div>
    </div>
  );
}
