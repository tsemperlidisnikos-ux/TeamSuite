import { useMemo, useState, type ChangeEvent } from 'react';
import { Download, Eye, FileText, Plus, Pencil, Search, SquarePen, Trash2, Upload } from 'lucide-react';
import * as coachesService from '../api/services/coachesService';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { Select } from '../components/ui/Select';
import { useAppData } from '../hooks/useAppData';
import type { CoachInput } from '../schemas';
import type { Coach } from '../types';
import { formatDate } from '../utils/labels';
import { localDateIso } from '../utils/dates';
import { activeClubSportSelectOptions, clubSportsMatch } from '../utils/clubSports';
import { downloadXlsx } from '../utils/xlsxDownload';

const MAX_PHOTO_BYTES = 800_000;
const MAX_DOC_BYTES = 2_500_000;

function isImageDataUrl(url: string | null | undefined): boolean {
  return Boolean(url && /^data:image\//i.test(url));
}

function isPdfDataUrl(url: string | null | undefined, fileName?: string | null): boolean {
  if (url && /^data:application\/pdf/i.test(url)) return true;
  return Boolean(fileName && fileName.toLowerCase().endsWith('.pdf'));
}

function CoachDocumentPreview({
  url,
  fileName,
  onOpenFull,
}: {
  url: string;
  fileName?: string | null;
  onOpenFull: () => void;
}) {
  const image = isImageDataUrl(url);
  const pdf = isPdfDataUrl(url, fileName);

  return (
    <div className="coach-doc-preview">
      <div className="coach-doc-preview-frame">
        {image ? (
          <img src={url} alt={fileName || 'Προεπισκόπηση'} />
        ) : pdf ? (
          <iframe title={fileName || 'PDF'} src={url} />
        ) : (
          <p className="muted">Δεν υποστηρίζεται ενσωματωμένη προεπισκόπηση για αυτόν τον τύπο.</p>
        )}
      </div>
      <div className="coach-doc-preview-actions">
        <Button type="button" variant="secondary" onClick={onOpenFull}>
          <Eye size={16} /> Προεπισκόπηση
        </Button>
        <a className="text-link" href={url} target="_blank" rel="noreferrer">
          {fileName || 'Άνοιγμα σε νέα καρτέλα'}
        </a>
      </div>
    </div>
  );
}

const emptyForm: CoachInput = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  sport: '',
  active: true,
  photoUrl: null,
  ggaCode: '',
  hireDate: '',
  licenseLevel: '',
  licenseDocumentUrl: null,
  licenseDocumentName: null,
  licenseValidFrom: '',
  licenseValidUntil: '',
  firstAidDocumentUrl: null,
  firstAidDocumentName: null,
  firstAidValidFrom: '',
  firstAidValidUntil: '',
};

function coachToForm(coach: Coach): CoachInput {
  return {
    firstName: coach.firstName,
    lastName: coach.lastName,
    email: coach.email,
    phone: coach.phone,
    sport: coach.sport ?? '',
    active: coach.active,
    photoUrl: coach.photoUrl ?? null,
    ggaCode: coach.ggaCode ?? '',
    hireDate: coach.hireDate ?? '',
    licenseLevel: coach.licenseLevel ?? '',
    licenseDocumentUrl: coach.licenseDocumentUrl ?? null,
    licenseDocumentName: coach.licenseDocumentName ?? null,
    licenseValidFrom: coach.licenseValidFrom ?? '',
    licenseValidUntil: coach.licenseValidUntil ?? '',
    firstAidDocumentUrl: coach.firstAidDocumentUrl ?? null,
    firstAidDocumentName: coach.firstAidDocumentName ?? null,
    firstAidValidFrom: coach.firstAidValidFrom ?? '',
    firstAidValidUntil: coach.firstAidValidUntil ?? '',
  };
}

function exportCoachesXlsx(rows: Coach[]) {
  downloadXlsx(
    'Προπονητές',
    ['Επώνυμο', 'Όνομα', 'Άθλημα', 'Τηλέφωνο', 'Email', 'Κωδικός Γ.Γ.Α', 'Κατάσταση'],
    rows.map((coach) => [
      coach.lastName,
      coach.firstName,
      coach.sport || '',
      coach.phone || '',
      coach.email,
      coach.ggaCode || '',
      coach.active ? 'Ενεργός' : 'Ανενεργός',
    ]),
    `proponites-${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Αποτυχία ανάγνωσης αρχείου'));
    reader.readAsDataURL(file);
  });
}

export function CoachesPage() {
  const { data, refresh } = useAppData();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Coach | null>(null);
  const [form, setForm] = useState<CoachInput>(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<{
    url: string;
    title: string;
    fileName?: string | null;
  } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [sportFilter, setSportFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkActive, setBulkActive] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);

  const listSportOptions = useMemo(
    () =>
      activeClubSportSelectOptions(data.sports, {
        includeEmpty: true,
        emptyLabel: 'Όλα τα αθλήματα',
        retain: sportFilter ? [sportFilter] : [],
      }),
    [data.sports, sportFilter],
  );

  const filteredCoaches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.coaches
      .filter((coach) => {
        if (statusFilter === 'active' && !coach.active) return false;
        if (statusFilter === 'inactive' && coach.active) return false;
        if (sportFilter && !clubSportsMatch(coach.sport, sportFilter)) return false;
        if (!q) return true;
        const hay = `${coach.lastName} ${coach.firstName} ${coach.email} ${coach.phone} ${coach.sport ?? ''} ${coach.ggaCode ?? ''}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) =>
        `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'el'),
      );
  }, [data.coaches, query, sportFilter, statusFilter]);

  function toggleSelected(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleAllVisible() {
    const ids = filteredCoaches.map((c) => c.id);
    const allOn = ids.length > 0 && ids.every((id) => selected.includes(id));
    setSelected((prev) =>
      allOn ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])],
    );
  }

  const sportOptions = useMemo(
    () =>
      activeClubSportSelectOptions(data.sports, {
        emptyLabel: 'Επιλέξτε άθλημα',
        retain: form.sport ? [form.sport] : [],
      }),
    [data.sports, form.sport],
  );

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm, hireDate: localDateIso() });
    setError('');
    setOpen(true);
  }

  function openEdit(coach: Coach) {
    setEditing(coach);
    setForm(coachToForm(coach));
    setError('');
    setOpen(true);
  }

  async function handlePhoto(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Η φωτογραφία πρέπει να είναι εικόνα (JPG, PNG, WEBP).');
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError('Η φωτογραφία πρέπει να είναι έως ~800KB.');
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setForm((prev) => ({ ...prev, photoUrl: dataUrl }));
      setError('');
    } catch {
      setError('Αποτυχία ανεβάσματος φωτογραφίας.');
    }
  }

  async function handleDocument(
    kind: 'license' | 'firstAid',
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const okType =
      file.type.startsWith('image/') ||
      file.type === 'application/pdf' ||
      file.name.toLowerCase().endsWith('.pdf');
    if (!okType) {
      setError('Επιτρέπονται PDF ή εικόνες για τα πιστοποιητικά.');
      return;
    }
    if (file.size > MAX_DOC_BYTES) {
      setError('Το αρχείο πρέπει να είναι έως ~2.5MB.');
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setForm((prev) =>
        kind === 'license'
          ? {
              ...prev,
              licenseDocumentUrl: dataUrl,
              licenseDocumentName: file.name,
            }
          : {
              ...prev,
              firstAidDocumentUrl: dataUrl,
              firstAidDocumentName: file.name,
            },
      );
      setError('');
    } catch {
      setError('Αποτυχία ανεβάσματος αρχείου.');
    }
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    const result = editing
      ? await coachesService.updateCoach(editing.id, form)
      : await coachesService.createCoach(form);
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Σφάλμα');
      return;
    }
    setOpen(false);
    refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm('Διαγραφή προπονητή;')) return;
    await coachesService.deleteCoach(id);
    refresh();
  }

  function openBulkStatus() {
    if (selected.length === 0) return;
    setBulkActive(statusFilter === 'inactive');
    setBulkOpen(true);
  }

  async function handleBulkStatus() {
    if (selected.length === 0) return;
    setBulkSaving(true);
    for (const id of selected) {
      const coach = data.coaches.find((c) => c.id === id);
      if (!coach) continue;
      const result = await coachesService.updateCoach(id, {
        ...coachToForm(coach),
        active: bulkActive,
      });
      if (!result.success) {
        setBulkSaving(false);
        setError(result.error ?? 'Αποτυχία μαζικής αλλαγής');
        window.alert(result.error ?? 'Αποτυχία μαζικής αλλαγής');
        return;
      }
    }
    setBulkSaving(false);
    setBulkOpen(false);
    setSelected([]);
    refresh();
  }

  return (
    <div className="stack-lg">
      <PageHeader
        title="Προπονητές"
        subtitle="Διαχείριση προπονητών συλλόγου"
        actions={
          <Button type="button" onClick={openCreate}>
            <Plus size={16} /> Νέος προπονητής
          </Button>
        }
      />

      <div className="toolbar">
        <label className="search-field">
          <Search size={16} />
          <input
            type="search"
            placeholder="Αναζήτηση προπονητή..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Άθλημα</span>
          <select
            className="field-input"
            value={sportFilter}
            onChange={(e) => setSportFilter(e.target.value)}
          >
            {listSportOptions.map((opt) => (
              <option key={opt.value || 'all'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Κατάσταση</span>
          <select
            className="field-input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">Όλα</option>
            <option value="active">Ενεργός</option>
            <option value="inactive">Ανενεργός</option>
          </select>
        </label>
        <Button
          type="button"
          variant="secondary"
          disabled={selected.length === 0}
          onClick={openBulkStatus}
        >
          <SquarePen size={16} /> Μαζική αλλαγή κατάστασης
        </Button>
        <Button type="button" variant="secondary" onClick={() => exportCoachesXlsx(filteredCoaches)}>
          <Download size={16} /> Εξαγωγή
        </Button>
      </div>

      <section className="panel table-wrap">
        {data.coaches.length === 0 ? (
          <div className="empty-state">
            <h3>Δεν υπάρχουν προπονητές</h3>
            <p>Πάτα «Νέος προπονητής» για να προσθέσεις τον πρώτο.</p>
            <Button type="button" onClick={openCreate}>
              <Plus size={16} /> Νέος προπονητής
            </Button>
          </div>
        ) : filteredCoaches.length === 0 ? (
          <div className="empty-state">
            <h3>Δεν βρέθηκαν προπονητές</h3>
            <p>Δοκίμασε διαφορετικά κριτήρια αναζήτησης.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={
                      filteredCoaches.length > 0 &&
                      filteredCoaches.every((c) => selected.includes(c.id))
                    }
                    onChange={toggleAllVisible}
                    aria-label="Επιλογή όλων"
                  />
                </th>
                <th></th>
                <th>Επώνυμο</th>
                <th>Όνομα</th>
                <th>Άθλημα</th>
                <th>Κωδικός Γ.Γ.Α</th>
                <th>Άδεια</th>
                <th>Πρώτες βοήθειες</th>
                <th>Email</th>
                <th>Τηλέφωνο</th>
                <th>Κατάσταση</th>
                <th>Πρόσληψη</th>
                <th>Τμήματα</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredCoaches.map((coach) => {
                const assigned = data.classes.filter((c) => c.coachId === coach.id);
                return (
                  <tr key={coach.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.includes(coach.id)}
                        onChange={() => toggleSelected(coach.id)}
                        aria-label={`Επιλογή ${coach.lastName} ${coach.firstName}`}
                      />
                    </td>
                    <td>
                      {coach.photoUrl ? (
                        <img
                          src={coach.photoUrl}
                          alt=""
                          className="coach-list-photo"
                        />
                      ) : (
                        <span className="coach-list-photo coach-list-photo--empty" aria-hidden />
                      )}
                    </td>
                    <td>
                      <strong>{coach.lastName}</strong>
                    </td>
                    <td>
                      <strong>{coach.firstName}</strong>
                    </td>
                    <td>{coach.sport || '—'}</td>
                    <td>{coach.ggaCode?.trim() || '—'}</td>
                    <td>
                      {coach.licenseLevel || coach.licenseDocumentUrl ? (
                        <span className="coach-doc-meta">
                          {coach.licenseLevel ? `Επίπ. ${coach.licenseLevel}` : 'Άδεια'}
                          {coach.licenseValidUntil
                            ? ` · έως ${formatDate(coach.licenseValidUntil)}`
                            : ''}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {coach.firstAidDocumentUrl ? (
                        <span className="coach-doc-meta">
                          Ναι
                          {coach.firstAidValidUntil
                            ? ` · έως ${formatDate(coach.firstAidValidUntil)}`
                            : ''}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{coach.email}</td>
                    <td>{coach.phone || '—'}</td>
                    <td>
                      <span className={`badge ${coach.active ? 'badge-active' : 'badge-inactive'}`}>
                        {coach.active ? 'Ενεργός' : 'Ανενεργός'}
                      </span>
                    </td>
                    <td>{formatDate(coach.hireDate)}</td>
                    <td>{assigned.map((c) => c.name).join(', ') || '—'}</td>
                    <td className="row-actions">
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => openEdit(coach)}
                        aria-label="Επεξεργασία"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => void handleDelete(coach.id)}
                        aria-label="Διαγραφή"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <Modal
        open={bulkOpen}
        title="Μαζική αλλαγή κατάστασης"
        onClose={() => !bulkSaving && setBulkOpen(false)}
        footer={
          <>
            <Button
              variant="secondary"
              type="button"
              disabled={bulkSaving}
              onClick={() => setBulkOpen(false)}
            >
              Άκυρο
            </Button>
            <Button type="button" disabled={bulkSaving} onClick={() => void handleBulkStatus()}>
              {bulkSaving ? 'Εφαρμογή...' : 'Εφαρμογή'}
            </Button>
          </>
        }
      >
        <label className="field">
          <span className="field-label">
            Νέα κατάσταση για {selected.length} εγγραφές
          </span>
          <select
            className="field-input"
            value={bulkActive ? 'active' : 'inactive'}
            onChange={(e) => setBulkActive(e.target.value === 'active')}
          >
            <option value="active">Ενεργός</option>
            <option value="inactive">Ανενεργός</option>
          </select>
        </label>
      </Modal>

      <Modal
        open={open}
        title={editing ? 'Επεξεργασία προπονητή' : 'Νέος προπονητής'}
        onClose={() => setOpen(false)}
        wide
        className="coach-modal"
        footer={
          <>
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>
              Ακύρωση
            </Button>
            <Button type="button" disabled={saving} onClick={() => void handleSave()}>
              Αποθήκευση
            </Button>
          </>
        }
      >
        <div className="coach-form stack-md">
          <div className="coach-photo-row">
            <div className="coach-photo-preview">
              {form.photoUrl ? (
                <img src={form.photoUrl} alt="" />
              ) : (
                <span>Χωρίς φωτογραφία</span>
              )}
            </div>
            <div className="coach-photo-actions">
              <label className="btn btn-secondary coach-file-btn">
                <Upload size={16} />
                {form.photoUrl ? 'Αλλαγή φωτογραφίας' : 'Προσθήκη φωτογραφίας'}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    void handlePhoto(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </label>
              {form.photoUrl ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setForm((prev) => ({ ...prev, photoUrl: null }))}
                >
                  Αφαίρεση
                </Button>
              ) : null}
            </div>
          </div>

          <div className="form-grid">
            <Input
              label="Επώνυμο"
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
            />
            <Input
              label="Όνομα"
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
            />
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <Input
              label="Τηλέφωνο"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <Select
              label="Άθλημα"
              value={form.sport}
              onChange={(e) => setForm({ ...form, sport: e.target.value })}
              options={sportOptions}
            />
            <Input
              label="Κωδικός Γ.Γ.Α"
              value={form.ggaCode ?? ''}
              onChange={(e) => setForm({ ...form, ggaCode: e.target.value })}
            />
            <Select
              label="Κατάσταση"
              value={form.active ? 'true' : 'false'}
              onChange={(e) => setForm({ ...form, active: e.target.value === 'true' })}
              options={[
                { value: 'true', label: 'Ενεργός' },
                { value: 'false', label: 'Ανενεργός' },
              ]}
            />
            <Input
              label="Ημερομηνία πρόσληψης"
              type="date"
              value={form.hireDate ?? ''}
              onChange={(e) => setForm({ ...form, hireDate: e.target.value })}
            />
          </div>

          <section className="coach-doc-block">
            <h3>
              <FileText size={16} /> Άδεια άσκησης επαγγέλματος
            </h3>
            <div className="form-grid">
              <Select
                label="Επίπεδο"
                value={form.licenseLevel ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    licenseLevel: e.target.value as CoachInput['licenseLevel'],
                  })
                }
                options={[
                  { value: '', label: 'Επιλέξτε επίπεδο' },
                  { value: 'A', label: 'A' },
                  { value: 'B', label: 'B' },
                  { value: 'Γ', label: 'Γ' },
                ]}
              />
              <Input
                label="Έναρξη ισχύος"
                type="date"
                value={form.licenseValidFrom ?? ''}
                onChange={(e) => setForm({ ...form, licenseValidFrom: e.target.value })}
              />
              <Input
                label="Λήξη ισχύος"
                type="date"
                value={form.licenseValidUntil ?? ''}
                onChange={(e) => setForm({ ...form, licenseValidUntil: e.target.value })}
              />
            </div>
            <div className="coach-doc-upload">
              <label className="btn btn-secondary coach-file-btn">
                <Upload size={16} />
                {form.licenseDocumentUrl ? 'Αλλαγή αρχείου' : 'Ανέβασμα αρχείου'}
                <input
                  type="file"
                  accept="image/*,application/pdf,.pdf"
                  hidden
                  onChange={(e) => void handleDocument('license', e)}
                />
              </label>
              {form.licenseDocumentUrl ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      licenseDocumentUrl: null,
                      licenseDocumentName: null,
                    }))
                  }
                >
                  Αφαίρεση
                </Button>
              ) : (
                <span className="muted">PDF ή εικόνα</span>
              )}
            </div>
            {form.licenseDocumentUrl ? (
              <CoachDocumentPreview
                url={form.licenseDocumentUrl}
                fileName={form.licenseDocumentName}
                onOpenFull={() =>
                  setPreviewDoc({
                    url: form.licenseDocumentUrl!,
                    title: 'Άδεια άσκησης επαγγέλματος',
                    fileName: form.licenseDocumentName,
                  })
                }
              />
            ) : null}
          </section>

          <section className="coach-doc-block">
            <h3>
              <FileText size={16} /> Πιστοποιητικό πρώτων βοηθειών
            </h3>
            <div className="form-grid">
              <Input
                label="Έναρξη ισχύος"
                type="date"
                value={form.firstAidValidFrom ?? ''}
                onChange={(e) => setForm({ ...form, firstAidValidFrom: e.target.value })}
              />
              <Input
                label="Λήξη ισχύος"
                type="date"
                value={form.firstAidValidUntil ?? ''}
                onChange={(e) => setForm({ ...form, firstAidValidUntil: e.target.value })}
              />
            </div>
            <div className="coach-doc-upload">
              <label className="btn btn-secondary coach-file-btn">
                <Upload size={16} />
                {form.firstAidDocumentUrl ? 'Αλλαγή αρχείου' : 'Ανέβασμα αρχείου'}
                <input
                  type="file"
                  accept="image/*,application/pdf,.pdf"
                  hidden
                  onChange={(e) => void handleDocument('firstAid', e)}
                />
              </label>
              {form.firstAidDocumentUrl ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      firstAidDocumentUrl: null,
                      firstAidDocumentName: null,
                    }))
                  }
                >
                  Αφαίρεση
                </Button>
              ) : (
                <span className="muted">PDF ή εικόνα</span>
              )}
            </div>
            {form.firstAidDocumentUrl ? (
              <CoachDocumentPreview
                url={form.firstAidDocumentUrl}
                fileName={form.firstAidDocumentName}
                onOpenFull={() =>
                  setPreviewDoc({
                    url: form.firstAidDocumentUrl!,
                    title: 'Πιστοποιητικό πρώτων βοηθειών',
                    fileName: form.firstAidDocumentName,
                  })
                }
              />
            ) : null}
          </section>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
      </Modal>

      <Modal
        open={Boolean(previewDoc)}
        title={previewDoc?.title ?? 'Προεπισκόπηση'}
        onClose={() => setPreviewDoc(null)}
        wide
        className="coach-doc-preview-modal"
        footer={
          <Button type="button" variant="secondary" onClick={() => setPreviewDoc(null)}>
            Κλείσιμο
          </Button>
        }
      >
        {previewDoc ? (
          <div className="coach-doc-preview-full">
            {isImageDataUrl(previewDoc.url) ? (
              <img src={previewDoc.url} alt={previewDoc.fileName || previewDoc.title} />
            ) : isPdfDataUrl(previewDoc.url, previewDoc.fileName) ? (
              <iframe title={previewDoc.fileName || previewDoc.title} src={previewDoc.url} />
            ) : (
              <p className="muted">Ανοίξτε το αρχείο σε νέα καρτέλα για προβολή.</p>
            )}
            <a className="text-link" href={previewDoc.url} target="_blank" rel="noreferrer">
              {previewDoc.fileName || 'Άνοιγμα σε νέα καρτέλα'}
            </a>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
