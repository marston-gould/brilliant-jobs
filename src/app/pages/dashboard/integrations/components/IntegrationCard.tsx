// ============================================================
// IntegrationCard — Generic integration status card (SA-017)
// ============================================================

import React from 'react';
import { Card, Badge } from '@app/components';

interface IntegrationCardProps {
  name: string;
  description: string;
  connected: boolean;
  icon: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}

export function IntegrationCard({ name, description, connected, icon, actionLabel, onAction }: IntegrationCardProps) {
  return (
    <Card variant="default" padding="lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-bg-elevated flex items-center justify-center">
            {icon}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text">{name}</h3>
            <p className="text-xs text-text-faint">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={connected ? 'default' : 'secondary'}>
            {connected ? 'Active' : 'Not Connected'}
          </Badge>
          {onAction && actionLabel && (
            <button
              className="text-xs text-accent hover:text-accent-hover transition-colors"
              onClick={onAction}
            >
              {actionLabel}
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}
