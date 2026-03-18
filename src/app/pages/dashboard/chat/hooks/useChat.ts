// ============================================================
// useChat — Chat data hook (SA-017 → SPA-PHASE-A rewrite)
// ============================================================
// Loads history from localStorage (provider-synced).
// sendMessage wired to callGateway('chat-job-search').
// No polling — chat updates only on user action.
// ============================================================

import { useCallback, useEffect, useReducer } from 'react';
import { safeReadLS, safeWriteLS, callGateway } from '@lib/supabase';

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
  | { type: 'ERROR'; error: string }
  | { type: 'ADD_MESSAGE'; message: ChatMessage }
  | { type: 'SET_STREAMING'; streaming: boolean };

const initialState: ChatState = {
  loading: false,
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
    case 'ADD_MESSAGE': return { ...state, messages: [...state.messages, action.message] };
    case 'SET_STREAMING': return { ...state, streaming: action.streaming };
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

  // Load chat history from localStorage on mount — no polling needed
  useEffect(() => {
    const history = safeReadLS<ChatMessage[]>('bj_chat_history', []);
    const storedMode = (localStorage.getItem('bj_search_mode') || 'filters') as 'filters' | 'chat';
    const filterOverride = safeReadLS<Record<string, any> | null>('bj__chatFilterOverride', null);
    dispatch({ type: 'LOADED', data: { messages: history, mode: storedMode, filterOverride } });
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;
    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: new Date().toISOString() };
    dispatch({ type: 'ADD_MESSAGE', message: userMsg });
    dispatch({ type: 'SET_STREAMING', streaming: true });

    try {
      const history = safeReadLS<ChatMessage[]>('bj_chat_history', []);
      history.push(userMsg);
      const sessionId = localStorage.getItem('bj_chat_session') || crypto.randomUUID();
      localStorage.setItem('bj_chat_session', sessionId);
      const mode = localStorage.getItem('bj_search_mode') || 'chat';
      const derivedFilters = JSON.parse(localStorage.getItem('bj_chat_derived_filters') || '{}');

      const result = await callGateway<{ reply: string; filters?: Record<string, any> }>('chat-job-search', {
        message: text,
        session_id: sessionId,
        mode,
        filters: derivedFilters,
        history: history.slice(-10).map((m) => ({ role: m.role, content: m.content })),
      }, { timeout: 30000 });

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: result?.reply || "Sorry, I couldn't process that.",
        timestamp: new Date().toISOString(),
      };
      history.push(assistantMsg);
      safeWriteLS('bj_chat_history', history);
      dispatch({ type: 'ADD_MESSAGE', message: assistantMsg });

      if (result?.filters) {
        const existing = JSON.parse(localStorage.getItem('bj_chat_derived_filters') || '{}');
        localStorage.setItem('bj_chat_derived_filters', JSON.stringify({ ...existing, ...result.filters, _appliedAt: Date.now() }));
      }
    } catch (e: any) {
      const errMsg: ChatMessage = {
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.',
        timestamp: new Date().toISOString(),
      };
      dispatch({ type: 'ADD_MESSAGE', message: errMsg });
    } finally {
      dispatch({ type: 'SET_STREAMING', streaming: false });
    }
  }, []);

  const setMode = useCallback((mode: 'filters' | 'chat') => {
    try { localStorage.setItem('bj_search_mode', mode); } catch { /* non-fatal */ }
    dispatch({ type: 'LOADED', data: { mode } });
  }, []);

  const applyFilters = useCallback((filters: Record<string, any>) => {
    try {
      const existing = JSON.parse(localStorage.getItem('bj_chat_derived_filters') || '{}');
      localStorage.setItem('bj_chat_derived_filters', JSON.stringify({ ...existing, ...filters, _appliedAt: Date.now() }));
    } catch { /* non-fatal */ }
  }, []);

  const clearChat = useCallback(() => {
    try {
      localStorage.removeItem('bj_chat_history');
      localStorage.removeItem('bj_chat_session');
      localStorage.removeItem('bj_chat_derived_filters');
    } catch { /* non-fatal */ }
    dispatch({ type: 'LOADED', data: { messages: [], filterOverride: null } });
  }, []);

  return [state, { sendMessage, setMode, applyFilters, clearChat }];
}
