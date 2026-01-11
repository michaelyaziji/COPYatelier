'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth, SignedIn, SignedOut, SignInButton } from '@clerk/nextjs';
import {
  Sparkles,
  ArrowLeft,
  CreditCard,
  Zap,
  Crown,
  Calendar,
  ExternalLink,
  AlertCircle,
  CheckCircle,
  Loader2,
  History,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { clsx } from 'clsx';
import { api } from '@/lib/api';
import { Subscription, CreditBalance, CreditTransaction } from '@/types';

export default function BillingPage() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { isSignedIn } = useAuth();
  const searchParams = useSearchParams();

  // Fetch data on mount, and sync if returning from Stripe checkout
  useEffect(() => {
    if (isSignedIn) {
      const sessionId = searchParams.get('session_id');
      const success = searchParams.get('success');

      if (sessionId && success === 'true') {
        // Returning from Stripe checkout - sync the subscription first
        api.syncSubscription(sessionId)
          .then(() => fetchData())
          .catch((err) => {
            setError(err instanceof Error ? err.message : 'Failed to sync subscription');
            fetchData(); // Still fetch data even if sync fails
          });
      } else {
        fetchData();
      }
    } else {
      setIsLoading(false);
    }
  }, [isSignedIn, searchParams]);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [subData, balanceData, historyData] = await Promise.all([
        api.getSubscription(),
        api.getCreditsBalance(),
        api.getCreditsHistory({ limit: 10 }),
      ]);

      setSubscription(subData);
      setBalance(balanceData);
      setTransactions(historyData.transactions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load billing data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenPortal = async () => {
    setActionLoading('portal');
    try {
      const response = await api.getBillingPortal();
      window.location.href = response.portal_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open billing portal');
      setActionLoading(null);
    }
  };

  const handleCancelSubscription = async () => {
    if (!confirm('Are you sure you want to cancel your subscription? You will lose access to premium features at the end of your billing period.')) {
      return;
    }

    setActionLoading('cancel');
    try {
      await api.cancelSubscription();
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel subscription');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReactivate = async () => {
    setActionLoading('reactivate');
    try {
      await api.reactivateSubscription();
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reactivate subscription');
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getTierIcon = (tier: string) => {
    switch (tier) {
      case 'starter':
        return <Zap className="h-5 w-5" />;
      case 'pro':
        return <Crown className="h-5 w-5" />;
      default:
        return <Sparkles className="h-5 w-5" />;
    }
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'starter':
        return 'from-violet-600 to-violet-700';
      case 'pro':
        return 'from-amber-500 to-amber-600';
      default:
        return 'from-zinc-400 to-zinc-500';
    }
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'usage':
        return <Zap className="h-4 w-4 text-red-500" />;
      case 'subscription_grant':
      case 'initial_grant':
        return <Plus className="h-4 w-4 text-emerald-500" />;
      case 'purchase':
        return <CreditCard className="h-4 w-4 text-violet-500" />;
      case 'refund':
        return <RefreshCw className="h-4 w-4 text-blue-500" />;
      default:
        return <History className="h-4 w-4 text-zinc-400" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-white">
      {/* Header */}
      <header className="border-b border-zinc-200/50 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3 group">
              <ArrowLeft className="h-4 w-4 text-zinc-400 group-hover:text-zinc-600 transition-colors" />
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-violet-500 flex items-center justify-center shadow-lg shadow-violet-500/25">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-zinc-900">Atelier</h1>
                <p className="text-xs text-zinc-500">Billing & Subscription</p>
              </div>
            </Link>

            <Link href="/pricing">
              <Button variant="outline">View Plans</Button>
            </Link>
          </div>
        </div>
      </header>

      <SignedOut>
        <div className="max-w-4xl mx-auto px-6 py-16 text-center">
          <h2 className="text-2xl font-bold text-zinc-900 mb-4">Sign in to view billing</h2>
          <p className="text-zinc-600 mb-8">You need to be signed in to manage your subscription and billing.</p>
          <SignInButton mode="modal">
            <Button size="lg">Sign In</Button>
          </SignInButton>
        </div>
      </SignedOut>

      <SignedIn>
        {/* Success Banner */}
        {searchParams.get('success') === 'true' && (
          <div className="bg-emerald-50 border-b border-emerald-200">
            <div className="max-w-4xl mx-auto px-6 py-3 flex items-center gap-2 text-emerald-700">
              <CheckCircle className="h-5 w-5" />
              Your subscription has been activated successfully!
            </div>
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="bg-red-50 border-b border-red-200">
            <div className="max-w-4xl mx-auto px-6 py-3 flex items-center gap-2 text-red-700">
              <AlertCircle className="h-5 w-5" />
              {error}
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="max-w-4xl mx-auto px-6 py-16 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-violet-600 mx-auto mb-4" />
            <p className="text-zinc-600">Loading billing information...</p>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
            {/* Subscription Card */}
            <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
              <div className={clsx(
                'bg-gradient-to-r text-white p-6',
                getTierColor(subscription?.tier || 'free')
              )}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                      {getTierIcon(subscription?.tier || 'free')}
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold capitalize">
                        {subscription?.tier || 'Free'} Plan
                      </h2>
                      <p className="text-white/80 text-sm">
                        {subscription?.status === 'active' ? 'Active' : subscription?.status || 'Active'}
                      </p>
                    </div>
                  </div>

                  {subscription?.cancel_at_period_end && (
                    <div className="bg-white/20 rounded-lg px-3 py-1.5">
                      <p className="text-sm font-medium">Cancels at period end</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Credits Balance */}
                {balance && (
                  <div className="flex items-center justify-between p-4 bg-zinc-50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center">
                        <Zap className="h-5 w-5 text-violet-600" />
                      </div>
                      <div>
                        <p className="text-sm text-zinc-500">Available Credits</p>
                        <p className="text-2xl font-bold text-zinc-900">{balance.balance}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-zinc-500">Monthly Allocation</p>
                      <p className="text-lg font-semibold text-zinc-700">{balance.tier_credits} credits</p>
                    </div>
                  </div>
                )}

                {/* Billing Period */}
                {subscription?.current_period_end && (
                  <div className="flex items-center gap-3 text-zinc-600">
                    <Calendar className="h-5 w-5 text-zinc-400" />
                    <span>
                      {subscription.cancel_at_period_end ? 'Access until' : 'Next billing date'}:{' '}
                      <span className="font-medium text-zinc-900">
                        {formatDate(subscription.current_period_end)}
                      </span>
                    </span>
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap gap-3 pt-4 border-t border-zinc-100">
                  {subscription?.tier !== 'free' && subscription?.stripe_customer_id && (
                    <>
                      <Button
                        variant="outline"
                        onClick={handleOpenPortal}
                        disabled={actionLoading !== null}
                      >
                        {actionLoading === 'portal' ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <ExternalLink className="h-4 w-4 mr-2" />
                        )}
                        Manage Payment Method
                      </Button>

                      {subscription.cancel_at_period_end ? (
                        <Button
                          onClick={handleReactivate}
                          disabled={actionLoading !== null}
                        >
                          {actionLoading === 'reactivate' ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <RefreshCw className="h-4 w-4 mr-2" />
                          )}
                          Reactivate Subscription
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={handleCancelSubscription}
                          disabled={actionLoading !== null}
                        >
                          {actionLoading === 'cancel' ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : null}
                          Cancel Subscription
                        </Button>
                      )}
                    </>
                  )}

                  <Link href="/pricing">
                    <Button variant={subscription?.tier === 'free' ? 'primary' : 'outline'}>
                      {subscription?.tier === 'free' ? 'Upgrade Plan' : 'Change Plan'}
                    </Button>
                  </Link>
                </div>
              </div>
            </div>

            {/* Transaction History */}
            <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm">
              <div className="p-6 border-b border-zinc-100">
                <h3 className="text-lg font-semibold text-zinc-900">Credit History</h3>
                <p className="text-sm text-zinc-500">Your recent credit transactions</p>
              </div>

              {transactions.length === 0 ? (
                <div className="p-6 text-center text-zinc-500">
                  <History className="h-8 w-8 mx-auto mb-2 text-zinc-300" />
                  <p>No transactions yet</p>
                </div>
              ) : (
                <div className="divide-y divide-zinc-100">
                  {transactions.map((tx) => (
                    <div key={tx.id} className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center">
                          {getTransactionIcon(tx.type)}
                        </div>
                        <div>
                          <p className="font-medium text-zinc-900">
                            {tx.description || tx.type.replace(/_/g, ' ')}
                          </p>
                          <p className="text-sm text-zinc-500">
                            {formatDate(tx.created_at)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={clsx(
                          'font-semibold',
                          tx.amount > 0 ? 'text-emerald-600' : 'text-red-600'
                        )}>
                          {tx.amount > 0 ? '+' : ''}{tx.amount} credits
                        </p>
                        <p className="text-sm text-zinc-500">
                          Balance: {tx.balance_after}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {transactions.length > 0 && (
                <div className="p-4 border-t border-zinc-100 text-center">
                  <Link href="/settings" className="text-sm text-violet-600 hover:text-violet-700 font-medium">
                    View full history in Settings
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </SignedIn>

      {/* Footer */}
      <footer className="border-t border-zinc-200 bg-white mt-auto">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-violet-500 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <span className="font-semibold text-zinc-900">Atelier</span>
            </div>
            <p className="text-sm text-zinc-500">
              &copy; {new Date().getFullYear()} Atelier. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
