// ============================================================
// useChat — Chat data hook (SA-017)
// ============================================================
// Bridges to legacy chat.js via window.* globals.
// ============================================================

import { useCallback, useEffect, useReducer, useRef } from 'react';

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
      const bj = (window as any);
      const sessions = Array.isArray(bj._chatSessions) ? bj._chatSessions : [];
      const currentSession = sessions[sessions.length - 1];
      const messages: ChatMessage[] = currentSession?.messages || [];

      dispatch({
        type: 'LOADED',
        data: {
          messages,
          mode: bj._searchMode === 'chat' ? 'chat' : 'filters',
          streaming: !!bj._chatStreaming,
          filterOverride: bj._chatFilterOverride || null,
        },
      });
    } catch (e) {
      dispatch({ type: 'ERROR', error: String(e) });
    }
  }, []);

  useEffect(() => {
    try { const fn = (window as any).initChatMode; if (typeof fn === 'function') fn(); } catch {}
    loadData();
    pollRef.current = setInterval(loadData, 1000); // faster poll for chat
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadData]);

  const sendMessage = useCallback((text: string) => {
    try {
      const fn = (window as any)._sendChatMessage || (window as any).appendChatBubble;
      if (typeof fn === 'function') fn('user', text);
    } catch {}
  }, []);

  const setMode = useCallback((mode: 'filters' | 'chat') => {
    try { const fn = (window as any).setSearchMode; if (typeof fn === 'function') fn(mode); } catch {}
  }, []);

  const applyFilters = useCallback((filters: Record<string, any>) => {
    try { const fn = (window as any).applyChatFilters; if (typeof fn === 'function') fn(filters); } catch {}
  }, []);

  const clearChat = useCallback(() => {
    try { const fn = (window as any)._clearChatSession; if (typeof fn === 'function') fn(); } catch {}
  }, []);

  return [state, { sendMessage, setMode, applyFilters, clearChat }];
}
