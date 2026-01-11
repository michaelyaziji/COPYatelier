'use client';

import { useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import { setAuthTokenGetter } from '@/lib/api';

/**
 * AuthProvider component that wires up Clerk authentication with the API client.
 * This must be rendered inside ClerkProvider.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth();

  useEffect(() => {
    // Wire up the auth token getter for the API client
    setAuthTokenGetter(async () => {
      try {
        const token = await getToken();
        return token;
      } catch {
        return null;
      }
    });
  }, [getToken]);

  return <>{children}</>;
}
