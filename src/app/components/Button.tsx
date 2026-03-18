// ============================================================
// Button — Design System Primitive (SA-013)
// ============================================================
// All buttons across the SPA must use this component.
// Variants: primary, secondary, ghost, danger
// Sizes: sm, md, lg
// Dark mode: automatic via CSS custom properties
// ============================================================

import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-white border-accent hover:opacity-90 active:opacity-80',
  secondary:
    'bg-bg-card text-text border-border hover:border-border-hover hover:text-text active:bg-bg-hover',
  ghost:
    'bg-transparent text-text-dim border-transparent hover:bg-bg-hover hover:text-text active:bg-bg-input',
  danger:
    'bg-red text-white border-red hover:opacity-90 active:opacity-80',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3.5 py-[7px] text-xs rounded-md gap-1.5',
  md: 'px-5 py-2.5 text-[13px] rounded-lg gap-2 font-semibold',
  lg: 'px-8 py-3.5 text-[15px] rounded-lg gap-2 font-semibold',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  fullWidth = false,
  disabled,
  className = '',
  children,
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center border font-medium transition-all cursor-pointer select-none';
  const disabledClass = disabled || loading ? 'opacity-50 cursor-not-allowed' : '';
  const widthClass = fullWidth ? 'w-full' : '';

  return (
    <button
      className={`${base} ${variantClasses[variant]} ${sizeClasses[size]} ${disabledClass} ${widthClass} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : icon ? (
        <span className="flex-shrink-0">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}

export default Button;
