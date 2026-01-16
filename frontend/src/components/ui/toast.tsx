'use client';

import { useEffect, useState } from 'react';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { clsx } from 'clsx';

interface ToastProps {
  message: string;
  type?: 'loading' | 'success' | 'error';
  isVisible: boolean;
  onDismiss?: () => void;
  duration?: number; // auto-dismiss after ms (0 = no auto-dismiss)
}

export function Toast({ message, type = 'loading', isVisible, onDismiss, duration = 0 }: ToastProps) {
  useEffect(() => {
    if (isVisible && duration > 0 && onDismiss) {
      const timer = setTimeout(onDismiss, duration);
      return () => clearTimeout(timer);
    }
  }, [isVisible, duration, onDismiss]);

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-200">
      <div
        className={clsx(
          'flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border',
          type === 'loading' && 'bg-white border-zinc-200 text-zinc-700',
          type === 'success' && 'bg-emerald-50 border-emerald-200 text-emerald-700',
          type === 'error' && 'bg-red-50 border-red-200 text-red-700'
        )}
      >
        {type === 'loading' && <Loader2 className="w-4 h-4 animate-spin text-violet-600" />}
        {type === 'success' && <CheckCircle className="w-4 h-4" />}
        {type === 'error' && <XCircle className="w-4 h-4" />}
        <span className="text-sm font-medium">{message}</span>
      </div>
    </div>
  );
}
