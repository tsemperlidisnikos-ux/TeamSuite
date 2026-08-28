import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { isPlatformAdmin } from '../auth/auth';
import {
  ATHLETE_LICENSE_OPTIONS,
  applyCatalogPricing,
  catalogNetPriceForAthletes,
  formatLicenseEuro,
  getLicensePackages,
  licenseGrossPrice,
  licenseTierLabel,
  licenseVatAmount,
  periodLabel,
  saveLicensePackages,
  type LicensePackage,
} from '../auth/licensePackages';
import { AdminZone, PlatformAdminShell } from '../components/layout/PlatformAdminShell';
import { Button } from '../components/ui/Button';

function syncDerivedPrices(pkg: LicensePackage): LicensePackage {
  const price = Number.isFinite(pkg.price) ? Math.max(0, pkg.price) : 0;
  return {
    ...pkg,
    periodMonths: 12,
    price,
    monthlyPrice: Math.round((price / 12) * 100) / 100,
    yearlyPrice: price,
  };
}

export function LicensePackagesPage() {
  const [packages, setPackages] = useState<LicensePackage[]>(() =>
    getLicensePackages().map((pkg) => applyCatalogPricing(pkg)),
  );
  const [message, setMessage] = useState('');

  if (!isPlatformAdmin()) {
    return <Navigate to="/login" replace />;
  }

  function updatePackage(id: string, patch: Partial<LicensePackage>) {
    setPackages((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        let next = syncDerivedPrices({ ...p, ...patch });
        if (patch.athleteLicenses != null) {
          next = applyCatalogPricing(next);
        }
        return next;
      }),
    );
  }

  function handleSave() {
    const next = packages.map(syncDerivedPrices);
    saveLicensePackages(next);
    setPackages(next);
    setMessage('Ο τιμοκατάλογος αποθηκεύτηκε.');
  }

  function handleResetCatalog() {
    const next = packages.map((pkg) => applyCatalogPricing(pkg));
    setPackages(next);
    saveLicensePackages(next);
    setMessage('Εφαρμόστηκε ο επίσημος τιμοκατάλογος ανά αθλητές.');
  }

  return (
    <PlatformAdminShell
      title="Πακέτο αδειών"
      lede="Τιμές από τον επίσημο τιμοκατάλογο (καθαρή αξία + ΦΠΑ 24%) ανά αριθμό αθλητών. Διάρκεια 12 μήνες."
      banner={message}
    >
      <div className="admin-zones">
        {packages.map((pkg) => {
          const catalogNet = catalogNetPriceForAthletes(pkg.athleteLicenses);
          const vat = licenseVatAmount(pkg.price);
          const gross = licenseGrossPrice(pkg.price);
          return (
            <AdminZone key={pkg.id} title={pkg.name}>
              <article className="admin-zone-card">
                <header className="admin-zone-card-head">
                  <h3>{licenseTierLabel(pkg.athleteLicenses)}</h3>
                  <p>
                    €{formatLicenseEuro(pkg.price)} + ΦΠΑ €{formatLicenseEuro(vat)} = €
                    {formatLicenseEuro(gross)} / {periodLabel(12)}
                    {pkg.active ? '' : ' · Ανενεργό'}
                  </p>
                </header>
                <div className="admin-zone-card-body">
                  <div className="entry-form admin-entry">
                    <label className="field">
                      <span>Αθλητές</span>
                      <select
                        value={pkg.athleteLicenses}
                        onChange={(e) =>
                          updatePackage(pkg.id, { athleteLicenses: Number(e.target.value) })
                        }
                      >
                        {ATHLETE_LICENSE_OPTIONS.map((n) => (
                          <option key={n} value={n}>
                            {n} · {licenseTierLabel(n)} · €
                            {formatLicenseEuro(catalogNetPriceForAthletes(n))}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Όνομα πακέτου (αυτόματο)</span>
                      <input value={pkg.name} readOnly />
                    </label>
                    <label className="field">
                      <span>Καθαρή τιμή (€ / 12 μήνες)</span>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={Number.isFinite(pkg.price) ? pkg.price : 0}
                        onChange={(e) => {
                          const value = e.target.value === '' ? 0 : Number(e.target.value);
                          updatePackage(pkg.id, { price: Number.isFinite(value) ? value : 0 });
                        }}
                      />
                    </label>
                    <label className="field">
                      <span>ΦΠΑ 24%</span>
                      <input value={`€ ${formatLicenseEuro(vat)}`} readOnly />
                    </label>
                    <label className="field">
                      <span>Σύνολο με ΦΠΑ</span>
                      <input value={`€ ${formatLicenseEuro(gross)}`} readOnly />
                    </label>
                    <label className="field">
                      <span>Διάρκεια</span>
                      <select value={12} disabled aria-readonly="true">
                        <option value={12}>{periodLabel(12)}</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>Περιγραφή</span>
                      <textarea
                        rows={2}
                        value={pkg.description}
                        onChange={(e) => updatePackage(pkg.id, { description: e.target.value })}
                      />
                    </label>
                    <p className="admin-entry-note">
                      Κατάλογος για {pkg.athleteLicenses} αθλητές: καθαρή €
                      {formatLicenseEuro(catalogNet)}
                      {Math.abs(pkg.price - catalogNet) > 0.009
                        ? ` · τρέχουσα τιμή διαφέρει από τον κατάλογο`
                        : ''}
                      .
                    </p>
                    {pkg.features.length > 0 ? (
                    <ul className="admin-package-features">
                      {pkg.features.map((feature) => (
                        <li
                          key={feature.label}
                          className={feature.included ? 'is-included' : 'is-excluded'}
                        >
                          {feature.included ? 'Ναι' : 'Όχι'} · {feature.label}
                        </li>
                      ))}
                    </ul>
                    ) : null}
                    <label className="admin-check">
                      <input
                        type="checkbox"
                        checked={pkg.active}
                        onChange={(e) => updatePackage(pkg.id, { active: e.target.checked })}
                      />
                      <span>Ενεργό πακέτο</span>
                    </label>
                  </div>
                </div>
              </article>
            </AdminZone>
          );
        })}
      </div>
      <div className="admin-entry-actions">
        <Button type="button" variant="secondary" onClick={handleResetCatalog}>
          Επαναφορά τιμοκαταλόγου
        </Button>
        <Button type="button" onClick={handleSave}>
          Αποθήκευση
        </Button>
      </div>
    </PlatformAdminShell>
  );
}
