import { useEffect, useMemo, useRef, useState } from 'react';
import * as receiptBookService from '../api/services/receiptBookService';
import { createId } from '../data/repository';
import { Button } from './ui/Button';
import { useAppData } from '../hooks/useAppData';
import type { ReceiptNumberRange } from '../types';
import {
  normalizeReceiptIssues,
  normalizeReceiptRanges,
  remainingInRange,
  validateReceiptRanges,
} from '../utils/receiptBook';

export function ReceiptBookPanel() {
  const { data, refresh } = useAppData();
  const [draft, setDraft] = useState<ReceiptNumberRange[]>(() =>
    normalizeReceiptRanges(data.receiptNumberRanges),
  );
  const [series, setSeries] = useState('Α');
  const [from, setFrom] = useState('1');
  const [to, setTo] = useState('50');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (dirtyRef.current) return;
    setDraft(normalizeReceiptRanges(data.receiptNumberRanges));
  }, [data.receiptNumberRanges]);

  const issues = useMemo(
    () => normalizeReceiptIssues(data.receiptIssues),
    [data.receiptIssues],
  );
  const voided = useMemo(
    () => issues.filter((row) => row.voidedAt),
    [issues],
  );

  function markDirty() {
    dirtyRef.current = true;
    setMessage('');
  }

  function addRange() {
    const nextSeries = series.trim();
    const nextFrom = Math.floor(Number(from));
    const nextTo = Math.floor(Number(to));
    if (!nextSeries) {
      setError('Γράψτε τη σειρά (π.χ. Α).');
      return;
    }
    if (!Number.isFinite(nextFrom) || !Number.isFinite(nextTo) || nextFrom < 1 || nextTo < nextFrom) {
      setError('Το εύρος αριθμών δεν είναι έγκυρο (π.χ. 1 έως 50).');
      return;
    }
    const row: ReceiptNumberRange = {
      id: createId('rrp'),
      series: nextSeries,
      from: nextFrom,
      to: nextTo,
    };
    const checked = validateReceiptRanges([...draft, row]);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    markDirty();
    setDraft(checked.ranges);
    setError('');
    setFrom(String(nextTo + 1));
    setTo(String(nextTo + 50));
  }

  function removeRange(id: string) {
    markDirty();
    setDraft((prev) => prev.filter((row) => row.id !== id));
  }

  async function handleSave() {
    const pending = series.trim()
      ? {
          id: createId('rrp'),
          series: series.trim(),
          from: Math.floor(Number(from)),
          to: Math.floor(Number(to)),
        }
      : null;
    let rows = draft;
    if (
      pending &&
      Number.isFinite(pending.from) &&
      Number.isFinite(pending.to) &&
      pending.from >= 1 &&
      pending.to >= pending.from
    ) {
      const already = draft.some(
        (row) =>
          row.series.toLocaleUpperCase('el') === pending.series.toLocaleUpperCase('el') &&
          row.from === pending.from &&
          row.to === pending.to,
      );
      if (!already) rows = [...draft, pending];
    }
    const checked = validateReceiptRanges(rows);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    const result = await receiptBookService.saveReceiptRanges(checked.ranges);
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Σφάλμα αποθήκευσης');
      return;
    }
    dirtyRef.current = false;
    setDraft(normalizeReceiptRanges(result.data));
    setMessage('Το βιβλίο αποδείξεων αποθηκεύτηκε.');
    refresh();
  }

  return (
    <section className="panel settings-panel size-chart-panel">
      <div className="size-chart-header">
        <div>
          <h3>Αποδείξεις είσπραξης</h3>
          <p className="lede">
            Ορίστε σειρά και εύρος αριθμών (π.χ. σειρά Α, 1–50). Στην απόδειξη που στέλνεται
            με email η αρίθμηση αυξάνεται αυτόματα. Όταν εξαντληθεί το εύρος, προσθέστε νέο
            (π.χ. Α 51–100). Διαγραφή συναλλαγής δεν επαναχρησιμοποιεί τον αριθμό.
          </p>
        </div>
      </div>

      <div className="settings-form">
        <div className="clothing-pkg-add receipt-book-add">
          <input
            className="field-input"
            value={series}
            onChange={(e) => setSeries(e.target.value)}
            placeholder="Σειρά (π.χ. Α)"
            aria-label="Σειρά"
          />
          <input
            className="field-input"
            type="number"
            min={1}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="Από"
            aria-label="Από αριθμό"
          />
          <input
            className="field-input"
            type="number"
            min={1}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="Έως"
            aria-label="Έως αριθμό"
          />
          <Button type="button" variant="secondary" onClick={addRange}>
            Προσθήκη
          </Button>
        </div>

        {draft.length === 0 ? (
          <p className="size-chart-empty">Δεν υπάρχουν εύρη αριθμών αποδείξεων</p>
        ) : (
          <ul className="clothing-pkg-list">
            {draft.map((row) => (
              <li key={row.id} className="clothing-pkg-row receipt-book-row">
                <span>
                  Σειρά <strong>{row.series}</strong> · Αρ. {row.from}–{row.to}
                  <span className="ap-muted">
                    {' '}
                    · απομένουν {remainingInRange(row, draft, issues)}
                  </span>
                </span>
                <button
                  type="button"
                  className="size-chart-delete"
                  onClick={() => removeRange(row.id)}
                >
                  Διαγραφή
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {voided.length > 0 ? (
        <div className="receipt-void-list">
          <h4>Διαγραμμένες αποδείξεις</h4>
          <p className="lede">
            Οι αριθμοί παραμένουν δεσμευμένοι και δεν ξαναδίνονται.
          </p>
          <ul className="clothing-pkg-list">
            {voided.map((row) => (
              <li key={row.id} className="receipt-void-row">
                {row.voidReason ||
                  `Η απόδειξη σειράς ${row.series} με αριθμό ${row.number} έχει γίνει διαγραφή`}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

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
