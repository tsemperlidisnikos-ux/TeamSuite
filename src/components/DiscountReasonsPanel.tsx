import { useEffect, useMemo, useRef, useState } from 'react';
import * as discountReasonsService from '../api/services/discountReasonsService';
import { createId } from '../data/repository';
import { Button } from './ui/Button';
import { useAppData } from '../hooks/useAppData';
import type { DiscountReasonDef } from '../types';
import { listActiveClubSportNames } from '../utils/clubSports';
import {
  ALL_SPORTS_DISCOUNT_LABEL,
  clubDiscountReasons,
} from '../utils/discountReasons';

function toDraft(list: DiscountReasonDef[] | undefined): DiscountReasonDef[] {
  return clubDiscountReasons(list);
}

export function DiscountReasonsPanel() {
  const { data, refresh } = useAppData();
  const [draft, setDraft] = useState<DiscountReasonDef[]>(() =>
    toDraft(data.discountReasons),
  );
  const [newName, setNewName] = useState('');
  const [newSport, setNewSport] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const dirtyRef = useRef(false);

  const sportOptions = useMemo(
    () => listActiveClubSportNames(data.sports),
    [data.sports],
  );

  useEffect(() => {
    if (dirtyRef.current) return;
    setDraft(toDraft(data.discountReasons));
  }, [data.discountReasons]);

  const grouped = useMemo(() => {
    const map = new Map<string, DiscountReasonDef[]>();
    for (const row of draft) {
      const key = row.sport || '';
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    const keys = [...map.keys()].sort((a, b) => {
      if (!a) return -1;
      if (!b) return 1;
      return a.localeCompare(b, 'el');
    });
    return keys.map((sport) => ({
      sport,
      label: sport || ALL_SPORTS_DISCOUNT_LABEL,
      rows: map.get(sport) ?? [],
    }));
  }, [draft]);

  function markDirty() {
    dirtyRef.current = true;
    setMessage('');
  }

  function rowsForSave(): DiscountReasonDef[] {
    const rows = draft.map((row) => ({ ...row, name: row.name.trim() }));
    const pending = newName.trim();
    if (pending) {
      rows.push({ id: createId('dsc'), name: pending, sport: newSport.trim() });
    }
    return rows.filter((row) => row.name);
  }

  function addReason() {
    const name = newName.trim();
    if (!name) {
      setError('Γράψτε τον λόγο έκπτωσης και πατήστε Προσθήκη ή Αποθήκευση.');
      return;
    }
    markDirty();
    setDraft((prev) => [...prev, { id: createId('dsc'), name, sport: newSport.trim() }]);
    setNewName('');
    setError('');
  }

  function updateRow(id: string, patch: Partial<DiscountReasonDef>) {
    markDirty();
    setDraft((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  function removeRow(id: string) {
    markDirty();
    setDraft((prev) => prev.filter((row) => row.id !== id));
  }

  async function handleSave() {
    const rows = rowsForSave();
    if (rows.length === 0 && !draft.length && !newName.trim()) {
      setError('Γράψτε έναν λόγο έκπτωσης πριν την αποθήκευση.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    const result = await discountReasonsService.saveDiscountReasons(rows);
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Σφάλμα αποθήκευσης');
      return;
    }
    dirtyRef.current = false;
    setDraft(toDraft(result.data));
    setNewName('');
    setMessage('Οι λόγοι έκπτωσης αποθηκεύτηκαν.');
    refresh();
  }

  return (
    <section className="panel settings-panel size-chart-panel">
      <div className="size-chart-header">
        <div>
          <h3>Λόγοι έκπτωσης</h3>
          <p className="lede">
            Δεν υπάρχουν προεπιλεγμένοι λόγοι. Καταχωρήστε ό,τι ισχύει για τον σύλλογό σας
            ανά άθλημα και πατήστε Αποθήκευση. Στο προφίλ αθλητή εμφανίζονται σε dropdown
            με checkbox.
          </p>
        </div>
      </div>

      <div className="settings-form">
        <div className="clothing-pkg-add discount-reason-add">
          <select
            className="field-input"
            value={newSport}
            onChange={(e) => setNewSport(e.target.value)}
            aria-label="Άθλημα λόγου έκπτωσης"
          >
            <option value="">{ALL_SPORTS_DISCOUNT_LABEL}</option>
            {sportOptions.map((sport) => (
              <option key={sport} value={sport}>
                {sport}
              </option>
            ))}
          </select>
          <input
            className="field-input"
            value={newName}
            placeholder="π.χ. Αδέλφια, Ετήσια συνδρομή…"
            onChange={(e) => {
              setNewName(e.target.value);
              setError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addReason();
              }
            }}
          />
          <Button type="button" variant="secondary" onClick={addReason}>
            Προσθήκη
          </Button>
        </div>

        {grouped.length === 0 ? (
          <p className="size-chart-empty">Δεν υπάρχουν λόγοι έκπτωσης</p>
        ) : (
          grouped.map((group) => (
            <div key={group.sport || 'all'} className="discount-reason-group">
              <h4>{group.label}</h4>
              <ul className="clothing-pkg-list">
                {group.rows.map((row) => (
                  <li key={row.id} className="discount-reason-row">
                    <input
                      className="field-input"
                      value={row.name}
                      onChange={(e) => updateRow(row.id, { name: e.target.value })}
                    />
                    <select
                      className="field-input"
                      value={row.sport}
                      onChange={(e) => updateRow(row.id, { sport: e.target.value })}
                      aria-label="Άθλημα"
                    >
                      <option value="">{ALL_SPORTS_DISCOUNT_LABEL}</option>
                      {sportOptions.map((sport) => (
                        <option key={sport} value={sport}>
                          {sport}
                        </option>
                      ))}
                      {row.sport &&
                      !sportOptions.some((s) => s === row.sport) ? (
                        <option value={row.sport}>{row.sport}</option>
                      ) : null}
                    </select>
                    <button
                      type="button"
                      className="size-chart-delete"
                      onClick={() => removeRow(row.id)}
                    >
                      Διαγραφή
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="settings-success">{message}</p> : null}

      <div className="settings-form-actions">
        <Button type="button" disabled={saving} onClick={() => void handleSave()}>
          {saving ? 'Αποθήκευση…' : 'Αποθήκευση'}
        </Button>
      </div>
    </section>
  );
}
