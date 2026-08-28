import type { SelectHTMLAttributes } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  options: Array<{ value: string; label: string }>;
}

export function Select({
  label,
  error,
  options,
  id,
  className = '',
  ...props
}: SelectProps) {
  const selectId = id ?? props.name;
  return (
    <label className="field" htmlFor={selectId}>
      <span className="field-label">{label}</span>
      <select id={selectId} className={`field-input ${className}`.trim()} {...props}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error ? <span className="field-error">{error}</span> : null}
    </label>
  );
}
