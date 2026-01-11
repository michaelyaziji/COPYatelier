'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  CreditCard,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertTriangle,
  RefreshCw,
  X,
  Zap,
  Plus,
  User,
  History,
  Gift,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, AdminTransaction } from '@/lib/api';
import { clsx } from 'clsx';

export default function AdminTransactionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [transactions, setTransactions] = useState<AdminTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [type, setType] = useState(searchParams.get('type') || '');
  const [userId, setUserId] = useState(searchParams.get('user_id') || '');
  const [page, setPage] = useState(parseInt(searchParams.get('page') || '1'));
  const limit = 30;

  const fetchTransactions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.listAdminTransactions({
        limit,
        offset: (page - 1) * limit,
        transaction_type: type || undefined,
        user_id: userId || undefined,
      });
      setTransactions(data.transactions);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transactions');
    } finally {
      setIsLoading(false);
    }
  }, [page, type, userId]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    if (userId) params.set('user_id', userId);
    if (page > 1) params.set('page', page.toString());
    const query = params.toString();
    router.replace(`/admin/transactions${query ? `?${query}` : ''}`, { scroll: false });
  }, [type, userId, page, router]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getTransactionIcon = (txType: string) => {
    switch (txType) {
      case 'usage':
        return <Zap className="h-4 w-4 text-red-500" />;
      case 'subscription_grant':
      case 'initial_grant':
        return <Plus className="h-4 w-4 text-emerald-500" />;
      case 'purchase':
        return <CreditCard className="h-4 w-4 text-violet-500" />;
      case 'admin_grant':
        return <Gift className="h-4 w-4 text-blue-500" />;
      case 'refund':
        return <RefreshCw className="h-4 w-4 text-amber-500" />;
      default:
        return <History className="h-4 w-4 text-zinc-400" />;
    }
  };

  const getTransactionLabel = (txType: string) => {
    const labels: Record<string, string> = {
      usage: 'Usage',
      subscription_grant: 'Subscription Grant',
      initial_grant: 'Initial Grant',
      purchase: 'Purchase',
      admin_grant: 'Admin Grant',
      refund: 'Refund',
    };
    return labels[txType] || txType.replace(/_/g, ' ');
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Transactions</h1>
          <p className="text-zinc-500 mt-1">Credit transaction history</p>
        </div>
        <Button onClick={fetchTransactions} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <select
            value={type}
            onChange={(e) => { setType(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            <option value="">All Types</option>
            <option value="usage">Usage</option>
            <option value="subscription_grant">Subscription Grant</option>
            <option value="initial_grant">Initial Grant</option>
            <option value="purchase">Purchase</option>
            <option value="admin_grant">Admin Grant</option>
            <option value="refund">Refund</option>
          </select>

          <div className="flex-1 min-w-[200px]">
            <Input
              type="text"
              placeholder="Filter by User ID..."
              value={userId}
              onChange={(e) => { setUserId(e.target.value); setPage(1); }}
            />
          </div>

          {(type || userId) && (
            <Button
              variant="outline"
              onClick={() => {
                setType('');
                setUserId('');
                setPage(1);
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
            <p className="text-zinc-600">Loading transactions...</p>
          </div>
        ) : transactions.length === 0 ? (
          <div className="p-8 text-center">
            <CreditCard className="h-12 w-12 text-zinc-300 mx-auto mb-4" />
            <p className="text-zinc-600">No transactions found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-zinc-50 border-b border-zinc-100">
                  <tr>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Type</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">User</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Description</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Amount</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Balance After</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-zinc-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center">
                            {getTransactionIcon(tx.type)}
                          </div>
                          <span className="text-sm font-medium text-zinc-700 capitalize">
                            {getTransactionLabel(tx.type)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {tx.user_email ? (
                          <Link
                            href={`/admin/users/${tx.user_id}`}
                            className="flex items-center gap-2 text-sm text-zinc-600 hover:text-violet-600"
                          >
                            <User className="h-4 w-4" />
                            {tx.user_email}
                          </Link>
                        ) : (
                          <span className="text-zinc-400 text-sm">{tx.user_id.slice(0, 8)}...</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-zinc-600 max-w-[300px] truncate">
                          {tx.description || '-'}
                        </p>
                        {tx.session_id && (
                          <p className="text-xs text-zinc-400 font-mono mt-0.5">
                            Session: {tx.session_id.slice(0, 8)}...
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={clsx(
                          'font-semibold',
                          tx.amount > 0 ? 'text-emerald-600' : 'text-red-600'
                        )}>
                          {tx.amount > 0 ? '+' : ''}{tx.amount}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-zinc-600">
                        {tx.balance_after}
                      </td>
                      <td className="px-6 py-4 text-zinc-500 text-sm">
                        {formatDate(tx.created_at)}
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
                  Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, total)} of {total} transactions
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
