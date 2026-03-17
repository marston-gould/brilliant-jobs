// ============================================================
// SavedSearches — Saved Filter List (SA-014)
// ============================================================
// Collapsible panel showing user's saved search filters.
// Check/uncheck to combine filters, search to find them,
// bulk select/delete actions.
//
// Bridge: reads from legacy window.savedFilters during migration.
// ============================================================

import { useState, useCallback, useMemo } from 'react';

interface SavedSearchItem {
  id: string;
  name: string;
  color: string;
  checked: boolean;
  filterNum?: string;
}

interface SavedSearchesProps {
  items: SavedSearchItem[];
  onToggle: (id: string) => void;
  onDelete: (ids: string[]) => void;
  onSelectAll: (checked: boolean) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function SavedSearches({
  items,
  onToggle,
  onDelete,
  onSelectAll,
  collapsed = false,
  onToggleCollapse,
}: SavedSearchesProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedForDelete, setSelectedForDelete] = useState<Set<string>>(new Set());

  const checkedCount = items.filter(i => i.checked).length;

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(i => i.name.toLowerCase().includes(q));
  }, [items, searchQuery]);

  const _toggleDeleteSelect = useCallback((id: string) => {
    setSelectedForDelete(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleDeleteSelected = useCallback(() => {
    if (selectedForDelete.size === 0) return;
    onDelete(Array.from(selectedForDelete));
    setSelectedForDelete(new Set());
  }, [selectedForDelete, onDelete]);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <button
        type="button"
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-bg-hover/50 transition-colors"
        onClick={onToggleCollapse}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width={14}
          height={14}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className={`text-text-faint transition-transform ${collapsed ? '' : 'rotate-180'}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
        <span className="text-xs font-semibold text-text-dim">Saved Searches</span>
        {checkedCount > 0 && (
          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-accent/10 text-accent">
            {checkedCount}
          </span>
        )}
      </button>

      {/* Body */}
      {!collapsed && items.length > 0 && (
        <div className="px-3 pb-3">
          {/* Controls row */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={checkedCount === items.length && items.length > 0}
                onChange={(e) => onSelectAll(e.target.checked)}
                className="cursor-pointer"
                title="Select / Deselect All"
              />
              <span className="text-[10px] text-text-faint">Select / Deselect All</span>
            </div>
            <div className="flex items-center gap-2">
              {selectedForDelete.size > 0 && (
                <button
                  type="button"
                  className="px-2.5 py-0.5 text-[10px] rounded bg-red-400/10 text-red-400 hover:bg-red-400/20 transition-colors"
                  onClick={handleDeleteSelected}
                >
                  Delete Selected
                </button>
              )}
              <input
                type="text"
                className="w-[120px] px-2 py-0.5 text-[10px] bg-bg-input border border-border rounded text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
                placeholder="Search…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Filter list */}
          <div className="space-y-0.5 max-h-[200px] overflow-y-auto">
            {filteredItems.map(item => (
              <label
                key={item.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-bg-hover cursor-pointer group"
              >
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={() => onToggle(item.id)}
                  className="cursor-pointer"
                />
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-xs text-text-dim flex-1 truncate">{item.name}</span>
                {item.filterNum && (
                  <span
                    className="text-[9px] font-bold text-white px-1 rounded"
                    style={{ backgroundColor: item.color }}
                  >
                    {item.filterNum}
                  </span>
                )}
              </label>
            ))}
          </div>

          {filteredItems.length === 0 && (
            <p className="text-[10px] text-text-faint text-center py-2">
              {searchQuery ? 'No matching searches' : 'No saved searches yet'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default SavedSearches;
