import React, { useRef, useEffect } from 'react';
import type { ChatMessage } from '../hooks/useChat';

interface ChatMessagesProps {
  messages: ChatMessage[];
  streaming: boolean;
}

export function ChatMessages({ messages, streaming }: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-center">
        <div>
          <p className="text-sm text-text-faint mb-2">No messages yet</p>
          <p className="text-xs text-text-faint">Start a conversation to search with AI</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 py-4">
      {messages.map((msg, idx) => (
        <div
          key={idx}
          className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <div className={`max-w-prose px-4 py-3 rounded-2xl text-sm ${
            msg.role === 'user'
              ? 'bg-accent text-white rounded-br-md'
              : 'bg-bg-elevated text-text rounded-bl-md'
          }`}>
            <p className="whitespace-pre-wrap">{msg.content}</p>
          </div>
        </div>
      ))}
      {streaming && (
        <div className="flex justify-start">
          <div className="px-4 py-3 bg-bg-elevated rounded-2xl rounded-bl-md">
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-text-faint rounded-full animate-bounce" />
              <span className="w-2 h-2 bg-text-faint rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
              <span className="w-2 h-2 bg-text-faint rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
            </div>
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
