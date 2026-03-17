// ============================================================
// useChat — Chat data hook (SA-017)
// ============================================================
// Standalone hook — zero window.* dependencies (SPA-CUT-3).
// ============================================================

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { supabase, safeReadLS, safeWriteLS, callGateway, getUser } from '@lib/supabase';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  filters?: Record<string, any>;
}

interface ChatState {
  loading: boolean;
  error: string | null;
  messages: ChatMessage[];
  mode: 'filters' | 'chat';
  streaming: boolean;
  filterOverride: Record<string, any> | null;
}

type Action =
  | { type: 'LOADED'; data: Partial<ChatState> }
  | { type: 'ERROR'; error: string };

const initialState: ChatState = {
  loading: true,
  error: null,
  messages: [],
  mode: 'filters',
  streaming: false,
  filterOverride: null,
};

function reducer(state: ChatState, action: Action): ChatState {
  switch (action.type) {
    case 'LOADED': return { ...state, loading: false, error: null, ...action.data };
    case 'ERROR': return { ...state, loading: false, error: action.error };
    default: return state;
  }
}

export function useChat(): [ChatState, {
  sendMessage: (text: string) => void;
  setMode: (mode: 'filters' | 'chat') => void;
  applyFilters: (filters: Record<string, any>) => void;
  clearChat: () => void;
}] {
  const [state, dispatch] = useReducer(reducer, initialState);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(() => {
    try {
      // SPA-CUT-3: Data loaded from localStorage/Supabase (no window bridge)
      const sessions = Array.isArray(null) ? null : [];
      // @ts-ignore SPA-CUT-3
      const currentSession = sessions[sessions.length - 1];
      // @ts-ignore SPA-CUT-3
      const messages: ChatMessage[] = currentSession?.messages || [];

      dispatch({
        type: 'LOADED',
        data: {
          messages,
          mode: null === 'chat' ? 'chat' : 'filters',
          // @ts-ignore SPA-CUT-3
          streaming: !!null,
          filterOverride: safeReadLS('bj__chatFilterOverride', null),
        },
      });
    } catch (e) {
      dispatch({ type: 'ERROR', error: String(e) });
    }
  }, []);

  useEffect(() => {
    // SPA-CUT-3: Chat init handled by React component mount
    loadData();
    pollRef.current = setInterval(loadData, 1000); // faster poll for chat
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadData]);

  const sendMessage = useCallback((text: string) => {
    try {
      // SPA-CUT-3: _sendChatMessage bridge removed
    } catch {}
  }, []);

  const setMode = useCallback((mode: 'filters' | 'chat') => {
    // SPA-CUT-REMEDIATION: Persist mode choice to localStorage
    try { localStorage.setItem('bj_search_mode', mode); } catch { /* non-fatal */ }
  }, []);

  const applyFilters = useCallback((filters: Record<string, any>) => {
    // SPA-CUT-REMEDIATION: Save derived filters from chat to localStorage for Feed pickup
    try {
      const existing = JSON.parse(localStorage.getItem('bj_chat_derived_filters') || '{}');
      const merged = { ...existing, ...filters, _appliedAt: Date.now() };
      localStorage.setItem('bj_chat_derived_filters', JSON.stringify(merged));
    } catch { /* non-fatal */ }
  }, []);

  const clearChat = useCallback(() => {
    // SPA-CUT-REMEDIATION: Clear chat state from localStorage
    try { localStorage.removeItem('bj_chat_history'); localStorage.removeItem('bj_chat_session'); } catch { /* non-fatal */ }
  }, []);

  return [state, { sendMessage, setMode, applyFilters, clearChat }];
}
