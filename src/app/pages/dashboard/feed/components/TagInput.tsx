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
  /** Color scheme for pills — matches legacy qb-pill variants */
  colorScheme?: 'accent' | 'not' | 'location' | 'who' | 'when' | 'pay' | 'purple';
}

const PILL_COLORS: Record<string, { bg: string; text: string; border: string; remove: string; orText: string }> = {
  accent:   { bg: 'bg-[hsla(217,100%,62%,0.1)]', text: 'text-accent',       border: 'border-accent/20',                  remove: 'text-accent/50 hover:text-accent',         orText: 'text-[var(--purple)]' },
  not:      { bg: 'bg-[hsla(215,20%,65%,0.08)]',  text: 'text-text-faint',   border: 'border-[hsla(215,20%,65%,0.25)]',   remove: 'text-text-faint/50 hover:text-red',         orText: 'text-text-faint' },
  location: { bg: 'bg-[hsla(38,92%,50%,0.08)]',   text: 'text-[var(--warm)]', border: 'border-[hsla(38,92%,50%,0.2)]',    remove: 'text-[hsla(38,92%,50%,0.4)] hover:text-red', orText: 'text-[var(--warm)]' },
  who:      { bg: 'bg-[hsla(330,81%,60%,0.08)]',  text: 'text-[var(--pink)]', border: 'border-[hsla(330,81%,60%,0.2)]',   remove: 'text-[hsla(330,81%,60%,0.4)] hover:text-red', orText: 'text-[var(--pink)]' },
  when:     { bg: 'bg-[hsla(271,91%,65%,0.08)]',  text: 'text-[var(--purple)]', border: 'border-[hsla(271,91%,65%,0.2)]', remove: 'text-[hsla(271,91%,65%,0.4)] hover:text-red', orText: 'text-[var(--purple)]' },
  pay:      { bg: 'bg-[hsla(142,71%,45%,0.08)]',  text: 'text-[var(--green)]', border: 'border-[hsla(142,71%,45%,0.2)]', remove: 'text-[hsla(142,71%,45%,0.4)] hover:text-red', orText: 'text-[var(--green)]' },
  purple:   { bg: 'bg-[hsla(258,90%,66%,0.08)]',  text: 'text-[var(--purple)]', border: 'border-[hsla(258,90%,66%,0.2)]', remove: 'text-[hsla(258,90%,66%,0.4)] hover:text-red', orText: 'text-[var(--purple)]' },
};

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

export function TagInput({ value, onChange, placeholder, onKeyDown, 'aria-label': ariaLabel, colorScheme = 'accent' }: TagInputProps) {
  const [inputText, setInputText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const tags = parseTags(value);
  const c = (PILL_COLORS[colorScheme] ?? PILL_COLORS['accent'])!;

  const addTag = useCallback((raw: string) => {
    const text = raw.trim().toLowerCase();
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
            <span className={`text-[9px] font-bold uppercase mr-0.5 ${c.orText}`}>or</span>
          )}
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[12px] font-medium ${c.bg} ${c.text} border ${c.border}`}>
            {tag.text}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeTag(i); }}
              className={`ml-0.5 text-[14px] leading-none ${c.remove}`}
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
