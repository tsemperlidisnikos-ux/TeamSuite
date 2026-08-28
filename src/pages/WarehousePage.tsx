import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  Download,
  MoreHorizontal,
  Package,
  PackageMinus,
  PackagePlus,
  Pencil,
  Plus,
  Search,
  Upload,
  Wallet,
} from 'lucide-react';
import * as productsService from '../api/services/productsService';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { useAppData } from '../hooks/useAppData';
import { PRODUCT_CATEGORIES, type WarehouseProductInput } from '../schemas';
import type { WarehouseProduct } from '../types';
import { formatCurrency } from '../utils/labels';
import {
  formatProductSize,
  sizeChartOptGroups,
} from '../utils/sizeChartOptions';

const emptyForm: WarehouseProductInput = {
  name: '',
  category: '',
  sku: '',
  salePrice: 0,
  size: '',
  sizeGroup: '',
  notes: '',
  stockQty: 0,
  brand: '',
  barcode: '',
  color: '',
  costPrice: 0,
  minStock: 5,
  imageUrl: null,
};

function minStockOf(product: WarehouseProduct): number {
  return product.minStock ?? 5;
}

function isLowStock(product: WarehouseProduct): boolean {
  return (product.stockQty ?? 0) <= minStockOf(product);
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function exportProductsCsv(products: WarehouseProduct[]) {
  const headers = [
    'sku',
    'barcode',
    'name',
    'brand',
    'category',
    'size',
    'color',
    'stockQty',
    'minStock',
    'costPrice',
    'salePrice',
  ];
  const lines = [
    headers.join(','),
    ...products.map((p) =>
      [
        p.sku,
        p.barcode ?? '',
        p.name,
        p.brand ?? '',
        p.category,
        p.size,
        p.color ?? '',
        p.stockQty ?? 0,
        minStockOf(p),
        p.costPrice ?? 0,
        p.salePrice,
      ]
        .map((v) => `"${String(v).replaceAll('"', '""')}"`)
        .join(','),
    ),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `apothiki-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function WarehousePage() {
  const { data, refresh } = useAppData();
  const importRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WarehouseProduct | null>(null);
  const [form, setForm] = useState<WarehouseProductInput>(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [stockProduct, setStockProduct] = useState<WarehouseProduct | null>(null);
  const [stockType, setStockType] = useState<'in' | 'out' | 'adjust'>('in');
  const [stockQty, setStockQty] = useState(1);
  const [stockNote, setStockNote] = useState('');
  const [stockError, setStockError] = useState('');
  const [stockSaving, setStockSaving] = useState(false);

  const products = useMemo(
    () => [...(data.products ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'el')),
    [data.products],
  );

  const brands = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      const brand = p.brand?.trim();
      if (brand) set.add(brand);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'el'));
  }, [products]);

  const movements = data.stockMovements ?? [];
  const since30 = daysAgoIso(30);

  const stats = useMemo(() => {
    const totalProducts = products.length;
    const totalStock = products.reduce((sum, p) => sum + (p.stockQty ?? 0), 0);
    const stockValue = products.reduce(
      (sum, p) => sum + (p.stockQty ?? 0) * (p.costPrice || p.salePrice || 0),
      0,
    );
    const imports30 = movements
      .filter((m) => m.type === 'in' && m.createdAt >= since30)
      .reduce((sum, m) => sum + m.quantity, 0);
    const exports30 = movements
      .filter((m) => m.type === 'out' && m.createdAt >= since30)
      .reduce((sum, m) => sum + m.quantity, 0);
    const lowStock = products.filter(isLowStock).length;
    return { totalProducts, totalStock, stockValue, imports30, exports30, lowStock };
  }, [products, movements, since30]);

  const movementTotals = useMemo(() => {
    const map = new Map<string, { inQty: number; outQty: number }>();
    for (const m of movements) {
      const cur = map.get(m.productId) ?? { inQty: 0, outQty: 0 };
      if (m.type === 'in') cur.inQty += m.quantity;
      if (m.type === 'out') cur.outQty += m.quantity;
      map.set(m.productId, cur);
    }
    return map;
  }, [movements]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryFilter && p.category !== categoryFilter) return false;
      if (brandFilter && (p.brand ?? '') !== brandFilter) return false;
      if (statusFilter === 'low' && !isLowStock(p)) return false;
      if (statusFilter === 'ok' && isLowStock(p)) return false;
      if (!q) return true;
      const hay = `${p.name} ${p.sku} ${p.barcode ?? ''} ${p.brand ?? ''} ${p.category} ${p.notes}`.toLowerCase();
      return hay.includes(q);
    });
  }, [products, query, categoryFilter, brandFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const from = filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, filtered.length);

  const sizeOptions = useMemo(() => {
    const sizes = sizeChartOptGroups(data.sizeChart).flatMap((g) => g.sizes);
    const keys = new Set(sizes.map((s) => s.toUpperCase()));
    const currentSize = form.size.trim();
    if (currentSize && !keys.has(currentSize.toUpperCase())) {
      return [...sizes, currentSize];
    }
    return sizes;
  }, [data.sizeChart, form.size]);

  const selectedSizeValue = form.size.trim();

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError('');
    setOpen(true);
  }

  function openEdit(product: WarehouseProduct) {
    setEditing(product);
    setForm({
      name: product.name,
      category: product.category,
      sku: product.sku ?? '',
      salePrice: product.salePrice,
      size: product.size ?? '',
      sizeGroup: product.sizeGroup ?? '',
      notes: product.notes ?? '',
      stockQty: product.stockQty ?? 0,
      brand: product.brand ?? '',
      barcode: product.barcode ?? '',
      color: product.color ?? '',
      costPrice: product.costPrice ?? 0,
      minStock: product.minStock ?? 5,
      imageUrl: product.imageUrl ?? null,
    });
    setError('');
    setMenuId(null);
    setOpen(true);
  }

  function openStock(product: WarehouseProduct) {
    setStockProduct(product);
    setStockType('in');
    setStockQty(1);
    setStockNote('');
    setStockError('');
    setMenuId(null);
  }

  async function handleStockSave() {
    if (!stockProduct) return;
    setStockSaving(true);
    setStockError('');
    const result = await productsService.recordStockMovement({
      productId: stockProduct.id,
      type: stockType,
      quantity: stockQty,
      note: stockNote,
    });
    setStockSaving(false);
    if (!result.success) {
      setStockError(result.error ?? 'Σφάλμα κίνησης');
      return;
    }
    setStockProduct(null);
    refresh();
  }

  function closeModal() {
    setOpen(false);
    setError('');
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    const result = editing
      ? await productsService.updateProduct(editing.id, form)
      : await productsService.createProduct(form);
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Σφάλμα αποθήκευσης');
      return;
    }
    closeModal();
    refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm('Διαγραφή προϊόντος;')) return;
    await productsService.deleteProduct(id);
    setMenuId(null);
    refresh();
  }

  function handleImportClick() {
    importRef.current?.click();
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) {
      alert('Το αρχείο δεν περιέχει προϊόντα.');
      return;
    }
    const headers = lines[0].split(',').map((h) => h.replaceAll('"', '').trim().toLowerCase());
    let created = 0;
    for (const line of lines.slice(1)) {
      const cols = line.match(/("([^"]|"")*"|[^,]*)/g)?.map((c) => c.replace(/^"|"$/g, '').replaceAll('""', '"')) ?? [];
      const get = (key: string) => {
        const idx = headers.indexOf(key);
        return idx >= 0 ? cols[idx] ?? '' : '';
      };
      const name = get('name').trim();
      if (!name) continue;
      const category = get('category').trim() || 'ΑΛΛΟ';
      await productsService.createProduct({
        name,
        category,
        sku: get('sku'),
        barcode: get('barcode'),
        brand: get('brand'),
        size: get('size'),
        color: get('color'),
        sizeGroup: '',
        notes: '',
        stockQty: Number(get('stockqty')) || 0,
        minStock: Number(get('minstock')) || 5,
        costPrice: Number(get('costprice')) || 0,
        salePrice: Number(get('saleprice')) || 0,
        imageUrl: null,
      });
      created += 1;
    }
    refresh();
    alert(created ? `Εισήχθησαν ${created} προϊόντα.` : 'Δεν βρέθηκαν έγκυρες γραμμές.');
  }

  return (
    <div className="wh-page">
      <header className="wh-page-head">
        <div>
          <h1>Αποθήκη</h1>
          <p className="wh-breadcrumb">Αρχική / Αποθήκη / Προϊόντα</p>
        </div>
        <Button type="button" onClick={openCreate}>
          <Plus size={16} /> Νέο προϊόν
        </Button>
      </header>

      <section className="wh-stats">
        <article className="wh-stat panel">
          <Package size={20} />
          <div>
            <span>Σύνολο προϊόντων</span>
            <strong>{stats.totalProducts.toLocaleString('el-GR')}</strong>
            <em>SKUs</em>
          </div>
        </article>
        <article className="wh-stat panel">
          <Boxes size={20} />
          <div>
            <span>Σύνολο αποθέματος</span>
            <strong>{stats.totalStock.toLocaleString('el-GR')}</strong>
            <em>Τεμάχια</em>
          </div>
        </article>
        <article className="wh-stat panel">
          <Wallet size={20} />
          <div>
            <span>Αξία αποθέματος</span>
            <strong>{formatCurrency(stats.stockValue)}</strong>
            <em>Κόστος κτήσης</em>
          </div>
        </article>
        <article className="wh-stat panel">
          <PackagePlus size={20} />
          <div>
            <span>Εισαγωγές (30ημ.)</span>
            <strong>{stats.imports30.toLocaleString('el-GR')}</strong>
            <em>Τεμάχια</em>
          </div>
        </article>
        <article className="wh-stat panel is-out">
          <PackageMinus size={20} />
          <div>
            <span>Εξαγωγές (30ημ.)</span>
            <strong>{stats.exports30.toLocaleString('el-GR')}</strong>
            <em>Τεμάχια</em>
          </div>
        </article>
        <article className="wh-stat panel is-warn">
          <AlertTriangle size={20} />
          <div>
            <span>Χαμηλό απόθεμα</span>
            <strong>{stats.lowStock.toLocaleString('el-GR')}</strong>
            <em>Προϊόντα</em>
          </div>
        </article>
      </section>

      <section className="wh-toolbar panel">
        <label className="wh-search">
          <Search size={16} aria-hidden />
          <input
            type="search"
            placeholder="Αναζήτηση προϊόντων..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <select
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Κατηγορία · Όλες</option>
          {PRODUCT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={brandFilter}
          onChange={(e) => {
            setBrandFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Μάρκα · Όλες</option>
          {brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Κατάσταση · Όλα</option>
          <option value="ok">Επαρκές</option>
          <option value="low">Χαμηλό απόθεμα</option>
        </select>
        <div className="wh-toolbar-actions">
          <button type="button" className="wh-io-btn" onClick={() => exportProductsCsv(filtered)}>
            <Download size={15} /> Εξαγωγή
          </button>
          <button type="button" className="wh-io-btn" onClick={handleImportClick}>
            <Upload size={15} /> Εισαγωγή
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(e) => void handleImportFile(e)}
          />
        </div>
      </section>

      <section className="wh-table-card panel">
        {pageRows.length === 0 ? (
          <div className="wh-empty">
            <Package size={28} />
            <p>Δεν υπάρχουν προϊόντα με αυτά τα κριτήρια.</p>
            <Button type="button" onClick={openCreate}>
              <Plus size={16} /> Νέο προϊόν
            </Button>
          </div>
        ) : (
          <div className="table-wrap wh-table-wrap">
            <table className="wh-table">
              <thead>
                <tr>
                  <th />
                  <th>Κωδικός</th>
                  <th>Barcode</th>
                  <th>Όνομα προϊόντος</th>
                  <th>Μάρκα</th>
                  <th>Κατηγορία</th>
                  <th>Μέγεθος / Χρώμα</th>
                  <th>Απόθεμα</th>
                  <th>Εισαγωγές</th>
                  <th>Εξαγωγές</th>
                  <th>Διαθέσιμο</th>
                  <th>Ελάχ. αποθ.</th>
                  <th>Κόστος κτήσης</th>
                  <th>Ενέργειες</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((item) => {
                  const moves = movementTotals.get(item.id) ?? { inQty: 0, outQty: 0 };
                  const stock = item.stockQty ?? 0;
                  const min = minStockOf(item);
                  const low = stock <= min;
                  const sizeColor = [
                    formatProductSize(item.size, item.sizeGroup, data.sizeChart),
                    item.color?.trim(),
                  ]
                    .filter(Boolean)
                    .join(' / ');
                  return (
                    <tr key={item.id} className={low ? 'is-low' : ''}>
                      <td>
                        <div className="wh-thumb" aria-hidden>
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt="" />
                          ) : (
                            <Package size={16} />
                          )}
                        </div>
                      </td>
                      <td>{item.sku || '—'}</td>
                      <td>{item.barcode || '—'}</td>
                      <td>
                        <div className="wh-name-cell">
                          <strong>{item.name}</strong>
                          {item.notes ? <span>{item.notes}</span> : null}
                        </div>
                      </td>
                      <td>{item.brand || '—'}</td>
                      <td>{item.category || '—'}</td>
                      <td>{sizeColor || '—'}</td>
                      <td className={low ? 'wh-num is-low' : 'wh-num is-ok'}>{stock}</td>
                      <td>{moves.inQty}</td>
                      <td>{moves.outQty}</td>
                      <td className={low ? 'wh-num is-low' : 'wh-num is-ok'}>{stock}</td>
                      <td className={low ? 'wh-num is-low' : ''}>{min}</td>
                      <td>{formatCurrency(item.costPrice || item.salePrice || 0)}</td>
                      <td className="wh-actions">
                        <button
                          type="button"
                          className="wh-edit-btn"
                          aria-label="Επεξεργασία"
                          onClick={() => openEdit(item)}
                        >
                          <Pencil size={14} />
                        </button>
                        <div className="wh-menu-wrap">
                          <button
                            type="button"
                            className="wh-menu-btn"
                            aria-label="Περισσότερα"
                            onClick={() => setMenuId(menuId === item.id ? null : item.id)}
                          >
                            <MoreHorizontal size={16} />
                          </button>
                          {menuId === item.id ? (
                            <div className="wh-menu">
                              <button type="button" onClick={() => openStock(item)}>
                                <ArrowDownToLine size={14} /> Κίνηση αποθέματος
                              </button>
                              <button type="button" onClick={() => openStock(item)}>
                                <ArrowUpFromLine size={14} /> Εισαγωγή / Εξαγωγή
                              </button>
                              <button type="button" onClick={() => void handleDelete(item.id)}>
                                Διαγραφή
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="wh-pager">
          <span>
            Εμφανίζονται {from} έως {to} από {filtered.length.toLocaleString('el-GR')} εγγραφές
          </span>
          <label className="wh-page-size">
            Ανά σελίδα
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value) || 25);
                setPage(1);
              }}
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <div className="wh-pager-btns">
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
        title={editing ? 'Επεξεργασία προϊόντος' : 'Νέο προϊόν'}
        onClose={closeModal}
        wide
        footer={
          <>
            <Button variant="secondary" type="button" onClick={closeModal}>
              Άκυρο
            </Button>
            <Button type="button" disabled={saving} onClick={() => void handleSave()}>
              Αποθήκευση
            </Button>
          </>
        }
      >
        <div className="product-form">
          <div className="product-form-row product-form-row--2">
            <label className="field">
              <span className="field-label">
                Όνομα <span className="req">*</span>
              </span>
              <input
                className="field-input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">
                Κατηγορία <span className="req">*</span>
              </span>
              <select
                className="field-input"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                required
              >
                <option value="">—</option>
                {PRODUCT_CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="product-form-row product-form-row--3">
            <label className="field">
              <span className="field-label">SKU</span>
              <input
                className="field-input"
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
              />
            </label>
            <label className="field">
              <span className="field-label">Barcode</span>
              <input
                className="field-input"
                value={form.barcode ?? ''}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
              />
            </label>
            <label className="field">
              <span className="field-label">Μάρκα</span>
              <input
                className="field-input"
                value={form.brand ?? ''}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
              />
            </label>
            <label className="field">
              <span className="field-label">
                Τιμή πώλησης <span className="req">*</span>
              </span>
              <input
                className="field-input"
                type="number"
                min={0}
                step="0.01"
                value={form.salePrice || ''}
                onChange={(e) => setForm({ ...form, salePrice: Number(e.target.value) })}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">Κόστος κτήσης</span>
              <input
                className="field-input"
                type="number"
                min={0}
                step="0.01"
                value={form.costPrice || ''}
                onChange={(e) => setForm({ ...form, costPrice: Number(e.target.value) || 0 })}
              />
            </label>
            <label className="field">
              <span className="field-label">Αρχικό απόθεμα</span>
              <input
                className="field-input"
                type="number"
                min={0}
                step="1"
                value={form.stockQty ?? 0}
                onChange={(e) => setForm({ ...form, stockQty: Number(e.target.value) || 0 })}
              />
            </label>
            <label className="field">
              <span className="field-label">Ελάχ. απόθεμα</span>
              <input
                className="field-input"
                type="number"
                min={0}
                step="1"
                value={form.minStock ?? 5}
                onChange={(e) => setForm({ ...form, minStock: Number(e.target.value) || 0 })}
              />
            </label>
            <label className="field">
              <span className="field-label">Μέγεθος</span>
              <select
                className="field-input"
                value={selectedSizeValue}
                onChange={(e) => {
                  setForm({
                    ...form,
                    size: e.target.value,
                    sizeGroup: '',
                  });
                }}
              >
                <option value="">—</option>
                {sizeOptions.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Χρώμα</span>
              <input
                className="field-input"
                value={form.color ?? ''}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
              />
            </label>
          </div>

          <label className="field">
            <span className="field-label">Σημειώσεις / περιγραφή</span>
            <textarea
              className="field-input"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>

          {error ? <p className="form-error">{error}</p> : null}
        </div>
      </Modal>

      <Modal
        open={Boolean(stockProduct)}
        title={stockProduct ? `Απόθεμα — ${stockProduct.name}` : 'Απόθεμα'}
        onClose={() => setStockProduct(null)}
        footer={
          <>
            <Button variant="secondary" type="button" onClick={() => setStockProduct(null)}>
              Άκυρο
            </Button>
            <Button type="button" disabled={stockSaving} onClick={() => void handleStockSave()}>
              Καταχώρηση
            </Button>
          </>
        }
      >
        <div className="stack-md">
          <p className="muted">Τρέχον απόθεμα: {stockProduct?.stockQty ?? 0}</p>
          <label className="field">
            <span className="field-label">Τύπος κίνησης</span>
            <select
              className="field-input"
              value={stockType}
              onChange={(e) => setStockType(e.target.value as 'in' | 'out' | 'adjust')}
            >
              <option value="in">Εισαγωγή (+)</option>
              <option value="out">Εξαγωγή / πώληση (−)</option>
              <option value="adjust">Απογραφή (ορισμός ποσότητας)</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">Ποσότητα</span>
            <input
              className="field-input"
              type="number"
              min={1}
              step={1}
              value={stockQty}
              onChange={(e) => setStockQty(Math.max(1, Number(e.target.value) || 1))}
            />
          </label>
          <label className="field">
            <span className="field-label">Σημείωση</span>
            <input
              className="field-input"
              value={stockNote}
              onChange={(e) => setStockNote(e.target.value)}
              placeholder="π.χ. παραλαβή / πώληση αθλητή"
            />
          </label>
          {stockError ? <p className="form-error">{stockError}</p> : null}
        </div>
      </Modal>
    </div>
  );
}
