import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  ChevronRight,
  Grid2x2,
  List,
  MoreHorizontal,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import * as photosService from '../api/services/photosService';
import { useAppData } from '../hooks/useAppData';
import { formatDate } from '../utils/labels';
import type { GalleryPhoto } from '../types';

const MAX_PHOTO_BYTES = 1_500_000;
const PAGE_SIZE = 12;

type SortMode = 'newest' | 'oldest' | 'name';
type ViewMode = 'grid' | 'list';

function albumLabel(photo: GalleryPhoto) {
  const named = (photo.album ?? '').trim();
  if (named) return named;
  const d = photo.createdAt?.slice(0, 10);
  if (!d) return 'Χωρίς συλλογή';
  try {
    return new Intl.DateTimeFormat('el-GR', { month: 'long', year: 'numeric' }).format(
      new Date(d),
    );
  } catch {
    return 'Χωρίς συλλογή';
  }
}

function photoTitle(photo: GalleryPhoto) {
  return photo.caption?.trim() || photo.fileName?.trim() || 'Χωρίς τίτλο';
}

export function PhotosPage() {
  const { data, refresh } = useAppData();
  const fileRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [albumFilter, setAlbumFilter] = useState('');
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [page, setPage] = useState(1);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [fileName, setFileName] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [album, setAlbum] = useState('');
  const [selectedAthleteIds, setSelectedAthleteIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const photos = data.photos ?? [];
  const consentAthletes = useMemo(
    () =>
      data.students.filter(
        (s) => s.status === 'active' && s.gdprItems?.photoUse && s.gdprItems?.gallery,
      ),
    [data.students],
  );

  const albums = useMemo(() => {
    const set = new Set<string>();
    for (const p of photos) set.add(albumLabel(p));
    return [...set].sort((a, b) => a.localeCompare(b, 'el'));
  }, [photos]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = photos.filter((p) => {
      if (albumFilter && albumLabel(p) !== albumFilter) return false;
      if (!q) return true;
      return (
        photoTitle(p).toLowerCase().includes(q) ||
        (p.fileName ?? '').toLowerCase().includes(q) ||
        albumLabel(p).toLowerCase().includes(q)
      );
    });
    list = [...list].sort((a, b) => {
      if (sortMode === 'name') {
        return photoTitle(a).localeCompare(photoTitle(b), 'el');
      }
      const ta = a.createdAt || '';
      const tb = b.createdAt || '';
      return sortMode === 'newest' ? tb.localeCompare(ta) : ta.localeCompare(tb);
    });
    return list;
  }, [photos, albumFilter, query, sortMode]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const from = filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const to = Math.min(safePage * PAGE_SIZE, filtered.length);

  useEffect(() => {
    setPage(1);
  }, [albumFilter, query, sortMode]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setMenuOpenId(null);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function resetForm() {
    setFileName('');
    setImageUrl('');
    setCaption('');
    setAlbum('');
    setSelectedAthleteIds([]);
    if (fileRef.current) fileRef.current.value = '';
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setError('');
    setMessage('');
    if (!file) {
      setFileName('');
      setImageUrl('');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('Επιλέξτε εικόνα (JPG, PNG, WEBP).');
      event.target.value = '';
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError('Η φωτογραφία πρέπει να είναι έως ~1.5MB.');
      event.target.value = '';
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onerror = () => setError('Αποτυχία ανάγνωσης αρχείου.');
    reader.onload = () => setImageUrl(String(reader.result ?? ''));
    reader.readAsDataURL(file);
  }

  async function handleUpload(event: FormEvent) {
    event.preventDefault();
    if (!imageUrl) {
      setError('Επιλέξτε αρχείο φωτογραφίας.');
      return;
    }
    if (!selectedAthleteIds.length) {
      setError('Επιλέξτε τουλάχιστον έναν αθλητή με συγκατάθεση gallery.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    const result = await photosService.createPhoto({
      imageUrl,
      caption,
      fileName,
      album,
      athleteIds: selectedAthleteIds,
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Σφάλμα ανεβάσματος');
      return;
    }
    setMessage('Η φωτογραφία ανέβηκε.');
    resetForm();
    setUploadOpen(false);
    refresh();
  }

  async function handleDelete(id: string) {
    setMenuOpenId(null);
    if (!confirm('Διαγραφή φωτογραφίας;')) return;
    const result = await photosService.deletePhoto(id);
    if (!result.success) {
      setError(result.error ?? 'Σφάλμα διαγραφής');
      return;
    }
    refresh();
  }

  const pageButtons = useMemo(() => {
    const pages: Array<number | '…'> = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
      return pages;
    }
    pages.push(1);
    if (safePage > 3) pages.push('…');
    for (let i = Math.max(2, safePage - 1); i <= Math.min(totalPages - 1, safePage + 1); i++) {
      pages.push(i);
    }
    if (safePage < totalPages - 2) pages.push('…');
    pages.push(totalPages);
    return pages;
  }, [safePage, totalPages]);

  return (
    <div className="photos-page">
      <header className="photos-header">
        <div>
          <h1>Φωτογραφίες</h1>
          <p>Διαχείριση φωτογραφιών και συλλογών.</p>
        </div>
        <button type="button" className="photos-upload-btn" onClick={() => setUploadOpen(true)}>
          <Upload size={16} aria-hidden />
          ΑΝΕΒΑΣΜΑ ΦΩΤΟΓΡΑΦΙΩΝ
        </button>
      </header>

      <div className="photos-toolbar">
        <select
          className="photos-toolbar-control"
          value={albumFilter}
          onChange={(e) => setAlbumFilter(e.target.value)}
          aria-label="Συλλογή"
        >
          <option value="">Όλες οι συλλογές</option>
          {albums.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>

        <label className="photos-search">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Αναζήτηση φωτογραφιών..."
          />
          <Search size={16} aria-hidden />
        </label>

        <select
          className="photos-toolbar-control photos-sort"
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
          aria-label="Ταξινόμηση"
        >
          <option value="newest">Ταξινόμηση: Νεότερες πρώτες</option>
          <option value="oldest">Ταξινόμηση: Παλαιότερες πρώτες</option>
          <option value="name">Ταξινόμηση: Όνομα</option>
        </select>

        <div className="photos-view-toggle" role="group" aria-label="Προβολή">
          <button
            type="button"
            className={viewMode === 'grid' ? 'is-active' : ''}
            onClick={() => setViewMode('grid')}
            aria-label="Πλέγμα"
          >
            <Grid2x2 size={16} />
          </button>
          <button
            type="button"
            className={viewMode === 'list' ? 'is-active' : ''}
            onClick={() => setViewMode('list')}
            aria-label="Λίστα"
          >
            <List size={16} />
          </button>
        </div>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="settings-success">{message}</p> : null}

      {filtered.length === 0 ? (
        <div className="photos-empty-state">
          <p>Δεν υπάρχουν φωτογραφίες{query || albumFilter ? ' με αυτά τα φίλτρα' : ''}.</p>
          <button type="button" className="photos-upload-btn" onClick={() => setUploadOpen(true)}>
            <Upload size={16} aria-hidden />
            ΑΝΕΒΑΣΜΑ ΦΩΤΟΓΡΑΦΙΩΝ
          </button>
        </div>
      ) : (
        <>
          <section
            className={viewMode === 'grid' ? 'photos-grid' : 'photos-list'}
            ref={menuRef}
          >
            {pageItems.map((photo) => (
              <article key={photo.id} className="photo-card">
                <div className="photo-card-media">
                  <img
                    src={photo.imageUrl}
                    alt={photoTitle(photo)}
                    loading="lazy"
                  />
                </div>
                <div className="photo-card-body">
                  <div className="photo-card-meta">
                    <strong title={photoTitle(photo)}>{photoTitle(photo)}</strong>
                    <span>{formatDate(photo.createdAt.slice(0, 10))}</span>
                  </div>
                  <div className="photo-card-menu-wrap">
                    <button
                      type="button"
                      className="photo-card-menu-btn"
                      aria-label="Επιλογές"
                      aria-expanded={menuOpenId === photo.id}
                      onClick={() =>
                        setMenuOpenId((id) => (id === photo.id ? null : photo.id))
                      }
                    >
                      <MoreHorizontal size={18} />
                    </button>
                    {menuOpenId === photo.id ? (
                      <div className="photo-card-menu">
                        <button type="button" onClick={() => void handleDelete(photo.id)}>
                          <Trash2 size={14} /> Διαγραφή
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </section>

          <footer className="photos-footer">
            <p>
              Εμφανίζονται {from} έως {to} από {filtered.length} φωτογραφίες
            </p>
            <div className="photos-pagination">
              {pageButtons.map((item, idx) =>
                item === '…' ? (
                  <span key={`e-${idx}`} className="photos-page-ellipsis">
                    …
                  </span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    className={`photos-page-btn${item === safePage ? ' is-active' : ''}`}
                    onClick={() => setPage(item)}
                  >
                    {item}
                  </button>
                ),
              )}
              <button
                type="button"
                className="photos-page-btn"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                aria-label="Επόμενη σελίδα"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </footer>
        </>
      )}

      {uploadOpen ? (
        <div className="photos-modal-backdrop" role="presentation" onClick={() => setUploadOpen(false)}>
          <div
            className="photos-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="photos-upload-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="photos-modal-head">
              <h2 id="photos-upload-title">Ανέβασμα φωτογραφιών</h2>
              <button
                type="button"
                className="photos-modal-close"
                onClick={() => setUploadOpen(false)}
                aria-label="Κλείσιμο"
              >
                <X size={18} />
              </button>
            </header>
            <form className="photos-upload-form" onSubmit={(e) => void handleUpload(e)}>
              <label className="photos-field">
                <span>Αρχείο</span>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={handleFileChange}
                />
                {fileName ? <em className="photos-file-name">{fileName}</em> : null}
              </label>
              {imageUrl ? (
                <div className="photos-upload-preview">
                  <img src={imageUrl} alt="Προεπισκόπηση" />
                </div>
              ) : null}
              <label className="photos-field">
                <span>Τίτλος / λεζάντα</span>
                <input
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="π.χ. Κερκίδα – Ντέρμπι"
                />
              </label>
              <label className="photos-field">
                <span>Συλλογή</span>
                <input
                  value={album}
                  onChange={(e) => setAlbum(e.target.value)}
                  placeholder="π.χ. Αγώνες 2026"
                  list="photos-album-suggestions"
                />
                <datalist id="photos-album-suggestions">
                  {albums.map((a) => (
                    <option key={a} value={a} />
                  ))}
                </datalist>
              </label>
              <fieldset className="photos-field">
                <legend>Αθλητές με συγκατάθεση φωτογραφίας / gallery</legend>
                {consentAthletes.length === 0 ? (
                  <p className="form-error" style={{ margin: 0 }}>
                    Δεν υπάρχουν ενεργοί αθλητές με photoUse + gallery. Ενεργοποιήστε τα στο προφίλ
                    GDPR.
                  </p>
                ) : (
                  <div className="photos-athlete-consent-list">
                    {consentAthletes.map((s) => (
                      <label key={s.id}>
                        <input
                          type="checkbox"
                          checked={selectedAthleteIds.includes(s.id)}
                          onChange={(e) => {
                            setSelectedAthleteIds((prev) =>
                              e.target.checked
                                ? [...prev, s.id]
                                : prev.filter((id) => id !== s.id),
                            );
                          }}
                        />
                        <span>
                          {s.lastName} {s.firstName}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>
              {error ? <p className="form-error">{error}</p> : null}
              <div className="photos-modal-actions">
                <button type="button" className="photos-btn-secondary" onClick={() => setUploadOpen(false)}>
                  Ακύρωση
                </button>
                <button type="submit" className="photos-upload-btn" disabled={saving}>
                  {saving ? 'Ανέβασμα…' : 'Ανέβασμα'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
