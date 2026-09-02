export type VivaPendingPayment = {
  id: string;
  clubId: string;
  orderCode: string;
  athleteId: string;
  amountEuro: number;
  athleteName: string;
  createdAt: string;
  provider?: 'viva' | 'stripe' | 'eurobank';
};

const KEY = 'academyhub-viva-pending-v1';

export function listVivaPending(): VivaPendingPayment[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as VivaPendingPayment[];
  } catch {
    return [];
  }
}

function saveAll(items: VivaPendingPayment[]): void {
  localStorage.setItem(KEY, JSON.stringify(items.slice(0, 100)));
}

export function addVivaPending(entry: Omit<VivaPendingPayment, 'id'>): VivaPendingPayment {
  const item: VivaPendingPayment = {
    ...entry,
    id: `vp_${crypto.randomUUID().slice(0, 8)}`,
  };
  const next = [item, ...listVivaPending().filter((p) => p.orderCode !== item.orderCode)];
  saveAll(next);
  return item;
}

export function takeVivaPending(orderCode: string): VivaPendingPayment | null {
  const all = listVivaPending();
  const found = all.find((p) => p.orderCode === String(orderCode));
  if (!found) return null;
  saveAll(all.filter((p) => p.id !== found.id));
  return found;
}

/** Prefer exact orderCode; else newest pending for club within 2 hours. */
export function resolveVivaPending(opts: {
  clubId: string;
  orderCode?: string | null;
}): VivaPendingPayment | null {
  if (opts.orderCode) {
    const exact = takeVivaPending(opts.orderCode);
    if (exact) return exact;
  }
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  const candidates = listVivaPending()
    .filter((p) => p.clubId === opts.clubId)
    .filter((p) => {
      const ts = Date.parse(p.createdAt);
      return Number.isFinite(ts) ? ts >= cutoff : true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const first = candidates[0];
  if (!first) return null;
  return takeVivaPending(first.orderCode);
}
