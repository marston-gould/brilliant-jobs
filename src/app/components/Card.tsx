// ============================================================
// Card — Design System Primitive (SA-013)
// ============================================================
// Container component for grouped content. Uses design tokens
// for backgrounds, borders, and shadows. Dark mode automatic.
// ============================================================

import React from 'react';

type CardVariant = 'default' | 'elevated' | 'outline' | 'inset';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  as?: 'div' | 'section' | 'article';
}

const variantClasses: Record<CardVariant, string> = {
  default: 'bg-bg-card border border-border',
  elevated: 'bg-bg-card border border-border shadow-md',
  outline: 'bg-transparent border border-border',
  inset: 'bg-bg-input border border-border',
};

const paddingClasses: Record<string, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-6',
  lg: 'p-6',
};

export function Card({
  variant = 'default',
  padding = 'md',
  as: Component = 'div',
  className = '',
  children,
  ...props
}: CardProps) {
  return (
    <Component
      className={`rounded-xl ${variantClasses[variant]} ${paddingClasses[padding]} ${className}`}
      {...props}
    >
      {children}
    </Component>
  );
}

export default Card;
