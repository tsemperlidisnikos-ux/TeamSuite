import { useMemo, useState } from 'react';
import {
  Download,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import * as staffService from '../api/services/staffService';
import type { StaffInput } from '../api/services/staffService';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { useAppData } from '../hooks/useAppData';
import type { StaffMember } from '../types';

const roleLabels: Record<StaffMember['role'], string> = {
  admin: 'Διαχειριστής',
  coach: 'Προπονητής',
  secretariat: 'Γραμματεία',
  employee: 'Υπάλληλος',
};

const emptyForm: StaffInput = {
  fullName: '',
  email: '',
  phone: '',
  role: 'employee',
  active: true,
  teamLabel: '',
  photoUrl: null,
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

function exportStaffCsv(rows: StaffMember[]) {
  const lines = [
    ['fullName', 'role', 'phone', 'email', 'active'].join(','),
    ...rows.map((m) =>
      [
        m.fullName,
        roleLabels[m.role],
        m.phone,
        m.email,
        m.active ? 'active' : 'inactive',
      ]
        .map((v) => `"${String(v).replaceAll('"', '""')}"`)
        .join(','),
    ),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `prosopiko-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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

  const staff = useMemo(
    () => [...(data.staff ?? [])].sort((a, b) => a.fullName.localeCompare(b.fullName, 'el')),
    [data.staff],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return staff.filter((m) => {
      if (roleFilter && m.role !== roleFilter) return false;
      if (statusFilter === 'active' && !m.active) return false;
      if (statusFilter === 'inactive' && m.active) return false;
      if (!q) return true;
      return `${m.fullName} ${m.email} ${m.phone}`.toLowerCase().includes(q);
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
    setForm({
      fullName: member.fullName,
      email: member.email,
      phone: member.phone,
      role: member.role,
      active: member.active,
      teamLabel: '',
      photoUrl: member.photoUrl ?? null,
    });
    setError('');
    setOpen(true);
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
    <div className="stf-page">
      <header className="stf-head">
        <div className="stf-head-copy">
          <span className="stf-head-icon" aria-hidden>
            <Users size={20} />
          </span>
          <div>
            <h1>Προσωπικό</h1>
            <p>Διαχείριση προσωπικού συλλόγου</p>
          </div>
        </div>
        <Button type="button" onClick={openCreate}>
          <Plus size={16} /> Νέο μέλος
        </Button>
      </header>

      <section className="stf-toolbar panel">
        <label className="stf-search">
          <Search size={16} aria-hidden />
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
        <select
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
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Κατάσταση: Όλα</option>
          <option value="active">Ενεργός</option>
          <option value="inactive">Ανενεργός</option>
        </select>
        <button type="button" className="stf-export" onClick={() => exportStaffCsv(filtered)}>
          <Download size={15} /> Εξαγωγή
        </button>
      </section>

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
                        aria-label={`Επιλογή ${member.fullName}`}
                      />
                    </td>
                    <td>
                      <div className="stf-name-cell">
                        <span className="stf-avatar" aria-hidden>
                          {member.photoUrl ? (
                            <img src={member.photoUrl} alt="" />
                          ) : (
                            initials(member.fullName)
                          )}
                        </span>
                        <strong>{member.fullName}</strong>
                      </div>
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
          <label className="field">
            <span className="field-label">Ονοματεπώνυμο</span>
            <input
              className="field-input"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            />
          </label>
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
              <option value="coach">Προπονητής</option>
              <option value="secretariat">Γραμματεία</option>
              <option value="employee">Υπάλληλος</option>
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
