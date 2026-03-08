import React, { useState, useCallback } from 'react';
import { Button } from '@app/components';

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [text, setText] = useState('');

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  }, [text, onSend]);

  return (
    <div className="flex items-center gap-2 p-3 border-t border-border">
      <input
        className="flex-1 px-4 py-2 text-sm bg-bg-elevated border border-border rounded-lg text-text placeholder-text-faint focus:outline-none focus:border-accent"
        placeholder="Ask about jobs, filters, or career advice…"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
        disabled={disabled}
      />
      <Button variant="primary" size="sm" onClick={handleSubmit} disabled={disabled || !text.trim()}>
        Send
      </Button>
    </div>
  );
}
