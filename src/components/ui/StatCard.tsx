import type { ComponentType, ReactNode, SVGProps } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

type IconComponent =
  | LucideIcon
  | ComponentType<SVGProps<SVGSVGElement> & { size?: number; color?: string }>;

interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  icon: IconComponent;
  tone?: 'default' | 'positive' | 'negative' | 'warn';
  to?: string;
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
  to,
}: StatCardProps) {
  const inner = (
    <>
      <div className="stat-card-top">
        <span className="stat-label">{label}</span>
        <span className="stat-icon">
          <Icon size={18} />
        </span>
      </div>
      <strong className="stat-value">{value}</strong>
      {hint ? <span className="stat-hint">{hint}</span> : null}
    </>
  );
  if (to) {
    return (
      <Link to={to} className={`stat-card tone-${tone}`}>
        {inner}
      </Link>
    );
  }
  return <article className={`stat-card tone-${tone}`}>{inner}</article>;
}

interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
