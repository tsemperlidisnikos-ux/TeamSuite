import { useEffect, useState } from 'react';
import * as clothingPackagesService from '../api/services/clothingPackagesService';
import { createId } from '../data/repository';
import { Button } from './ui/Button';
import { useAppData } from '../hooks/useAppData';
import type { ClothingPackageDef } from '../types';
import { normalizeClothingPackages } from '../utils/clothingPackages';

function toDraft(list: ClothingPackageDef[] | undefined): ClothingPackageDef[] {
  return normalizeClothingPackages(list);
}

export function ClothingPackagesPanel() {
  const { data, refresh } = useAppData();
  const [draft, setDraft] = useState<ClothingPackageDef[]>(() =>
    toDraft(data.clothingPackages),
  );
  const [newName, setNewName] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(toDraft(data.clothingPackages));
  }, [data.clothingPackages]);

  function removePackage(id: string) {
    setDraft((prev) => prev.filter((row) => row.id !== id));
    setMessage('');
  }

  function addPackage() {
    const name = newName.trim();
    if (!name) return;
    setDraft((prev) => [...prev, { id: createId('clp'), name }]);
    setNewName('');
    setMessage('');
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    setMessage('');
    const result = await clothingPackagesService.saveClothingPackages(
      draft.map((row) => ({ ...row, name: row.name.trim() })).filter((row) => row.name),
    );
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Σφάλμα αποθήκευσης');
      return;
    }
    setMessage('Τα πακέτα ρουχισμού αποθηκεύτηκαν.');
    refresh();
  }

  return (
    <section className="panel settings-panel size-chart-panel">
      <div className="size-chart-header">
        <div>
          <h3>Πακέτο ρουχισμού</h3>
          <p className="lede">
            Ορίστε τα πακέτα ρουχισμού του συλλόγου. Στο προφίλ αθλητή επιλέγονται με checkbox.
          </p>
        </div>
      </div>

      <div className="settings-form">
        <div className="clothing-pkg-add">
          <input
            className="field-input"
            value={newName}
            placeholder="Όνομα πακέτου (π.χ. BASIC, Ζακέτα…)"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addPackage();
              }
            }}
          />
          <Button type="button" variant="secondary" onClick={addPackage}>
            Προσθήκη
          </Button>
        </div>
        <ul className="clothing-pkg-list">
          {draft.length === 0 ? (
            <li className="size-chart-empty">Δεν υπάρχουν πακέτα</li>
          ) : (
            draft.map((row) => (
              <li key={row.id} className="clothing-pkg-row">
                <input
                  className="field-input"
                  value={row.name}
                  onChange={(e) =>
                    setDraft((prev) =>
                      prev.map((item) =>
                        item.id === row.id ? { ...item, name: e.target.value } : item,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  className="size-chart-delete"
                  onClick={() => removePackage(row.id)}
                >
                  Διαγραφή
                </button>
              </li>
            ))
          )}
        </ul>
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
