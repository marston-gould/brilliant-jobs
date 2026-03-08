// ============================================================
// Input — Design System Primitive (SA-013)
// ============================================================

import React from 'react';

type InputSize = 'sm' | 'md' | 'lg';

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  inputSize?: InputSize;
  error?: string;
  label?: string;
  hint?: string;
  icon?: React.ReactNode;
}

const sizeClasses: Record<InputSize, string> = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-3 py-2 text-sm',
  lg: 'px-4 py-2.5 text-base',
};

export function Input({
  inputSize = 'md',
  error,
  label,
  hint,
  icon,
  className = '',
  id,
  ...props
}: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
  const hasError = Boolean(error);

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label
          htmlFor={inputId}
          className="text-xs font-medium text-text-dim uppercase tracking-wide"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint pointer-events-none">
            {icon}
          </span>
        )}
        <input
          id={inputId}
          className={`
            w-full rounded-md border bg-bg-input text-text
            placeholder:text-text-faint
            transition-all
            focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30
            ${hasError ? 'border-red' : 'border-border'}
            ${icon ? 'pl-9' : ''}
            ${sizeClasses[inputSize]}
            ${className}
          `}
          aria-invalid={hasError || undefined}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          {...props}
        />
      </div>
      {error && (
        <p id={`${inputId}-error`} className="text-xs text-red" role="alert">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={`${inputId}-hint`} className="text-xs text-text-faint">
          {hint}
        </p>
      )}
    </div>
  );
}

export default Input;
