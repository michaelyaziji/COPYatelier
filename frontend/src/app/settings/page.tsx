'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SignedIn, SignedOut, useUser } from '@clerk/nextjs';
import {
  Sparkles,
  User,
  Settings,
  Shield,
  Download,
  Trash2,
  ArrowLeft,
  Loader2,
  Check,
  Crown,
  Zap,
  CreditCard,
  History,
  Calendar,
  ExternalLink,
  RefreshCw,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { api, UserProfile, UserPreferences } from '@/lib/api';
import { Subscription, CreditBalance, CreditTransaction } from '@/types';
import { clsx } from 'clsx';

type TabId = 'profile' | 'subscription' | 'credits' | 'preferences' | 'account';

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'subscription', label: 'Subscription', icon: Crown },
  { id: 'credits', label: 'Credits', icon: Zap },
  { id: 'preferences', label: 'Preferences', icon: Settings },
  { id: 'account', label: 'Account', icon: Shield },
];

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Australia/Sydney',
];

const PROVIDERS = [
  { value: '', label: 'No default' },
  { value: 'anthropic', label: 'Anthropic (Claude)' },
  { value: 'google', label: 'Google (Gemini)' },
  { value: 'openai', label: 'OpenAI (GPT)' },
];

export default function SettingsPage() {
  const router = useRouter();
  const { user: clerkUser, isLoaded: clerkLoaded } = useUser();
  const [activeTab, setActiveTab] = useState<TabId>('profile');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form state
  const [displayName, setDisplayName] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [preferences, setPreferences] = useState<UserPreferences>({
    default_provider: null,
    default_model: null,
    default_max_rounds: 5,
    show_evaluation_details: true,
    theme: 'light',
  });

  // Subscription & Credits state
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Delete account state
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (clerkLoaded && clerkUser) {
      loadUserProfile();
    }
  }, [clerkLoaded, clerkUser]);

  const loadUserProfile = async () => {
    try {
      setLoading(true);
      setError(null);

      const [profile, subData, balanceData, historyData] = await Promise.all([
        api.getCurrentUser(),
        api.getSubscription(),
        api.getCreditsBalance(),
        api.getCreditsHistory({ limit: 50 }),
      ]);

      setUserProfile(profile);
      setDisplayName(profile.display_name || '');
      setTimezone(profile.profile.timezone);
      setPreferences(profile.profile.preferences);
      setSubscription(subData);
      setBalance(balanceData);
      setTransactions(historyData.transactions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    try {
      setSaving(true);
      setError(null);
      await api.updateProfile({
        display_name: displayName,
        timezone: timezone,
      });
      setSuccessMessage('Profile saved successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePreferences = async () => {
    try {
      setSaving(true);
      setError(null);
      await api.updatePreferences(preferences);
      setSuccessMessage('Preferences saved successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  const handleExportData = async () => {
    try {
      setSaving(true);
      setError(null);
      const data = await api.exportUserData();

      // Download as JSON file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `atelier-data-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setSuccessMessage('Data exported successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export data');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== 'DELETE') {
      setError('Please type DELETE to confirm');
      return;
    }

    try {
      setDeleting(true);
      setError(null);
      await api.deleteAccount('DELETE');

      // Sign out and redirect to home
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete account');
      setDeleting(false);
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
      await loadUserProfile();
      setSuccessMessage('Subscription will be canceled at the end of your billing period');
      setTimeout(() => setSuccessMessage(null), 3000);
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
      await loadUserProfile();
      setSuccessMessage('Subscription reactivated successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
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
      <header className="bg-white/80 backdrop-blur-md border-b border-zinc-200/50 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push('/')}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-violet-500 flex items-center justify-center shadow-lg shadow-violet-500/25">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-zinc-900">Settings</h1>
                  <p className="text-xs text-zinc-500">Manage your account</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <SignedOut>
        <div className="max-w-4xl mx-auto px-6 py-12">
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-zinc-600">Please sign in to access settings.</p>
            </CardContent>
          </Card>
        </div>
      </SignedOut>

      <SignedIn>
        <main className="max-w-4xl mx-auto px-6 py-8">
          {/* Success/Error Messages */}
          {successMessage && (
            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2">
              <Check className="h-5 w-5 text-emerald-600" />
              <span className="text-sm text-emerald-700">{successMessage}</span>
            </div>
          )}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <span className="text-sm text-red-700">{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Sidebar Tabs */}
            <div className="md:col-span-1">
              <nav className="space-y-1">
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={clsx(
                        'w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all',
                        activeTab === tab.id
                          ? 'bg-violet-100 text-violet-900 font-medium'
                          : 'text-zinc-600 hover:bg-zinc-100'
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      {tab.label}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Content */}
            <div className="md:col-span-3">
              {loading ? (
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {/* Profile Tab */}
                  {activeTab === 'profile' && (
                    <Card>
                      <CardHeader>
                        <CardTitle>Profile Settings</CardTitle>
                        <CardDescription>
                          Manage your display name and timezone
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        <div>
                          <label className="block text-sm font-medium text-zinc-700 mb-2">
                            Email
                          </label>
                          <input
                            type="email"
                            value={userProfile?.email || ''}
                            disabled
                            className="w-full px-4 py-2 rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-500"
                          />
                          <p className="text-xs text-zinc-500 mt-1">
                            Email is managed through your authentication provider
                          </p>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-zinc-700 mb-2">
                            Display Name
                          </label>
                          <input
                            type="text"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            placeholder="Your display name"
                            className="w-full px-4 py-2 rounded-lg border border-zinc-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-zinc-700 mb-2">
                            Timezone
                          </label>
                          <select
                            value={timezone}
                            onChange={(e) => setTimezone(e.target.value)}
                            className="w-full px-4 py-2 rounded-lg border border-zinc-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 outline-none"
                          >
                            {TIMEZONES.map((tz) => (
                              <option key={tz} value={tz}>
                                {tz}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="pt-4 border-t">
                          <Button onClick={handleSaveProfile} disabled={saving}>
                            {saving ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                Saving...
                              </>
                            ) : (
                              'Save Changes'
                            )}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Subscription Tab */}
                  {activeTab === 'subscription' && (
                    <div className="space-y-6">
                      {/* Current Plan Card */}
                      <Card className="overflow-hidden">
                        <div className={clsx(
                          'p-6',
                          subscription?.tier === 'pro' ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white' :
                          subscription?.tier === 'starter' ? 'bg-gradient-to-r from-violet-600 to-violet-700 text-white' :
                          'bg-gradient-to-r from-zinc-400 to-zinc-500 text-white'
                        )}>
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                              {subscription?.tier === 'pro' ? <Crown className="h-6 w-6" /> :
                               subscription?.tier === 'starter' ? <Zap className="h-6 w-6" /> :
                               <Sparkles className="h-6 w-6" />}
                            </div>
                            <div>
                              <h3 className="text-2xl font-bold capitalize">{subscription?.tier || 'Free'} Plan</h3>
                              <p className="text-white/80">
                                {subscription?.cancel_at_period_end ? 'Cancels at period end' :
                                 subscription?.status === 'active' ? 'Active' : subscription?.status || 'Active'}
                              </p>
                            </div>
                          </div>
                        </div>
                        <CardContent className="pt-6 space-y-4">
                          {subscription?.current_period_end && (
                            <div className="flex items-center gap-2 text-zinc-600">
                              <Calendar className="h-5 w-5 text-zinc-400" />
                              <span>
                                {subscription.cancel_at_period_end ? 'Access until' : 'Next billing'}:{' '}
                                <span className="font-medium text-zinc-900">
                                  {formatDate(subscription.current_period_end)}
                                </span>
                              </span>
                            </div>
                          )}

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
                                  Manage Payment
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
                                    Reactivate
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
                        </CardContent>
                      </Card>

                      {/* Credits Balance */}
                      {balance && (
                        <Card>
                          <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center">
                                  <Zap className="h-6 w-6 text-violet-600" />
                                </div>
                                <div>
                                  <p className="text-sm text-zinc-500">Available Credits</p>
                                  <p className="text-3xl font-bold text-zinc-900">{balance.balance}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-sm text-zinc-500">Monthly Allocation</p>
                                <p className="text-xl font-semibold text-zinc-700">{balance.tier_credits}</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  )}

                  {/* Credits Tab */}
                  {activeTab === 'credits' && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <History className="h-5 w-5" />
                          Credit History
                        </CardTitle>
                        <CardDescription>
                          All your credit transactions
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {transactions.length === 0 ? (
                          <div className="py-12 text-center text-zinc-500">
                            <History className="h-12 w-12 mx-auto mb-4 text-zinc-300" />
                            <p className="font-medium">No transactions yet</p>
                            <p className="text-sm mt-1">Your credit transactions will appear here</p>
                          </div>
                        ) : (
                          <div className="divide-y divide-zinc-100 -mx-6">
                            {transactions.map((tx) => (
                              <div key={tx.id} className="px-6 py-4 flex items-center justify-between hover:bg-zinc-50">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-lg bg-zinc-100 flex items-center justify-center">
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
                      </CardContent>
                    </Card>
                  )}

                  {/* Preferences Tab */}
                  {activeTab === 'preferences' && (
                    <Card>
                      <CardHeader>
                        <CardTitle>Preferences</CardTitle>
                        <CardDescription>
                          Customize your default settings for new sessions
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        <div>
                          <label className="block text-sm font-medium text-zinc-700 mb-2">
                            Default AI Provider
                          </label>
                          <select
                            value={preferences.default_provider || ''}
                            onChange={(e) =>
                              setPreferences({
                                ...preferences,
                                default_provider: e.target.value || null,
                              })
                            }
                            className="w-full px-4 py-2 rounded-lg border border-zinc-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 outline-none"
                          >
                            {PROVIDERS.map((p) => (
                              <option key={p.value} value={p.value}>
                                {p.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-zinc-700 mb-2">
                            Default Max Rounds
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={20}
                            value={preferences.default_max_rounds}
                            onChange={(e) =>
                              setPreferences({
                                ...preferences,
                                default_max_rounds: parseInt(e.target.value) || 5,
                              })
                            }
                            className="w-full px-4 py-2 rounded-lg border border-zinc-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 outline-none"
                          />
                          <p className="text-xs text-zinc-500 mt-1">
                            Maximum number of rounds for orchestration (1-20)
                          </p>
                        </div>

                        <div className="flex items-center justify-between">
                          <div>
                            <label className="block text-sm font-medium text-zinc-700">
                              Show Evaluation Details
                            </label>
                            <p className="text-xs text-zinc-500">
                              Display detailed evaluation scores in results
                            </p>
                          </div>
                          <button
                            onClick={() =>
                              setPreferences({
                                ...preferences,
                                show_evaluation_details: !preferences.show_evaluation_details,
                              })
                            }
                            className={clsx(
                              'relative w-12 h-6 rounded-full transition-colors',
                              preferences.show_evaluation_details
                                ? 'bg-violet-600'
                                : 'bg-zinc-300'
                            )}
                          >
                            <span
                              className={clsx(
                                'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
                                preferences.show_evaluation_details
                                  ? 'translate-x-7'
                                  : 'translate-x-1'
                              )}
                            />
                          </button>
                        </div>

                        <div className="pt-4 border-t">
                          <Button onClick={handleSavePreferences} disabled={saving}>
                            {saving ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                Saving...
                              </>
                            ) : (
                              'Save Preferences'
                            )}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Account Tab */}
                  {activeTab === 'account' && (
                    <div className="space-y-6">
                      {/* Export Data */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Download className="h-5 w-5" />
                            Export Your Data
                          </CardTitle>
                          <CardDescription>
                            Download all your data including sessions, documents, and settings
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <Button variant="outline" onClick={handleExportData} disabled={saving}>
                            {saving ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                Exporting...
                              </>
                            ) : (
                              <>
                                <Download className="h-4 w-4 mr-2" />
                                Export Data
                              </>
                            )}
                          </Button>
                        </CardContent>
                      </Card>

                      {/* Delete Account */}
                      <Card className="border-red-200">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2 text-red-600">
                            <Trash2 className="h-5 w-5" />
                            Delete Account
                          </CardTitle>
                          <CardDescription>
                            Permanently delete your account and all associated data
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="p-4 bg-red-50 rounded-lg">
                            <p className="text-sm text-red-700">
                              <strong>Warning:</strong> This action cannot be undone. All your
                              sessions, documents, and settings will be permanently deleted.
                            </p>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-zinc-700 mb-2">
                              Type <span className="font-mono text-red-600">DELETE</span> to confirm
                            </label>
                            <input
                              type="text"
                              value={deleteConfirmation}
                              onChange={(e) => setDeleteConfirmation(e.target.value)}
                              placeholder="DELETE"
                              className="w-full px-4 py-2 rounded-lg border border-red-200 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none"
                            />
                          </div>

                          <Button
                            variant="danger"
                            onClick={handleDeleteAccount}
                            disabled={deleteConfirmation !== 'DELETE' || deleting}
                          >
                            {deleting ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                Deleting...
                              </>
                            ) : (
                              <>
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete My Account
                              </>
                            )}
                          </Button>
                        </CardContent>
                      </Card>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </main>
      </SignedIn>
    </div>
  );
}
