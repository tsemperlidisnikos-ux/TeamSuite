import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Bell,
  CalendarDays,
  CreditCard,
  Download,
  FileHeart,
  LayoutGrid,
  Users,
} from 'lucide-react';
import * as onlineCheckoutService from '../api/services/onlineCheckoutService';
import * as feeChargesService from '../api/services/feeChargesService';
import { getSession } from '../auth/auth';
import { getClubById } from '../auth/clubs';
import { Button } from '../components/ui/Button';
import { PageHeader } from '../components/ui/PageHeader';
import { StatCard } from '../components/ui/StatCard';
import { useAppData } from '../hooks/useAppData';
import { getPreviewClubId } from '../platform/platformConfig';
import { settleVivaReturn } from '../utils/vivaSettle';
import { formatCurrency, formatDate } from '../utils/labels';
import { localDateIso } from '../utils/dates';
import { announcementVisibleToParent } from '../utils/announcementAudience';
import { studentClassIds } from '../utils/studentClasses';
import { athleteHealthCardValid } from '../utils/classHelpers';
import { downloadIcsFile } from '../utils/icsCalendar';

type ParentTab = 'overview' | 'schedule' | 'payments' | 'documents';

const TABS: Array<{ id: ParentTab; label: string; icon: typeof LayoutGrid }> = [
  { id: 'overview', label: 'Αρχική', icon: LayoutGrid },
  { id: 'schedule', label: 'Πρόγραμμα', icon: CalendarDays },
  { id: 'payments', label: 'Πληρωμές', icon: CreditCard },
  { id: 'documents', label: 'Έγγραφα', icon: FileHeart },
];

function athleteBalance(
  athleteId: string,
  transactions: { athleteId: string; type: string; amount: number }[],
): number {
  return transactions
    .filter((t) => t.athleteId === athleteId)
    .reduce((sum, t) => sum + (t.type === 'charge' ? t.amount : -t.amount), 0);
}

function healthDocStatus(
  athlete: { healthCard?: boolean; healthCardStatus?: string; healthCardExpires?: string },
  today: string,
): { label: string; tone: 'default' | 'positive' | 'warn' | 'negative' } {
  const exp = athlete.healthCardExpires?.trim();
  if (!athleteHealthCardValid(athlete)) {
    if (athlete.healthCardStatus === 'Όχι' || athlete.healthCard === false) {
      return { label: 'Κάρτα υγείας: Όχι', tone: 'warn' };
    }
    return { label: 'Χωρίς καταχώριση', tone: 'warn' };
  }
  if (exp && exp < today) {
    return { label: 'Ληγμένη ιατρική', tone: 'negative' };
  }
  if (exp) {
    const soon = new Date(`${exp}T12:00:00`);
    const now = new Date(`${today}T12:00:00`);
    const days = Math.ceil((soon.getTime() - now.getTime()) / 86400000);
    if (days <= 30) {
      return { label: `Λήγει ${formatDate(exp)}`, tone: 'warn' };
    }
    return { label: `Έγκυρη έως ${formatDate(exp)}`, tone: 'positive' };
  }
  return { label: 'Κάρτα υγείας ενεργή', tone: 'positive' };
}

export function ParentPortalPage() {
  const { data, refresh } = useAppData();
  const session = getSession();
  const clubId = getPreviewClubId() ?? session?.clubId ?? null;
  const club = clubId ? getClubById(clubId) : null;
  const readyPay = onlineCheckoutService.listReadyOnlineProviders(clubId);
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const tab: ParentTab = TABS.some((item) => item.id === rawTab)
    ? (rawTab as ParentTab)
    : 'overview';
  const [payError, setPayError] = useState('');
  const [payingId, setPayingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const txnId = searchParams.get('t');
    const orderCode = searchParams.get('s');
    if ((!txnId && !orderCode) || !clubId) return;
    let cancelled = false;
    void (async () => {
      const pay = searchParams.get('pay');
      const result = await settleVivaReturn({
        clubId,
        orderCode,
        transactionId: txnId,
        providerHint:
          pay === 'stripe' || pay === 'eurobank' || pay === 'viva' ? pay : null,
      });
      if (cancelled) return;
      setMessage(result.message);
      if (result.settled) refresh();
      const next = new URLSearchParams(searchParams);
      next.delete('t');
      next.delete('s');
      next.delete('pay');
      next.delete('cancel');
      if (!next.get('tab')) next.set('tab', 'payments');
      setSearchParams(next, { replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, setSearchParams, clubId, refresh]);

  function setTab(next: ParentTab) {
    setSearchParams({ tab: next }, { replace: true });
  }

  const linkedAthletes = useMemo(() => {
    if (!session) return [];
    const athleteIds = new Set(
      (data.parentLinks ?? [])
        .filter((link) => link.parentUserId === session.id)
        .map((link) => link.athleteId),
    );
    return (data.students ?? []).filter(
      (s) => athleteIds.has(s.id) && s.status !== 'inactive',
    );
  }, [data.parentLinks, data.students, session]);

  const athleteIds = useMemo(
    () => new Set(linkedAthletes.map((a) => a.id)),
    [linkedAthletes],
  );

  const balances = useMemo(
    () =>
      linkedAthletes.map((athlete) => ({
        athlete,
        balance: athleteBalance(athlete.id, data.transactions ?? []),
      })),
    [linkedAthletes, data.transactions],
  );

  const totalBalance = useMemo(
    () => balances.reduce((sum, row) => sum + Math.max(0, row.balance), 0),
    [balances],
  );

  const openCharges = useMemo(
    () =>
      linkedAthletes.flatMap((athlete) =>
        feeChargesService.listOpenCharges(athlete.id).map((row) => ({
          ...row,
          athleteName: `${athlete.lastName} ${athlete.firstName}`.trim(),
        })),
      ),
    [linkedAthletes, data.transactions],
  );

  const paymentHistory = useMemo(() => {
    return (data.transactions ?? [])
      .filter((t) => t.type === 'payment' && athleteIds.has(t.athleteId))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, 24);
  }, [data.transactions, athleteIds]);

  const today = localDateIso();
  const upcomingTrainings = useMemo(() => {
    const classIds = new Set(linkedAthletes.flatMap((a) => studentClassIds(a)));
    return (data.trainings ?? [])
      .filter((t) => {
        if (t.date < today) return false;
        return Boolean(t.classId && classIds.has(t.classId));
      })
      .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
  }, [data.trainings, linkedAthletes, today]);

  const recentAttendance = useMemo(() => {
    return (data.attendance ?? [])
      .filter((row) => athleteIds.has(row.studentId))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 12);
  }, [data.attendance, athleteIds]);

  const announcements = useMemo(() => {
    if (!session) return [];
    const linkedIds = linkedAthletes.map((a) => a.id);
    const linkedClasses = linkedAthletes.flatMap((a) => studentClassIds(a));
    const linkedMeta = linkedAthletes.map((a) => ({
      id: a.id,
      sport: a.sport,
      clubName: a.clubName,
      classSport:
        studentClassIds(a)
          .map((id) => data.classes.find((c) => c.id === id)?.sport)
          .find(Boolean) || null,
    }));
    return (data.announcements ?? [])
      .filter((a) =>
        announcementVisibleToParent(a, session.id, linkedIds, linkedClasses, linkedMeta),
      )
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [data.announcements, data.classes, linkedAthletes, session]);

  const classNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const cls of data.classes ?? []) map.set(cls.id, cls.name);
    return map;
  }, [data.classes]);

  const athleteNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of linkedAthletes) {
      map.set(s.id, `${s.lastName} ${s.firstName}`.trim());
    }
    return map;
  }, [linkedAthletes]);

  const nextTraining = upcomingTrainings[0] ?? null;

  async function handlePay(
    athleteId: string,
    amount: number,
    athleteName: string,
    provider: (typeof readyPay)[number]['id'],
  ) {
    if (!clubId) return;
    setPayError('');
    setPayingId(`${athleteId}:${provider}`);
    const athlete = linkedAthletes.find((a) => a.id === athleteId);
    const email = athlete?.motherEmail || athlete?.email || session?.email || '';
    const result = await onlineCheckoutService.startOnlineCheckout({
      clubId,
      provider,
      amountEuro: amount,
      athleteId,
      athleteName,
      customerEmail: email,
      customerFullName: session?.fullName ?? athleteName,
    });
    setPayingId(null);
    if (!result.success) {
      setPayError(result.error ?? 'Αποτυχία έναρξης πληρωμής');
    }
  }

  function handleDownloadSchedule() {
    if (upcomingTrainings.length === 0) return;
    downloadIcsFile(
      upcomingTrainings.map((t) => ({
        uid: t.id,
        title:
          (t.classId ? classNameById.get(t.classId) : null) || t.notes || 'Προπόνηση',
        date: t.date,
        startTime: t.startTime,
        endTime: t.endTime,
        location: t.location,
        description: t.notes,
      })),
      'proponiseis-teamsuite.ics',
      club?.name ? `Προπονήσεις · ${club.name}` : 'Προπονήσεις',
    );
  }

  return (
    <div className="stack-lg parent-portal">
      <PageHeader
        title="Περιοχή γονέα"
        subtitle={`Καλώς ήρθατε, ${session?.fullName ?? 'γονέα'}. Πρόγραμμα, πληρωμές και έγγραφα των αθλητών σας.`}
      />

      {message ? <p className="settings-success">{message}</p> : null}

      <nav className="parent-portal-tabs" aria-label="Ενότητες γονέα">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`parent-portal-tab${tab === item.id ? ' is-active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            <item.icon size={16} />
            {item.label}
          </button>
        ))}
      </nav>

      {linkedAthletes.length === 0 ? (
        <section className="panel">
          <p className="muted">
            Δεν υπάρχουν συνδεδεμένοι αθλητές. Ζητήστε από τη γραμματεία να σας συνδέσει μέσω
            «Γονείς → Σύνδεση γονέα».
          </p>
        </section>
      ) : null}

      {linkedAthletes.length > 0 && tab === 'overview' ? (
        <>
          <div className="stats-grid cols-4">
            <StatCard
              label="Συνδεδεμένοι αθλητές"
              value={String(linkedAthletes.length)}
              hint="Ενεργοί στον σύλλογο"
              icon={Users}
            />
            <StatCard
              label="Συνολικές οφειλές"
              value={formatCurrency(totalBalance)}
              hint={totalBalance > 0 ? 'Πληρωμή online διαθέσιμη' : 'Καθαρό υπόλοιπο'}
              icon={CreditCard}
              tone={totalBalance > 0 ? 'warn' : 'positive'}
            />
            <StatCard
              label="Επόμενη προπόνηση"
              value={
                nextTraining
                  ? formatDate(nextTraining.date)
                  : '—'
              }
              hint={
                nextTraining
                  ? `${nextTraining.startTime}${nextTraining.endTime ? `–${nextTraining.endTime}` : ''}`
                  : 'Δεν υπάρχει προγραμματισμένη'
              }
              icon={CalendarDays}
            />
            <StatCard
              label="Ανακοινώσεις"
              value={String(announcements.length)}
              hint="Ορατές για εσάς"
              icon={Bell}
            />
          </div>

          <section className="panel parent-portal-section">
            <h2>
              <Users size={18} /> Αθλητές
            </h2>
            <ul className="parent-portal-list">
              {linkedAthletes.map((athlete) => (
                <li key={athlete.id}>
                  <strong>
                    {athlete.lastName} {athlete.firstName}
                  </strong>
                  <span className="muted">
                    {studentClassIds(athlete)
                      .map((id) => classNameById.get(id))
                      .filter(Boolean)
                      .join(', ') || 'Χωρίς τμήμα'}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel parent-portal-section">
            <h2>
              <Bell size={18} /> Τελευταίες ανακοινώσεις
            </h2>
            {announcements.length === 0 ? (
              <p className="muted">Δεν υπάρχουν ανακοινώσεις.</p>
            ) : (
              <ul className="parent-portal-list">
                {announcements.slice(0, 5).map((a) => (
                  <li key={a.id}>
                    <strong>{a.title}</strong>
                    <span className="muted">
                      {a.createdAt ? formatDate(a.createdAt.slice(0, 10)) : ''}
                      {a.message
                        ? ` · ${a.message.slice(0, 120)}${a.message.length > 120 ? '…' : ''}`
                        : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}

      {linkedAthletes.length > 0 && tab === 'schedule' ? (
        <>
          <section className="panel parent-portal-section">
            <div className="parent-portal-section-head">
              <h2>
                <CalendarDays size={18} /> Επόμενες προπονήσεις
              </h2>
              {upcomingTrainings.length > 0 ? (
                <Button type="button" variant="secondary" onClick={handleDownloadSchedule}>
                  <Download size={16} />
                  Λήψη ημερολογίου (.ics)
                </Button>
              ) : null}
            </div>
            {upcomingTrainings.length === 0 ? (
              <p className="muted">Δεν υπάρχουν προγραμματισμένες προπονήσεις.</p>
            ) : (
              <ul className="parent-portal-list">
                {upcomingTrainings.map((t) => (
                  <li key={t.id}>
                    <strong>
                      {formatDate(t.date)} · {t.startTime}
                      {t.endTime ? `–${t.endTime}` : ''}
                    </strong>
                    <span className="muted">
                      {(t.classId ? classNameById.get(t.classId) : null) ||
                        t.notes ||
                        'Προπόνηση'}
                      {t.location ? ` · ${t.location}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="settings-hint">
              Μπορείτε να εισάγετε το αρχείο .ics στο Google Calendar ή Outlook για ειδοποιήσεις.
            </p>
          </section>

          <section className="panel parent-portal-section">
            <h2>
              <Users size={18} /> Πρόσφατες παρουσίες
            </h2>
            {recentAttendance.length === 0 ? (
              <p className="muted">Δεν υπάρχουν καταχωρήσεις παρουσίας.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Ημ/νία</th>
                      <th>Αθλητής</th>
                      <th>Κατάσταση</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentAttendance.map((row) => (
                      <tr key={row.id}>
                        <td>{formatDate(row.date)}</td>
                        <td>{athleteNameById.get(row.studentId) ?? '—'}</td>
                        <td>{row.present ? 'Παρών/ούσα' : 'Απών/ούσα'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}

      {linkedAthletes.length > 0 && tab === 'payments' ? (
        <>
          <section className="panel parent-portal-section">
            <h2>
              <CreditCard size={18} /> Υπόλοιπα συνδρομών
            </h2>
            {payError ? <p className="form-error">{payError}</p> : null}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Αθλητής</th>
                    <th>Υπόλοιπο</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map(({ athlete, balance }) => (
                    <tr key={athlete.id}>
                      <td>
                        {athlete.lastName} {athlete.firstName}
                      </td>
                      <td>
                        <strong className={balance > 0 ? 'badge badge-overdue' : 'badge badge-paid'}>
                          {formatCurrency(balance)}
                        </strong>
                      </td>
                      <td className="row-actions">
                        {balance > 0 && readyPay.length > 0
                          ? readyPay.map((p) => (
                              <Button
                                key={p.id}
                                type="button"
                                disabled={payingId === `${athlete.id}:${p.id}`}
                                onClick={() =>
                                  void handlePay(
                                    athlete.id,
                                    balance,
                                    `${athlete.lastName} ${athlete.firstName}`,
                                    p.id,
                                  )
                                }
                              >
                                {payingId === `${athlete.id}:${p.id}`
                                  ? 'Μετάβαση…'
                                  : `Πληρωμή ${p.label}`}
                              </Button>
                            ))
                          : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {openCharges.length > 0 ? (
              <>
                <h3 className="parent-portal-subtitle">Ανοιχτές χρεώσεις ανά περίοδο</h3>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Αθλητής</th>
                        <th>Περίοδος</th>
                        <th>Χρέωση</th>
                        <th>Υπόλοιπο</th>
                        <th>Σχόλιο</th>
                      </tr>
                    </thead>
                    <tbody>
                      {openCharges.map((row) => (
                        <tr key={row.chargeId}>
                          <td>{row.athleteName}</td>
                          <td>{row.periodLabel}</td>
                          <td>{formatCurrency(row.amount)}</td>
                          <td>
                            <strong className="badge badge-overdue">
                              {formatCurrency(row.remaining)}
                            </strong>
                          </td>
                          <td className="muted">{row.comments || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="muted settings-hint">Δεν υπάρχουν ανοιχτές χρεώσεις ανά μήνα.</p>
            )}

            {readyPay.length === 0 ? (
              <p className="muted settings-hint">
                Η online πληρωμή θα εμφανιστεί όταν ο διαχειριστής πλατφόρμας επιτρέψει πάροχο
                (Viva / Eurobank / Stripe) και ο σύλλογος τον ενεργοποιήσει στις Ρυθμίσεις.
              </p>
            ) : null}
          </section>

          <section className="panel parent-portal-section">
            <h2>
              <CreditCard size={18} /> Ιστορικό πληρωμών
            </h2>
            {paymentHistory.length === 0 ? (
              <p className="muted">Δεν υπάρχουν καταχωρημένες πληρωμές.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Ημ/νία</th>
                      <th>Αθλητής</th>
                      <th>Ποσό</th>
                      <th>Σχόλιο</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentHistory.map((row) => (
                      <tr key={row.id}>
                        <td>{formatDate(String(row.createdAt || '').slice(0, 10))}</td>
                        <td>{athleteNameById.get(row.athleteId) ?? '—'}</td>
                        <td>{formatCurrency(row.amount)}</td>
                        <td className="muted">{row.comments || row.paymentMethod || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}

      {linkedAthletes.length > 0 && tab === 'documents' ? (
        <section className="panel parent-portal-section">
          <h2>
            <FileHeart size={18} /> Ιατρικά & συναίνεση
          </h2>
          <p className="muted settings-hint">
            Ενημερωτική εικόνα από τα στοιχεία του συλλόγου. Για διορθώσεις επικοινωνήστε με τη
            γραμματεία.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Αθλητής</th>
                  <th>Ιατρική / κάρτα υγείας</th>
                  <th>GDPR</th>
                  <th>Συναίνεση ιατρικών</th>
                </tr>
              </thead>
              <tbody>
                {linkedAthletes.map((athlete) => {
                  const health = healthDocStatus(athlete, today);
                  return (
                    <tr key={athlete.id}>
                      <td>
                        <strong>
                          {athlete.lastName} {athlete.firstName}
                        </strong>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            health.tone === 'negative'
                              ? 'badge-overdue'
                              : health.tone === 'warn'
                                ? 'badge-pending'
                                : 'badge-paid'
                          }`}
                        >
                          {health.label}
                        </span>
                        {athlete.healthCardStatus ? (
                          <div className="muted">{athlete.healthCardStatus}</div>
                        ) : null}
                      </td>
                      <td>
                        {athlete.gdprConsent === 'full'
                          ? 'Πλήρης'
                          : athlete.gdprConsent === 'pending'
                            ? 'Εκκρεμεί'
                            : athlete.gdprConsent === 'locked'
                              ? 'Κλειδωμένη'
                              : '—'}
                        {athlete.consentExpires ? (
                          <div className="muted">Λήξη: {formatDate(athlete.consentExpires)}</div>
                        ) : null}
                      </td>
                      <td>
                        {athlete.gdprItems?.medical ? 'Ναι' : 'Όχι'}
                        {athlete.gdprItems?.amkaHealthCard ? ' · ΑΜΚΑ OK' : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
