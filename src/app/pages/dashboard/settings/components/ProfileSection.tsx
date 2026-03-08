// ============================================================
// ProfileSection — User profile display (SA-017)
// ============================================================

import React from 'react';
import { Card } from '@app/components';
import type { ProfileData } from '../hooks/useSettings';

interface ProfileSectionProps {
  profile: ProfileData;
}

export function ProfileSection({ profile }: ProfileSectionProps) {
  const fields = [
    { label: 'Email', value: profile.email },
    { label: 'Name', value: profile.name },
    { label: 'Timezone', value: profile.timezone },
    { label: 'Phone', value: profile.phone || 'Not set' },
    { label: 'LinkedIn', value: profile.linkedIn || 'Not connected' },
    { label: 'Joined', value: profile.joinedAt ? new Date(profile.joinedAt).toLocaleDateString() : '—' },
  ];

  return (
    <Card variant="default" padding="lg">
      <h3 className="text-sm font-semibold text-text mb-4">Profile</h3>
      <div className="space-y-3">
        {fields.map(f => (
          <div key={f.label} className="flex justify-between text-xs">
            <span className="text-text-faint">{f.label}</span>
            <span className="text-text font-medium truncate ml-4">{f.value}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
