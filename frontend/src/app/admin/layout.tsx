'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth, SignedIn, SignedOut } from '@clerk/nextjs';
import {
  Sparkles,
  LayoutDashboard,
  Users,
  BarChart3,
  Activity,
  CreditCard,
  ArrowLeft,
  Shield,
  Loader2,
} from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '@/lib/api';

const navItems = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/admin/sessions', label: 'Sessions', icon: Activity },
  { href: '/admin/transactions', label: 'Transactions', icon: CreditCard },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { isSignedIn, isLoaded } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    // Check if user is admin
    const checkAdmin = async () => {
      try {
        const user = await api.getCurrentUser();
        // Check if user has admin status by trying to access admin endpoint
        try {
          await api.getAdminStats();
          setIsAdmin(true);
        } catch {
          setIsAdmin(false);
        }
      } catch {
        setIsAdmin(false);
      } finally {
        setIsChecking(false);
      }
    };

    checkAdmin();
  }, [isLoaded, isSignedIn]);

  // Show loading while checking auth
  if (!isLoaded || isChecking) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-violet-600 mx-auto mb-4" />
          <p className="text-zinc-600">Verifying access...</p>
        </div>
      </div>
    );
  }

  // Not signed in
  if (!isSignedIn) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="text-center">
          <Shield className="h-12 w-12 text-zinc-300 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-zinc-900 mb-2">Admin Access Required</h1>
          <p className="text-zinc-600 mb-4">Please sign in to access the admin dashboard.</p>
          <Link href="/" className="text-violet-600 hover:text-violet-700 font-medium">
            Return to Home
          </Link>
        </div>
      </div>
    );
  }

  // Not an admin
  if (isAdmin === false) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="text-center">
          <Shield className="h-12 w-12 text-red-300 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-zinc-900 mb-2">Access Denied</h1>
          <p className="text-zinc-600 mb-4">You don't have permission to access the admin dashboard.</p>
          <Link href="/" className="text-violet-600 hover:text-violet-700 font-medium">
            Return to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-zinc-200 flex flex-col">
        {/* Logo */}
        <div className="p-4 border-b border-zinc-100">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-violet-500 flex items-center justify-center shadow-lg shadow-violet-500/25">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-zinc-900">Atelier</h1>
              <p className="text-xs text-violet-600 font-medium">Admin</p>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href ||
              (item.href !== '/admin' && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-violet-50 text-violet-700'
                    : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Back to App */}
        <div className="p-4 border-t border-zinc-100">
          <Link
            href="/"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
            Back to App
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
