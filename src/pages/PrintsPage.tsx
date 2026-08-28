import { useMemo, useState, type ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import * as registrationApplicationsService from '../api/services/registrationApplicationsService';
import { getSession, isPlatformAdmin } from '../auth/auth';
import { getClubById } from '../auth/clubs';
import { getPreviewClubId } from '../platform/platformConfig';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { useAppData } from '../hooks/useAppData';
import type { AcademyClass, Student } from '../types';
import {
  REGISTRY_COLUMNS,
  defaultRegistryFilters,
  filterAthleteRegistry,
  mapAthleteRegistryRow,
  type RegistryFilters,
  type TriState,
} from '../utils/athleteRegistryFilter';
import { PAYMENT_METHODS, paymentMethodLabel } from '../shared/paymentMethods';
import { sizeChartOptGroups } from '../utils/sizeChartOptions';
import { localDateIso } from '../utils/dates';
import { canAccessAmka } from '../utils/amkaAccess';
import { sportsMatch } from '../utils/coachScope';
import { studentClassIds, studentInClass } from '../utils/studentClasses';
import { studentHasSport } from '../utils/studentSports';

const COMPARE_OPS = ['=', '<', '>', '<=', '>='] as const;

type MenuId =
  | 'athletes-registry'
  | 'athlete-balances'
  | 'attendance-log'
  | 'training-attendance-sheet'
  | 'registration-applications'
  | 'medical-expiry'
  | 'payments-collections'
  | 'debtors'
  | 'legal-forms'
  | 'development-report'
  | 'teams'
  | 'medical'
  | 'finance'
  | 'fees'
  | 'trainings';

const MENU_ITEMS: Array<{ id: MenuId; title: string }> = [
  { id: 'athletes-registry', title: 'Λίστα αθλητών' },
  { id: 'athlete-balances', title: 'Υπόλοιπα αθλητών' },
  { id: 'attendance-log', title: 'Παρουσιολόγιο' },
  { id: 'training-attendance-sheet', title: 'Παρουσιολόγιο προπόνησης' },
  { id: 'registration-applications', title: 'Αιτήσεις εγγραφής' },
  { id: 'medical-expiry', title: 'Λήξεις ιατρικών πιστοποιητικών' },
  { id: 'payments-collections', title: 'Εισπράξεις περιόδου' },
  { id: 'debtors', title: 'Οφειλέτες' },
  { id: 'legal-forms', title: 'Νομικά έντυπα' },
  { id: 'development-report', title: 'Αναφορά προόδου' },
  { id: 'teams', title: 'Κατάλογος τμημάτων' },
  { id: 'medical', title: 'Ιατρικά στοιχεία' },
  { id: 'finance', title: 'Οικονομική αναφορά' },
  { id: 'fees', title: 'Χρεώσεις / πληρωμές' },
  { id: 'trainings', title: 'Πρόγραμμα προπονήσεων' },
];

function transactionLocalDay(createdAt: string): string {
  const parsed = new Date(createdAt);
  if (!Number.isNaN(parsed.getTime())) return localDateIso(parsed);
  return createdAt.slice(0, 10);
}

function todayIso(): string {
  return localDateIso();
}

function seasonStartIso(): string {
  const d = new Date();
  const year = d.getMonth() + 1 >= 8 ? d.getFullYear() : d.getFullYear() - 1;
  return `${year}-08-01`;
}

function monthStartIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}

function monthsAgoIso(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function studentMatchesSportFilter(
  student: Pick<Student, 'sport' | 'sports' | 'classId' | 'classIds'>,
  sport: string,
  classes: AcademyClass[],
): boolean {
  if (!sport.trim()) return true;
  if (studentHasSport(student, sport)) return true;
  return studentClassIds(student).some((id) =>
    sportsMatch(classes.find((c) => c.id === id)?.sport, sport),
  );
}

function studentClassNames(
  student: Pick<Student, 'classId' | 'classIds'>,
  classes: AcademyClass[],
): string {
  return (
    studentClassIds(student)
      .map((id) => classes.find((c) => c.id === id)?.name)
      .filter(Boolean)
      .join(', ') || ''
  );
}

function FilterRow({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="prints-filter-row">
      <label className="prints-filter-label" htmlFor={htmlFor}>
        {label}
      </label>
      <div className="prints-filter-control">{children}</div>
    </div>
  );
}

function TriStateSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: TriState;
  onChange: (v: TriState) => void;
}) {
  return (
    <select
      id={id}
      className="prints-filter-input"
      value={value}
      onChange={(e) => onChange(e.target.value as TriState)}
    >
      <option value="">Όλα</option>
      <option value="yes">Ναι</option>
      <option value="no">Όχι</option>
    </select>
  );
}

function OpNumber({
  id,
  op,
  value,
  onOp,
  onValue,
  placeholder,
  min,
  step,
}: {
  id: string;
  op: string;
  value: string;
  onOp: (v: string) => void;
  onValue: (v: string) => void;
  placeholder?: string;
  min?: number;
  step?: string;
}) {
  return (
    <div className="prints-filter-inline">
      <select
        className="prints-filter-input prints-filter-op"
        value={op}
        onChange={(e) => onOp(e.target.value)}
        aria-label="Συντελεστής"
      >
        {COMPARE_OPS.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <input
        id={id}
        type="number"
        className="prints-filter-input"
        value={value}
        min={min}
        step={step}
        placeholder={placeholder}
        onChange={(e) => onValue(e.target.value)}
      />
    </div>
  );
}

function TeamSelect({
  id,
  value,
  onChange,
  allLabel = 'Όλα τα τμήματα',
  sport = '',
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  allLabel?: string;
  sport?: string;
}) {
  const { data } = useAppData();
  const options = useMemo(() => {
    const list = data.classes ?? [];
    if (!sport.trim()) return list;
    return list.filter((c) => sportsMatch(c.sport, sport));
  }, [data.classes, sport]);

  return (
    <select
      id={id}
      className="prints-filter-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{allLabel}</option>
      {options.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

function SportSelect({
  id,
  value,
  onChange,
  allLabel = 'Όλα τα αθλήματα',
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  allLabel?: string;
}) {
  const { data } = useAppData();
  const options = useMemo(() => {
    const fromCatalog = (data.sports ?? [])
      .filter((s) => s.active)
      .map((s) => s.name);
    const fromClasses = (data.classes ?? []).map((c) => c.sport).filter(Boolean);
    const fromAthletes = (data.students ?? []).map((s) => s.sport).filter(Boolean);
    return Array.from(new Set([...fromCatalog, ...fromClasses, ...fromAthletes]))
      .filter((n): n is string => Boolean(n && String(n).trim()))
      .sort((a, b) => a.localeCompare(b, 'el'));
  }, [data.sports, data.classes, data.students]);

  return (
    <select
      id={id}
      className="prints-filter-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{allLabel}</option>
      {options.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </select>
  );
}

function AssociationSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const { data } = useAppData();
  const options = useMemo(() => {
    const fromClubs = (data.associations ?? [])
      .filter((a) => a.active !== false)
      .map((a) => a.name);
    const fromAthletes = data.students
      .map((s) => s.clubName)
      .filter((n): n is string => Boolean(n && n.trim()));
    return Array.from(new Set([...fromClubs, ...fromAthletes])).sort((a, b) =>
      a.localeCompare(b, 'el'),
    );
  }, [data.associations, data.students]);

  return (
    <select
      id={id}
      className="prints-filter-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Όλα</option>
      {options.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </select>
  );
}

function GenderSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      id={id}
      className="prints-filter-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Όλα</option>
      <option value="boy">Αγόρι</option>
      <option value="girl">Κορίτσι</option>
    </select>
  );
}

function parseMoney(value: string | undefined): number {
  if (!value) return 0;
  const n = Number(value.replace(/[^\d,.-]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function moneyColumnKey(columns: Array<{ key: string }>): string | null {
  if (columns.some((c) => c.key === 'amount')) return 'amount';
  if (columns.some((c) => c.key === 'balance')) return 'balance';
  return null;
}

function ResultsModal({
  open,
  title,
  count,
  total,
  summary,
  columns,
  rows,
  onClose,
  onDeleteRow,
  onDeleteAll,
  deleting,
}: {
  open: boolean;
  title: string;
  count: number;
  total?: number;
  summary?: string;
  columns: Array<{ key: string; label: string }>;
  rows: Array<Record<string, string>>;
  onClose: () => void;
  onDeleteRow?: (id: string) => void;
  onDeleteAll?: () => void;
  deleting?: boolean;
}) {
  const showActions = Boolean(onDeleteRow);
  const moneyKey = columns.some((c) => c.key === 'label') ? null : moneyColumnKey(columns);
  const moneyTotal =
    moneyKey && rows.length > 0
      ? rows.reduce((sum, row) => sum + parseMoney(row[moneyKey]), 0)
      : null;
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      fullscreen
      className="prints-results-modal"
      footer={
        <>
          {onDeleteAll && rows.length > 0 ? (
            <Button
              type="button"
              variant="danger"
              disabled={deleting}
              onClick={onDeleteAll}
            >
              <Trash2 size={16} /> Διαγραφή όλων
            </Button>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            onClick={() => window.print()}
            disabled={rows.length === 0}
          >
            Εκτύπωση
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Κλείσιμο
          </Button>
        </>
      }
    >
      <p className="prints-results-modal-count">
        Εγγραφές: {count}
        {total != null ? ` / ${total}` : ''}
        {summary ? ` · ${summary}` : ''}
      </p>
      {rows.length > 0 ? (
        <div className="prints-results-modal-body">
          <table className="page-table prints-results-table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col.key}>{col.label}</th>
                ))}
                {showActions ? <th></th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id || String(index)}>
                  {columns.map((col) => (
                    <td key={col.key}>{row[col.key] ?? ''}</td>
                  ))}
                  {showActions ? (
                    <td className="row-actions">
                      {row.id ? (
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={deleting}
                          aria-label="Διαγραφή αίτησης"
                          title="Διαγραφή"
                          onClick={() => onDeleteRow?.(row.id)}
                        >
                          <Trash2 size={16} />
                        </Button>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
            {moneyKey && moneyTotal != null ? (
              <tfoot>
                <tr className="prints-results-total">
                  {columns.map((col, colIndex) => (
                    <td key={col.key}>
                      {colIndex === 0
                        ? 'Σύνολο'
                        : col.key === moneyKey
                          ? `${moneyTotal.toFixed(2)} €`
                          : ''}
                    </td>
                  ))}
                  {showActions ? <td></td> : null}
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      ) : (
        <p className="prints-results-empty">Δεν βρέθηκαν εγγραφές με αυτά τα φίλτρα.</p>
      )}
    </Modal>
  );
}

function SectionShell({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: ReactNode;
}) {
  return (
    <div className="prints-registry-section">
      <h2>{title}</h2>
      <p className="prints-registry-desc">{desc}</p>
      <div className="prints-filter-panel">{children}</div>
    </div>
  );
}

function customChargeFilterLabel(rawLabel: string | undefined): string {
  const trimmed = (rawLabel ?? '').trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('πρόγραμμα') || lower.startsWith('προγραμμα')) return trimmed;
  return `Πρόγραμμα ${trimmed}`;
}

function AthleteRegistrySection() {
  const { data } = useAppData();
  const session = getSession();
  const clubId = getPreviewClubId() ?? session?.clubId ?? null;
  const club = clubId ? getClubById(clubId) : null;
  const customChargeLabel = useMemo(
    () => customChargeFilterLabel(club?.customChargeLabel),
    [club?.customChargeLabel],
  );
  const [filters, setFilters] = useState<RegistryFilters>(() => defaultRegistryFilters());
  const [showResults, setShowResults] = useState(false);
  const [filtered, setFiltered] = useState<Student[]>([]);

  const uniformSizeGroups = useMemo(
    () => sizeChartOptGroups(data.sizeChart),
    [data.sizeChart],
  );

  function setFilter<K extends keyof RegistryFilters>(key: K, value: RegistryFilters[K]) {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'sport' && prev.teamId) {
        const cls = data.classes.find((c) => c.id === prev.teamId);
        if (value && cls && !sportsMatch(cls.sport, String(value))) {
          next.teamId = '';
        }
      }
      return next;
    });
  }

  function runSearch() {
    setFiltered(
      filterAthleteRegistry(data.students, filters, data.classes, data.attendance),
    );
    setShowResults(true);
  }

  const rows = filtered.map((athlete, index) =>
    mapAthleteRegistryRow(
      athlete,
      index,
      studentClassNames(athlete, data.classes),
      { revealAmka: canAccessAmka(getSession()?.role) },
    ),
  );

  return (
    <SectionShell
      title="Λίστα αθλητών"
      desc="Φίλτρα αναζήτησης και εκτύπωση λίστας με ΑΜΚΑ, φύλο, επώνυμο, όνομα, πατρώνυμο, ημ. γέννησης, κάρτα υγείας, φωτογραφία και γνωμάτευση."
    >
      <FilterRow label="Από Ημερομηνία" htmlFor="reg-from">
        <input
          id="reg-from"
          type="date"
          className="prints-filter-input"
          value={filters.fromDate}
          onChange={(e) => setFilter('fromDate', e.target.value)}
        />
      </FilterRow>
      <FilterRow label="Έως Ημερομηνία" htmlFor="reg-until">
        <input
          id="reg-until"
          type="date"
          className="prints-filter-input"
          value={filters.untilDate}
          onChange={(e) => setFilter('untilDate', e.target.value)}
        />
      </FilterRow>
      <FilterRow label="Άθλημα" htmlFor="reg-sport">
        <SportSelect
          id="reg-sport"
          value={filters.sport}
          onChange={(v) => setFilter('sport', v)}
        />
      </FilterRow>
      <FilterRow label="Τμήματα" htmlFor="reg-team">
        <TeamSelect
          id="reg-team"
          value={filters.teamId}
          sport={filters.sport}
          onChange={(v) => setFilter('teamId', v)}
        />
      </FilterRow>
      <FilterRow label="Έτος Γέννησης" htmlFor="reg-birth">
        <OpNumber
          id="reg-birth"
          op={filters.birthYearOp}
          value={filters.birthYear}
          onOp={(v) => setFilter('birthYearOp', v as RegistryFilters['birthYearOp'])}
          onValue={(v) => setFilter('birthYear', v)}
          placeholder="YYYY"
        />
      </FilterRow>
      <FilterRow label="Φύλο" htmlFor="reg-gender">
        <GenderSelect
          id="reg-gender"
          value={filters.gender}
          onChange={(v) => setFilter('gender', v)}
        />
      </FilterRow>
      <FilterRow label="Χρέωση Εγγραφής" htmlFor="reg-fee">
        <TriStateSelect
          id="reg-fee"
          value={filters.registrationFee}
          onChange={(v) => setFilter('registrationFee', v)}
        />
      </FilterRow>
      <FilterRow label="Φωτογραφία" htmlFor="reg-photo">
        <TriStateSelect
          id="reg-photo"
          value={filters.photo}
          onChange={(v) => setFilter('photo', v)}
        />
      </FilterRow>
      <FilterRow label="Ενεργοί" htmlFor="reg-active">
        <TriStateSelect
          id="reg-active"
          value={filters.active}
          onChange={(v) => setFilter('active', v)}
        />
      </FilterRow>
      <FilterRow label="Κάρτα Υγείας" htmlFor="reg-health">
        <TriStateSelect
          id="reg-health"
          value={filters.doctorCheck}
          onChange={(v) => setFilter('doctorCheck', v)}
        />
      </FilterRow>
      <FilterRow label="Σωματείο" htmlFor="reg-assoc">
        <AssociationSelect
          id="reg-assoc"
          value={filters.association}
          onChange={(v) => setFilter('association', v)}
        />
      </FilterRow>
      <FilterRow label="Εισιτήριο Διαρκείας" htmlFor="reg-ticket">
        <TriStateSelect
          id="reg-ticket"
          value={filters.seasonTicket}
          onChange={(v) => setFilter('seasonTicket', v)}
        />
      </FilterRow>
      {customChargeLabel ? (
        <FilterRow label={customChargeLabel} htmlFor="reg-custom-charge">
          <TriStateSelect
            id="reg-custom-charge"
            value={filters.customCharge}
            onChange={(v) => setFilter('customCharge', v)}
          />
        </FilterRow>
      ) : null}
      <FilterRow label="Αρ. Δελτίου" htmlFor="reg-card">
        <TriStateSelect
          id="reg-card"
          value={filters.hasRegistrationCard}
          onChange={(v) => setFilter('hasRegistrationCard', v)}
        />
      </FilterRow>
      <FilterRow label="Παρουσία σε προπόνηση" htmlFor="reg-presence">
        <div className="prints-filter-inline">
          <select
            className="prints-filter-input prints-filter-op"
            value={filters.trainingPresenceOp}
            onChange={(e) =>
              setFilter(
                'trainingPresenceOp',
                e.target.value as RegistryFilters['trainingPresenceOp'],
              )
            }
          >
            <option value=">=">&gt;=</option>
            <option value="=">=</option>
            <option value="<">&lt;</option>
            <option value=">">&gt;</option>
          </select>
          <input
            id="reg-presence"
            type="number"
            min={0}
            className="prints-filter-input"
            value={filters.trainingPresence}
            onChange={(e) => setFilter('trainingPresence', e.target.value)}
          />
        </div>
      </FilterRow>
      <FilterRow label="Παραλαβή στολής" htmlFor="reg-uniform">
        <TriStateSelect
          id="reg-uniform"
          value={filters.uniformReceipt}
          onChange={(v) => setFilter('uniformReceipt', v)}
        />
      </FilterRow>
      <FilterRow label="Μέγεθος Στολής" htmlFor="reg-size">
        <select
          id="reg-size"
          className="prints-filter-input"
          value={filters.uniformSize}
          onChange={(e) => setFilter('uniformSize', e.target.value)}
        >
          <option value="">Όλα</option>
          {uniformSizeGroups.map((group) => (
            <optgroup key={group.category} label={group.label}>
              {group.sizes.map((size) => (
                <option key={`${group.category}-${size}`} value={size}>
                  {size}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </FilterRow>
      <div className="prints-filter-actions">
        <Button type="button" onClick={runSearch}>
          Αναζήτηση
        </Button>
      </div>
      <ResultsModal
        open={showResults}
        title="Λίστα αθλητών"
        count={filtered.length}
        total={data.students.length}
        columns={REGISTRY_COLUMNS}
        rows={rows}
        onClose={() => setShowResults(false)}
      />
    </SectionShell>
  );
}

function AthleteBalancesSection() {
  const { data } = useAppData();
  const [untilDate, setUntilDate] = useState(todayIso);
  const [sport, setSport] = useState('');
  const [teamId, setTeamId] = useState('');
  const [gender, setGender] = useState('');
  const [active, setActive] = useState<TriState>('');
  const [hasBalance, setHasBalance] = useState<TriState>('yes');
  const [balanceOp, setBalanceOp] = useState('>=');
  const [balanceAmount, setBalanceAmount] = useState('');
  const [association, setAssociation] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);

  function runSearch() {
    const next = data.students
      .filter((s) => {
        if (!studentMatchesSportFilter(s, sport, data.classes)) return false;
        if (teamId && !studentInClass(s, teamId)) return false;
        if (gender && s.gender !== gender) return false;
        if (active === 'yes' && s.status !== 'active') return false;
        if (active === 'no' && s.status === 'active') return false;
        if (association && (s.clubName || '') !== association) return false;
        const charge = data.transactions
          .filter((t) => t.athleteId === s.id && t.type === 'charge')
          .reduce((sum, t) => sum + t.amount, 0);
        const payment = data.transactions
          .filter((t) => t.athleteId === s.id && t.type === 'payment')
          .reduce((sum, t) => sum + t.amount, 0);
        const balance = charge - payment;
        if (hasBalance === 'yes' && balance <= 0) return false;
        if (hasBalance === 'no' && balance > 0) return false;
        if (balanceAmount) {
          const target = Number(balanceAmount);
          const ok =
            balanceOp === '='
              ? balance === target
              : balanceOp === '<'
                ? balance < target
                : balanceOp === '>'
                  ? balance > target
                  : balanceOp === '<='
                    ? balance <= target
                    : balance >= target;
          if (!ok) return false;
        }
        void untilDate;
        return true;
      })
      .map((s, index) => {
        const charge = data.transactions
          .filter((t) => t.athleteId === s.id && t.type === 'charge')
          .reduce((sum, t) => sum + t.amount, 0);
        const payment = data.transactions
          .filter((t) => t.athleteId === s.id && t.type === 'payment')
          .reduce((sum, t) => sum + t.amount, 0);
        return {
          id: s.id,
          index: String(index + 1),
          last_name: s.lastName,
          first_name: s.firstName,
          team: studentClassNames(s, data.classes),
          balance: `${(charge - payment).toFixed(2)} €`,
        };
      });
    setRows(next);
    setShowResults(true);
  }

  return (
    <SectionShell
      title="Υπόλοιπα αθλητών"
      desc="Εκκρεμείς χρεώσεις ανά αθλητή. Φίλτρα ανά άθλημα, τμήμα, φύλο, ενεργότητα, ποσό υπολοίπου και σωματείο."
    >
      <FilterRow label="Έως Ημερομηνία" htmlFor="bal-until">
        <input
          id="bal-until"
          type="date"
          className="prints-filter-input"
          value={untilDate}
          onChange={(e) => setUntilDate(e.target.value)}
        />
      </FilterRow>
      <FilterRow label="Άθλημα" htmlFor="bal-sport">
        <SportSelect
          id="bal-sport"
          value={sport}
          onChange={(v) => {
            setSport(v);
            setTeamId('');
          }}
        />
      </FilterRow>
      <FilterRow label="Τμήματα" htmlFor="bal-team">
        <TeamSelect id="bal-team" value={teamId} sport={sport} onChange={setTeamId} />
      </FilterRow>
      <FilterRow label="Φύλο" htmlFor="bal-gender">
        <GenderSelect id="bal-gender" value={gender} onChange={setGender} />
      </FilterRow>
      <FilterRow label="Ενεργοί" htmlFor="bal-active">
        <TriStateSelect id="bal-active" value={active} onChange={setActive} />
      </FilterRow>
      <FilterRow label="Έχει υπόλοιπο" htmlFor="bal-has">
        <TriStateSelect id="bal-has" value={hasBalance} onChange={setHasBalance} />
      </FilterRow>
      <FilterRow label="Υπόλοιπο" htmlFor="bal-amount">
        <OpNumber
          id="bal-amount"
          op={balanceOp}
          value={balanceAmount}
          onOp={setBalanceOp}
          onValue={setBalanceAmount}
          min={0}
          step="0.01"
        />
      </FilterRow>
      <FilterRow label="Σωματείο" htmlFor="bal-assoc">
        <AssociationSelect id="bal-assoc" value={association} onChange={setAssociation} />
      </FilterRow>
      <div className="prints-filter-actions">
        <Button type="button" onClick={runSearch}>
          Αναζήτηση
        </Button>
      </div>
      <ResultsModal
        open={showResults}
        title="Υπόλοιπα αθλητών"
        count={rows.length}
        columns={[
          { key: 'index', label: '#' },
          { key: 'last_name', label: 'Επώνυμο' },
          { key: 'first_name', label: 'Όνομα' },
          { key: 'team', label: 'Τμήμα' },
          { key: 'balance', label: 'Υπόλοιπο' },
        ]}
        rows={rows}
        onClose={() => setShowResults(false)}
      />
    </SectionShell>
  );
}

function AttendanceLogSection() {
  const { data } = useAppData();
  const [fromDate, setFromDate] = useState(seasonStartIso);
  const [untilDate, setUntilDate] = useState(todayIso);
  const [sport, setSport] = useState('');
  const [teamId, setTeamId] = useState('');
  const [gender, setGender] = useState('');
  const [active, setActive] = useState<TriState>('');
  const [hasAttendance, setHasAttendance] = useState<TriState>('');
  const [presenceOp, setPresenceOp] = useState('>=');
  const [presenceCount, setPresenceCount] = useState('');
  const [rateOp, setRateOp] = useState('>=');
  const [rateValue, setRateValue] = useState('');
  const [association, setAssociation] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);

  function runSearch() {
    const next = data.students
      .filter((s) => {
        if (!studentMatchesSportFilter(s, sport, data.classes)) return false;
        if (teamId && !studentInClass(s, teamId)) return false;
        if (gender && s.gender !== gender) return false;
        if (active === 'yes' && s.status !== 'active') return false;
        if (active === 'no' && s.status === 'active') return false;
        if (association && (s.clubName || '') !== association) return false;
        const records = data.attendance.filter((a) => {
          if (a.studentId !== s.id) return false;
          if (fromDate && a.date < fromDate) return false;
          if (untilDate && a.date > untilDate) return false;
          return true;
        });
        const present = records.filter((a) => a.present).length;
        const total = records.length;
        const rate = total ? (present / total) * 100 : 0;
        if (hasAttendance === 'yes' && present <= 0) return false;
        if (hasAttendance === 'no' && present > 0) return false;
        if (presenceCount) {
          const t = Number(presenceCount);
          const ok =
            presenceOp === '='
              ? present === t
              : presenceOp === '<'
                ? present < t
                : presenceOp === '>'
                  ? present > t
                  : presenceOp === '<='
                    ? present <= t
                    : present >= t;
          if (!ok) return false;
        }
        if (rateValue) {
          const t = Number(rateValue);
          const ok =
            rateOp === '='
              ? rate === t
              : rateOp === '<'
                ? rate < t
                : rateOp === '>'
                  ? rate > t
                  : rateOp === '<='
                    ? rate <= t
                    : rate >= t;
          if (!ok) return false;
        }
        return true;
      })
      .map((s, index) => {
        const records = data.attendance.filter((a) => {
          if (a.studentId !== s.id) return false;
          if (fromDate && a.date < fromDate) return false;
          if (untilDate && a.date > untilDate) return false;
          return true;
        });
        const present = records.filter((a) => a.present).length;
        const absent = records.filter((a) => !a.present).length;
        const rate = records.length ? ((present / records.length) * 100).toFixed(0) : '0';
        return {
          id: s.id,
          index: String(index + 1),
          last_name: s.lastName,
          first_name: s.firstName,
          trainings: String(records.length),
          present: String(present),
          absent: String(absent),
          rate: `${rate}%`,
        };
      });
    setRows(next);
    setShowResults(true);
  }

  return (
    <SectionShell
      title="Παρουσιολόγιο"
      desc="Παρουσίες και απουσίες ανά αθλητή για επιλεγμένη περίοδο. Φίλτρα ανά άθλημα, τμήμα, φύλο, ενεργότητα και ποσοστό παρουσίας."
    >
      <FilterRow label="Από Ημερομηνία" htmlFor="att-from">
        <input
          id="att-from"
          type="date"
          className="prints-filter-input"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
        />
      </FilterRow>
      <FilterRow label="Έως Ημερομηνία" htmlFor="att-until">
        <input
          id="att-until"
          type="date"
          className="prints-filter-input"
          value={untilDate}
          onChange={(e) => setUntilDate(e.target.value)}
        />
      </FilterRow>
      <FilterRow label="Άθλημα" htmlFor="att-sport">
        <SportSelect
          id="att-sport"
          value={sport}
          onChange={(v) => {
            setSport(v);
            setTeamId('');
          }}
        />
      </FilterRow>
      <FilterRow label="Τμήματα" htmlFor="att-team">
        <TeamSelect id="att-team" value={teamId} sport={sport} onChange={setTeamId} />
      </FilterRow>
      <FilterRow label="Φύλο" htmlFor="att-gender">
        <GenderSelect id="att-gender" value={gender} onChange={setGender} />
      </FilterRow>
      <FilterRow label="Ενεργοί" htmlFor="att-active">
        <TriStateSelect id="att-active" value={active} onChange={setActive} />
      </FilterRow>
      <FilterRow label="Έχει παρουσίες" htmlFor="att-has">
        <TriStateSelect id="att-has" value={hasAttendance} onChange={setHasAttendance} />
      </FilterRow>
      <FilterRow label="Παρουσίες" htmlFor="att-count">
        <OpNumber
          id="att-count"
          op={presenceOp}
          value={presenceCount}
          onOp={setPresenceOp}
          onValue={setPresenceCount}
          min={0}
        />
      </FilterRow>
      <FilterRow label="Ποσοστό παρουσίας (%)" htmlFor="att-rate">
        <OpNumber
          id="att-rate"
          op={rateOp}
          value={rateValue}
          onOp={setRateOp}
          onValue={setRateValue}
          min={0}
          placeholder="%"
        />
      </FilterRow>
      <FilterRow label="Σωματείο" htmlFor="att-assoc">
        <AssociationSelect id="att-assoc" value={association} onChange={setAssociation} />
      </FilterRow>
      <div className="prints-filter-actions">
        <Button type="button" onClick={runSearch}>
          Αναζήτηση
        </Button>
      </div>
      <ResultsModal
        open={showResults}
        title="Παρουσιολόγιο"
        count={rows.length}
        columns={[
          { key: 'index', label: '#' },
          { key: 'last_name', label: 'Επώνυμο' },
          { key: 'first_name', label: 'Όνομα' },
          { key: 'trainings', label: 'Προπονήσεις' },
          { key: 'present', label: 'Παρουσίες' },
          { key: 'absent', label: 'Απουσίες' },
          { key: 'rate', label: 'Ποσοστό' },
        ]}
        rows={rows}
        onClose={() => setShowResults(false)}
      />
    </SectionShell>
  );
}

function TrainingAttendanceSheetSection() {
  const { data } = useAppData();
  const [sport, setSport] = useState('');
  const [teamId, setTeamId] = useState('');
  const [date, setDate] = useState(todayIso);
  const [trainingId, setTrainingId] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);

  const dayTrainings = useMemo(() => {
    if (!teamId) return [];
    return data.trainings.filter((t) => t.classId === teamId && t.date === date);
  }, [data.trainings, teamId, date]);

  function runSearch() {
    if (!teamId) return;
    const athletes = data.students.filter(
      (s) => studentInClass(s, teamId) && studentMatchesSportFilter(s, sport, data.classes),
    );
    setRows(
      athletes.map((s, index) => ({
        id: s.id,
        index: String(index + 1),
        last_name: s.lastName,
        first_name: s.firstName,
        present: '',
        absent: '',
        holiday: '',
      })),
    );
    setShowResults(true);
  }

  return (
    <SectionShell
      title="Παρουσιολόγιο προπόνησης"
      desc="Κενό φύλλο παρουσίας για επιλεγμένη προπόνηση ή λίστα τμήματος. Εκτύπωση με checkbox παρόν/απών/αργία."
    >
      <FilterRow label="Άθλημα" htmlFor="tas-sport">
        <SportSelect
          id="tas-sport"
          value={sport}
          onChange={(v) => {
            setSport(v);
            setTeamId('');
            setTrainingId('');
          }}
        />
      </FilterRow>
      <FilterRow label="Τμήματα" htmlFor="tas-team">
        <TeamSelect
          id="tas-team"
          value={teamId}
          sport={sport}
          onChange={(v) => {
            setTeamId(v);
            setTrainingId('');
          }}
          allLabel="Επιλέξτε τμήμα"
        />
      </FilterRow>
      <FilterRow label="Ημερομηνία" htmlFor="tas-date">
        <input
          id="tas-date"
          type="date"
          className="prints-filter-input"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setTrainingId('');
          }}
        />
      </FilterRow>
      <FilterRow label="Προπονήσεις" htmlFor="tas-training">
        <select
          id="tas-training"
          className="prints-filter-input"
          value={trainingId}
          disabled={!teamId}
          onChange={(e) => setTrainingId(e.target.value)}
        >
          <option value="">Μόνο λίστα τμήματος (χωρίς συγκεκριμένη προπόνηση)</option>
          {dayTrainings.map((t) => (
            <option key={t.id} value={t.id}>
              {t.startTime} · {t.location || '—'}
            </option>
          ))}
        </select>
      </FilterRow>
      <div className="prints-filter-actions">
        <Button type="button" onClick={runSearch} disabled={!teamId}>
          Αναζήτηση
        </Button>
      </div>
      <ResultsModal
        open={showResults}
        title="Παρουσιολόγιο προπόνησης"
        count={rows.length}
        columns={[
          { key: 'index', label: '#' },
          { key: 'last_name', label: 'Επώνυμο' },
          { key: 'first_name', label: 'Όνομα' },
          { key: 'present', label: 'Παρών' },
          { key: 'absent', label: 'Απών' },
          { key: 'holiday', label: 'Αργία' },
        ]}
        rows={rows}
        onClose={() => setShowResults(false)}
      />
    </SectionShell>
  );
}

function RegistrationApplicationsSection() {
  const { data, refresh } = useAppData();
  const canDelete = isPlatformAdmin();
  const [fromDate, setFromDate] = useState('');
  const [untilDate, setUntilDate] = useState(todayIso);
  const [category, setCategory] = useState('pending');
  const [appType, setAppType] = useState('');
  const [sport, setSport] = useState('');
  const [teamId, setTeamId] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);
  const [deleting, setDeleting] = useState(false);

  function kindLabel(kind: string): string {
    if (kind === 'trial') return 'Δοκιμαστική';
    if (kind === 'waitlist') return 'Λίστα αναμονής';
    return 'Πλήρης εγγραφή';
  }

  function statusLabel(status: string): string {
    if (status === 'approved') return 'Εγκεκριμένη';
    if (status === 'rejected') return 'Απορριφθείσα';
    return 'Εκκρεμής';
  }

  function mapRows(apps: typeof data.registrationApplications) {
    return apps.map((app, index) => ({
      id: app.id,
      index: String(index + 1),
      name: `${app.lastName} ${app.firstName}`.trim(),
      guardian: app.guardianName || '—',
      phone: app.guardianPhone || '—',
      team: data.classes.find((c) => c.id === app.classId)?.name ?? '—',
      kind: kindLabel(app.kind),
      status: statusLabel(app.status),
      date: (app.createdAt || '').slice(0, 10) || '—',
    }));
  }

  function filterApps(apps = data.registrationApplications ?? []) {
    return apps.filter((app) => {
      const day = (app.createdAt || '').slice(0, 10);
      if (fromDate && day && day < fromDate) return false;
      if (untilDate && day && day > untilDate) return false;
      if (teamId && app.classId !== teamId) return false;
      if (sport) {
        const cls = data.classes.find((c) => c.id === app.classId);
        if (!sportsMatch(cls?.sport, sport)) return false;
      }
      if (appType && app.kind !== appType) return false;
      if (category === 'pending' && app.status !== 'pending') return false;
      if (category === 'trial' && app.kind !== 'trial') return false;
      if (category === 'waitlist' && app.kind !== 'waitlist') return false;
      return true;
    });
  }

  function runSearch() {
    setRows(mapRows(filterApps()));
    setShowResults(true);
  }

  async function handleDeleteRow(id: string) {
    if (!canDelete || deleting) return;
    if (!confirm('Διαγραφή αυτής της αίτησης;')) return;
    setDeleting(true);
    const result = await registrationApplicationsService.deleteRegistrationApplication(id);
    setDeleting(false);
    if (!result.success) {
      window.alert(result.error ?? 'Αποτυχία διαγραφής');
      return;
    }
    refresh();
    setRows((prev) =>
      prev
        .filter((row) => row.id !== id)
        .map((row, index) => ({ ...row, index: String(index + 1) })),
    );
  }

  async function handleDeleteAll() {
    if (!canDelete || deleting || rows.length === 0) return;
    if (!confirm(`Διαγραφή και των ${rows.length} εμφανιζόμενων αιτήσεων;`)) return;
    setDeleting(true);
    const result = await registrationApplicationsService.deleteRegistrationApplications(
      rows.map((row) => row.id).filter(Boolean),
    );
    setDeleting(false);
    if (!result.success) {
      window.alert(result.error ?? 'Αποτυχία διαγραφής');
      return;
    }
    refresh();
    setRows([]);
  }

  return (
    <SectionShell
      title="Αιτήσεις εγγραφής"
      desc="Εκτύπωση εκκρεμών, δοκιμαστικών και λίστας αναμονής. Φίλτρα ανά ημερομηνία, άθλημα, τμήμα και τύπο αίτησης."
    >
      <FilterRow label="Από Ημερομηνία" htmlFor="app-from">
        <input
          id="app-from"
          type="date"
          className="prints-filter-input"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
        />
      </FilterRow>
      <FilterRow label="Έως Ημερομηνία" htmlFor="app-until">
        <input
          id="app-until"
          type="date"
          className="prints-filter-input"
          value={untilDate}
          onChange={(e) => setUntilDate(e.target.value)}
        />
      </FilterRow>
      <FilterRow label="Κατηγορία αιτήσεων" htmlFor="app-cat">
        <select
          id="app-cat"
          className="prints-filter-input"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="pending">Εκκρεμείς</option>
          <option value="trial">Δοκιμαστικές</option>
          <option value="waitlist">Λίστα αναμονής</option>
          <option value="all">Όλα</option>
        </select>
      </FilterRow>
      <FilterRow label="Τύπος αίτησης" htmlFor="app-type">
        <select
          id="app-type"
          className="prints-filter-input"
          value={appType}
          onChange={(e) => setAppType(e.target.value)}
        >
          <option value="">Όλα</option>
          <option value="full">Πλήρης εγγραφή</option>
          <option value="trial">Δοκιμαστική προπόνηση</option>
          <option value="waitlist">Λίστα αναμονής</option>
        </select>
      </FilterRow>
      <FilterRow label="Άθλημα" htmlFor="app-sport">
        <SportSelect
          id="app-sport"
          value={sport}
          onChange={(v) => {
            setSport(v);
            setTeamId('');
          }}
        />
      </FilterRow>
      <FilterRow label="Τμήματα" htmlFor="app-team">
        <TeamSelect id="app-team" value={teamId} sport={sport} onChange={setTeamId} />
      </FilterRow>
      <div className="prints-filter-actions">
        <Button type="button" onClick={runSearch}>
          Αναζήτηση
        </Button>
      </div>
      <ResultsModal
        open={showResults}
        title="Αιτήσεις εγγραφής"
        count={rows.length}
        columns={[
          { key: 'index', label: '#' },
          { key: 'name', label: 'Όνομα' },
          { key: 'guardian', label: 'Γονέας' },
          { key: 'phone', label: 'Τηλέφωνο' },
          { key: 'team', label: 'Τμήμα' },
          { key: 'kind', label: 'Τύπος' },
          { key: 'status', label: 'Κατάσταση' },
          { key: 'date', label: 'Ημ/νία' },
        ]}
        rows={rows}
        onClose={() => setShowResults(false)}
        onDeleteRow={canDelete ? (id) => void handleDeleteRow(id) : undefined}
        onDeleteAll={canDelete ? () => void handleDeleteAll() : undefined}
        deleting={deleting}
      />
    </SectionShell>
  );
}

function MedicalExpirySection() {
  const { data } = useAppData();
  const [refDate, setRefDate] = useState(todayIso);
  const [window, setWindow] = useState('30');
  const [sport, setSport] = useState('');
  const [teamId, setTeamId] = useState('');
  const [gender, setGender] = useState('');
  const [active, setActive] = useState<TriState>('yes');
  const [showResults, setShowResults] = useState(false);
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);

  function runSearch() {
    const next = data.students
      .filter((s) => {
        if (!studentMatchesSportFilter(s, sport, data.classes)) return false;
        if (teamId && !studentInClass(s, teamId)) return false;
        if (gender && s.gender !== gender) return false;
        if (active === 'yes' && s.status !== 'active') return false;
        if (active === 'no' && s.status === 'active') return false;
        if (window === 'none') return !s.healthCard;
        if (window === 'all') return true;
        if (window === 'expired') return s.healthCardStatus === 'Ληγμένη';
        return Boolean(s.healthCard || s.healthCardStatus === 'Έγκυρη');
      })
      .map((s, index) => ({
        id: s.id,
        index: String(index + 1),
        last_name: s.lastName,
        first_name: s.firstName,
        status: s.healthCardStatus || (s.healthCard ? 'Έγκυρη' : 'Χωρίς'),
        team: studentClassNames(s, data.classes),
      }));
    void refDate;
    setRows(next);
    setShowResults(true);
  }

  return (
    <SectionShell
      title="Λήξεις ιατρικών πιστοποιητικών"
      desc="Αθλητές με ληγμένη ή προσεχώς ληγμένη ιατρική βεβαίωση. Φίλτρα ανά άθλημα, τμήμα, φύλο και ενεργότητα."
    >
      <FilterRow label="Ημερομηνία αναφοράς" htmlFor="med-ref">
        <input
          id="med-ref"
          type="date"
          className="prints-filter-input"
          value={refDate}
          onChange={(e) => setRefDate(e.target.value)}
        />
      </FilterRow>
      <FilterRow label="Λήξη πιστοποιητικού" htmlFor="med-win">
        <select
          id="med-win"
          className="prints-filter-input"
          value={window}
          onChange={(e) => setWindow(e.target.value)}
        >
          <option value="expired">Ληγμένη</option>
          <option value="7">Λήγει εντός 7 ημερών</option>
          <option value="30">Λήγει εντός 30 ημερών</option>
          <option value="60">Λήγει εντός 60 ημερών</option>
          <option value="90">Λήγει εντός 90 ημερών</option>
          <option value="none">Χωρίς βεβαίωση</option>
          <option value="all">Όλα</option>
        </select>
      </FilterRow>
      <FilterRow label="Άθλημα" htmlFor="med-sport">
        <SportSelect
          id="med-sport"
          value={sport}
          onChange={(v) => {
            setSport(v);
            setTeamId('');
          }}
        />
      </FilterRow>
      <FilterRow label="Τμήματα" htmlFor="med-team">
        <TeamSelect id="med-team" value={teamId} sport={sport} onChange={setTeamId} />
      </FilterRow>
      <FilterRow label="Φύλο" htmlFor="med-gender">
        <GenderSelect id="med-gender" value={gender} onChange={setGender} />
      </FilterRow>
      <FilterRow label="Ενεργοί" htmlFor="med-active">
        <TriStateSelect id="med-active" value={active} onChange={setActive} />
      </FilterRow>
      <div className="prints-filter-actions">
        <Button type="button" onClick={runSearch}>
          Αναζήτηση
        </Button>
      </div>
      <ResultsModal
        open={showResults}
        title="Λήξεις ιατρικών πιστοποιητικών"
        count={rows.length}
        columns={[
          { key: 'index', label: '#' },
          { key: 'last_name', label: 'Επώνυμο' },
          { key: 'first_name', label: 'Όνομα' },
          { key: 'team', label: 'Τμήμα' },
          { key: 'status', label: 'Κατάσταση' },
        ]}
        rows={rows}
        onClose={() => setShowResults(false)}
      />
    </SectionShell>
  );
}

function PaymentsCollectionsSection() {
  const { data } = useAppData();
  const [fromDate, setFromDate] = useState(monthStartIso);
  const [untilDate, setUntilDate] = useState(todayIso);
  const [sport, setSport] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [method, setMethod] = useState('');
  const [entryType, setEntryType] = useState('');
  const [athleteQuery, setAthleteQuery] = useState('');
  const [teamId, setTeamId] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);
  const [totalAmount, setTotalAmount] = useState(0);

  function runSearch() {
    const min = amountMin.trim() ? Number(amountMin) : null;
    const max = amountMax.trim() ? Number(amountMax) : null;
    const q = athleteQuery.trim().toLowerCase();

    const filtered = (data.transactions ?? [])
      .filter((t) => {
        const day = transactionLocalDay(t.createdAt);
        if (fromDate && day < fromDate) return false;
        if (untilDate && day > untilDate) return false;
        if (entryType && t.type !== entryType) return false;
        if (method) {
          const stored = t.paymentMethod === 'other' ? 'viva' : t.paymentMethod;
          if (stored !== method) return false;
        }
        if (min != null && !Number.isNaN(min) && t.amount < min) return false;
        if (max != null && !Number.isNaN(max) && t.amount > max) return false;

        const student = data.students.find((s) => s.id === t.athleteId);
        if (teamId && (!student || !studentInClass(student, teamId))) return false;
        if (sport && student && !studentMatchesSportFilter(student, sport, data.classes)) {
          return false;
        }
        if (sport && !student) return false;
        if (q) {
          const hay = `${student?.lastName ?? ''} ${student?.firstName ?? ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    setTotalAmount(filtered.reduce((acc, t) => acc + t.amount, 0));
    setRows(
      filtered.map((t, index) => {
        const student = data.students.find((s) => s.id === t.athleteId);
        const cls = data.classes.find((c) => c.id === student?.classId);
        return {
          id: t.id,
          index: String(index + 1),
          date: transactionLocalDay(t.createdAt),
          athlete: student ? `${student.lastName} ${student.firstName}` : '—',
          sport: student?.sport || cls?.sport || '—',
          team: cls?.name ?? '—',
          type: t.type === 'charge' ? 'Χρέωση' : 'Πληρωμή',
          amount: `${t.amount.toFixed(2)} €`,
          method: paymentMethodLabel(t.paymentMethod),
          period: `${String(t.month).padStart(2, '0')}/${t.year}`,
          receipt: t.receiptNumber || '—',
        };
      }),
    );
    setShowResults(true);
  }

  return (
    <SectionShell
      title="Εισπράξεις περιόδου"
      desc="Χρεώσεις και πληρωμές για επιλεγμένη περίοδο. Φίλτρα ανά ημερομηνία, άθλημα, ποσό, τρόπο πληρωμής, τύπο, αθλητή και τμήμα."
    >
      <FilterRow label="Από Ημερομηνία" htmlFor="pay-from">
        <input
          id="pay-from"
          type="date"
          className="prints-filter-input"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
        />
      </FilterRow>
      <FilterRow label="Έως Ημερομηνία" htmlFor="pay-until">
        <input
          id="pay-until"
          type="date"
          className="prints-filter-input"
          value={untilDate}
          onChange={(e) => setUntilDate(e.target.value)}
        />
      </FilterRow>
      <FilterRow label="Άθλημα" htmlFor="pay-sport">
        <SportSelect
          id="pay-sport"
          value={sport}
          onChange={(v) => {
            setSport(v);
            setTeamId('');
          }}
        />
      </FilterRow>
      <FilterRow label="Ποσό από" htmlFor="pay-amount-min">
        <input
          id="pay-amount-min"
          type="number"
          min={0}
          step="0.01"
          className="prints-filter-input"
          value={amountMin}
          onChange={(e) => setAmountMin(e.target.value)}
          placeholder="π.χ. 10"
        />
      </FilterRow>
      <FilterRow label="Ποσό έως" htmlFor="pay-amount-max">
        <input
          id="pay-amount-max"
          type="number"
          min={0}
          step="0.01"
          className="prints-filter-input"
          value={amountMax}
          onChange={(e) => setAmountMax(e.target.value)}
          placeholder="π.χ. 100"
        />
      </FilterRow>
      <FilterRow label="Τρόπος πληρωμής" htmlFor="pay-method">
        <select
          id="pay-method"
          className="prints-filter-input"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
        >
          <option value="">Όλα</option>
          {PAYMENT_METHODS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </FilterRow>
      <FilterRow label="Τύπος κίνησης" htmlFor="pay-type">
        <select
          id="pay-type"
          className="prints-filter-input"
          value={entryType}
          onChange={(e) => setEntryType(e.target.value)}
        >
          <option value="">Όλα</option>
          <option value="charge">Χρέωση</option>
          <option value="payment">Πληρωμή</option>
        </select>
      </FilterRow>
      <FilterRow label="Αθλητής" htmlFor="pay-athlete">
        <input
          id="pay-athlete"
          type="text"
          className="prints-filter-input"
          value={athleteQuery}
          onChange={(e) => setAthleteQuery(e.target.value)}
          placeholder="Επώνυμο ή όνομα"
        />
      </FilterRow>
      <FilterRow label="Τμήματα" htmlFor="pay-team">
        <TeamSelect id="pay-team" value={teamId} sport={sport} onChange={setTeamId} />
      </FilterRow>
      <div className="prints-filter-actions">
        <Button type="button" onClick={runSearch}>
          Αναζήτηση
        </Button>
      </div>
      <ResultsModal
        open={showResults}
        title="Εισπράξεις περιόδου"
        count={rows.length}
        summary={`Σύνολο ποσών: ${totalAmount.toFixed(2)} €`}
        columns={[
          { key: 'index', label: '#' },
          { key: 'date', label: 'Ημερομηνία' },
          { key: 'athlete', label: 'Αθλητής' },
          { key: 'sport', label: 'Άθλημα' },
          { key: 'team', label: 'Τμήμα' },
          { key: 'type', label: 'Τύπος' },
          { key: 'amount', label: 'Ποσό' },
          { key: 'method', label: 'Τρόπος' },
          { key: 'period', label: 'Περίοδος' },
          { key: 'receipt', label: 'Απόδειξη' },
        ]}
        rows={rows}
        onClose={() => setShowResults(false)}
      />
    </SectionShell>
  );
}

function DebtorsSection() {
  const { data } = useAppData();
  const [untilDate, setUntilDate] = useState(todayIso);
  const [sport, setSport] = useState('');
  const [teamId, setTeamId] = useState('');
  const [gender, setGender] = useState('');
  const [active, setActive] = useState<TriState>('yes');
  const [minBalance, setMinBalance] = useState('');
  const [association, setAssociation] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);

  function runSearch() {
    const next = data.students
      .map((s) => {
        const charge = data.transactions
          .filter((t) => t.athleteId === s.id && t.type === 'charge')
          .reduce((sum, t) => sum + t.amount, 0);
        const payment = data.transactions
          .filter((t) => t.athleteId === s.id && t.type === 'payment')
          .reduce((sum, t) => sum + t.amount, 0);
        return { student: s, balance: charge - payment };
      })
      .filter(({ student: s, balance }) => {
        if (balance <= 0) return false;
        if (!studentMatchesSportFilter(s, sport, data.classes)) return false;
        if (teamId && !studentInClass(s, teamId)) return false;
        if (gender && s.gender !== gender) return false;
        if (active === 'yes' && s.status !== 'active') return false;
        if (active === 'no' && s.status === 'active') return false;
        if (association && (s.clubName || '') !== association) return false;
        if (minBalance && balance < Number(minBalance)) return false;
        void untilDate;
        return true;
      })
      .map(({ student: s, balance }, index) => ({
        id: s.id,
        index: String(index + 1),
        last_name: s.lastName,
        first_name: s.firstName,
        phone: s.phone || '',
        parent_phone: s.guardianPhone || '',
        balance: `${balance.toFixed(2)} €`,
      }));
    setRows(next);
    setShowResults(true);
  }

  return (
    <SectionShell
      title="Οφειλέτες"
      desc="Αθλητές με εκκρεμείς χρεώσεις και στοιχεία επικοινωνίας. Φίλτρα ανά άθλημα, τμήμα, ενεργότητα και ελάχιστο υπόλοιπο."
    >
      <FilterRow label="Έως Ημερομηνία" htmlFor="deb-until">
        <input
          id="deb-until"
          type="date"
          className="prints-filter-input"
          value={untilDate}
          onChange={(e) => setUntilDate(e.target.value)}
        />
      </FilterRow>
      <FilterRow label="Άθλημα" htmlFor="deb-sport">
        <SportSelect
          id="deb-sport"
          value={sport}
          onChange={(v) => {
            setSport(v);
            setTeamId('');
          }}
        />
      </FilterRow>
      <FilterRow label="Τμήματα" htmlFor="deb-team">
        <TeamSelect id="deb-team" value={teamId} sport={sport} onChange={setTeamId} />
      </FilterRow>
      <FilterRow label="Φύλο" htmlFor="deb-gender">
        <GenderSelect id="deb-gender" value={gender} onChange={setGender} />
      </FilterRow>
      <FilterRow label="Ενεργοί" htmlFor="deb-active">
        <TriStateSelect id="deb-active" value={active} onChange={setActive} />
      </FilterRow>
      <FilterRow label="Ελάχιστο υπόλοιπο" htmlFor="deb-min">
        <input
          id="deb-min"
          type="number"
          min={0}
          step="0.01"
          className="prints-filter-input"
          value={minBalance}
          onChange={(e) => setMinBalance(e.target.value)}
        />
      </FilterRow>
      <FilterRow label="Σωματείο" htmlFor="deb-assoc">
        <AssociationSelect id="deb-assoc" value={association} onChange={setAssociation} />
      </FilterRow>
      <div className="prints-filter-actions">
        <Button type="button" onClick={runSearch}>
          Αναζήτηση
        </Button>
      </div>
      <ResultsModal
        open={showResults}
        title="Οφειλέτες"
        count={rows.length}
        columns={[
          { key: 'index', label: '#' },
          { key: 'last_name', label: 'Επώνυμο' },
          { key: 'first_name', label: 'Όνομα' },
          { key: 'phone', label: 'Τηλέφωνο' },
          { key: 'parent_phone', label: 'Τηλ. γονέα' },
          { key: 'balance', label: 'Υπόλοιπο' },
        ]}
        rows={rows}
        onClose={() => setShowResults(false)}
      />
    </SectionShell>
  );
}

function LegalFormsSection() {
  const { data } = useAppData();
  const [mode, setMode] = useState<'gdpr' | 'registration'>('gdpr');
  const [sport, setSport] = useState('');
  const [athleteId, setAthleteId] = useState('');

  const athleteOptions = useMemo(() => {
    return [...data.students]
      .filter((s) => studentMatchesSportFilter(s, sport, data.classes))
      .sort((a, b) =>
        `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'el'),
      );
  }, [data.students, data.classes, sport]);

  return (
    <SectionShell
      title="Νομικά έντυπα"
      desc="Εκτύπωση φόρμας συναίνεσης GDPR και φόρμας εγγραφής αθλητή."
    >
      <div className="prints-filter-inline" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 8 }}>
        <button
          type="button"
          className={`btn ${mode === 'gdpr' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setMode('gdpr')}
        >
          Φόρμα GDPR
        </button>
        <button
          type="button"
          className={`btn ${mode === 'registration' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setMode('registration')}
        >
          Φόρμα εγγραφής
        </button>
      </div>
      {mode === 'gdpr' ? (
        <>
          <FilterRow label="Άθλημα" htmlFor="legal-sport">
            <SportSelect
              id="legal-sport"
              value={sport}
              onChange={(v) => {
                setSport(v);
                setAthleteId('');
              }}
            />
          </FilterRow>
          <FilterRow label="Αθλητής" htmlFor="legal-athlete">
            <select
              id="legal-athlete"
              className="prints-filter-input"
              value={athleteId}
              onChange={(e) => setAthleteId(e.target.value)}
            >
              <option value="">Επιλέξτε αθλητή</option>
              {athleteOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.lastName} {s.firstName}
                </option>
              ))}
            </select>
          </FilterRow>
        </>
      ) : (
        <FilterRow label="Αιτήσεις Εγγραφής" htmlFor="legal-app">
          <select id="legal-app" className="prints-filter-input" defaultValue="">
            <option value="">Επιλέξτε αίτηση</option>
          </select>
        </FilterRow>
      )}
      <div className="prints-filter-actions">
        <Button type="button" onClick={() => window.print()} disabled={mode === 'gdpr' && !athleteId}>
          Εκτύπωση
        </Button>
      </div>
    </SectionShell>
  );
}

function DevelopmentReportSection() {
  const { data } = useAppData();
  const [sport, setSport] = useState('');
  const [athleteId, setAthleteId] = useState('');
  const [fromDate, setFromDate] = useState(monthsAgoIso(3));
  const [untilDate, setUntilDate] = useState(todayIso);
  const [preview, setPreview] = useState(false);

  const athleteOptions = useMemo(() => {
    return [...data.students]
      .filter((s) => studentMatchesSportFilter(s, sport, data.classes))
      .sort((a, b) =>
        `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'el'),
      );
  }, [data.students, data.classes, sport]);

  const reports = useMemo(() => {
    if (!athleteId || !preview) return [];
    return (data.progressReports ?? [])
      .filter((r) => r.athleteId === athleteId)
      .filter((r) => r.date >= fromDate && r.date <= untilDate)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [data.progressReports, athleteId, fromDate, untilDate, preview]);

  const athlete = data.students.find((s) => s.id === athleteId);

  return (
    <SectionShell
      title="Αναφορά προόδου"
      desc="Εκτύπωση αναφοράς προόδου αθλητή για επιλεγμένη περίοδο."
    >
      <FilterRow label="Άθλημα" htmlFor="dev-sport">
        <SportSelect
          id="dev-sport"
          value={sport}
          onChange={(v) => {
            setSport(v);
            setAthleteId('');
            setPreview(false);
          }}
        />
      </FilterRow>
      <FilterRow label="Αθλητής" htmlFor="dev-athlete">
        <select
          id="dev-athlete"
          className="prints-filter-input"
          value={athleteId}
          onChange={(e) => {
            setAthleteId(e.target.value);
            setPreview(false);
          }}
        >
          <option value="">Επίλεξε αθλητή...</option>
          {athleteOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.lastName} {s.firstName}
            </option>
          ))}
        </select>
      </FilterRow>
      <FilterRow label="Από" htmlFor="dev-from">
        <input
          id="dev-from"
          type="date"
          className="prints-filter-input"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
        />
      </FilterRow>
      <FilterRow label="Έως" htmlFor="dev-until">
        <input
          id="dev-until"
          type="date"
          className="prints-filter-input"
          value={untilDate}
          onChange={(e) => setUntilDate(e.target.value)}
        />
      </FilterRow>
      <div className="prints-filter-actions">
        <Button type="button" onClick={() => setPreview(true)} disabled={!athleteId}>
          Αναζήτηση
        </Button>
        {preview ? (
          <Button type="button" variant="secondary" onClick={() => window.print()}>
            Εκτύπωση
          </Button>
        ) : null}
      </div>
      {preview ? (
        <div className="prints-preview stack-md">
          <h3>
            Αναφορά προόδου — {athlete ? `${athlete.lastName} ${athlete.firstName}` : '—'}
          </h3>
          <p className="muted">
            Περίοδος {fromDate} – {untilDate}
          </p>
          {reports.length === 0 ? (
            <p className="prints-placeholder-note">
              Δεν υπάρχουν καταχωρήσεις αναφοράς προόδου για την επιλεγμένη περίοδο.
            </p>
          ) : (
            <ul className="parent-portal-list">
              {reports.map((r) => (
                <li key={r.id}>
                  <strong>
                    {r.date} · {r.title} · {r.rating}/5
                  </strong>
                  <span className="muted">
                    {r.createdByName}
                    {r.notes ? ` · ${r.notes}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </SectionShell>
  );
}

function SimpleReportSection({
  title,
  desc,
  filters,
}: {
  title: string;
  desc: string;
  filters: Array<'team' | 'paymentStatus' | 'sport'>;
}) {
  const { data } = useAppData();
  const [sport, setSport] = useState('');
  const [teamId, setTeamId] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);
  const [columns, setColumns] = useState<Array<{ key: string; label: string }>>([]);

  function runSearch() {
    if (title === 'Κατάλογος τμημάτων') {
      setColumns([
        { key: 'index', label: '#' },
        { key: 'name', label: 'Όνομα' },
        { key: 'sport', label: 'Άθλημα' },
        { key: 'age', label: 'Κατηγορία' },
      ]);
      setRows(
        data.classes
          .filter((c) => !sport || sportsMatch(c.sport, sport))
          .map((c, i) => ({
            id: c.id,
            index: String(i + 1),
            name: c.name,
            sport: c.sport,
            age: c.ageGroup,
          })),
      );
    } else if (title === 'Πρόγραμμα προπονήσεων') {
      setColumns([
        { key: 'index', label: '#' },
        { key: 'date', label: 'Ημερομηνία' },
        { key: 'time', label: 'Ώρα' },
        { key: 'location', label: 'Τοποθεσία' },
        { key: 'team', label: 'Τμήμα' },
      ]);
      setRows(
        data.trainings
          .filter((t) => {
            if (teamId && t.classId !== teamId) return false;
            if (!sport) return true;
            const cls = data.classes.find((c) => c.id === t.classId);
            return sportsMatch(cls?.sport, sport);
          })
          .map((t, i) => ({
            id: t.id,
            index: String(i + 1),
            date: t.date,
            time: `${t.startTime}–${t.endTime}`,
            location: t.location || '',
            team: data.classes.find((c) => c.id === t.classId)?.name ?? '',
          })),
      );
    } else if (title === 'Ιατρικά στοιχεία') {
      setColumns([
        { key: 'index', label: '#' },
        { key: 'last_name', label: 'Επώνυμο' },
        { key: 'first_name', label: 'Όνομα' },
        { key: 'health', label: 'Κάρτα υγείας' },
        { key: 'team', label: 'Τμήμα' },
      ]);
      setRows(
        data.students
          .filter((s) => {
            if (!studentMatchesSportFilter(s, sport, data.classes)) return false;
            if (teamId && !studentInClass(s, teamId)) return false;
            return true;
          })
          .map((s, i) => ({
            id: s.id,
            index: String(i + 1),
            last_name: s.lastName,
            first_name: s.firstName,
            health: s.healthCard ? 'Ναι' : 'Όχι',
            team: studentClassNames(s, data.classes),
          })),
      );
    } else if (title === 'Οικονομική αναφορά') {
      const revenue = data.revenues.reduce((s, r) => s + r.amount, 0);
      const expense = data.expenses.reduce((s, e) => s + e.amount, 0);
      setColumns([
        { key: 'label', label: 'Κατηγορία' },
        { key: 'amount', label: 'Ποσό' },
      ]);
      setRows([
        { id: '1', label: 'Έσοδα', amount: `${revenue.toFixed(2)} €` },
        { id: '2', label: 'Έξοδα', amount: `${expense.toFixed(2)} €` },
        { id: '3', label: 'Υπόλοιπο', amount: `${(revenue - expense).toFixed(2)} €` },
      ]);
    } else {
      setColumns([
        { key: 'index', label: '#' },
        { key: 'athlete', label: 'Αθλητής' },
        { key: 'amount', label: 'Ποσό' },
        { key: 'status', label: 'Κατάσταση' },
      ]);
      setRows(
        data.revenues
          .filter((r) => {
            if (paymentStatus && r.paymentStatus !== paymentStatus) return false;
            if (!sport) return true;
            const s = data.students.find((st) => st.id === r.studentId);
            return s ? studentMatchesSportFilter(s, sport, data.classes) : false;
          })
          .map((r, i) => {
            const s = data.students.find((st) => st.id === r.studentId);
            return {
              id: r.id,
              index: String(i + 1),
              athlete: s ? `${s.lastName} ${s.firstName}` : '',
              amount: `${r.amount.toFixed(2)} €`,
              status:
                r.paymentStatus === 'paid'
                  ? 'Πληρωμένο'
                  : r.paymentStatus === 'pending'
                    ? 'Εκκρεμεί'
                    : r.paymentStatus,
            };
          }),
      );
    }
    setShowResults(true);
  }

  return (
    <SectionShell title={title} desc={desc}>
      {filters.includes('sport') ? (
        <FilterRow label="Άθλημα" htmlFor={`simple-sport-${title}`}>
          <SportSelect
            id={`simple-sport-${title}`}
            value={sport}
            onChange={(v) => {
              setSport(v);
              setTeamId('');
            }}
          />
        </FilterRow>
      ) : null}
      {filters.includes('team') ? (
        <FilterRow label="Τμήματα" htmlFor={`simple-team-${title}`}>
          <TeamSelect
            id={`simple-team-${title}`}
            value={teamId}
            sport={filters.includes('sport') ? sport : ''}
            onChange={setTeamId}
          />
        </FilterRow>
      ) : null}
      {filters.includes('paymentStatus') ? (
        <FilterRow label="Κατάσταση" htmlFor={`simple-status-${title}`}>
          <select
            id={`simple-status-${title}`}
            className="prints-filter-input"
            value={paymentStatus}
            onChange={(e) => setPaymentStatus(e.target.value)}
          >
            <option value="">Όλα</option>
            <option value="pending">Εκκρεμεί</option>
            <option value="paid">Πληρωμένο</option>
          </select>
        </FilterRow>
      ) : null}
      <div className="prints-filter-actions">
        <Button type="button" onClick={runSearch}>
          Αναζήτηση
        </Button>
      </div>
      <ResultsModal
        open={showResults}
        title={title}
        count={rows.length}
        columns={columns}
        rows={rows}
        onClose={() => setShowResults(false)}
      />
    </SectionShell>
  );
}

function SelectedSection({ id }: { id: MenuId }) {
  switch (id) {
    case 'athletes-registry':
      return <AthleteRegistrySection />;
    case 'athlete-balances':
      return <AthleteBalancesSection />;
    case 'attendance-log':
      return <AttendanceLogSection />;
    case 'training-attendance-sheet':
      return <TrainingAttendanceSheetSection />;
    case 'registration-applications':
      return <RegistrationApplicationsSection />;
    case 'medical-expiry':
      return <MedicalExpirySection />;
    case 'payments-collections':
      return <PaymentsCollectionsSection />;
    case 'debtors':
      return <DebtorsSection />;
    case 'legal-forms':
      return <LegalFormsSection />;
    case 'development-report':
      return <DevelopmentReportSection />;
    case 'teams':
      return (
        <SimpleReportSection
          title="Κατάλογος τμημάτων"
          desc="Όνομα και κατηγορία κάθε τμήματος. Φίλτρο ανά άθλημα."
          filters={['sport']}
        />
      );
    case 'medical':
      return (
        <SimpleReportSection
          title="Ιατρικά στοιχεία"
          desc="Πιστοποιητικά, τραυματισμοί και σημειώσεις."
          filters={['sport', 'team']}
        />
      );
    case 'finance':
      return (
        <SimpleReportSection
          title="Οικονομική αναφορά"
          desc="Μηνιαία έσοδα, έξοδα και υπόλοιπο."
          filters={[]}
        />
      );
    case 'fees':
      return (
        <SimpleReportSection
          title="Χρεώσεις / πληρωμές"
          desc="Κατάσταση χρεώσεων και πληρωμών αθλητών."
          filters={['sport', 'paymentStatus']}
        />
      );
    case 'trainings':
      return (
        <SimpleReportSection
          title="Πρόγραμμα προπονήσεων"
          desc="Ημερομηνία, ώρα, τοποθεσία και τμήμα."
          filters={['sport', 'team']}
        />
      );
    default:
      return null;
  }
}

export function PrintsPage() {
  const [selectedId, setSelectedId] = useState<MenuId>('athletes-registry');

  return (
    <div className="prints-page">
      <div className="page-header">
        <h1>Εκτύπωση</h1>
      </div>

      <div className="prints-layout">
        <nav className="prints-nav page-panel" aria-label="Εκτύπωση">
          {MENU_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={selectedId === item.id ? 'prints-nav-item active' : 'prints-nav-item'}
              onClick={() => setSelectedId(item.id)}
            >
              {item.title}
            </button>
          ))}
        </nav>

        <div className="prints-main page-panel">
          <SelectedSection id={selectedId} />
        </div>
      </div>
    </div>
  );
}
