import { useMemo, useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import * as matchesService from '../api/services/matchesService';
import { getSession } from '../auth/auth';
import { Button } from '../components/ui/Button';
import { PageHeader } from '../components/ui/PageHeader';
import { useAppData } from '../hooks/useAppData';
import type { MatchInput } from '../schemas';
import type { Match, MatchStatus, MatchVenue } from '../types';
import {
  classIdsOf,
  isClassInCoachScope,
  resolveCoachRecord,
  sportsMatch,
  visibleClassesForSession,
} from '../utils/coachScope';
import { localDateIso } from '../utils/dates';
import { formatDate } from '../utils/labels';
import { listActiveClubSportNames } from '../utils/clubSports';
import { listActiveFacilities } from '../utils/facilityHours';
import { normalizeSportKey } from '../utils/sport';

const emptyForm = (): MatchInput => ({
  date: localDateIso(),
  time: '18:00',
  opponent: '',
  sport: '',
  classId: null,
  venue: 'home',
  location: '',
  status: 'scheduled',
  ourScore: null,
  opponentScore: null,
  notes: '',
});

const venueLabels: Record<MatchVenue, string> = {
  home: 'Εντός',
  away: 'Εκτός',
  neutral: 'Ουδέτερο',
};

const statusLabels: Record<MatchStatus, string> = {
  scheduled: 'Προγραμματισμένος',
  played: 'Ολοκληρώθηκε',
  cancelled: 'Ακυρώθηκε',
};

export function MatchesPage() {
  const { data, refresh } = useAppData();
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
  const facilityLocations = useMemo(
    () => listActiveFacilities(data.facilities).map((item) => item.name),
    [data.facilities],
  );
  const [form, setForm] = useState<MatchInput>(() => ({
    ...emptyForm(),
    sport: coach?.sport ?? '',
  }));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

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
    return toItems(activeNames);
  }, [data.sports, isCoach, coach]);

  const classesForSelectedSport = useMemo(() => {
    if (!form.sport.trim()) return visibleClasses;
    return visibleClasses.filter((c) => sportsMatch(c.sport, form.sport));
  }, [visibleClasses, form.sport]);

  const matches = useMemo(
    () =>
      [...(data.matches ?? [])]
        .filter((m) => {
          if (!isCoach) return true;
          if (m.classId) return isClassInCoachScope(m.classId, allowedClassIds, true);
          return sportsMatch(m.sport, coach?.sport);
        })
        .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`)),
    [data.matches, isCoach, allowedClassIds, coach],
  );

  function startEdit(match: Match) {
    setEditingId(match.id);
    setForm({
      date: match.date,
      time: match.time,
      opponent: match.opponent,
      sport: match.sport,
      classId: match.classId,
      venue: match.venue,
      location: match.location,
      status: match.status,
      ourScore: match.ourScore,
      opponentScore: match.opponentScore,
      notes: match.notes,
    });
    setError('');
    setMessage('');
  }

  function resetForm() {
    setEditingId(null);
    setForm({
      ...emptyForm(),
      sport: isCoach && coach?.sport ? coach.sport : '',
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    const payload: MatchInput = {
      ...form,
      sport: isCoach && coach?.sport ? coach.sport : form.sport,
      opponent: form.opponent.trim(),
      ourScore: form.status === 'played' ? Number(form.ourScore ?? 0) : null,
      opponentScore: form.status === 'played' ? Number(form.opponentScore ?? 0) : null,
    };
    const result = editingId
      ? await matchesService.updateMatch(editingId, payload)
      : await matchesService.createMatch(payload);
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Αποτυχία αποθήκευσης');
      return;
    }
    setMessage(editingId ? 'Ο αγώνας ενημερώθηκε.' : 'Ο αγώνας καταχωρήθηκε.');
    resetForm();
    refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm('Διαγραφή αγώνα;')) return;
    const result = await matchesService.deleteMatch(id);
    if (!result.success) {
      setError(result.error ?? 'Αποτυχία διαγραφής');
      return;
    }
    if (editingId === id) resetForm();
    refresh();
  }

  return (
    <div className="stack-lg">
      <PageHeader
        title="Αγώνες"
        subtitle="Προγραμματισμός αγώνων, φύλλο αποτελέσματος και σκορ."
      />

      <section className="panel">
        <h3>{editingId ? 'Επεξεργασία αγώνα' : 'Νέος αγώνας'}</h3>
        <form className="entry-form" onSubmit={(e) => void handleSubmit(e)}>
          <div className="club-users-grid">
            <label className="field">
              <span>Ημερομηνία</span>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
                required
              />
            </label>
            <label className="field">
              <span>Ώρα</span>
              <input
                type="time"
                value={form.time}
                onChange={(e) => setForm((p) => ({ ...p, time: e.target.value }))}
              />
            </label>
            <label className="field">
              <span>Αντίπαλος</span>
              <input
                value={form.opponent}
                onChange={(e) => setForm((p) => ({ ...p, opponent: e.target.value }))}
                required
              />
            </label>
            <label className="field">
              <span>Άθλημα</span>
              <select
                value={form.sport}
                disabled={isCoach}
                onChange={(e) => {
                  const sport = e.target.value;
                  setForm((p) => {
                    const stillValid =
                      p.classId &&
                      visibleClasses.some(
                        (c) => c.id === p.classId && sportsMatch(c.sport, sport),
                      );
                    return {
                      ...p,
                      sport,
                      classId: stillValid ? p.classId : null,
                    };
                  });
                }}
              >
                {isCoach ? null : <option value="">—</option>}
                {sportOptions.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Τμήμα</span>
              <select
                value={form.classId ?? ''}
                onChange={(e) =>
                  setForm((p) => ({ ...p, classId: e.target.value || null }))
                }
              >
                <option value="">— χωρίς —</option>
                {classesForSelectedSport.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Έδρα</span>
              <select
                value={form.venue}
                onChange={(e) =>
                  setForm((p) => ({ ...p, venue: e.target.value as MatchVenue }))
                }
              >
                <option value="home">Εντός</option>
                <option value="away">Εκτός</option>
                <option value="neutral">Ουδέτερο</option>
              </select>
            </label>
            <label className="field">
              <span>Γήπεδο / Χώρος</span>
              <select
                value={form.location}
                onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
              >
                <option value="">—</option>
                {form.location && !facilityLocations.includes(form.location) ? (
                  <option value={form.location}>{form.location}</option>
                ) : null}
                {facilityLocations.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Κατάσταση</span>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((p) => ({ ...p, status: e.target.value as MatchStatus }))
                }
              >
                <option value="scheduled">Προγραμματισμένος</option>
                <option value="played">Ολοκληρώθηκε</option>
                <option value="cancelled">Ακυρώθηκε</option>
              </select>
            </label>
            {form.status === 'played' ? (
              <>
                <label className="field">
                  <span>Σκορ μας</span>
                  <input
                    type="number"
                    min={0}
                    value={form.ourScore ?? 0}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, ourScore: Number(e.target.value) || 0 }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Σκορ αντιπάλου</span>
                  <input
                    type="number"
                    min={0}
                    value={form.opponentScore ?? 0}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        opponentScore: Number(e.target.value) || 0,
                      }))
                    }
                  />
                </label>
              </>
            ) : null}
          </div>
          <label className="field">
            <span>Σημειώσεις / φύλλο αγώνα</span>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            />
          </label>
          <div className="admin-entry-actions">
            <Button type="submit" disabled={saving}>
              <Plus size={16} /> {editingId ? 'Αποθήκευση' : 'Καταχώρηση'}
            </Button>
            {editingId ? (
              <Button type="button" variant="secondary" onClick={resetForm}>
                Άκυρο
              </Button>
            ) : null}
          </div>
        </form>
        {error ? <p className="form-error">{error}</p> : null}
        {message ? <p className="settings-success">{message}</p> : null}
      </section>

      <section className="panel table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Ημερομηνία</th>
              <th>Αντίπαλος</th>
              <th>Έδρα</th>
              <th>Κατάσταση</th>
              <th>Σκορ</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {matches.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">
                  Δεν υπάρχουν αγώνες ακόμη.
                </td>
              </tr>
            ) : (
              matches.map((match) => (
                <tr key={match.id}>
                  <td>
                    {formatDate(match.date)}
                    {match.time ? ` · ${match.time}` : ''}
                  </td>
                  <td>
                    <strong>{match.opponent}</strong>
                    <div className="muted">{match.sport || '—'}</div>
                  </td>
                  <td>{venueLabels[match.venue]}</td>
                  <td>{statusLabels[match.status]}</td>
                  <td>
                    {match.status === 'played'
                      ? `${match.ourScore ?? 0} – ${match.opponentScore ?? 0}`
                      : '—'}
                  </td>
                  <td className="row-actions">
                    <button type="button" className="btn btn-ghost" onClick={() => startEdit(match)}>
                      Επεξεργασία
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => void handleDelete(match.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
