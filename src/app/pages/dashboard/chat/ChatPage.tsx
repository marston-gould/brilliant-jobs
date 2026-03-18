// ============================================================
// ChatPage — Main Chat Page Container (SA-017)
// ============================================================

import { ChatMessages, ChatInput } from './components';
import { useChat } from './hooks/useChat';
import { Button } from '@app/components';

export function ChatPage() {
  const [state, actions] = useChat();

  if (state.loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-text-faint mt-2">Loading chat…</p>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <p className="text-sm text-red-500 font-semibold">Failed to load chat</p>
          <p className="text-xs text-text-faint mt-1">{state.error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-120px)]">
      {/* Mode toggle + clear */}
      <div className="flex items-center justify-between py-3">
        <div className="flex gap-1 p-[3px] rounded-lg bg-[var(--bg-hover)] w-fit">
          {(['filters', 'chat'] as const).map(mode => (
            <button
              key={mode}
              className={`px-3.5 py-1 text-[11px] font-semibold rounded-md transition-all border ${
                state.mode === mode ? 'bg-accent text-white border-accent' : 'bg-bg-card text-text-dim border-transparent hover:border-accent'
              }`}
              onClick={() => actions.setMode(mode)}
            >
              {mode === 'filters' ? 'Filter Mode' : 'Chat Mode'}
            </button>
          ))}
        </div>
        {state.messages.length > 0 && (
          <Button variant="ghost" size="sm" onClick={actions.clearChat}>
            Clear
          </Button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <ChatMessages messages={state.messages} streaming={state.streaming} />
      </div>

      {/* Input */}
      <ChatInput onSend={actions.sendMessage} disabled={state.streaming} />
    </div>
  );
}

export default ChatPage;
