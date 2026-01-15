'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Coins, TrendingDown, AlertCircle } from 'lucide-react';
import { useCreditsStore } from '@/store/credits';
import { clsx } from 'clsx';

interface CreditDisplayProps {
  className?: string;
}

export function CreditDisplay({ className }: CreditDisplayProps) {
  const { balance, isLoading, fetchBalance } = useCreditsStore();

  // Fetch balance on mount
  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  if (isLoading && !balance) {
    return (
      <div className={clsx('flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-100 text-zinc-400', className)}>
        <div className="w-4 h-4 border-2 border-zinc-300 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-medium">Loading...</span>
      </div>
    );
  }

  if (!balance) {
    return null;
  }

  // Determine status color
  const isLow = balance.balance < 5;
  const isWarning = balance.balance < 10;

  return (
    <Link
      href="/pricing"
      className={clsx(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all hover:shadow-sm',
        isLow
          ? 'bg-red-50 border-red-200'
          : isWarning
            ? 'bg-amber-50 border-amber-200'
            : 'bg-violet-50 border-violet-200',
        className
      )}
      title="View pricing and credits"
    >
      {isLow ? (
        <AlertCircle className="h-3.5 w-3.5 text-red-500" />
      ) : isWarning ? (
        <TrendingDown className="h-3.5 w-3.5 text-amber-600" />
      ) : (
        <Coins className="h-3.5 w-3.5 text-violet-600" />
      )}
      <span className={clsx(
        'text-sm font-semibold',
        isLow
          ? 'text-red-700'
          : isWarning
            ? 'text-amber-700'
            : 'text-violet-700'
      )}>
        {balance.balance}
      </span>
      <span className={clsx(
        'text-xs',
        isLow
          ? 'text-red-600'
          : isWarning
            ? 'text-amber-600'
            : 'text-violet-600'
      )}>
        credits
      </span>
    </Link>
  );
}
