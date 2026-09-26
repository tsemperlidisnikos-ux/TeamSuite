import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export function Input({ label, error, hint, id, className = '', ...props }: InputProps) {
  const inputId = id ?? props.name;
  return (
    <label className="field" htmlFor={inputId}>
      <span className="field-label">{label}</span>
      <input id={inputId} className={`field-input ${className}`.trim()} {...props} />
      {error ? <span className="field-error">{error}</span> : null}
      {!error && hint ? <span className="field-hint muted">{hint}</span> : null}
    </label>
  );
}
