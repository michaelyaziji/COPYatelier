'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Search,
  Users,
  Shield,
  ShieldOff,
  Zap,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertTriangle,
  RefreshCw,
  X,
  Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, AdminUser } from '@/lib/api';
import { clsx } from 'clsx';

export default function AdminUsersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [tier, setTier] = useState(searchParams.get('tier') || '');
  const [page, setPage] = useState(parseInt(searchParams.get('page') || '1'));
  const limit = 20;

  // Modal state
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [grantAmount, setGrantAmount] = useState('');
  const [grantReason, setGrantReason] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.listAdminUsers({
        limit,
        offset: (page - 1) * limit,
        tier: tier || undefined,
        search: search || undefined,
      });
      setUsers(data.users);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setIsLoading(false);
    }
  }, [page, tier, search]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (tier) params.set('tier', tier);
    if (page > 1) params.set('page', page.toString());
    const query = params.toString();
    router.replace(`/admin/users${query ? `?${query}` : ''}`, { scroll: false });
  }, [search, tier, page, router]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchUsers();
  };

  const handleToggleAdmin = async (user: AdminUser) => {
    if (!confirm(`Are you sure you want to ${user.is_admin ? 'remove' : 'grant'} admin access for ${user.email}?`)) {
      return;
    }

    setActionLoading(user.id);
    try {
      await api.setAdminStatus(user.id, !user.is_admin);
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update admin status');
    } finally {
      setActionLoading(null);
    }
  };

  const handleGrantCredits = async () => {
    if (!selectedUser || !grantAmount || !grantReason.trim()) return;

    const amount = parseInt(grantAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setActionLoading('grant');
    try {
      await api.grantCredits(selectedUser.id, amount, grantReason.trim());
      setShowGrantModal(false);
      setSelectedUser(null);
      setGrantAmount('');
      setGrantReason('');
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to grant credits');
    } finally {
      setActionLoading(null);
    }
  };

  const totalPages = Math.ceil(total / limit);

  // Helper to display user identity in a readable way
  const getUserDisplayInfo = (user: AdminUser) => {
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

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Users</h1>
          <p className="text-zinc-500 mt-1">Manage user accounts and permissions</p>
        </div>
        <Button onClick={fetchUsers} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-4 mb-6">
        <form onSubmit={handleSearch} className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <Input
                type="text"
                placeholder="Search by email or name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <select
            value={tier}
            onChange={(e) => { setTier(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            <option value="">All Tiers</option>
            <option value="free">Free</option>
            <option value="starter">Starter</option>
            <option value="pro">Pro</option>
          </select>
          <Button type="submit">Search</Button>
        </form>
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
            <p className="text-zinc-600">Loading users...</p>
          </div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center">
            <Users className="h-12 w-12 text-zinc-300 mx-auto mb-4" />
            <p className="text-zinc-600">No users found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-zinc-50 border-b border-zinc-100">
                  <tr>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">User</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Tier</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Credits</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Sessions</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Joined</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-zinc-50">
                      <td className="px-6 py-4">
                        {(() => {
                          const displayInfo = getUserDisplayInfo(user);
                          return (
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center">
                                {user.is_admin ? (
                                  <Shield className="h-5 w-5 text-violet-600" />
                                ) : (
                                  <Users className="h-5 w-5 text-zinc-400" />
                                )}
                              </div>
                              <div>
                                <p className="font-medium text-zinc-900">{displayInfo.primary}</p>
                                {displayInfo.secondary && (
                                  <p className="text-sm text-zinc-500">{displayInfo.secondary}</p>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-6 py-4">
                        {getTierBadge(user.tier)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Zap className="h-4 w-4 text-amber-500" />
                          <span className="font-medium text-zinc-900">{user.credit_balance}</span>
                          <span className="text-zinc-400 text-sm">({user.lifetime_credits_used} used)</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-zinc-600">
                        {user.session_count}
                      </td>
                      <td className="px-6 py-4 text-zinc-600 text-sm">
                        {user.created_at
                          ? new Date(user.created_at).toLocaleDateString()
                          : 'N/A'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => router.push(`/admin/users/${user.id}`)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedUser(user);
                              setShowGrantModal(true);
                            }}
                          >
                            <Zap className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleToggleAdmin(user)}
                            disabled={actionLoading === user.id}
                          >
                            {actionLoading === user.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : user.is_admin ? (
                              <ShieldOff className="h-4 w-4 text-red-500" />
                            ) : (
                              <Shield className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
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
                  Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, total)} of {total} users
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

      {/* Grant Credits Modal */}
      {showGrantModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold text-zinc-900 mb-2">Grant Credits</h2>
            <p className="text-zinc-500 mb-6">
              Grant credits to <span className="font-medium text-zinc-700">{getUserDisplayInfo(selectedUser).primary}</span>
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
                  setSelectedUser(null);
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
