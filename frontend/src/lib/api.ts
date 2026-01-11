// API client for backend communication

import { SessionConfig, SessionState, CreditBalance, CreditTransaction, CreditEstimate, Subscription, CheckoutResponse, PortalResponse } from '@/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

// Token getter function - will be set by the auth provider
let getAuthToken: (() => Promise<string | null>) | null = null;

/**
 * Set the auth token getter function.
 * Called by the AuthProvider component to wire up Clerk auth.
 */
export function setAuthTokenGetter(getter: () => Promise<string | null>) {
  getAuthToken = getter;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE) {
    this.baseUrl = baseUrl;
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    if (!getAuthToken) {
      return {};
    }

    const token = await getAuthToken();
    if (!token) {
      return {};
    }

    return {
      Authorization: `Bearer ${token}`,
    };
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const authHeaders = await this.getAuthHeaders();

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));

      // Handle 402 Payment Required (insufficient credits) specially
      if (response.status === 402) {
        const creditError = new Error(
          error.detail?.message || error.detail || 'Insufficient credits'
        ) as Error & { status: number; errorData: typeof error.detail };
        creditError.status = 402;
        creditError.errorData = error.detail;
        throw creditError;
      }

      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Sessions
  async createSession(config: SessionConfig): Promise<{ session_id: string; status: string }> {
    return this.request('/sessions', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  async startSession(sessionId: string): Promise<{
    session_id: string;
    status: string;
    rounds_completed: number;
    total_turns: number;
    termination_reason: string;
  }> {
    return this.request(`/sessions/${sessionId}/start`, {
      method: 'POST',
    });
  }

  async stopSession(sessionId: string): Promise<{
    session_id: string;
    status: string;
    message: string;
    turns_completed: number;
  }> {
    return this.request(`/sessions/${sessionId}/stop`, {
      method: 'POST',
    });
  }

  async pauseSession(sessionId: string): Promise<{
    session_id: string;
    status: string;
  }> {
    return this.request(`/sessions/${sessionId}/pause`, {
      method: 'POST',
    });
  }

  async resumeSession(sessionId: string): Promise<{
    session_id: string;
    status: string;
  }> {
    return this.request(`/sessions/${sessionId}/resume`, {
      method: 'POST',
    });
  }

  /**
   * Start a streaming session using fetch with auth headers.
   * Returns a ReadableStream that can be read for SSE events.
   */
  async startStreamingSession(sessionId: string): Promise<Response> {
    const url = `${this.baseUrl}/sessions/${sessionId}/start-stream`;
    const authHeaders = await this.getAuthHeaders();

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...authHeaders,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response;
  }

  // Helper to get the streaming URL for fetch-based SSE
  getStreamingUrl(sessionId: string): string {
    return `${this.baseUrl}/sessions/${sessionId}/start-stream`;
  }

  // Helper to get auth headers (for external use if needed)
  async getAuthHeadersPublic(): Promise<Record<string, string>> {
    return this.getAuthHeaders();
  }

  async getSession(sessionId: string): Promise<SessionState> {
    return this.request(`/sessions/${sessionId}`);
  }

  async getCurrentDocument(sessionId: string): Promise<{
    session_id: string;
    document: string;
    last_updated_by: string | null;
    turn_number: number;
  }> {
    return this.request(`/sessions/${sessionId}/document`);
  }

  async listSessions(projectId?: string | null): Promise<{
    sessions: Array<{
      session_id: string;
      title: string;
      status: string;
      project_id: string | null;
      agent_count: number;
      current_round: number;
      total_turns: number;
      is_running: boolean;
      termination_reason: string | null;
      created_at: string | null;
    }>;
  }> {
    const params = projectId ? `?project_id=${projectId}` : '';
    return this.request(`/sessions${params}`);
  }

  // Health check
  async healthCheck(): Promise<{
    status: string;
    providers: Record<string, boolean>;
  }> {
    const response = await fetch(`${this.baseUrl.replace('/api/v1', '')}/health`);
    return response.json();
  }

  // User profile
  async getCurrentUser(): Promise<UserProfile> {
    return this.request('/users/me');
  }

  async updateProfile(params: {
    display_name?: string;
    timezone?: string;
  }): Promise<UserProfile> {
    const searchParams = new URLSearchParams();
    if (params.display_name) searchParams.append('display_name', params.display_name);
    if (params.timezone) searchParams.append('timezone', params.timezone);

    return this.request(`/users/me?${searchParams.toString()}`, {
      method: 'PATCH',
    });
  }

  async updatePreferences(preferences: UserPreferences): Promise<{
    preferences: UserPreferences;
    updated_at: string;
  }> {
    return this.request('/users/me/preferences', {
      method: 'PUT',
      body: JSON.stringify(preferences),
    });
  }

  async exportUserData(): Promise<UserDataExport> {
    return this.request('/users/me/export', {
      method: 'POST',
    });
  }

  async deleteAccount(confirmation: string): Promise<{
    status: string;
    message: string;
  }> {
    return this.request(`/users/me?confirmation=${encodeURIComponent(confirmation)}`, {
      method: 'DELETE',
    });
  }

  // Projects
  async listProjects(includeArchived: boolean = false): Promise<ProjectListResponse> {
    const params = includeArchived ? '?include_archived=true' : '';
    return this.request(`/projects${params}`);
  }

  async createProject(name: string, description?: string): Promise<Project> {
    const params = new URLSearchParams({ name });
    if (description) params.append('description', description);
    return this.request(`/projects?${params.toString()}`, {
      method: 'POST',
    });
  }

  async getProject(projectId: string): Promise<Project> {
    return this.request(`/projects/${projectId}`);
  }

  async updateProject(projectId: string, params: {
    name?: string;
    description?: string;
  }): Promise<Project> {
    const searchParams = new URLSearchParams();
    if (params.name) searchParams.append('name', params.name);
    if (params.description) searchParams.append('description', params.description);
    return this.request(`/projects/${projectId}?${searchParams.toString()}`, {
      method: 'PATCH',
    });
  }

  async archiveProject(projectId: string, permanent: boolean = false): Promise<{
    status: string;
    project_id: string;
  }> {
    const params = permanent ? '?permanent=true' : '';
    return this.request(`/projects/${projectId}${params}`, {
      method: 'DELETE',
    });
  }

  async unarchiveProject(projectId: string): Promise<Project> {
    return this.request(`/projects/${projectId}/unarchive`, {
      method: 'POST',
    });
  }

  async listProjectSessions(projectId: string): Promise<{
    sessions: ProjectSession[];
    project_id: string;
  }> {
    return this.request(`/projects/${projectId}/sessions`);
  }

  async moveSessionToProject(sessionId: string, projectId: string | null): Promise<{
    status: string;
    session_id: string;
    project_id: string | null;
  }> {
    const params = projectId ? `?project_id=${projectId}` : '';
    return this.request(`/sessions/${sessionId}/move${params}`, {
      method: 'POST',
    });
  }

  async deleteSession(sessionId: string): Promise<{ status: string }> {
    return this.request(`/sessions/${sessionId}`, {
      method: 'DELETE',
    });
  }

  async renameSession(sessionId: string, title: string): Promise<{ status: string; title: string }> {
    return this.request(`/sessions/${sessionId}/rename`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    });
  }

  async starSession(sessionId: string, starred: boolean): Promise<{ status: string; starred: boolean }> {
    return this.request(`/sessions/${sessionId}/star`, {
      method: 'PATCH',
      body: JSON.stringify({ starred }),
    });
  }

  async emailDocument(sessionId: string, email: string, content: string): Promise<{ status: string; message: string }> {
    return this.request(`/sessions/${sessionId}/email`, {
      method: 'POST',
      body: JSON.stringify({ email, content }),
    });
  }

  // Credits
  async getCreditsBalance(): Promise<CreditBalance> {
    return this.request('/credits/balance');
  }

  async getCreditsHistory(params?: {
    limit?: number;
    offset?: number;
    transaction_type?: string;
  }): Promise<{
    transactions: CreditTransaction[];
    limit: number;
    offset: number;
  }> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.append('limit', params.limit.toString());
    if (params?.offset) searchParams.append('offset', params.offset.toString());
    if (params?.transaction_type) searchParams.append('transaction_type', params.transaction_type);

    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return this.request(`/credits/history${query}`);
  }

  async estimateCredits(params: {
    agents: Array<{ agent_id: string; model: string }>;
    max_rounds: number;
    document_words?: number;
  }): Promise<CreditEstimate> {
    return this.request('/credits/estimate', {
      method: 'POST',
      body: JSON.stringify({
        agents: params.agents,
        max_rounds: params.max_rounds,
        document_words: params.document_words || 0,
      }),
    });
  }

  // Billing / Subscriptions
  async getSubscription(): Promise<Subscription> {
    return this.request('/billing/subscription');
  }

  async createCheckout(tier: 'starter' | 'pro', yearly: boolean = false): Promise<CheckoutResponse> {
    return this.request('/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ tier, yearly }),
    });
  }

  async createCreditCheckout(credits: number): Promise<CheckoutResponse> {
    return this.request('/billing/checkout/credits', {
      method: 'POST',
      body: JSON.stringify({ credits }),
    });
  }

  async cancelSubscription(): Promise<{ message: string }> {
    return this.request('/billing/cancel', {
      method: 'POST',
    });
  }

  async reactivateSubscription(): Promise<{ message: string }> {
    return this.request('/billing/reactivate', {
      method: 'POST',
    });
  }

  async getBillingPortal(): Promise<PortalResponse> {
    return this.request('/billing/portal', {
      method: 'POST',
    });
  }

  async syncSubscription(sessionId?: string): Promise<{ status: string; tier?: string; credits_added?: number }> {
    const params = sessionId ? `?session_id=${sessionId}` : '';
    return this.request(`/billing/sync${params}`, {
      method: 'POST',
    });
  }

  // Admin - Dashboard
  async getAdminStats(): Promise<AdminStats> {
    return this.request('/admin/stats');
  }

  // Admin - Users
  async listAdminUsers(params?: {
    limit?: number;
    offset?: number;
    tier?: string;
    search?: string;
  }): Promise<{ users: AdminUser[]; total: number; limit: number; offset: number }> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.append('limit', params.limit.toString());
    if (params?.offset) searchParams.append('offset', params.offset.toString());
    if (params?.tier) searchParams.append('tier', params.tier);
    if (params?.search) searchParams.append('search', params.search);

    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return this.request(`/admin/users${query}`);
  }

  async getAdminUserDetails(userId: string): Promise<AdminUserDetails> {
    return this.request(`/admin/users/${userId}`);
  }

  async grantCredits(userId: string, amount: number, reason: string): Promise<{
    status: string;
    transaction_id: string;
    amount: number;
    new_balance: number;
  }> {
    return this.request(`/admin/users/${userId}/grant-credits`, {
      method: 'POST',
      body: JSON.stringify({ amount, reason }),
    });
  }

  async setAdminStatus(userId: string, isAdmin: boolean): Promise<{
    status: string;
    user_id: string;
    is_admin: boolean;
  }> {
    return this.request(`/admin/users/${userId}/admin-status`, {
      method: 'PATCH',
      body: JSON.stringify({ is_admin: isAdmin }),
    });
  }

  // Admin - Analytics
  async getRevenueAnalytics(period: string = 'month'): Promise<RevenueAnalytics> {
    return this.request(`/admin/analytics/revenue?period=${period}`);
  }

  async getUsageAnalytics(period: string = 'month'): Promise<UsageAnalytics> {
    return this.request(`/admin/analytics/usage?period=${period}`);
  }

  // Admin - Sessions
  async listAdminSessions(params?: {
    limit?: number;
    offset?: number;
    status?: string;
    user_id?: string;
  }): Promise<{ sessions: AdminSession[]; total: number; limit: number; offset: number }> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.append('limit', params.limit.toString());
    if (params?.offset) searchParams.append('offset', params.offset.toString());
    if (params?.status) searchParams.append('status', params.status);
    if (params?.user_id) searchParams.append('user_id', params.user_id);

    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return this.request(`/admin/sessions${query}`);
  }

  async getFailedSessions(days: number = 7): Promise<{
    sessions: AdminSession[];
    count: number;
    days: number;
  }> {
    return this.request(`/admin/sessions/failed?days=${days}`);
  }

  // Admin - Transactions
  async listAdminTransactions(params?: {
    limit?: number;
    offset?: number;
    user_id?: string;
    transaction_type?: string;
  }): Promise<{ transactions: AdminTransaction[]; total: number; limit: number; offset: number }> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.append('limit', params.limit.toString());
    if (params?.offset) searchParams.append('offset', params.offset.toString());
    if (params?.user_id) searchParams.append('user_id', params.user_id);
    if (params?.transaction_type) searchParams.append('transaction_type', params.transaction_type);

    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return this.request(`/admin/transactions${query}`);
  }
}

// User types
export interface UserPreferences {
  default_provider?: string | null;
  default_model?: string | null;
  default_max_rounds: number;
  show_evaluation_details: boolean;
  theme: string;
}

export interface UserProfileData {
  id: string;
  timezone: string;
  preferences: UserPreferences;
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  id: string;
  email: string;
  display_name: string | null;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
  profile: UserProfileData;
}

export interface UserDataExport {
  user: Record<string, unknown>;
  profile: Record<string, unknown> | null;
  sessions: Array<Record<string, unknown>>;
  exchange_turns: Array<Record<string, unknown>>;
  document_versions: Array<Record<string, unknown>>;
  exported_at: string;
}

// Project types
export interface Project {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  default_agent_config: Array<Record<string, unknown>> | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  session_count: number;
}

export interface ProjectListResponse {
  projects: Project[];
  total: number;
}

export interface ProjectSession {
  session_id: string;
  title: string;
  status: string;
  current_round: number;
  termination_reason: string | null;
  created_at: string;
  completed_at: string | null;
}

// Admin types
export interface AdminStats {
  users: {
    total: number;
    by_tier: { free: number; starter: number; pro: number };
    new_this_week: number;
  };
  revenue: {
    mrr: number;
    starter_mrr: number;
    pro_mrr: number;
  };
  usage: {
    sessions_today: number;
    sessions_this_week: number;
    credits_used_today: number;
    credits_used_this_week: number;
  };
  health: {
    failed_sessions_24h: number;
    active_sessions: number;
  };
}

export interface AdminUser {
  id: string;
  email: string;
  display_name: string | null;
  is_admin: boolean;
  tier: string;
  subscription_status: string;
  credit_balance: number;
  lifetime_credits_used: number;
  session_count: number;
  created_at: string | null;
}

export interface AdminUserDetails {
  id: string;
  email: string;
  display_name: string | null;
  is_admin: boolean;
  created_at: string | null;
  subscription: {
    tier: string;
    status: string;
    stripe_customer_id: string | null;
    current_period_end: string | null;
  };
  credits: {
    balance: number;
    lifetime_used: number;
    tier_credits: number;
  };
  recent_sessions: Array<{
    id: string;
    title: string;
    status: string;
    created_at: string | null;
    credits_used: number;
  }>;
  recent_transactions: Array<{
    id: string;
    amount: number;
    type: string;
    description: string | null;
    created_at: string | null;
  }>;
}

export interface AdminSession {
  id: string;
  title: string;
  status: string;
  user_id: string | null;
  user_email: string | null;
  current_round: number;
  credits_used: number;
  termination_reason: string | null;
  created_at: string | null;
  completed_at: string | null;
}

export interface AdminTransaction {
  id: string;
  user_id: string;
  user_email: string | null;
  amount: number;
  type: string;
  description: string | null;
  session_id: string | null;
  balance_after: number;
  created_at: string | null;
}

export interface RevenueAnalytics {
  period: string;
  total_mrr: number;
  tier_breakdown: Record<string, { subscribers: number; mrr: number }>;
  credit_purchases_in_period: number;
}

export interface UsageAnalytics {
  period: string;
  total_sessions: number;
  completed_sessions: number;
  failed_sessions: number;
  success_rate: number;
  credits_used: number;
  avg_credits_per_session: number;
}

export const api = new ApiClient();
