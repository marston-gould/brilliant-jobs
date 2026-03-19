// ============================================================
// TagInput — Pill/Tag Input for Filter Builder
// ============================================================
// Converts typed text into visual pill/tag chips.
// Recognizes commas as separators, "OR" as alternative grouping.
// Backspace removes last pill. Click × removes any pill.
// Underlying value is comma-separated string for query compatibility.
// ============================================================

import { useState, useRef, useCallback, type KeyboardEvent } from 'react';

interface TagInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onKeyDown?: (e: KeyboardEvent) => void;
  'aria-label'?: string;
}

interface Tag {
  text: string;
  isOr: boolean; // true if this tag is an OR-alternative (prefixed with "or " in value)
}

function parseTags(raw: string): Tag[] {
  if (!raw.trim()) return [];
  return raw.split(',').map(s => s.trim()).filter(Boolean).map(t => ({
    text: t.replace(/^or\s+/i, ''),
    isOr: /^or\s+/i.test(t),
  }));
}

function tagsToString(tags: Tag[]): string {
  return tags.map(t => t.isOr ? `or ${t.text}` : t.text).join(', ');
}

export function TagInput({ value, onChange, placeholder, onKeyDown, 'aria-label': ariaLabel }: TagInputProps) {
  const [inputText, setInputText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const tags = parseTags(value);

  const addTag = useCallback((raw: string) => {
    const text = raw.trim();
    if (!text) return;
    const isOr = /^or\s+/i.test(text);
    const cleanText = text.replace(/^or\s+/i, '');
    if (!cleanText) return;
    const newTags = [...tags, { text: cleanText, isOr: isOr && tags.length > 0 }];
    onChange(tagsToString(newTags));
    setInputText('');
  }, [tags, onChange]);

  const removeTag = useCallback((idx: number) => {
    const newTags = tags.filter((_, i) => i !== idx);
    if (newTags.length > 0 && newTags[0]!.isOr) {
      newTags[0] = { text: newTags[0]!.text, isOr: false };
    }
    onChange(tagsToString(newTags));
  }, [tags, onChange]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(inputText);
    } else if (e.key === 'Backspace' && inputText === '' && tags.length > 0) {
      removeTag(tags.length - 1);
    } else if (e.key === 'Tab' && inputText.trim()) {
      e.preventDefault();
      addTag(inputText);
    }
    // Pass through Enter for search
    if (e.key === 'Enter' && !inputText.trim()) {
      onKeyDown?.(e);
    }
  }, [inputText, tags, addTag, removeTag, onKeyDown]);

  const handleBlur = useCallback(() => {
    if (inputText.trim()) addTag(inputText);
  }, [inputText, addTag]);

  return (
    <div
      className="flex flex-wrap items-center gap-1 w-full min-h-[40px] px-2 py-1.5 bg-bg-input border border-border rounded-lg text-[13px] text-text focus-within:border-accent transition-colors cursor-text"
      onClick={() => inputRef.current?.focus()}
    >
      {tags.map((tag, i) => (
        <span key={`${i}-${tag.text}`} className="inline-flex items-center gap-0.5">
          {tag.isOr && (
            <span className="text-[9px] font-bold text-accent uppercase mr-0.5">or</span>
          )}
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[12px] font-medium bg-accent/10 text-accent border border-accent/20">
            {tag.text}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeTag(i); }}
              className="text-accent/50 hover:text-accent ml-0.5 text-[14px] leading-none"
              aria-label={`Remove ${tag.text}`}
            >
              ×
            </button>
          </span>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        className="flex-1 min-w-[80px] bg-transparent border-none outline-none text-[13px] text-text placeholder:text-text-faint py-0.5"
        placeholder={tags.length === 0 ? placeholder : 'add more…'}
        value={inputText}
        onChange={e => setInputText(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        aria-label={ariaLabel}
      />
    </div>
  );
}

export default TagInput;
