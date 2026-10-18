'use client';

import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { usePool } from '../context/PoolContext';

export default function ToastStack() {
  const { toasts, removeToast } = usePool();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 max-w-sm">
      {toasts.map((t) => {
        const isSuccess = t.type === 'success';
        const isError   = t.type === 'error';
        return (
          <div
            key={t.id}
            className="glass flex items-start gap-3 rounded-xl px-4 py-3 shadow-2xl animate-fade-up"
            style={{
              border: `1px solid ${isSuccess ? 'rgba(16,185,129,0.4)' : isError ? 'rgba(239,68,68,0.4)' : 'rgba(212,175,55,0.35)'}`,
            }}
          >
            {isSuccess && <CheckCircle className="shrink-0 mt-0.5" size={16} style={{ color: 'var(--emerald-glow)' }} />}
            {isError   && <AlertCircle className="shrink-0 mt-0.5" size={16} style={{ color: '#ef4444' }} />}
            {!isSuccess && !isError && <Info className="shrink-0 mt-0.5" size={16} style={{ color: 'var(--gold)' }} />}
            <p className="text-xs leading-relaxed flex-1" style={{ color: 'var(--ivory-dim)' }}>{t.msg}</p>
            <button
              onClick={() => removeToast(t.id)}
              className="shrink-0 rounded-full p-0.5 hover:bg-white/10 transition-colors"
              aria-label="Dismiss"
            >
              <X size={12} style={{ color: 'var(--ivory-dim)' }} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
