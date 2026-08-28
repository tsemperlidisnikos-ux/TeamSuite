import { useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Filter, Pencil, Plus, Trash2 } from 'lucide-react';
import * as protocolService from '../api/services/documentProtocolService';
import { AppPopupLayer } from '../components/ui/AppPopupLayer';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { useAppData } from '../hooks/useAppData';
import type { DocumentProtocolInput } from '../schemas';
import type { DocumentProtocolEntry, DocumentProtocolStatus } from '../types';
import { localDateIso } from '../utils/dates';
import { formatDate } from '../utils/labels';

const PAGE_SIZES = [10, 25, 50, 100] as const;

const directionLabels = {
  incoming: 'Εισερχόμενο',
  outgoing: 'Εξερχόμενο',
} as const;

const statusLabels: Record<DocumentProtocolStatus, string> = {
  recorded: 'Καταχωρημένο',
  pending: 'Εκκρεμές',
  archived: 'Αρχειοθετημένο',
};

type Filters = {
  direction: '' | 'incoming' | 'outgoing';
  sport: string;
  status: '' | DocumentProtocolStatus;
  dateFrom: string;
  dateTo: string;
};

const emptyFilters: Filters = {
  direction: '',
  sport: '',
  status: '',
  dateFrom: '',
  dateTo: '',
};

const emptyForm: DocumentProtocolInput = {
  protocolNumber: '',
  direction: 'incoming',
  sport: '',
  subject: '',
  party: '',
  notes: '',
  fileName: null,
  fileDataUrl: null,
  status: 'recorded',
  date: localDateIso(),
};

function exportCsv(rows: DocumentProtocolEntry[], filename: string) {
  const headers = [
    'Αρ. Πρωτοκόλλου',
    'Κατεύθυνση',
    'Άθλημα',
    'Ημερομηνία',
    'Θέμα',
    'Αποστολέας/Παραλήπτης',
    'Αρχείο',
    'Κατάσταση',
    'Σημειώσεις',
  ];
  const lines = rows.map((row) =>
    [
      row.protocolNumber,
      directionLabels[row.direction],
      row.sport,
      formatDate(row.date),
      row.subject,
      row.party,
      row.fileName ?? '',
      statusLabels[row.status],
      row.notes,
    ]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(';'),
  );
  const blob = new Blob(['\uFEFF' + [headers.join(';'), ...lines].join('\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function DocumentProtocolPage() {
  const { data, refresh } = useAppData();
  const [draftFilters, setDraftFilters] = useState<Filters>(emptyFilters);
  const [applied, setApplied] = useState<Filters>(emptyFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersAnchorRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(25);
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<DocumentProtocolInput>(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const canEditProtocolNumber = protocolService.canOverrideProtocolNumber();

  const sports = useMemo(
    () => (data.sports ?? []).filter((s) => s.active),
    [data.sports],
  );

  const allRows = useMemo(
    () =>
      [...(data.documentProtocolEntries ?? [])].sort((a, b) =>
        b.protocolNumber.localeCompare(a.protocolNumber, 'el'),
      ),
    [data.documentProtocolEntries],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter((row) => {
      if (applied.direction && row.direction !== applied.direction) return false;
      if (applied.sport && row.sport !== applied.sport) return false;
      if (applied.status && row.status !== applied.status) return false;
      if (applied.dateFrom && row.date < applied.dateFrom) return false;
      if (applied.dateTo && row.date > applied.dateTo) return false;
      if (q) {
        const hay = [
          row.protocolNumber,
          row.subject,
          row.party,
          row.sport,
          row.notes,
          row.fileName ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allRows, applied, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const from = filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, filtered.length);

  function openCreate() {
    const date = localDateIso();
    setEditingId(null);
    setForm({
      ...emptyForm,
      date,
      protocolNumber: protocolService.peekNextProtocolNumber(date),
    });
    setError('');
    setModalOpen(true);
  }

  function openEdit(row: DocumentProtocolEntry) {
    setEditingId(row.id);
    setForm({
      protocolNumber: row.protocolNumber,
      direction: row.direction,
      sport: row.sport,
      subject: row.subject,
      party: row.party,
      notes: row.notes,
      fileName: row.fileName ?? null,
      fileDataUrl: row.fileDataUrl ?? null,
      status: row.status,
      date: row.date,
    });
    setError('');
    setModalOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    const payload = {
      ...form,
      date: form.date || localDateIso(),
      protocolNumber: canEditProtocolNumber ? form.protocolNumber : '',
    };
    const result = editingId
      ? await protocolService.updateDocumentProtocolEntry(editingId, payload)
      : await protocolService.createDocumentProtocolEntry(payload);
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Αποτυχία καταχώρησης');
      return;
    }
    setModalOpen(false);
    setEditingId(null);
    refresh();
  }

  async function handleDelete(row: DocumentProtocolEntry) {
    if (
      !confirm(
        `Διαγραφή καταχώρησης πρωτοκόλλου «${row.protocolNumber}»; Η ενέργεια δεν αναιρείται.`,
      )
    ) {
      return;
    }
    setDeletingId(row.id);
    await protocolService.deleteDocumentProtocolEntry(row.id);
    setDeletingId(null);
    if (editingId === row.id) {
      setModalOpen(false);
      setEditingId(null);
    }
    refresh();
  }

  return (
    <div className="stack-lg protocol-page">
      <PageHeader title="Πρωτόκολλο Εγγράφων" />

      <section className="panel protocol-panel">
        <div className="protocol-toolbar">
          <div className="protocol-toolbar-left">
            <h2 className="protocol-registry-title">Μητρώο Εγγραφών</h2>
            <div className="protocol-filters-anchor" ref={filtersAnchorRef}>
              <Button
                type="button"
                variant="secondary"
                aria-expanded={filtersOpen}
                onClick={() => setFiltersOpen((o) => !o)}
              >
                <Filter size={16} /> Φίλτρα
              </Button>
            </div>
          </div>

          <div className="protocol-header-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={() => exportCsv(filtered, `protokollo-${localDateIso()}.csv`)}
            >
              <Download size={16} /> Εξαγωγή
            </Button>
            <Button type="button" onClick={openCreate}>
              <Plus size={16} /> Καταχώρηση Εγγράφου
            </Button>
          </div>
        </div>

        <div className="protocol-table-controls">
          <label className="protocol-page-size">
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
          <label className="protocol-search">
            <span>Αναζήτηση:</span>
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Αρ. Πρωτοκόλλου, θέμα, αποστολέας…"
            />
          </label>
        </div>

        <div className="table-wrap protocol-table-wrap">
          <table className="data-table protocol-table">
            <thead>
              <tr>
                <th>Αρ. Πρωτοκόλλου</th>
                <th>Κατεύθυνση</th>
                <th>Άθλημα</th>
                <th>Ημερομηνία</th>
                <th>Θέμα</th>
                <th>Αποστολέας/Παραλήπτης</th>
                <th>Αρχείο</th>
                <th>Κατάσταση</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="protocol-empty muted">
                    Δεν υπάρχουν δεδομένα στον πίνακα
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.protocolNumber}</td>
                    <td>{directionLabels[row.direction]}</td>
                    <td>{row.sport || '—'}</td>
                    <td>{formatDate(row.date)}</td>
                    <td>{row.subject}</td>
                    <td>{row.party || '—'}</td>
                    <td>
                      {row.fileDataUrl && row.fileName ? (
                        <a href={row.fileDataUrl} download={row.fileName}>
                          {row.fileName}
                        </a>
                      ) : (
                        row.fileName || '—'
                      )}
                    </td>
                    <td>{statusLabels[row.status]}</td>
                    <td>
                      <div className="protocol-row-actions">
                        <button
                          type="button"
                          className="btn btn-ghost protocol-page-btn"
                          title="Επεξεργασία"
                          onClick={() => openEdit(row)}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost protocol-page-btn"
                          title="Διαγραφή"
                          disabled={deletingId === row.id}
                          onClick={() => void handleDelete(row)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="protocol-pagination">
          <div className="protocol-pagination-nav">
            <button
              type="button"
              className="btn btn-ghost protocol-page-btn"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Προηγούμενη σελίδα"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              className="btn btn-ghost protocol-page-btn"
              disabled={safePage >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              aria-label="Επόμενη σελίδα"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <p className="muted protocol-page-summary">
            Εμφανίζονται {from} έως {to} από {filtered.length} εγγραφές
          </p>
        </div>
      </section>

      <Modal
        open={modalOpen}
        title={editingId ? 'Επεξεργασία Εγγράφου' : 'Καταχώρηση Εγγράφου'}
        onClose={() => {
          setModalOpen(false);
          setEditingId(null);
        }}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setModalOpen(false);
                setEditingId(null);
              }}
            >
              Ακύρωση
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={saving}>
              {saving ? 'Αποθήκευση…' : editingId ? 'Αποθήκευση' : 'Καταχώρηση'}
            </Button>
          </>
        }
      >
        <p className="muted protocol-modal-hint">
          {canEditProtocolNumber
            ? 'Ο αριθμός πρωτοκόλλου αποδίδεται αυτόματα. Μπορείτε να τον αλλάξετε ως διαχειριστής.'
            : 'Ο αριθμός πρωτοκόλλου αποδίδεται αυτόματα και δεν μπορεί να αλλάξει.'}
        </p>
        <div className="entry-form stack-md">
          <label className="field">
            <span>Αρ. Πρωτοκόλλου</span>
            <input
              value={form.protocolNumber ?? ''}
              readOnly={!canEditProtocolNumber}
              disabled={!canEditProtocolNumber}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, protocolNumber: e.target.value }))
              }
              placeholder="π.χ. 2026/0001"
            />
          </label>
          <label className="field">
            <span>
              Κατεύθυνση <span className="req">*</span>
            </span>
            <select
              value={form.direction}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  direction: e.target.value as DocumentProtocolInput['direction'],
                }))
              }
            >
              <option value="incoming">Εισερχόμενο</option>
              <option value="outgoing">Εξερχόμενο</option>
            </select>
          </label>
          <label className="field">
            <span>Άθλημα</span>
            <select
              value={form.sport}
              onChange={(e) => setForm((prev) => ({ ...prev, sport: e.target.value }))}
            >
              <option value="">—</option>
              {sports.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>
              Θέμα <span className="req">*</span>
            </span>
            <input
              value={form.subject}
              onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))}
            />
          </label>
          <label className="field">
            <span>Αποστολέας/Παραλήπτης</span>
            <input
              value={form.party}
              onChange={(e) => setForm((prev) => ({ ...prev, party: e.target.value }))}
            />
          </label>
          <label className="field">
            <span>Σημειώσεις</span>
            <textarea
              rows={4}
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
            />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
        </div>
      </Modal>

      <AppPopupLayer
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        anchorRef={filtersAnchorRef}
        panelClassName="protocol-filters"
        backdropClassName="app-popup-backdrop--dim"
        align="left"
      >
        <aside role="dialog" aria-label="Φίλτρα πρωτοκόλλου">
          <label className="field">
            <span>Κατεύθυνση</span>
            <select
              value={draftFilters.direction}
              onChange={(e) =>
                setDraftFilters((prev) => ({
                  ...prev,
                  direction: e.target.value as Filters['direction'],
                }))
              }
            >
              <option value="">Όλες</option>
              <option value="incoming">Εισερχόμενο</option>
              <option value="outgoing">Εξερχόμενο</option>
            </select>
          </label>
          <label className="field">
            <span>Άθλημα</span>
            <select
              value={draftFilters.sport}
              onChange={(e) =>
                setDraftFilters((prev) => ({ ...prev, sport: e.target.value }))
              }
            >
              <option value="">Όλα</option>
              {sports.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Κατάσταση</span>
            <select
              value={draftFilters.status}
              onChange={(e) =>
                setDraftFilters((prev) => ({
                  ...prev,
                  status: e.target.value as Filters['status'],
                }))
              }
            >
              <option value="">Όλες</option>
              <option value="recorded">Καταχωρημένο</option>
              <option value="pending">Εκκρεμές</option>
              <option value="archived">Αρχειοθετημένο</option>
            </select>
          </label>
          <label className="field">
            <span>Από ημερομηνία</span>
            <input
              type="date"
              value={draftFilters.dateFrom}
              onChange={(e) =>
                setDraftFilters((prev) => ({ ...prev, dateFrom: e.target.value }))
              }
            />
          </label>
          <label className="field">
            <span>Έως ημερομηνία</span>
            <input
              type="date"
              value={draftFilters.dateTo}
              onChange={(e) =>
                setDraftFilters((prev) => ({ ...prev, dateTo: e.target.value }))
              }
            />
          </label>
          <div className="protocol-filter-actions">
            <Button
              type="button"
              onClick={() => {
                setApplied(draftFilters);
                setPage(1);
                setFiltersOpen(false);
              }}
            >
              Προβολή
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setDraftFilters(emptyFilters);
                setApplied(emptyFilters);
                setPage(1);
              }}
            >
              Εκκαθάριση
            </Button>
          </div>
        </aside>
      </AppPopupLayer>
    </div>
  );
}
