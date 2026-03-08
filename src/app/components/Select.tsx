// ============================================================
// Select — Design System Primitive (SA-013)
// ============================================================

import React from 'react';

type SelectSize = 'sm' | 'md' | 'lg';

interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  selectSize?: SelectSize;
  options: SelectOption[];
  error?: string;
  label?: string;
  hint?: string;
  placeholder?: string;
}

const sizeClasses: Record<SelectSize, string> = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-3 py-2 text-sm',
  lg: 'px-4 py-2.5 text-base',
};

export function Select({
  selectSize = 'md',
  options,
  error,
  label,
  hint,
  placeholder,
  className = '',
  id,
  ...props
}: SelectProps) {
  const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');
  const hasError = Boolean(error);

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label
          htmlFor={selectId}
          className="text-xs font-medium text-text-dim uppercase tracking-wide"
        >
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={`
          w-full rounded-md border bg-bg-input text-text
          transition-all appearance-none cursor-pointer
          focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30
          ${hasError ? 'border-red' : 'border-border'}
          ${sizeClasses[selectSize]}
          ${className}
        `}
        aria-invalid={hasError || undefined}
        aria-describedby={error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && (
        <p id={`${selectId}-error`} className="text-xs text-red" role="alert">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={`${selectId}-hint`} className="text-xs text-text-faint">
          {hint}
        </p>
      )}
    </div>
  );
}

export default Select;
