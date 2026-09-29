import { useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import * as clubMembersService from '../api/services/clubMembersService';
import { Button } from '../components/ui/Button';
import { PageHeader } from '../components/ui/PageHeader';
import { useAppData } from '../hooks/useAppData';
import type { ClubMemberInput } from '../schemas';
import type { ClubMember } from '../types';
import { GREEK_PREFECTURES } from '../utils/clubMembers';

const emptyForm: ClubMemberInput = {
  lastName: '',
  firstName: '',
  address: '',
  postalCode: '',
  city: '',
  prefecture: '',
  email: '',
  phone: '',
  active: true,
};

export function MembersPage() {
  const { data, refresh } = useAppData();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ClubMember | null>(null);
  const [form, setForm] = useState<ClubMemberInput>(emptyForm);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const members = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...(data.clubMembers ?? [])]
      .filter((row) => {
        if (!q) return true;
        const hay = `${row.lastName} ${row.firstName} ${row.city} ${row.prefecture} ${row.email} ${row.phone} ${row.address} ${row.postalCode}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) =>
        `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'el'),
      );
  }, [data.clubMembers, query]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError('');
    setOpen(true);
  }

  function openEdit(item: ClubMember) {
    setEditing(item);
    setForm({
      lastName: item.lastName,
      firstName: item.firstName,
      address: item.address ?? '',
      postalCode: item.postalCode ?? '',
      city: item.city ?? '',
      prefecture: item.prefecture ?? '',
      email: item.email ?? '',
      phone: item.phone ?? '',
      active: item.active !== false,
    });
    setError('');
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    setError('');
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    const result = editing
      ? await clubMembersService.updateClubMember(editing.id, form)
      : await clubMembersService.createClubMember(form);
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Σφάλμα αποθήκευσης');
      return;
    }
    closeModal();
    refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm('Διαγραφή μέλους;')) return;
    await clubMembersService.deleteClubMember(id);
    refresh();
  }

  return (
    <div className="stack-lg">
      <PageHeader
        title="Μέλη"
        subtitle="Μητρώο μελών συλλόγου (όχι αθλητές)."
        actions={
          <Button type="button" onClick={openCreate}>
            <Plus size={16} /> Νέο μέλος
          </Button>
        }
      />

      <label className="field" style={{ maxWidth: '22rem' }}>
        <span className="field-label">Αναζήτηση</span>
        <input
          className="field-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Επώνυμο, όνομα, πόλη, email…"
        />
      </label>

      <section className="panel table-wrap">
        {members.length === 0 ? (
          <div className="empty-state">
            <h3>Δεν υπάρχουν μέλη</h3>
            <p>Προσθέστε το πρώτο μέλος του συλλόγου.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Επώνυμο</th>
                <th>Όνομα</th>
                <th>Διεύθυνση</th>
                <th>ΤΚ</th>
                <th>Πόλη</th>
                <th>Νομός</th>
                <th>Email</th>
                <th>Τηλέφωνο</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {members.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.lastName}</strong>
                  </td>
                  <td>{item.firstName}</td>
                  <td>{item.address || '—'}</td>
                  <td>{item.postalCode || '—'}</td>
                  <td>{item.city || '—'}</td>
                  <td>{item.prefecture || '—'}</td>
                  <td>{item.email || '—'}</td>
                  <td>{item.phone || '—'}</td>
                  <td className="row-actions">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => openEdit(item)}
                      aria-label="Επεξεργασία"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => void handleDelete(item.id)}
                      aria-label="Διαγραφή"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {open ? (
        <div className="training-modal-backdrop" role="presentation" onClick={closeModal}>
          <div
            className="training-modal training-modal--wide members-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>{editing ? 'Επεξεργασία μέλους' : 'Νέο μέλος'}</h2>
            <div className="training-modal-fields members-modal-grid">
              <label>
                <span>Επώνυμο</span>
                <input
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  required
                />
              </label>
              <label>
                <span>Όνομα</span>
                <input
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  required
                />
              </label>
              <label className="is-full">
                <span>Διεύθυνση</span>
                <input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </label>
              <label>
                <span>ΤΚ</span>
                <input
                  value={form.postalCode}
                  onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
                />
              </label>
              <label>
                <span>Πόλη</span>
                <input
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              </label>
              <label>
                <span>Νομός</span>
                <select
                  value={form.prefecture}
                  onChange={(e) => setForm({ ...form, prefecture: e.target.value })}
                >
                  <option value="">Επιλέξτε νομό...</option>
                  {GREEK_PREFECTURES.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Email</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </label>
              <label className="is-full">
                <span>Τηλέφωνο</span>
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </label>
            </div>
            {error ? <p className="form-error">{error}</p> : null}
            <div className="training-modal-actions">
              <Button type="button" variant="secondary" onClick={closeModal}>
                Άκυρο
              </Button>
              <Button type="button" onClick={() => void handleSave()} disabled={saving}>
                {saving ? 'Αποθήκευση…' : 'Αποθήκευση'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
