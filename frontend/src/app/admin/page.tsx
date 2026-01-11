'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Users,
  Zap,
  DollarSign,
  Activity,
  AlertTriangle,
  TrendingUp,
  ArrowUpRight,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, AdminStats } from '@/lib/api';
import { clsx } from 'clsx';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  trend?: number;
  href?: string;
  variant?: 'default' | 'success' | 'warning' | 'danger';
}

function StatCard({ title, value, subtitle, icon: Icon, trend, href, variant = 'default' }: StatCardProps) {
  const variantStyles = {
    default: 'bg-zinc-100 text-zinc-600',
    success: 'bg-emerald-100 text-emerald-600',
    warning: 'bg-amber-100 text-amber-600',
    danger: 'bg-red-100 text-red-600',
  };

  const content = (
    <div className="bg-white rounded-2xl border border-zinc-200 p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className={clsx('w-12 h-12 rounded-xl flex items-center justify-center', variantStyles[variant])}>
          <Icon className="h-6 w-6" />
        </div>
        {trend !== undefined && (
          <div className={clsx(
            'flex items-center gap-1 text-sm font-medium',
            trend >= 0 ? 'text-emerald-600' : 'text-red-600'
          )}>
            <TrendingUp className={clsx('h-4 w-4', trend < 0 && 'rotate-180')} />
            {Math.abs(trend)}%
          </div>
        )}
        {href && (
          <ArrowUpRight className="h-5 w-5 text-zinc-400" />
        )}
      </div>
      <div className="mt-4">
        <p className="text-3xl font-bold text-zinc-900">{value}</p>
        <p className="text-sm text-zinc-500 mt-1">{title}</p>
        {subtitle && (
          <p className="text-xs text-zinc-400 mt-0.5">{subtitle}</p>
        )}
      </div>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getAdminStats();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stats');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-violet-600 mx-auto mb-4" />
          <p className="text-zinc-600">Loading dashboard...</p>
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
          <Button onClick={fetchStats} variant="outline" className="mt-4">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Dashboard</h1>
          <p className="text-zinc-500 mt-1">Overview of your platform metrics</p>
        </div>
        <Button onClick={fetchStats} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Total Users"
          value={stats.users.total}
          subtitle={`${stats.users.new_this_week} new this week`}
          icon={Users}
          href="/admin/users"
        />
        <StatCard
          title="Monthly Revenue"
          value={formatCurrency(stats.revenue.mrr)}
          subtitle="MRR"
          icon={DollarSign}
          variant="success"
          href="/admin/analytics"
        />
        <StatCard
          title="Sessions Today"
          value={stats.usage.sessions_today}
          subtitle={`${stats.usage.sessions_this_week} this week`}
          icon={Activity}
          href="/admin/sessions"
        />
        <StatCard
          title="Credits Used Today"
          value={stats.usage.credits_used_today.toLocaleString()}
          subtitle={`${stats.usage.credits_used_this_week.toLocaleString()} this week`}
          icon={Zap}
          href="/admin/transactions"
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Users by Tier */}
        <div className="bg-white rounded-2xl border border-zinc-200 p-6">
          <h3 className="text-lg font-semibold text-zinc-900 mb-4">Users by Tier</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-zinc-400" />
                <span className="text-sm text-zinc-600">Free</span>
              </div>
              <span className="font-semibold text-zinc-900">{stats.users.by_tier.free}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-violet-500" />
                <span className="text-sm text-zinc-600">Starter</span>
              </div>
              <span className="font-semibold text-zinc-900">{stats.users.by_tier.starter}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-amber-500" />
                <span className="text-sm text-zinc-600">Pro</span>
              </div>
              <span className="font-semibold text-zinc-900">{stats.users.by_tier.pro}</span>
            </div>
          </div>
        </div>

        {/* Revenue Breakdown */}
        <div className="bg-white rounded-2xl border border-zinc-200 p-6">
          <h3 className="text-lg font-semibold text-zinc-900 mb-4">Revenue Breakdown</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-600">Starter Plans</span>
              <span className="font-semibold text-zinc-900">{formatCurrency(stats.revenue.starter_mrr)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-600">Pro Plans</span>
              <span className="font-semibold text-zinc-900">{formatCurrency(stats.revenue.pro_mrr)}</span>
            </div>
            <div className="pt-4 border-t border-zinc-100">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-zinc-700">Total MRR</span>
                <span className="font-bold text-lg text-emerald-600">{formatCurrency(stats.revenue.mrr)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* System Health */}
        <div className="bg-white rounded-2xl border border-zinc-200 p-6">
          <h3 className="text-lg font-semibold text-zinc-900 mb-4">System Health</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-600">Active Sessions</span>
              <span className={clsx(
                'font-semibold',
                stats.health.active_sessions > 0 ? 'text-emerald-600' : 'text-zinc-900'
              )}>
                {stats.health.active_sessions}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-600">Failed (24h)</span>
              <span className={clsx(
                'font-semibold',
                stats.health.failed_sessions_24h > 0 ? 'text-red-600' : 'text-emerald-600'
              )}>
                {stats.health.failed_sessions_24h}
              </span>
            </div>
            {stats.health.failed_sessions_24h > 0 && (
              <Link
                href="/admin/sessions?status=failed"
                className="block pt-4 border-t border-zinc-100"
              >
                <div className="flex items-center gap-2 text-sm text-amber-600 hover:text-amber-700">
                  <AlertTriangle className="h-4 w-4" />
                  View failed sessions
                </div>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-6">
        <h3 className="text-lg font-semibold text-zinc-900 mb-4">Quick Actions</h3>
        <div className="flex flex-wrap gap-3">
          <Link href="/admin/users">
            <Button variant="outline">
              <Users className="h-4 w-4 mr-2" />
              Manage Users
            </Button>
          </Link>
          <Link href="/admin/analytics">
            <Button variant="outline">
              <Activity className="h-4 w-4 mr-2" />
              View Analytics
            </Button>
          </Link>
          <Link href="/admin/sessions?status=failed">
            <Button variant="outline">
              <AlertTriangle className="h-4 w-4 mr-2" />
              Failed Sessions
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
