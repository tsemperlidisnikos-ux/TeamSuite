import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MoreVertical, Pencil, Plus, SquarePen, Trash2 } from 'lucide-react';
import * as classesService from '../api/services/classesService';
import { ClassFormModal, saveClassForm } from '../components/ClassFormModal';
import { getSession } from '../auth/auth';
import { AppPopupLayer } from '../components/ui/AppPopupLayer';
import { Button } from '../components/ui/Button';
import { useAppData } from '../hooks/useAppData';
import type { ClassInput } from '../schemas';
import type { AcademyClass } from '../types';
import { resolveCoachRecord, visibleClassesForSession } from '../utils/coachScope';
import {
  classGenderLabels,
  classToFormInput,
  coachDisplayName,
  isClassListedActive,
  seasonShortLabel,
} from '../utils/classHelpers';
import { getActiveSeason } from '../utils/clubSeasons';
import { activeClubSportSelectOptions, clubSportsMatch } from '../utils/clubSports';
import { studentInClass } from '../utils/studentClasses';

const PAGE_SIZES = [10, 25, 50, 100] as const;

type SortKey = 'name' | 'gender' | 'season' | 'sport' | 'ageGroup' | 'coach' | 'athletes';
type SortDir = 'asc' | 'desc';

const sortLabels: Record<SortKey, string> = {
  name: 'Όνομα',
  gender: 'Φύλο',
  season: 'Σεζόν',
  sport: 'Άθλημα',
  ageGroup: 'Κατηγορία',
  coach: "Α' Προπονητής",
  athletes: 'Αθλητές',
};

function SortableTh({
  column,
  sortKey,
  sortDir,
  onSort,
}: {
  column: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const active = sortKey === column;
  return (
    <th scope="col">
      <button
        type="button"
        className={`classes-sort-btn${active ? ' is-active' : ''}`}
        onClick={() => onSort(column)}
        aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        {sortLabels[column]}
        <span className="classes-sort-indicator" aria-hidden>
          {active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );
}

export function ClassesPage() {
  const { data, refresh } = useAppData();
  const session = getSession();
  const isCoach = session?.role === 'coach';
  const coach = useMemo(
    () => resolveCoachRecord(data.coaches, session?.coachId),
    [data.coaches, session?.coachId],
  );

  const [tab, setTab] = useState<'active' | 'inactive'>('active');
  const [seasonFilter, setSeasonFilter] = useState('');
  const [sportFilter, setSportFilter] = useState('');
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(25);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menuId, setMenuId] = useState<string | null>(null);
  const menuAnchorRef = useRef<HTMLButtonElement>(null);
  const menuClass = useMemo(
    () => (menuId ? data.classes.find((c) => c.id === menuId) ?? null : null),
    [menuId, data.classes],
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AcademyClass | null>(null);
  const [form, setForm] = useState<ClassInput>(() => ({
    name: '',
    sport: '',
    ageGroup: '',
    coachId: null,
    maxStudents: 18,
    scheduleSummary: '',
    monthlyFee: 55,
    startDate: '',
    endDate: '',
    seasonId: null,
    gender: '',
    birthYearFrom: null,
    birthYearTo: null,
    manualInactive: false,
  }));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const visibleClasses = useMemo(
    () =>
      visibleClassesForSession(data.classes, data.coaches, session, {
        seasons: data.clubSeasons,
        onlyActiveSeason: false,
      }),
    [data.classes, data.coaches, data.clubSeasons, session],
  );

  const sportOptions = useMemo(
    () =>
      activeClubSportSelectOptions(data.sports, {
        emptyLabel: 'Όλα',
        retain: visibleClasses.map((cls) => cls.sport),
      }),
    [data.sports, visibleClasses],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visibleClasses.filter((cls) => {
      const active = isClassListedActive(cls, data.clubSeasons);
      if (tab === 'active' && !active) return false;
      if (tab === 'inactive' && active) return false;
      if (seasonFilter && cls.seasonId !== seasonFilter) return false;
      if (sportFilter && !clubSportsMatch(cls.sport, sportFilter)) return false;
      if (q) {
        const hay = [
          cls.name,
          cls.ageGroup,
          cls.sport,
          coachDisplayName(cls.coachId, data.coaches),
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [visibleClasses, tab, seasonFilter, sportFilter, search, data.clubSeasons, data.coaches]);

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name':
          cmp = a.name.localeCompare(b.name, 'el');
          break;
        case 'gender':
          cmp = (classGenderLabels[a.gender ?? ''] ?? '').localeCompare(
            classGenderLabels[b.gender ?? ''] ?? '',
            'el',
          );
          break;
        case 'season': {
          const seasonA = (data.clubSeasons ?? []).find((s) => s.id === a.seasonId);
          const seasonB = (data.clubSeasons ?? []).find((s) => s.id === b.seasonId);
          cmp = seasonShortLabel(seasonA).localeCompare(seasonShortLabel(seasonB), 'el');
          break;
        }
        case 'sport':
          cmp = (a.sport ?? '').localeCompare(b.sport ?? '', 'el');
          break;
        case 'ageGroup':
          cmp = (a.ageGroup ?? '').localeCompare(b.ageGroup ?? '', 'el');
          break;
        case 'coach':
          cmp = coachDisplayName(a.coachId, data.coaches).localeCompare(
            coachDisplayName(b.coachId, data.coaches),
            'el',
          );
          break;
        case 'athletes': {
          const countA = data.students.filter((s) => studentInClass(s, a.id)).length;
          const countB = data.students.filter((s) => studentInClass(s, b.id)).length;
          cmp = countA - countB;
          break;
        }
      }
      return cmp * dir;
    });
  }, [filtered, sortKey, sortDir, data.clubSeasons, data.coaches, data.students]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  function toggleSort(key: SortKey) {
    setPage(1);
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir('asc');
  }

  function openCreate() {
    const activeSeason = getActiveSeason(data.clubSeasons);
    setEditing(null);
    setForm({
      name: '',
      sport: isCoach && coach?.sport ? coach.sport : '',
      ageGroup: '',
      coachId: null,
      maxStudents: 18,
      scheduleSummary: '',
      monthlyFee: 55,
      startDate: activeSeason?.startDate ?? '',
      endDate: activeSeason?.endDate ?? '',
      seasonId: activeSeason?.id ?? null,
      gender: '',
      birthYearFrom: null,
      birthYearTo: null,
      manualInactive: false,
    });
    setError('');
    setModalOpen(true);
  }

  function openEdit(cls: AcademyClass) {
    setEditing(cls);
    setForm({
      name: cls.name,
      sport: cls.sport,
      ageGroup: cls.ageGroup,
      coachId: cls.coachId,
      maxStudents: cls.maxStudents,
      scheduleSummary: cls.scheduleSummary,
      monthlyFee: cls.monthlyFee,
      startDate: cls.startDate ?? '',
      endDate: cls.endDate ?? '',
      seasonId: cls.seasonId ?? null,
      gender: cls.gender ?? '',
      birthYearFrom: cls.birthYearFrom ?? null,
      birthYearTo: cls.birthYearTo ?? null,
      manualInactive: cls.manualInactive ?? false,
    });
    setError('');
    setMenuId(null);
    setModalOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    const sport = isCoach && coach?.sport ? coach.sport : form.sport;
    const result = await saveClassForm(editing, form, { sportOverride: sport });
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Σφάλμα');
      return;
    }
    setModalOpen(false);
    refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm('Διαγραφή τμήματος;')) return;
    setMenuId(null);
    await classesService.deleteClass(id);
    refresh();
  }

  async function bulkToggleInactive(toInactive: boolean) {
    if (selected.size === 0) return;
    for (const id of selected) {
      const cls = data.classes.find((c) => c.id === id);
      if (!cls) continue;
      await classesService.updateClass(id, {
        ...classToFormInput(cls),
        manualInactive: toInactive,
      });
    }
    setSelected(new Set());
    refresh();
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllOnPage() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const row of pageRows) next.add(row.id);
      return next;
    });
  }

  function deselectAll() {
    setSelected(new Set());
  }

  return (
    <div className="classes-page stack-lg">
      <header className="classes-page-head">
        <h1>Τμήματα</h1>
        <div className="classes-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'active'}
            className={tab === 'active' ? 'is-active' : ''}
            onClick={() => {
              setTab('active');
              setPage(1);
            }}
          >
            Ενεργά
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'inactive'}
            className={tab === 'inactive' ? 'is-active' : ''}
            onClick={() => {
              setTab('inactive');
              setPage(1);
            }}
          >
            Μη Ενεργά
          </button>
        </div>
      </header>

      <section className="panel classes-panel">
        <div className="classes-toolbar">
          <h2>Τμήματα</h2>
          <div className="classes-toolbar-actions">
            <label className="classes-season-filter">
              <span>Σεζόν:</span>
              <select
                value={seasonFilter}
                onChange={(e) => {
                  setSeasonFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">—</option>
                {(data.clubSeasons ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {seasonShortLabel(s)}
                  </option>
                ))}
              </select>
            </label>
            <label className="classes-season-filter">
              <span>Άθλημα:</span>
              <select
                value={sportFilter}
                onChange={(e) => {
                  setSportFilter(e.target.value);
                  setPage(1);
                }}
              >
                {sportOptions.map((opt) => (
                  <option key={opt.value || 'all'} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <Button type="button" onClick={openCreate}>
              <Plus size={16} /> Δημιουργία
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={selected.size === 0}
              onClick={() =>
                void bulkToggleInactive(tab === 'active')
              }
            >
              <SquarePen size={16} /> Μαζική αλλαγή κατάστασης
            </Button>
          </div>
        </div>

        <div className="classes-table-controls">
          <label className="classes-page-size">
            Δείξε{' '}
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value) as (typeof PAGE_SIZES)[number]);
                setPage(1);
              }}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>{' '}
            εγγραφές
          </label>
          <div className="classes-bulk-select">
            <button type="button" className="btn btn-ghost" onClick={selectAllOnPage}>
              Επιλογή όλων
            </button>
            <button type="button" className="btn btn-ghost" onClick={deselectAll}>
              Αποεπιλογή όλων
            </button>
          </div>
          <label className="classes-search">
            <span>Αναζήτηση:</span>
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </label>
        </div>

        <div className="table-wrap classes-table-wrap">
          <table className="data-table classes-table">
            <thead>
              <tr>
                <th className="classes-col-check" />
                <SortableTh column="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh column="gender" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh column="season" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh column="sport" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh column="ageGroup" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh column="coach" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh column="athletes" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <th />
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="classes-empty muted">
                    Δεν υπάρχουν τμήματα
                  </td>
                </tr>
              ) : (
                pageRows.map((cls) => {
                  const season = (data.clubSeasons ?? []).find((s) => s.id === cls.seasonId);
                  const count = data.students.filter((s) => studentInClass(s, cls.id)).length;
                  return (
                    <tr key={cls.id}>
                      <td className="classes-col-check">
                        <input
                          type="checkbox"
                          checked={selected.has(cls.id)}
                          onChange={() => toggleSelect(cls.id)}
                          aria-label={`Επιλογή ${cls.name}`}
                        />
                      </td>
                      <td>
                        <Link to={`/classes/${cls.id}`} className="classes-name-link">
                          {cls.name}
                        </Link>
                      </td>
                      <td>{classGenderLabels[cls.gender ?? '']}</td>
                      <td>{seasonShortLabel(season)}</td>
                      <td>{cls.sport || '—'}</td>
                      <td>{cls.ageGroup || '—'}</td>
                      <td>{coachDisplayName(cls.coachId, data.coaches)}</td>
                      <td>{count}</td>
                      <td className="classes-row-menu">
                        <div className="app-popup-anchor">
                          <button
                            ref={menuId === cls.id ? menuAnchorRef : undefined}
                            type="button"
                            className="btn btn-ghost"
                            aria-label="Ενέργειες"
                            aria-expanded={menuId === cls.id}
                            onClick={() => setMenuId(menuId === cls.id ? null : cls.id)}
                          >
                            <MoreVertical size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="classes-pagination">
          <div className="classes-pagination-nav">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ‹
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={safePage >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            >
              ›
            </button>
          </div>
          <p className="muted">
            Εμφανίζονται {sorted.length === 0 ? 0 : (safePage - 1) * pageSize + 1} έως{' '}
            {Math.min(safePage * pageSize, sorted.length)} από {sorted.length} εγγραφές
          </p>
        </div>
      </section>

      <AppPopupLayer
        open={Boolean(menuClass)}
        onClose={() => setMenuId(null)}
        anchorRef={menuAnchorRef}
        panelClassName="classes-menu"
        align="right"
      >
        {menuClass ? (
          <>
            <button
              type="button"
              onClick={() => {
                openEdit(menuClass);
                setMenuId(null);
              }}
            >
              <Pencil size={14} /> Επεξεργασία
            </button>
            <button
              type="button"
              onClick={() => void handleDelete(menuClass.id)}
            >
              <Trash2 size={14} /> Διαγραφή
            </button>
          </>
        ) : null}
      </AppPopupLayer>

      <ClassFormModal
        open={modalOpen}
        editing={editing}
        form={form}
        error={error}
        saving={saving}
        onChange={setForm}
        onClose={() => setModalOpen(false)}
        onSave={() => void handleSave()}
      />
    </div>
  );
}
