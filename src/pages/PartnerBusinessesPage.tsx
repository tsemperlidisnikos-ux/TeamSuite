import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Filter,
  MapPin,
  Percent,
  Plus,
  Star,
  Tag,
} from 'lucide-react';
import * as partnerService from '../api/services/partnerBusinessesService';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { useAppData } from '../hooks/useAppData';
import type { PartnerBusinessInput, PartnerOfferInput } from '../schemas';
import type { PartnerBusiness, PartnerOffer } from '../types';

type ViewTab = 'all' | 'offers' | 'recent';

const PAGE_SIZE = 6;

const emptyBusiness: PartnerBusinessInput = {
  name: '',
  url: '',
  status: 'active',
  categories: '',
  isSponsor: false,
  address: '',
  logoUrl: null,
  favorite: false,
};

const emptyOffer: PartnerOfferInput = {
  name: '',
  businessId: '',
  status: 'active',
  discountText: '',
  conditions: '',
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export function PartnerBusinessesPage() {
  const { data, refresh } = useAppData();
  const [tab, setTab] = useState<ViewTab>('all');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [page, setPage] = useState(1);

  const [businessOpen, setBusinessOpen] = useState(false);
  const [editingBusiness, setEditingBusiness] = useState<PartnerBusiness | null>(null);
  const [businessForm, setBusinessForm] = useState<PartnerBusinessInput>(emptyBusiness);
  const [businessError, setBusinessError] = useState('');
  const [businessSaving, setBusinessSaving] = useState(false);

  const [offerOpen, setOfferOpen] = useState(false);
  const [offerForm, setOfferForm] = useState<PartnerOfferInput>(emptyOffer);
  const [offerError, setOfferError] = useState('');
  const [offerSaving, setOfferSaving] = useState(false);
  const [offerBusinessId, setOfferBusinessId] = useState<string | null>(null);

  const businesses = useMemo(
    () => [...(data.partnerBusinesses ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'el')),
    [data.partnerBusinesses],
  );
  const offers = useMemo(
    () => [...(data.partnerOffers ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [data.partnerOffers],
  );

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const b of businesses) {
      for (const part of b.categories.split(/[,;/|]/)) {
        const c = part.trim();
        if (c) set.add(c);
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'el'));
  }, [businesses]);

  const offerByBusiness = useMemo(() => {
    const map = new Map<string, PartnerOffer>();
    for (const offer of offers) {
      if (offer.status !== 'active') continue;
      if (!map.has(offer.businessId)) map.set(offer.businessId, offer);
    }
    return map;
  }, [offers]);

  const filtered = useMemo(() => {
    let list = businesses.filter((b) => b.status === 'active');
    if (categoryFilter) {
      list = list.filter((b) =>
        b.categories.toLowerCase().includes(categoryFilter.toLowerCase()),
      );
    }
    if (tab === 'offers') {
      list = list.filter((b) => offerByBusiness.has(b.id));
    }
    if (tab === 'recent') {
      list = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    return list;
  }, [businesses, categoryFilter, tab, offerByBusiness]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const from = filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const to = Math.min(safePage * PAGE_SIZE, filtered.length);

  function openCreateBusiness() {
    setEditingBusiness(null);
    setBusinessForm(emptyBusiness);
    setBusinessError('');
    setBusinessOpen(true);
  }

  function openEditBusiness(item: PartnerBusiness) {
    setEditingBusiness(item);
    setBusinessForm({
      name: item.name,
      url: item.url,
      status: item.status,
      categories: item.categories,
      isSponsor: item.isSponsor,
      address: item.address ?? '',
      logoUrl: item.logoUrl ?? null,
      favorite: item.favorite ?? false,
    });
    setBusinessError('');
    setBusinessOpen(true);
  }

  async function handleSaveBusiness() {
    setBusinessSaving(true);
    setBusinessError('');
    const result = editingBusiness
      ? await partnerService.updatePartnerBusiness(editingBusiness.id, businessForm)
      : await partnerService.createPartnerBusiness(businessForm);
    setBusinessSaving(false);
    if (!result.success) {
      setBusinessError(result.error ?? 'Σφάλμα αποθήκευσης');
      return;
    }
    setBusinessOpen(false);
    refresh();
  }

  async function toggleFavorite(item: PartnerBusiness) {
    await partnerService.updatePartnerBusiness(item.id, {
      name: item.name,
      url: item.url,
      status: item.status,
      categories: item.categories,
      isSponsor: item.isSponsor,
      address: item.address ?? '',
      logoUrl: item.logoUrl ?? null,
      favorite: !item.favorite,
    });
    refresh();
  }

  function openOfferFor(businessId: string) {
    const existing = offerByBusiness.get(businessId);
    setOfferBusinessId(businessId);
    setOfferForm(
      existing
        ? {
            name: existing.name,
            businessId,
            status: existing.status,
            discountText: existing.discountText ?? '',
            conditions: existing.conditions ?? '',
          }
        : { ...emptyOffer, businessId },
    );
    setOfferError('');
    setOfferOpen(true);
  }

  async function handleSaveOffer() {
    setOfferSaving(true);
    setOfferError('');
    const existing = offerBusinessId ? offerByBusiness.get(offerBusinessId) : undefined;
    const result = existing
      ? await partnerService.updatePartnerOffer(existing.id, offerForm)
      : await partnerService.createPartnerOffer(offerForm);
    setOfferSaving(false);
    if (!result.success) {
      setOfferError(result.error ?? 'Σφάλμα αποθήκευσης');
      return;
    }
    setOfferOpen(false);
    refresh();
  }

  return (
    <div className="pb-page">
      <header className="pb-head">
        <div>
          <h1>Συμβεβλημένες Επιχειρήσεις</h1>
          <p>Αποκλειστικές προσφορές και προνόμια για τα μέλη του συλλόγου μας.</p>
        </div>
        <Button type="button" onClick={openCreateBusiness}>
          <Plus size={16} /> Νέος συνεργάτης
        </Button>
      </header>

      <div className="pb-toolbar">
        <div className="pb-tabs" role="tablist">
          {(
            [
              ['all', 'Όλες'],
              ['offers', 'Προσφορές'],
              ['recent', 'Πρόσφατα'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={tab === id ? 'is-active' : ''}
              onClick={() => {
                setTab(id);
                setPage(1);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="pb-category">
          <Filter size={15} aria-hidden />
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Όλες οι κατηγορίες</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      {pageRows.length === 0 ? (
        <div className="pb-empty panel">
          <p>Δεν υπάρχουν συνεργάτες με αυτά τα κριτήρια.</p>
          <Button type="button" onClick={openCreateBusiness}>
            <Plus size={16} /> Νέος συνεργάτης
          </Button>
        </div>
      ) : (
        <div className="pb-grid">
          {pageRows.map((item) => {
            const offer = offerByBusiness.get(item.id);
            const category = item.categories.split(/[,;/|]/)[0]?.trim() || 'Συνεργάτης';
            return (
              <article key={item.id} className="pb-card panel">
                <div className="pb-card-top">
                  <div className="pb-logo" aria-hidden>
                    {item.logoUrl ? <img src={item.logoUrl} alt="" /> : initials(item.name)}
                  </div>
                  <div className="pb-card-meta">
                    <span className="pb-cat">{category}</span>
                    <strong>{item.name}</strong>
                    {item.address ? (
                      <span className="pb-addr">
                        <MapPin size={13} /> {item.address}
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className={`pb-fav${item.favorite ? ' is-on' : ''}`}
                    aria-label="Αγαπημένο"
                    onClick={() => void toggleFavorite(item)}
                  >
                    <Star size={16} fill={item.favorite ? 'currentColor' : 'none'} />
                  </button>
                </div>

                <div className="pb-offer">
                  <span className="pb-offer-icon">
                    <Tag size={14} />
                  </span>
                  <div>
                    <strong>
                      {offer?.discountText || offer?.name || 'Χωρίς ενεργή προσφορά'}
                    </strong>
                    <span>
                      {offer?.conditions ||
                        (offer ? 'Ισχύει για όλα τα μέλη' : 'Προσθέστε προσφορά για τα μέλη')}
                    </span>
                  </div>
                </div>

                <div className="pb-card-footer">
                  <button type="button" className="pb-link" onClick={() => openOfferFor(item.id)}>
                    Προβολή προσφοράς <ArrowRight size={14} />
                  </button>
                  <button type="button" className="pb-edit" onClick={() => openEditBusiness(item)}>
                    Επεξεργασία
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="pb-pager">
        <span>
          Εμφάνιση {from}-{to} από {filtered.length} συνεργάτες
        </span>
        <div className="pb-pager-btns">
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

      <Modal
        open={businessOpen}
        title={editingBusiness ? 'Επεξεργασία συνεργάτη' : 'Νέος συνεργάτης'}
        onClose={() => setBusinessOpen(false)}
        footer={
          <>
            <Button variant="secondary" type="button" onClick={() => setBusinessOpen(false)}>
              Άκυρο
            </Button>
            <Button type="button" disabled={businessSaving} onClick={() => void handleSaveBusiness()}>
              Αποθήκευση
            </Button>
          </>
        }
      >
        <div className="stack-md">
          <label className="field">
            <span className="field-label">Όνομα</span>
            <input
              className="field-input"
              value={businessForm.name}
              onChange={(e) => setBusinessForm({ ...businessForm, name: e.target.value })}
            />
          </label>
          <label className="field">
            <span className="field-label">Κατηγορία</span>
            <input
              className="field-input"
              value={businessForm.categories}
              onChange={(e) => setBusinessForm({ ...businessForm, categories: e.target.value })}
              placeholder="π.χ. Γυμναστήρια"
            />
          </label>
          <label className="field">
            <span className="field-label">Διεύθυνση</span>
            <input
              className="field-input"
              value={businessForm.address ?? ''}
              onChange={(e) => setBusinessForm({ ...businessForm, address: e.target.value })}
            />
          </label>
          <label className="field">
            <span className="field-label">URL</span>
            <input
              className="field-input"
              value={businessForm.url}
              onChange={(e) => setBusinessForm({ ...businessForm, url: e.target.value })}
            />
          </label>
          <label className="field">
            <span className="field-label">Κατάσταση</span>
            <select
              className="field-input"
              value={businessForm.status}
              onChange={(e) =>
                setBusinessForm({
                  ...businessForm,
                  status: e.target.value as PartnerBusiness['status'],
                })
              }
            >
              <option value="active">Ενεργή</option>
              <option value="inactive">Ανενεργή</option>
            </select>
          </label>
          {businessError ? <p className="form-error">{businessError}</p> : null}
        </div>
      </Modal>

      <Modal
        open={offerOpen}
        title="Προσφορά συνεργάτη"
        onClose={() => setOfferOpen(false)}
        footer={
          <>
            <Button variant="secondary" type="button" onClick={() => setOfferOpen(false)}>
              Άκυρο
            </Button>
            <Button type="button" disabled={offerSaving} onClick={() => void handleSaveOffer()}>
              <Percent size={14} /> Αποθήκευση
            </Button>
          </>
        }
      >
        <div className="stack-md">
          <label className="field">
            <span className="field-label">Τίτλος προσφοράς</span>
            <input
              className="field-input"
              value={offerForm.name}
              onChange={(e) => setOfferForm({ ...offerForm, name: e.target.value })}
            />
          </label>
          <label className="field">
            <span className="field-label">Έκπτωση (εμφάνιση)</span>
            <input
              className="field-input"
              value={offerForm.discountText ?? ''}
              onChange={(e) => setOfferForm({ ...offerForm, discountText: e.target.value })}
              placeholder="π.χ. 20% έκπτωση"
            />
          </label>
          <label className="field">
            <span className="field-label">Όροι</span>
            <input
              className="field-input"
              value={offerForm.conditions ?? ''}
              onChange={(e) => setOfferForm({ ...offerForm, conditions: e.target.value })}
              placeholder="π.χ. σε όλα τα μηνιαία πακέτα"
            />
          </label>
          {offerError ? <p className="form-error">{offerError}</p> : null}
        </div>
      </Modal>
    </div>
  );
}
