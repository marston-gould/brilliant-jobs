// ============================================================
// ChatPanel — Inline Chat for Feed Page (Phase D)
// ============================================================
// Replaces the placeholder chat panel in FeedPage.
// Wired to SupabaseChatProvider.sendMessage which calls
// the chat-job-search edge function via callGateway.
// ============================================================

import { useState, useCallback, useRef, useEffect } from 'react';
import { Send, Loader2, Trash2, MessageSquare } from 'lucide-react';
import { useChatProvider } from '@providers';
import type { ChatMessage } from '@providers/types';

export function ChatPanel() {
  const chatProvider = useChatProvider();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load history on mount
  useEffect(() => {
    chatProvider.getHistory().then(setMessages).catch(() => setMessages([]));
  }, [chatProvider]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput('');

    // Optimistic UI: show user message immediately
    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const reply = await chatProvider.sendMessage(text);
      // Provider already persists to localStorage; just update local state
      setMessages(prev => [...prev, reply]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.',
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, chatProvider]);

  const handleClear = useCallback(async () => {
    await chatProvider.clearSession();
    setMessages([]);
  }, [chatProvider]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  return (
    <div className="border border-border-subtle rounded-lg overflow-hidden bg-bg-surface flex flex-col" style={{ height: '400px' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-subtle bg-bg-main/50">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-accent" />
          <span className="text-sm font-medium text-text-primary">Chat Search</span>
        </div>
        {messages.length > 0 && (
          <button
            onClick={handleClear}
            className="p-1 rounded hover:bg-bg-surface text-text-faint hover:text-text-secondary transition-colors"
            aria-label="Clear chat"
            title="Clear conversation"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && !loading && (
          <div className="text-center py-8">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 text-text-faint opacity-40" />
            <p className="text-sm font-medium text-text-secondary mb-1">Describe your ideal role</p>
            <p className="text-xs text-text-faint max-w-xs mx-auto">
              Try: &ldquo;Senior product manager roles in Austin, TX paying over $150K&rdquo;
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] px-3 py-2 rounded-xl text-sm leading-relaxed
              ${msg.role === 'user'
                ? 'bg-accent text-white rounded-br-sm'
                : 'bg-bg-main border border-border-subtle text-text-primary rounded-bl-sm'
              }
            `}>
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-bg-main border border-border-subtle px-3 py-2 rounded-xl rounded-bl-sm">
              <Loader2 className="w-4 h-4 animate-spin text-text-faint" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border-subtle">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about jobs..."
            className="flex-1 px-3 py-2 rounded-lg border border-border-subtle bg-bg-main text-sm text-text-primary placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-accent/40"
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="px-3 py-2 rounded-lg bg-accent text-white disabled:opacity-50 hover:bg-accent/90 transition-colors"
            aria-label="Send message"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default ChatPanel;
