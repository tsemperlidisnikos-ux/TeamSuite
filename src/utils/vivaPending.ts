import type { OnlineCheckoutPending } from '../types';
import { getData, mutateData } from '../data/repository';

export type VivaPendingPayment = OnlineCheckoutPending;

const KEY = 'academyhub-viva-pending-v1';

function readLocal(): VivaPendingPayment[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as VivaPendingPayment[];
  } catch {
    return [];
  }
}

function writeLocal(items: VivaPendingPayment[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, 100)));
  } catch {
    /* quota */
  }
}

function mergeByOrderCode(rows: VivaPendingPayment[]): VivaPendingPayment[] {
  const map = new Map<string, VivaPendingPayment>();
  for (const row of rows) {
    const code = String(row.orderCode ?? '').trim();
    if (!code) continue;
    const prev = map.get(code);
    if (!prev || String(row.createdAt) > String(prev.createdAt)) map.set(code, row);
  }
  return [...map.values()].slice(0, 100);
}

export function listVivaPending(): VivaPendingPayment[] {
  let fromStore: VivaPendingPayment[] = [];
  try {
    fromStore = getData().onlineCheckouts ?? [];
  } catch {
    fromStore = [];
  }
  return mergeByOrderCode([...fromStore, ...readLocal()]);
}

function persist(items: VivaPendingPayment[]): void {
  writeLocal(items);
  try {
    mutateData((data) => {
      data.onlineCheckouts = items;
    });
  } catch {
    /* store not ready */
  }
}

export function addVivaPending(entry: Omit<VivaPendingPayment, 'id'>): VivaPendingPayment {
  const item: VivaPendingPayment = {
    ...entry,
    id: `vp_${crypto.randomUUID().slice(0, 8)}`,
  };
  persist(mergeByOrderCode([item, ...listVivaPending()]));
  return item;
}

export function takeVivaPending(orderCode: string): VivaPendingPayment | null {
  const all = listVivaPending();
  const found = all.find((p) => p.orderCode === String(orderCode));
  if (!found) return null;
  persist(all.filter((p) => p.id !== found.id && p.orderCode !== found.orderCode));
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
