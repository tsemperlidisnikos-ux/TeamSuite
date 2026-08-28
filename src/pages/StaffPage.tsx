import { useMemo, useState } from 'react';
import {
  Download,
  Pencil,
  Plus,
  Search,
  SquarePen,
  Trash2,
} from 'lucide-react';
import * as staffService from '../api/services/staffService';
import { staffNameParts, type StaffInput } from '../api/services/staffService';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { useAppData } from '../hooks/useAppData';
import { downloadXlsx } from '../utils/xlsxDownload';
import type { StaffMember } from '../types';

const roleLabels: Record<StaffMember['role'], string> = {
  admin: 'Διαχειριστής',
  coach: 'Προπονητής',
  secretariat: 'Γραμματεία',
  employee: 'Υπάλληλος',
};

const emptyForm: StaffInput = {
  lastName: '',
  firstName: '',
  email: '',
  phone: '',
  role: 'employee',
  active: true,
  teamLabel: '',
  photoUrl: null,
};

function staffDisplayName(member: StaffMember): string {
  const { lastName, firstName } = staffNameParts(member);
  return composeDisplay(lastName, firstName) || member.fullName;
}

function composeDisplay(lastName: string, firstName: string): string {
  return `${lastName.trim()} ${firstName.trim()}`.trim();
}

function staffToInput(member: StaffMember): StaffInput {
  const names = staffNameParts(member);
  return {
    lastName: names.lastName,
    firstName: names.firstName,
    email: member.email,
    phone: member.phone,
    role: member.role,
    active: member.active,
    teamLabel: '',
    photoUrl: member.photoUrl ?? null,
  };
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

function exportStaffXlsx(rows: StaffMember[]) {
  downloadXlsx(
    'Προσωπικό',
    ['Επώνυμο', 'Όνομα', 'Ρόλος', 'Τηλέφωνο', 'Email', 'Κατάσταση'],
    rows.map((member) => {
      const names = staffNameParts(member);
      return [
        names.lastName,
        names.firstName,
        roleLabels[member.role],
        member.phone || '',
        member.email,
        member.active ? 'Ενεργός' : 'Ανενεργός',
      ];
    }),
    `prosopiko-${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}

export function StaffPage() {
  const { data, refresh } = useAppData();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [form, setForm] = useState<StaffInput>(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkActive, setBulkActive] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);

  const staff = useMemo(
    () =>
      [...(data.staff ?? [])].sort((a, b) => {
        const na = staffNameParts(a);
        const nb = staffNameParts(b);
        return `${na.lastName} ${na.firstName}`.localeCompare(`${nb.lastName} ${nb.firstName}`, 'el');
      }),
    [data.staff],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return staff.filter((m) => {
      if (roleFilter && m.role !== roleFilter) return false;
      if (statusFilter === 'active' && !m.active) return false;
      if (statusFilter === 'inactive' && m.active) return false;
      if (!q) return true;
      return `${staffDisplayName(m)} ${m.email} ${m.phone}`.toLowerCase().includes(q);
    });
  }, [staff, query, roleFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const from = filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, filtered.length);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError('');
    setOpen(true);
  }

  function openEdit(member: StaffMember) {
    setEditing(member);
    setForm(staffToInput(member));
    setError('');
    setOpen(true);
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
      const member = staff.find((m) => m.id === id);
      if (!member) continue;
      const result = await staffService.updateStaff(id, {
        ...staffToInput(member),
        active: bulkActive,
      });
      if (!result.success) {
        setBulkSaving(false);
        window.alert(result.error ?? 'Αποτυχία μαζικής αλλαγής');
        return;
      }
    }
    setBulkSaving(false);
    setBulkOpen(false);
    setSelected([]);
    refresh();
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    const result = editing
      ? await staffService.updateStaff(editing.id, form)
      : await staffService.createStaff(form);
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Σφάλμα αποθήκευσης');
      return;
    }
    setOpen(false);
    refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm('Διαγραφή μέλους προσωπικού;')) return;
    await staffService.deleteStaff(id);
    refresh();
  }

  function toggleSelected(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleAllPage() {
    const ids = pageRows.map((r) => r.id);
    const allOn = ids.every((id) => selected.includes(id));
    setSelected((prev) =>
      allOn ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])],
    );
  }

  return (
    <div className="stack-lg">
      <PageHeader
        title="Προσωπικό"
        subtitle="Διαχείριση προσωπικού συλλόγου"
        actions={
          <Button type="button" onClick={openCreate}>
            <Plus size={16} /> Νέο μέλος
          </Button>
        }
      />

      <div className="toolbar">
        <label className="search-field">
          <Search size={16} />
          <input
            type="search"
            placeholder="Αναζήτηση μέλους..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="field">
          <span className="field-label">Ρόλος</span>
          <select
            className="field-input"
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Όλοι οι ρόλοι</option>
            <option value="admin">Διαχειριστής</option>
            <option value="coach">Προπονητής</option>
            <option value="secretariat">Γραμματεία</option>
            <option value="employee">Υπάλληλος</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Κατάσταση</span>
          <select
            className="field-input"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
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
        <Button type="button" variant="secondary" onClick={() => exportStaffXlsx(filtered)}>
          <Download size={16} /> Εξαγωγή
        </Button>
      </div>

      <section className="stf-table-card panel">
        {pageRows.length === 0 ? (
          <div className="stf-empty">
            <p>Δεν βρέθηκαν μέλη προσωπικού.</p>
            <Button type="button" onClick={openCreate}>
              <Plus size={16} /> Νέο μέλος
            </Button>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="stf-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={pageRows.every((r) => selected.includes(r.id))}
                      onChange={toggleAllPage}
                      aria-label="Επιλογή όλων"
                    />
                  </th>
                  <th>Επώνυμο</th>
                  <th>Όνομα</th>
                  <th>Ρόλος</th>
                  <th>Τηλέφωνο</th>
                  <th>Email</th>
                  <th>Κατάσταση</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.includes(member.id)}
                        onChange={() => toggleSelected(member.id)}
                        aria-label={`Επιλογή ${staffDisplayName(member)}`}
                      />
                    </td>
                    <td>
                      <div className="stf-name-cell">
                        <span className="stf-avatar" aria-hidden>
                          {member.photoUrl ? (
                            <img src={member.photoUrl} alt="" />
                          ) : (
                            initials(staffDisplayName(member))
                          )}
                        </span>
                        <strong>{staffNameParts(member).lastName || '—'}</strong>
                      </div>
                    </td>
                    <td>
                      <strong>{staffNameParts(member).firstName || '—'}</strong>
                    </td>
                    <td>
                      <span className={`stf-role is-${member.role}`}>
                        {roleLabels[member.role]}
                      </span>
                    </td>
                    <td className="stf-muted">{member.phone || '—'}</td>
                    <td className="stf-muted">{member.email}</td>
                    <td>
                      <span className={`stf-status ${member.active ? 'is-active' : 'is-inactive'}`}>
                        {member.active ? 'Ενεργός' : 'Ανενεργός'}
                      </span>
                    </td>
                    <td className="row-actions">
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => openEdit(member)}
                        aria-label="Επεξεργασία"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => void handleDelete(member.id)}
                        aria-label="Διαγραφή"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="stf-pager">
          <label className="stf-page-size">
            Εμφάνιση
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value) || 10);
                setPage(1);
              }}
            >
              {[10, 25, 50].map((n) => (
                <option key={n} value={n}>
                  {n} εγγραφών
                </option>
              ))}
            </select>
          </label>
          <span>
            {from}–{to} από {filtered.length} εγγραφές
          </span>
          <div className="stf-pager-btns">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ‹
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                className={n === safePage ? 'is-active' : ''}
                onClick={() => setPage(n)}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              ›
            </button>
          </div>
        </div>
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
        title={editing ? 'Επεξεργασία μέλους' : 'Νέο μέλος'}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>
              Άκυρο
            </Button>
            <Button type="button" disabled={saving} onClick={() => void handleSave()}>
              Αποθήκευση
            </Button>
          </>
        }
      >
        <div className="stack-md">
          <div className="grid-2">
            <label className="field">
              <span className="field-label">Επώνυμο</span>
              <input
                className="field-input"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              />
            </label>
            <label className="field">
              <span className="field-label">Όνομα</span>
              <input
                className="field-input"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              />
            </label>
          </div>
          <label className="field">
            <span className="field-label">Email</span>
            <input
              className="field-input"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label className="field">
            <span className="field-label">Τηλέφωνο</span>
            <input
              className="field-input"
              value={form.phone ?? ''}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </label>
          <label className="field">
            <span className="field-label">Ρόλος</span>
            <select
              className="field-input"
              value={form.role}
              onChange={(e) =>
                setForm({ ...form, role: e.target.value as StaffMember['role'] })
              }
            >
              <option value="admin">Διαχειριστής</option>
              <option value="secretariat">Γραμματεία</option>
              <option value="employee">Υπάλληλος</option>
              {form.role === 'coach' ? (
                <option value="coach">Προπονητής</option>
              ) : null}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Κατάσταση</span>
            <select
              className="field-input"
              value={form.active ? 'true' : 'false'}
              onChange={(e) => setForm({ ...form, active: e.target.value === 'true' })}
            >
              <option value="true">Ενεργός</option>
              <option value="false">Ανενεργός</option>
            </select>
          </label>
          {error ? <p className="form-error">{error}</p> : null}
        </div>
      </Modal>
    </div>
  );
}
