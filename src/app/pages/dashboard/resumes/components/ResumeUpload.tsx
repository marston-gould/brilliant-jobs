// ============================================================
// ResumeUpload — File upload area for resumes (SA-016)
// ============================================================

import React, { useCallback, useRef, useState } from 'react';
import { Button, Card } from '@app/components';

interface ResumeUploadProps {
  onUpload: (file: File) => void;
}

const ACCEPTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
];

const ACCEPTED_EXTENSIONS = '.pdf,.docx,.doc,.txt';

export function ResumeUpload({ onUpload }: ResumeUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file && (ACCEPTED_TYPES.includes(file.type) || /\.(pdf|docx?|txt)$/i.test(file.name))) {
        onUpload(file);
      }
    }
  }, [onUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  return (
    <div
      className={`rounded-xl border-2 border-dashed py-10 px-5 text-center transition-colors ${
        isDragging ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/40'
      }`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      role="button"
      tabIndex={0}
      aria-label="Upload resume"
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
        aria-label="Choose resume file"
      />
      <p className="text-2xl mb-2" aria-hidden="true">📄</p>
      <p className="text-sm font-semibold text-text">
        {isDragging ? 'Drop files here' : 'Drop resume files here or click to browse'}
      </p>
      <p className="text-xs text-text-faint mt-1">PDF, DOCX, DOC, or TXT</p>
    </div>
  );
}
