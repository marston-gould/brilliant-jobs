// ============================================================
// GDriveSection — Google Drive integration panel (SA-017)
// ============================================================

import React from 'react';
import { Button, Card, Badge } from '@app/components';
import type { GDriveFile } from '../hooks/useIntegrations';

interface GDriveSectionProps {
  connected: boolean;
  files: GDriveFile[];
  onConnect: () => void;
  onDisconnect: () => void;
  onAddFile: () => void;
  onUnlink: (idx: number) => void;
  onImportAsResume: (idx: number) => void;
}

export function GDriveSection({
  connected, files, onConnect, onDisconnect, onAddFile, onUnlink, onImportAsResume,
}: GDriveSectionProps) {
  return (
    <Card variant="default" padding="lg">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-bg-elevated flex items-center justify-center">
            <svg className="w-5 h-5 text-text-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text">Google Drive</h3>
            <p className="text-xs text-text-faint">Store and sync resumes from Google Drive</p>
          </div>
        </div>
        <Badge variant={connected ? 'default' : 'secondary'}>
          {connected ? 'Connected' : 'Disconnected'}
        </Badge>
      </div>

      {!connected ? (
        <Button variant="primary" size="sm" onClick={onConnect}>
          Connect Google Drive
        </Button>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-4">
            <Button variant="secondary" size="sm" onClick={onAddFile}>
              Add File
            </Button>
            <Button variant="ghost" size="sm" onClick={onDisconnect}>
              Disconnect
            </Button>
          </div>

          {files.length === 0 ? (
            <p className="text-xs text-text-faint py-4 text-center">No files linked yet. Click "Add File" to link a Google Drive document.</p>
          ) : (
            <div className="space-y-2">
              {files.map((file, idx) => (
                <div key={file.id || idx} className="flex items-center justify-between py-2 px-3 bg-bg-elevated rounded-lg">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm text-text truncate">{file.name}</span>
                    <Badge variant="secondary">{file.mimeType?.split('/').pop() || 'file'}</Badge>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => onImportAsResume(idx)}>
                      Import
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onUnlink(idx)}>
                      Unlink
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
