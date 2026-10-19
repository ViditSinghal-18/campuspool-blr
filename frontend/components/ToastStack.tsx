'use client';

import { useEffect, useRef, useState } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { usePool } from '../context/PoolContext';

interface DisplayToast {
  id: string;
  type: 'success' | 'error' | 'info';
  msg: string;
}

export default function ToastStack() {
  const { toasts, removeToast, clusters } = usePool();
  const [displayToasts, setDisplayToasts] = useState<DisplayToast[]>([]);
  const lastSeenMapRef = useRef<Map<string, number>>(new Map());
  const processedIdsRef = useRef<Set<string>>(new Set());
  const counterRef = useRef<number>(0);

  useEffect(() => {
    if (!toasts || toasts.length === 0) {
      return;
    }

    const now = Date.now();
    // Count only clusters with riders.length >= 2, matching Active Pools list
    const activePoolCount = clusters.filter(
      (c) => c.riders && c.riders.length >= 2
    ).length;

    toasts.forEach((t) => {
      if (processedIdsRef.current.has(t.id)) return;
      processedIdsRef.current.add(t.id);

      // Normalize pool count in "Live: 15 commuters -> N pools" toast to match Active Pools list
      let formattedMsg = t.msg;
      if (/commuters\s*(?:→|->|--?>)\s*\d+\s*pools/i.test(formattedMsg)) {
        formattedMsg = formattedMsg.replace(
          /(commuters\s*(?:→|->|--?>)\s*)\d+(\s*pools)/i,
          `$1${activePoolCount}$2`
        );
      }

      // Ignore duplicate messages within 2 seconds
      const lastSeen = lastSeenMapRef.current.get(formattedMsg) || 0;
      if (now - lastSeen < 2000) {
        removeToast(t.id);
        return;
      }
      lastSeenMapRef.current.set(formattedMsg, now);

      // Assign a guaranteed unique ID
      const uniqueId = `toast-${++counterRef.current}-${now}-${Math.random()
        .toString(36)
        .slice(2, 7)}`;

      const newToast: DisplayToast = {
        id: uniqueId,
        type: t.type,
        msg: formattedMsg,
      };

      // Maximum 2 toasts visible at a time
      setDisplayToasts((prev) => [...prev, newToast].slice(-2));

      // Auto-dismiss after 3.5 seconds
      setTimeout(() => {
        setDisplayToasts((prev) => prev.filter((item) => item.id !== uniqueId));
        removeToast(t.id);
      }, 3500);
    });
  }, [toasts, clusters, removeToast]);

  if (displayToasts.length === 0) return null;

  return (
    // Render top-center just under the navbar (top-16) so it never covers bottom-right legend
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 max-w-md w-full px-4 pointer-events-none">
      {displayToasts.map((t) => {
        const isSuccess = t.type === 'success';
        const isError = t.type === 'error';
        return (
          <div
            key={t.id}
            className="pointer-events-auto flex items-start gap-3 rounded-xl px-4 py-3 shadow-2xl backdrop-blur-md bg-black/85 border animate-fade-up w-full"
            style={{
              borderColor: isSuccess
                ? 'rgba(16,185,129,0.45)'
                : isError
                ? 'rgba(239,68,68,0.45)'
                : 'rgba(212,175,55,0.4)',
            }}
          >
            {isSuccess && (
              <CheckCircle
                className="shrink-0 mt-0.5 text-emerald-400"
                size={16}
              />
            )}
            {isError && (
              <AlertCircle className="shrink-0 mt-0.5 text-rose-500" size={16} />
            )}
            {!isSuccess && !isError && (
              <Info className="shrink-0 mt-0.5 text-amber-400" size={16} />
            )}
            <p className="text-xs leading-relaxed flex-1 text-slate-200">
              {t.msg}
            </p>
            <button
              onClick={() => {
                setDisplayToasts((prev) =>
                  prev.filter((item) => item.id !== t.id)
                );
              }}
              className="shrink-0 rounded-full p-1 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
              aria-label="Dismiss"
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
