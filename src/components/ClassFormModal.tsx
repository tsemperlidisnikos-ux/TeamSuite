import { useMemo } from 'react';
import * as classesService from '../api/services/classesService';
import { Button } from '../components/ui/Button';
import { useAppData } from '../hooks/useAppData';
import type { ClassInput } from '../schemas';
import type { AcademyClass } from '../types';
import { resolveCoachRecord } from '../utils/coachScope';
import { seasonDisplayName } from '../utils/clubSeasons';
import { activeClubSportSelectOptions } from '../utils/clubSports';
import { getSession } from '../auth/auth';

const CLASS_CATEGORY_OPTIONS = ['Αγωνιστικό', 'Ακαδημία'] as const;

type Props = {
  open: boolean;
  editing: AcademyClass | null;
  form: ClassInput;
  error: string;
  saving: boolean;
  onChange: (form: ClassInput) => void;
  onClose: () => void;
  onSave: () => void;
};

export function ClassFormModal({
  open,
  editing,
  form,
  error,
  saving,
  onChange,
  onClose,
  onSave,
}: Props) {
  const { data } = useAppData();
  const session = getSession();
  const isCoach = session?.role === 'coach';
  const coach = useMemo(
    () => resolveCoachRecord(data.coaches, session?.coachId),
    [data.coaches, session?.coachId],
  );

  const sportOptions = useMemo(() => {
    if (isCoach && coach?.sport) {
      return [{ value: coach.sport, label: coach.sport }];
    }
    return activeClubSportSelectOptions(data.sports, {
      emptyLabel: '—',
      retain: form.sport ? [form.sport] : [],
    });
  }, [data.sports, isCoach, coach, form.sport]);

  const coachOptions = useMemo(
    () =>
      (data.coaches ?? [])
        .filter((c) => c.active)
        .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'el')),
    [data.coaches],
  );

  if (!open) return null;

  return (
    <div className="training-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="training-modal class-form-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="class-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="class-modal-title">{editing ? 'Επεξεργασία τμήματος' : 'Νέο τμήμα'}</h2>

        <div className="training-modal-fields">
          <label>
            <span>Όνομα τμήματος *</span>
            <input
              type="text"
              value={form.name}
              onChange={(e) => onChange({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            <span>Φύλο</span>
            <select
              value={form.gender ?? ''}
              onChange={(e) =>
                onChange({ ...form, gender: e.target.value as ClassInput['gender'] })
              }
            >
              <option value="">—</option>
              <option value="female">Θήλυ</option>
              <option value="male">Άρρεν</option>
              <option value="mixed">Μικτό</option>
            </select>
          </label>
          <label>
            <span>Κατηγορία</span>
            <select
              value={form.ageGroup ?? ''}
              onChange={(e) => onChange({ ...form, ageGroup: e.target.value })}
            >
              <option value="">—</option>
              {CLASS_CATEGORY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
              {form.ageGroup &&
              !CLASS_CATEGORY_OPTIONS.includes(
                form.ageGroup as (typeof CLASS_CATEGORY_OPTIONS)[number],
              ) ? (
                <option value={form.ageGroup}>{form.ageGroup}</option>
              ) : null}
            </select>
          </label>
          <label>
            <span>Άθλημα</span>
            <select
              value={form.sport ?? ''}
              disabled={isCoach}
              onChange={(e) => onChange({ ...form, sport: e.target.value })}
            >
              {sportOptions.map((opt) => (
                <option key={opt.value || 'empty'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Σεζόν</span>
            <select
              value={form.seasonId ?? ''}
              onChange={(e) => {
                const seasonId = e.target.value || null;
                const season = (data.clubSeasons ?? []).find((s) => s.id === seasonId);
                onChange({
                  ...form,
                  seasonId,
                  startDate: season?.startDate ?? form.startDate,
                  endDate: season?.endDate ?? form.endDate,
                });
              }}
            >
              <option value="">—</option>
              {(data.clubSeasons ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {seasonDisplayName(s)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Α&apos; Προπονητής</span>
            <select
              value={form.coachId ?? ''}
              onChange={(e) =>
                onChange({ ...form, coachId: e.target.value || null })
              }
            >
              <option value="">—</option>
              {coachOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.lastName} {c.firstName}
                </option>
              ))}
            </select>
          </label>
          <div className="class-form-row-2">
            <label>
              <span>Έτος γέννησης από</span>
              <input
                type="number"
                min={1990}
                max={2020}
                value={form.birthYearFrom ?? ''}
                onChange={(e) =>
                  onChange({
                    ...form,
                    birthYearFrom: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </label>
            <label>
              <span>Έως</span>
              <input
                type="number"
                min={1990}
                max={2020}
                value={form.birthYearTo ?? ''}
                onChange={(e) =>
                  onChange({
                    ...form,
                    birthYearTo: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </label>
          </div>
          <label>
            <span>Ημερομηνία έναρξης</span>
            <input
              type="date"
              value={form.startDate ?? ''}
              onChange={(e) => onChange({ ...form, startDate: e.target.value })}
            />
          </label>
          <label>
            <span>Ημερομηνία λήξης</span>
            <input
              type="date"
              value={form.endDate ?? ''}
              min={form.startDate || undefined}
              onChange={(e) => onChange({ ...form, endDate: e.target.value })}
            />
          </label>

          {error ? <p className="form-error">{error}</p> : null}
        </div>

        <div className="training-modal-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Ακύρωση
          </Button>
          <Button type="button" onClick={onSave} disabled={saving}>
            {saving ? 'Αποθήκευση…' : 'Αποθήκευση'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export async function saveClassForm(
  editing: AcademyClass | null,
  form: ClassInput,
  options?: { sportOverride?: string },
) {
  const payload: ClassInput = {
    ...form,
    sport: options?.sportOverride ?? form.sport,
    scheduleSummary:
      form.scheduleSummary ||
      (form.startDate || form.endDate
        ? `${form.startDate || '…'} → ${form.endDate || '…'}`
        : 'Χωρίς πρόγραμμα'),
  };
  return editing
    ? classesService.updateClass(editing.id, payload)
    : classesService.createClass(payload);
}
