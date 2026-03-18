// ============================================================
// Badge — Design System Primitive (SA-013)
// ============================================================

import React from 'react';

type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'error' | 'info' | 'purple';
type BadgeSize = 'sm' | 'md';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-bg-input text-text-dim border-border',
  secondary: 'bg-bg-card text-text-muted border-border/50',
  success: 'bg-green-dim text-green border-green/20',
  warning: 'bg-warm-dim text-warm border-warm/20',
  error: 'bg-red-dim text-red border-red/20',
  info: 'bg-accent-dim text-accent border-accent/20',
  purple: 'bg-purple-dim text-purple border-purple/20',
};

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'px-2.5 py-[3px] text-[11px]',
  md: 'px-2 py-0.5 text-xs',
};

export function Badge({
  variant = 'default',
  size = 'md',
  dot = false,
  className = '',
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 font-semibold rounded-lg border ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {dot && (
        <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
      )}
      {children}
    </span>
  );
}

export default Badge;
