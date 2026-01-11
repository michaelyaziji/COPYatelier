// Zustand store for credit system state management

import { create } from 'zustand';
import { CreditBalance, CreditTransaction, CreditEstimate } from '@/types';
import { api } from '@/lib/api';

interface CreditsStore {
  // State
  balance: CreditBalance | null;
  transactions: CreditTransaction[];
  isLoading: boolean;
  error: string | null;

  // Last estimate (for pre-session check)
  lastEstimate: CreditEstimate | null;

  // Actions
  fetchBalance: () => Promise<void>;
  fetchTransactions: (limit?: number) => Promise<void>;
  estimateSessionCredits: (params: {
    agents: Array<{ agent_id: string; model: string }>;
    max_rounds: number;
    document_words?: number;
  }) => Promise<CreditEstimate | null>;
  refreshBalance: () => Promise<void>;
  clearError: () => void;
}

export const useCreditsStore = create<CreditsStore>((set, get) => ({
  // Initial state
  balance: null,
  transactions: [],
  isLoading: false,
  error: null,
  lastEstimate: null,

  // Fetch current balance
  fetchBalance: async () => {
    set({ isLoading: true, error: null });
    try {
      const balance = await api.getCreditsBalance();
      set({ balance, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch credit balance';
      set({ error: message, isLoading: false });
    }
  },

  // Fetch transaction history
  fetchTransactions: async (limit = 20) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.getCreditsHistory({ limit });
      set({ transactions: response.transactions, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch transactions';
      set({ error: message, isLoading: false });
    }
  },

  // Estimate credits for a session
  estimateSessionCredits: async (params) => {
    set({ isLoading: true, error: null });
    try {
      const estimate = await api.estimateCredits(params);
      set({ lastEstimate: estimate, isLoading: false });
      return estimate;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to estimate credits';
      set({ error: message, isLoading: false });
      return null;
    }
  },

  // Refresh balance (call after session completes)
  refreshBalance: async () => {
    try {
      const balance = await api.getCreditsBalance();
      set({ balance });
    } catch (error) {
      // Silently fail on refresh - balance might be stale briefly
      console.error('Failed to refresh balance:', error);
    }
  },

  // Clear error
  clearError: () => set({ error: null }),
}));
