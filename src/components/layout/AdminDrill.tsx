import { type LucideIcon } from 'lucide-react';
import { type ReactNode } from 'react';

export type AdminDrillItem = {
  id: string;
  label: string;
  hint?: string;
  count?: number;
  icon: LucideIcon;
};

export type AdminDrillCategory = {
  id: string;
  label: string;
  icon: LucideIcon;
  items: AdminDrillItem[];
};

export function AdminDrill({
  categories,
  categoryId,
  itemId,
  onNavigate,
  children,
}: {
  categories: AdminDrillCategory[];
  categoryId: string;
  itemId: string;
  onNavigate: (categoryId: string, itemId: string) => void;
  children: ReactNode;
}) {
  const category = categories.find((row) => row.id === categoryId) ?? categories[0];
  const items = category?.items ?? [];

  return (
    <div className="admin-drill">
      <nav className="admin-drill-col" aria-label="Κατηγορίες">
        <p className="admin-drill-col-title">Κατηγορίες</p>
        {categories.map((row) => {
          const Icon = row.icon;
          const active = row.id === category.id;
          return (
            <button
              key={row.id}
              type="button"
              className={`admin-drill-btn${active ? ' is-active' : ''}`}
              onClick={() => onNavigate(row.id, row.items[0]?.id ?? itemId)}
            >
              <Icon size={18} strokeWidth={2} aria-hidden />
              <span>{row.label}</span>
            </button>
          );
        })}
      </nav>
      <nav className="admin-drill-col" aria-label={category?.label ?? 'Υποκατηγορίες'}>
        <p className="admin-drill-col-title">{category?.label}</p>
        {items.map((row) => {
          const Icon = row.icon;
          const active = row.id === itemId;
          return (
            <button
              key={row.id}
              type="button"
              className={`admin-drill-btn${active ? ' is-active' : ''}`}
              onClick={() => onNavigate(category.id, row.id)}
            >
              <Icon size={18} strokeWidth={2} aria-hidden />
              <span>
                {row.label}
                {row.hint ? <small>{row.hint}</small> : null}
              </span>
              {row.count != null ? (
                <span className="admin-drill-count">{row.count}</span>
              ) : null}
            </button>
          );
        })}
      </nav>
      <div className="admin-drill-main">{children}</div>
    </div>
  );
}
