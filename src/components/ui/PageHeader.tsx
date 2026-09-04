import type { ReactNode } from 'react';
import { useT } from '../../i18n/LocaleContext';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  const { t } = useT();
  return (
    <header className="page-header">
      <div>
        <h1>{t(title)}</h1>
        {subtitle ? <p>{t(subtitle)}</p> : null}
      </div>
      {actions ? <div className="page-header-actions">{actions}</div> : null}
    </header>
  );
}
