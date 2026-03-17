// ============================================================
// Toast Notification System — Shared Component
// ============================================================
// Phase D: Cross-cutting gap — legacy had 45 toast triggers.
// Provides ToastProvider context + useToast() hook.
// Renders slide-in toasts at bottom-right, auto-dismiss.
// ============================================================

import {
  createContext,
  useContext,
  useCallback,
  useState,
  useEffect,
  type ReactNode,
} from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

// ── Types ────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number; // ms, default 4000
}

interface ToastContextValue {
  toast: (t: Omit<Toast, 'id'>) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
  dismiss: (id: string) => void;
}

// ── Context ──────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}

// ── Provider ─────────────────────────────────────────────

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = `toast-${++nextId}`;
    setToasts(prev => [...prev.slice(-4), { ...t, id }]); // max 5 visible
    return id;
  }, []);

  const success = useCallback((title: string, message?: string) => addToast({ type: 'success', title, message }), [addToast]);
  const error = useCallback((title: string, message?: string) => addToast({ type: 'error', title, message, duration: 6000 }), [addToast]);
  const warning = useCallback((title: string, message?: string) => addToast({ type: 'warning', title, message }), [addToast]);
  const info = useCallback((title: string, message?: string) => addToast({ type: 'info', title, message }), [addToast]);

  const value: ToastContextValue = {
    toast: addToast,
    success,
    error,
    warning,
    info,
    dismiss,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Toast container — fixed bottom-right */}
      <div
        className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none"
        aria-live="polite"
        aria-label="Notifications"
      >
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ── Toast item ───────────────────────────────────────────

const ICONS: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const STYLES: Record<ToastType, { border: string; icon: string; bg: string }> = {
  success: { border: 'border-emerald-500/30', icon: 'text-emerald-500', bg: 'bg-emerald-500/5' },
  error: { border: 'border-red-500/30', icon: 'text-red-500', bg: 'bg-red-500/5' },
  warning: { border: 'border-amber-500/30', icon: 'text-amber-500', bg: 'bg-amber-500/5' },
  info: { border: 'border-blue-500/30', icon: 'text-blue-500', bg: 'bg-blue-500/5' },
};

function ToastItem({ toast: t, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Slide in
    requestAnimationFrame(() => setVisible(true));
    // Auto dismiss
    const timeout = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss(t.id), 200);
    }, t.duration || 4000);
    return () => clearTimeout(timeout);
  }, [t.id, t.duration, onDismiss]);

  const Icon = ICONS[t.type];
  const style = STYLES[t.type];

  return (
    <div
      className={`
        pointer-events-auto max-w-sm w-full
        rounded-lg border shadow-lg backdrop-blur-sm
        px-4 py-3 flex items-start gap-3
        transition-all duration-200
        ${style.border} ${style.bg}
        ${visible
          ? 'translate-x-0 opacity-100'
          : 'translate-x-8 opacity-0'
        }
      `}
      style={{ backgroundColor: 'var(--bg-surface, #fff)' }}
      role="alert"
    >
      <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${style.icon}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary">{t.title}</p>
        {t.message && <p className="text-xs text-text-secondary mt-0.5">{t.message}</p>}
      </div>
      <button
        onClick={() => { setVisible(false); setTimeout(() => onDismiss(t.id), 200); }}
        className="p-0.5 rounded hover:bg-black/5 text-text-faint hover:text-text-secondary transition-colors flex-shrink-0"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export default ToastProvider;
