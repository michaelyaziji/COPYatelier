'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Users,
  Shield,
  ShieldOff,
  Zap,
  Calendar,
  CreditCard,
  Activity,
  Loader2,
  AlertTriangle,
  History,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, AdminUserDetails } from '@/lib/api';
import { clsx } from 'clsx';

export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;

  const [user, setUser] = useState<AdminUserDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Grant modal
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [grantAmount, setGrantAmount] = useState('');
  const [grantReason, setGrantReason] = useState('');

  const fetchUser = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getAdminUserDetails(userId);
      setUser(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load user');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
  }, [userId]);

  const handleToggleAdmin = async () => {
    if (!user) return;
    if (!confirm(`Are you sure you want to ${user.is_admin ? 'remove' : 'grant'} admin access?`)) {
      return;
    }

    setActionLoading('admin');
    try {
      await api.setAdminStatus(user.id, !user.is_admin);
      await fetchUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update admin status');
    } finally {
      setActionLoading(null);
    }
  };

  const handleGrantCredits = async () => {
    if (!user || !grantAmount || !grantReason.trim()) return;

    const amount = parseInt(grantAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setActionLoading('grant');
    try {
      await api.grantCredits(user.id, amount, grantReason.trim());
      setShowGrantModal(false);
      setGrantAmount('');
      setGrantReason('');
      await fetchUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to grant credits');
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

  // Helper to display user identity in a readable way
  const getUserDisplayInfo = (user: AdminUserDetails) => {
    // Check if email is a Clerk-generated fallback (e.g., user_xxx@clerk.user)
    const isClerkFallback = user.email.includes('@clerk.user');

    // If we have a display name, use it with email below
    if (user.display_name) {
      return {
        primary: user.display_name,
        secondary: isClerkFallback ? 'No email on file' : user.email,
      };
    }

    // No display name - show email as primary identifier
    if (isClerkFallback) {
      // Clerk fallback - no real email available
      const shortId = user.id.length > 12 ? `${user.id.slice(0, 8)}...` : user.id;
      return {
        primary: `User ${shortId}`,
        secondary: 'No email on file',
      };
    }

    // Real email without display name - show full email as primary
    return {
      primary: user.email,
      secondary: null,
    };
  };

  const getTierBadge = (tier: string) => {
    const styles: Record<string, string> = {
      free: 'bg-zinc-100 text-zinc-600',
      starter: 'bg-violet-100 text-violet-600',
      pro: 'bg-amber-100 text-amber-600',
    };
    return (
      <span className={clsx('px-2 py-1 rounded-full text-xs font-medium capitalize', styles[tier] || styles.free)}>
        {tier}
      </span>
    );
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: 'bg-zinc-100 text-zinc-600',
      running: 'bg-blue-100 text-blue-600',
      paused: 'bg-amber-100 text-amber-600',
      completed: 'bg-emerald-100 text-emerald-600',
      failed: 'bg-red-100 text-red-600',
    };
    return (
      <span className={clsx('px-2 py-0.5 rounded text-xs font-medium capitalize', styles[status] || styles.draft)}>
        {status}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-violet-600 mx-auto mb-4" />
          <p className="text-zinc-600">Loading user...</p>
        </div>
      </div>
    );
  }

  if (error && !user) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-4" />
          <p className="text-red-700 font-medium">{error}</p>
          <div className="flex items-center justify-center gap-3 mt-4">
            <Button onClick={() => router.back()} variant="outline">
              Go Back
            </Button>
            <Button onClick={fetchUser}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          {(() => {
            const displayInfo = getUserDisplayInfo(user);
            return (
              <>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-zinc-900">{displayInfo.primary}</h1>
                  {user.is_admin && (
                    <span className="flex items-center gap-1 px-2 py-1 bg-violet-100 text-violet-600 rounded-full text-xs font-medium">
                      <Shield className="h-3 w-3" />
                      Admin
                    </span>
                  )}
                </div>
                {displayInfo.secondary && (
                  <p className="text-zinc-500 mt-1">{displayInfo.secondary}</p>
                )}
              </>
            );
          })()}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowGrantModal(true)}>
            <Zap className="h-4 w-4 mr-2" />
            Grant Credits
          </Button>
          <Button
            variant="outline"
            onClick={handleToggleAdmin}
            disabled={actionLoading === 'admin'}
          >
            {actionLoading === 'admin' ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : user.is_admin ? (
              <ShieldOff className="h-4 w-4 mr-2 text-red-500" />
            ) : (
              <Shield className="h-4 w-4 mr-2" />
            )}
            {user.is_admin ? 'Remove Admin' : 'Make Admin'}
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* Info Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Subscription */}
        <div className="bg-white rounded-2xl border border-zinc-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="h-5 w-5 text-zinc-400" />
            <h2 className="text-lg font-semibold text-zinc-900">Subscription</h2>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-500">Tier</span>
              {getTierBadge(user.subscription.tier)}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-500">Status</span>
              <span className="text-sm font-medium text-zinc-900 capitalize">{user.subscription.status}</span>
            </div>
            {user.subscription.current_period_end && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-500">Period End</span>
                <span className="text-sm text-zinc-900">{formatDate(user.subscription.current_period_end)}</span>
              </div>
            )}
            {user.subscription.stripe_customer_id && (
              <div className="pt-3 border-t border-zinc-100">
                <p className="text-xs text-zinc-400 break-all">
                  Stripe: {user.subscription.stripe_customer_id}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Credits */}
        <div className="bg-white rounded-2xl border border-zinc-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="h-5 w-5 text-amber-500" />
            <h2 className="text-lg font-semibold text-zinc-900">Credits</h2>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-500">Balance</span>
              <span className="text-2xl font-bold text-zinc-900">{user.credits.balance}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-500">Lifetime Used</span>
              <span className="text-sm font-medium text-zinc-900">{user.credits.lifetime_used}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-500">Monthly Allocation</span>
              <span className="text-sm font-medium text-zinc-900">{user.credits.tier_credits}</span>
            </div>
          </div>
        </div>

        {/* Account Info */}
        <div className="bg-white rounded-2xl border border-zinc-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="h-5 w-5 text-zinc-400" />
            <h2 className="text-lg font-semibold text-zinc-900">Account</h2>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-500">Joined</span>
              <span className="text-sm text-zinc-900">{formatDate(user.created_at)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-500">User ID</span>
              <span className="text-xs text-zinc-400 font-mono break-all">{user.id}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Sessions */}
      <div className="bg-white rounded-2xl border border-zinc-200 mb-6">
        <div className="p-6 border-b border-zinc-100">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-zinc-400" />
            <h2 className="text-lg font-semibold text-zinc-900">Recent Sessions</h2>
          </div>
        </div>
        {user.recent_sessions.length === 0 ? (
          <div className="p-6 text-center text-zinc-500">
            <Activity className="h-8 w-8 mx-auto mb-2 text-zinc-300" />
            <p>No sessions yet</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {user.recent_sessions.map((session) => (
              <div key={session.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-zinc-900">{session.title}</p>
                  <p className="text-sm text-zinc-500">{formatDate(session.created_at)}</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-zinc-600">
                    {session.credits_used} credits
                  </span>
                  {getStatusBadge(session.status)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Transactions */}
      <div className="bg-white rounded-2xl border border-zinc-200">
        <div className="p-6 border-b border-zinc-100">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-zinc-400" />
            <h2 className="text-lg font-semibold text-zinc-900">Recent Transactions</h2>
          </div>
        </div>
        {user.recent_transactions.length === 0 ? (
          <div className="p-6 text-center text-zinc-500">
            <History className="h-8 w-8 mx-auto mb-2 text-zinc-300" />
            <p>No transactions yet</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {user.recent_transactions.map((tx) => (
              <div key={tx.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-zinc-900">
                    {tx.description || tx.type.replace(/_/g, ' ')}
                  </p>
                  <p className="text-sm text-zinc-500">{formatDate(tx.created_at)}</p>
                </div>
                <span className={clsx(
                  'font-semibold',
                  tx.amount > 0 ? 'text-emerald-600' : 'text-red-600'
                )}>
                  {tx.amount > 0 ? '+' : ''}{tx.amount} credits
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Grant Credits Modal */}
      {showGrantModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold text-zinc-900 mb-2">Grant Credits</h2>
            <p className="text-zinc-500 mb-6">
              Grant credits to <span className="font-medium text-zinc-700">{getUserDisplayInfo(user).primary}</span>
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Amount</label>
                <Input
                  type="number"
                  placeholder="100"
                  value={grantAmount}
                  onChange={(e) => setGrantAmount(e.target.value)}
                  min="1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Reason</label>
                <Input
                  type="text"
                  placeholder="Customer support compensation"
                  value={grantReason}
                  onChange={(e) => setGrantReason(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <Button
                variant="outline"
                onClick={() => {
                  setShowGrantModal(false);
                  setGrantAmount('');
                  setGrantReason('');
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleGrantCredits}
                disabled={!grantAmount || !grantReason.trim() || actionLoading === 'grant'}
              >
                {actionLoading === 'grant' ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Zap className="h-4 w-4 mr-2" />
                )}
                Grant Credits
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
