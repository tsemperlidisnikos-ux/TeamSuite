import type { ReactNode } from 'react';

type Props = {
  label: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
};

/** Label (αριστερά) + περιεχόμενο (δεξιά) για φόρμες Ρυθμίσεων. */
export function SettingsFormRow({ label, htmlFor, children, className = '' }: Props) {
  return (
    <div className={`settings-form-row ${className}`.trim()}>
      {typeof label === 'string' ? (
        <label className="settings-form-row-label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : (
        <div className="settings-form-row-label">{label}</div>
      )}
      <div className="settings-form-row-content">{children}</div>
    </div>
  );
}
