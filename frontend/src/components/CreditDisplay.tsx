'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Coins, TrendingDown, AlertCircle, Plus } from 'lucide-react';
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

  // Calculate usage percentage
  const usagePercentage = balance.tier_credits > 0
    ? Math.min(100, ((balance.tier_credits - balance.balance) / balance.tier_credits) * 100)
    : 0;

  // Determine status color and show buy more when low
  const isLow = balance.balance < 5;
  const isWarning = balance.balance < 10;
  const showBuyMore = balance.balance < 15;

  return (
    <div className={clsx('flex items-center gap-2', className)}>
      <div
        className={clsx(
          'flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all',
          isLow
            ? 'bg-red-50 border-red-200 text-red-700'
            : isWarning
              ? 'bg-amber-50 border-amber-200 text-amber-700'
              : 'bg-violet-50 border-violet-200 text-violet-700',
        )}
        title={`${balance.balance} credits remaining (${balance.tier} tier)`}
      >
        {isLow ? (
          <AlertCircle className="h-4 w-4" />
        ) : isWarning ? (
          <TrendingDown className="h-4 w-4" />
        ) : (
          <Coins className="h-4 w-4" />
        )}

        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold">{balance.balance}</span>
          <span className="text-xs opacity-75">credits</span>
        </div>

        {/* Mini progress bar */}
        <div className="w-12 h-1.5 rounded-full bg-white/50 overflow-hidden">
          <div
            className={clsx(
              'h-full rounded-full transition-all',
              isLow
                ? 'bg-red-500'
                : isWarning
                  ? 'bg-amber-500'
                  : 'bg-violet-500'
            )}
            style={{ width: `${100 - usagePercentage}%` }}
          />
        </div>
      </div>

      {/* Buy More / Upgrade button when low */}
      {showBuyMore && (
        <Link
          href="/pricing"
          className={clsx(
            'flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all',
            isLow
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'bg-violet-600 text-white hover:bg-violet-700'
          )}
        >
          <Plus className="h-3 w-3" />
          {balance.tier === 'free' ? 'Upgrade' : 'Buy More'}
        </Link>
      )}
    </div>
  );
}
