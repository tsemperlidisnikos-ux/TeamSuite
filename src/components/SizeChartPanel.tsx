import { useEffect, useState } from 'react';
import * as sizeChartService from '../api/services/sizeChartService';
import { Button } from './ui/Button';
import { useAppData } from '../hooks/useAppData';
import type { SizeChart } from '../types';
import { defaultSizeChart, flattenSizeChart, normalizeSizeChart } from '../utils/sizeChartOptions';

function toDraft(chart: SizeChart | undefined | null): SizeChart {
  return normalizeSizeChart(chart ?? defaultSizeChart());
}

export function SizeChartPanel() {
  const { data, refresh } = useAppData();
  const [draft, setDraft] = useState<SizeChart>(() => toDraft(data.sizeChart));
  const [newSize, setNewSize] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(toDraft(data.sizeChart));
  }, [data.sizeChart]);

  const sizes = flattenSizeChart(draft);

  function addSize() {
    const value = newSize.trim();
    if (!value) {
      setError('Γράψτε ένα μέγεθος για προσθήκη.');
      return;
    }
    const key = value.toUpperCase();
    if (sizes.some((item) => item.toUpperCase() === key)) {
      setError('Το μέγεθος υπάρχει ήδη.');
      return;
    }
    setDraft({
      kids: [...sizes, value],
      men: [],
      women: [],
    });
    setNewSize('');
    setError('');
    setMessage('');
  }

  function removeSize(size: string) {
    setDraft({
      kids: sizes.filter((item) => item !== size),
      men: [],
      women: [],
    });
    setError('');
    setMessage('');
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    setMessage('');
    const result = await sizeChartService.saveSizeChart({
      kids: flattenSizeChart(draft),
      men: [],
      women: [],
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Σφάλμα αποθήκευσης');
      return;
    }
    setMessage('Το μεγεθολόγιο αποθηκεύτηκε.');
    refresh();
  }

  return (
    <section className="panel settings-panel size-chart-panel">
      <div className="size-chart-header">
        <div>
          <h3>Μεγεθολόγιο</h3>
          <p className="lede">
            Ρουχισμός / μεγέθη του συλλόγου. Προσθέστε ή αφαιρέστε μεγέθη και πατήστε Αποθήκευση.
          </p>
        </div>
      </div>

      <div className="settings-form">
        <div className="clothing-pkg-add">
          <input
            className="field-input"
            value={newSize}
            placeholder="Νέο μέγεθος (π.χ. 14 y.o, XXXL…)"
            onChange={(e) => setNewSize(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addSize();
              }
            }}
          />
          <Button type="button" variant="secondary" onClick={addSize}>
            Προσθήκη
          </Button>
        </div>

        <ul className="size-chart-inline-list">
          {sizes.length === 0 ? (
            <li className="size-chart-empty">Δεν υπάρχουν μεγέθη</li>
          ) : (
            sizes.map((size) => (
              <li key={size}>
                <span>{size}</span>
                <button
                  type="button"
                  className="size-chart-delete"
                  onClick={() => removeSize(size)}
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
