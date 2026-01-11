'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Activity,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertTriangle,
  RefreshCw,
  X,
  Clock,
  Zap,
  User,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, AdminSession } from '@/lib/api';
import { clsx } from 'clsx';

export default function AdminSessionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [failedSessions, setFailedSessions] = useState<AdminSession[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [userId, setUserId] = useState(searchParams.get('user_id') || '');
  const [page, setPage] = useState(parseInt(searchParams.get('page') || '1'));
  const limit = 20;

  // Failed sessions panel
  const [showFailedPanel, setShowFailedPanel] = useState(searchParams.get('status') === 'failed');

  const fetchSessions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.listAdminSessions({
        limit,
        offset: (page - 1) * limit,
        status: status || undefined,
        user_id: userId || undefined,
      });
      setSessions(data.sessions);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setIsLoading(false);
    }
  }, [page, status, userId]);

  const fetchFailedSessions = async () => {
    try {
      const data = await api.getFailedSessions(7);
      setFailedSessions(data.sessions);
    } catch (err) {
      console.error('Failed to fetch failed sessions:', err);
    }
  };

  useEffect(() => {
    fetchSessions();
    fetchFailedSessions();
  }, [fetchSessions]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (userId) params.set('user_id', userId);
    if (page > 1) params.set('page', page.toString());
    const query = params.toString();
    router.replace(`/admin/sessions${query ? `?${query}` : ''}`, { scroll: false });
  }, [status, userId, page, router]);

  const handleFilterChange = (newStatus: string) => {
    setStatus(newStatus);
    setPage(1);
    setShowFailedPanel(newStatus === 'failed');
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
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

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Sessions</h1>
          <p className="text-zinc-500 mt-1">Monitor all orchestration sessions</p>
        </div>
        <Button onClick={() => { fetchSessions(); fetchFailedSessions(); }} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Failed Sessions Alert */}
      {failedSessions.length > 0 && !showFailedPanel && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <div>
                <p className="font-medium text-red-700">
                  {failedSessions.length} failed session{failedSessions.length > 1 ? 's' : ''} in the last 7 days
                </p>
                <p className="text-sm text-red-600">Review failed sessions to identify issues</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleFilterChange('failed')}
              className="border-red-200 text-red-600 hover:bg-red-100"
            >
              View Failed
            </Button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <select
            value={status}
            onChange={(e) => handleFilterChange(e.target.value)}
            className="px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            <option value="">All Status</option>
            <option value="draft">Draft</option>
            <option value="running">Running</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>

          <div className="flex-1 min-w-[200px]">
            <Input
              type="text"
              placeholder="Filter by User ID..."
              value={userId}
              onChange={(e) => { setUserId(e.target.value); setPage(1); }}
            />
          </div>

          {(status || userId) && (
            <Button
              variant="outline"
              onClick={() => {
                setStatus('');
                setUserId('');
                setPage(1);
                setShowFailedPanel(false);
              }}
            >
              <X className="h-4 w-4 mr-2" />
              Clear Filters
            </Button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="h-5 w-5" />
            {error}
          </div>
          <button onClick={() => setError(null)}>
            <X className="h-5 w-5 text-red-500" />
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-violet-600 mx-auto mb-4" />
            <p className="text-zinc-600">Loading sessions...</p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-8 text-center">
            <Activity className="h-12 w-12 text-zinc-300 mx-auto mb-4" />
            <p className="text-zinc-600">No sessions found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-zinc-50 border-b border-zinc-100">
                  <tr>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Session</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">User</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Status</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Round</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Credits</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {sessions.map((session) => (
                    <tr key={session.id} className="hover:bg-zinc-50">
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-zinc-900">{session.title}</p>
                          <p className="text-xs text-zinc-400 font-mono">{session.id.slice(0, 8)}...</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {session.user_email ? (
                          <Link
                            href={`/admin/users/${session.user_id}`}
                            className="flex items-center gap-2 text-sm text-zinc-600 hover:text-violet-600"
                          >
                            <User className="h-4 w-4" />
                            {session.user_email}
                          </Link>
                        ) : (
                          <span className="text-zinc-400 text-sm">Unknown</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {getStatusBadge(session.status)}
                        {session.termination_reason && session.status === 'failed' && (
                          <p className="text-xs text-red-500 mt-1 max-w-[200px] truncate">
                            {session.termination_reason}
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-zinc-600">
                        {session.current_round}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1 text-zinc-600">
                          <Zap className="h-4 w-4 text-amber-500" />
                          {session.credits_used}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-zinc-500 text-sm">
                        <div className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          {formatDate(session.created_at)}
                        </div>
                        {session.completed_at && (
                          <p className="text-xs text-zinc-400 mt-0.5">
                            Completed: {formatDate(session.completed_at)}
                          </p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-100">
                <p className="text-sm text-zinc-500">
                  Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, total)} of {total} sessions
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-zinc-600">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
