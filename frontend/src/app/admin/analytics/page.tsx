'use client';

import { useState, useEffect } from 'react';
import {
  BarChart3,
  DollarSign,
  Activity,
  TrendingUp,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Users,
  Zap,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, RevenueAnalytics, UsageAnalytics } from '@/lib/api';
import { clsx } from 'clsx';

export default function AdminAnalyticsPage() {
  const [period, setPeriod] = useState<'week' | 'month' | 'year'>('month');
  const [revenue, setRevenue] = useState<RevenueAnalytics | null>(null);
  const [usage, setUsage] = useState<UsageAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [revenueData, usageData] = await Promise.all([
        api.getRevenueAnalytics(period),
        api.getUsageAnalytics(period),
      ]);
      setRevenue(revenueData);
      setUsage(usageData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [period]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercent = (value: number) => {
    return `${(value * 100).toFixed(1)}%`;
  };

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-violet-600 mx-auto mb-4" />
          <p className="text-zinc-600">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-4" />
          <p className="text-red-700 font-medium">{error}</p>
          <Button onClick={fetchAnalytics} variant="outline" className="mt-4">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Analytics</h1>
          <p className="text-zinc-500 mt-1">Revenue and usage metrics</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-zinc-100 rounded-lg p-1">
            {(['week', 'month', 'year'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={clsx(
                  'px-4 py-2 rounded-md text-sm font-medium transition-colors capitalize',
                  period === p
                    ? 'bg-white text-zinc-900 shadow-sm'
                    : 'text-zinc-600 hover:text-zinc-900'
                )}
              >
                {p}
              </button>
            ))}
          </div>
          <Button onClick={fetchAnalytics} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Revenue Section */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-zinc-900 mb-4 flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-emerald-500" />
          Revenue
        </h2>

        {revenue && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white rounded-2xl border border-zinc-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                  <DollarSign className="h-6 w-6 text-emerald-600" />
                </div>
                <TrendingUp className="h-5 w-5 text-emerald-500" />
              </div>
              <p className="text-3xl font-bold text-zinc-900">{formatCurrency(revenue.total_mrr)}</p>
              <p className="text-sm text-zinc-500 mt-1">Monthly Recurring Revenue</p>
            </div>

            <div className="bg-white rounded-2xl border border-zinc-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center">
                  <Users className="h-6 w-6 text-violet-600" />
                </div>
              </div>
              <p className="text-3xl font-bold text-zinc-900">
                {revenue.tier_breakdown.starter?.subscribers || 0}
              </p>
              <p className="text-sm text-zinc-500 mt-1">
                Starter subscribers ({formatCurrency(revenue.tier_breakdown.starter?.mrr || 0)})
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-zinc-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
                  <Users className="h-6 w-6 text-amber-600" />
                </div>
              </div>
              <p className="text-3xl font-bold text-zinc-900">
                {revenue.tier_breakdown.pro?.subscribers || 0}
              </p>
              <p className="text-sm text-zinc-500 mt-1">
                Pro subscribers ({formatCurrency(revenue.tier_breakdown.pro?.mrr || 0)})
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-zinc-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                  <Zap className="h-6 w-6 text-blue-600" />
                </div>
              </div>
              <p className="text-3xl font-bold text-zinc-900">{revenue.credit_purchases_in_period}</p>
              <p className="text-sm text-zinc-500 mt-1">Credit purchases this {period}</p>
            </div>
          </div>
        )}
      </div>

      {/* Usage Section */}
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 mb-4 flex items-center gap-2">
          <Activity className="h-5 w-5 text-blue-500" />
          Usage
        </h2>

        {usage && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-2xl border border-zinc-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                  <Activity className="h-6 w-6 text-blue-600" />
                </div>
              </div>
              <p className="text-3xl font-bold text-zinc-900">{usage.total_sessions}</p>
              <p className="text-sm text-zinc-500 mt-1">Total sessions this {period}</p>
            </div>

            <div className="bg-white rounded-2xl border border-zinc-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                  <CheckCircle className="h-6 w-6 text-emerald-600" />
                </div>
              </div>
              <p className="text-3xl font-bold text-zinc-900">{formatPercent(usage.success_rate)}</p>
              <p className="text-sm text-zinc-500 mt-1">
                Success rate ({usage.completed_sessions} completed)
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-zinc-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center">
                  <XCircle className="h-6 w-6 text-red-600" />
                </div>
              </div>
              <p className="text-3xl font-bold text-zinc-900">{usage.failed_sessions}</p>
              <p className="text-sm text-zinc-500 mt-1">Failed sessions this {period}</p>
            </div>

            <div className="bg-white rounded-2xl border border-zinc-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
                  <Zap className="h-6 w-6 text-amber-600" />
                </div>
              </div>
              <p className="text-3xl font-bold text-zinc-900">{usage.credits_used.toLocaleString()}</p>
              <p className="text-sm text-zinc-500 mt-1">Credits used this {period}</p>
            </div>
          </div>
        )}

        {/* Additional metrics */}
        {usage && (
          <div className="bg-white rounded-2xl border border-zinc-200 p-6">
            <h3 className="text-lg font-semibold text-zinc-900 mb-4">Averages</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-zinc-100 flex items-center justify-center">
                  <BarChart3 className="h-6 w-6 text-zinc-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-zinc-900">
                    {usage.avg_credits_per_session.toFixed(1)}
                  </p>
                  <p className="text-sm text-zinc-500">Avg credits per session</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-zinc-100 flex items-center justify-center">
                  <Activity className="h-6 w-6 text-zinc-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-zinc-900">
                    {usage.total_sessions > 0
                      ? (usage.credits_used / usage.total_sessions).toFixed(0)
                      : '0'}
                  </p>
                  <p className="text-sm text-zinc-500">Credits per session (avg)</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-zinc-100 flex items-center justify-center">
                  <TrendingUp className="h-6 w-6 text-zinc-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-zinc-900">
                    {period === 'week' ? (usage.total_sessions / 7).toFixed(1) :
                     period === 'month' ? (usage.total_sessions / 30).toFixed(1) :
                     (usage.total_sessions / 365).toFixed(1)}
                  </p>
                  <p className="text-sm text-zinc-500">Sessions per day (avg)</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
