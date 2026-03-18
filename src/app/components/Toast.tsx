// ============================================================
// Toast — Slide-in notification system (legacy had 45 triggers)
// ============================================================
import { useState, useEffect, useCallback, createContext, useContext } from 'react';

interface ToastMessage {
  id: string;
  text: string;
  type: 'success' | 'error' | 'info';
  duration?: number;
}

interface ToastContextValue {
  toast: (text: string, type?: 'success' | 'error' | 'info', duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() { return useContext(ToastContext); }

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  const toast = useCallback((text: string, type: 'success' | 'error' | 'info' = 'info', duration = 3000) => {
    const id = crypto.randomUUID();
    setMessages(prev => [...prev, { id, text, type, duration }]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setMessages(prev => prev.filter(m => m.id !== id));
  }, []);

  useEffect(() => {
    if (messages.length === 0) return;
    const oldest = messages[0];
    if (!oldest) return;
    const timer = setTimeout(() => dismiss(oldest.id), oldest.duration || 3000);
    return () => clearTimeout(timer);
  }, [messages, dismiss]);

  // Expose globally for non-React code
  useEffect(() => {
    (window as any).__bjToast = toast;
  }, [toast]);

  const colors = { success: 'bg-green text-white', error: 'bg-red text-white', info: 'bg-accent text-white' };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none" style={{ maxWidth: 360 }}>
        {messages.map(m => (
          <div key={m.id}
            className={`pointer-events-auto px-4 py-2.5 rounded-lg shadow-lg text-[13px] font-medium animate-[slideIn_0.2s_ease] ${colors[m.type]}`}
            onClick={() => dismiss(m.id)}
            style={{ cursor: 'pointer' }}>
            {m.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
