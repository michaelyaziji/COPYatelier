// Types matching the backend models

export type ProviderType = 'anthropic' | 'google' | 'openai' | 'perplexity';

export type ModelType =
  // Anthropic
  | 'claude-opus-4-5-20251101'
  | 'claude-sonnet-4-5-20250929'
  | 'claude-sonnet-4-thinking-20250514'
  | 'claude-3-5-haiku-20241022'
  // Google
  | 'gemini-2.5-pro'
  | 'gemini-2.5-flash'
  | 'gemini-2.0-flash'
  // OpenAI
  | 'gpt-4o'
  | 'gpt-4o-mini'
  | 'o1'
  | 'o1-mini'
  | 'o3-mini'
  // Perplexity
  | 'sonar'
  | 'sonar-pro'
  | 'sonar-reasoning';

export interface EvaluationCriterion {
  name: string;
  description: string;
  weight: number;
}

export interface AgentConfig {
  agent_id: string;
  display_name: string;
  provider: ProviderType;
  model: ModelType;
  role_description: string;
  evaluation_criteria: EvaluationCriterion[];
  is_active: boolean;
  phase?: number; // Workflow phase: 1=Writer, 2=Editors, 3=Synthesizer
}

export interface TerminationCondition {
  max_rounds: number;
  score_threshold: number | null;
}

export interface SessionConfig {
  session_id: string;
  title: string;
  project_id?: string | null;
  agents: AgentConfig[];
  flow_type: 'sequential' | 'parallel_critique';
  termination: TerminationCondition;
  initial_prompt: string;
  working_document: string;
  reference_documents: Record<string, string>;
  reference_instructions?: string;
}

export interface CriterionScore {
  criterion: string;
  score: number;
  justification: string;
}

export interface Evaluation {
  criteria_scores: CriterionScore[];
  overall_score: number;
  summary: string;
}

export interface ExchangeTurn {
  turn_number: number;
  round_number: number;
  agent_id: string;
  agent_name: string;
  timestamp: string;
  output: string;
  raw_response: string;
  evaluation: Evaluation | null;
  parse_error: string | null;
  working_document: string;
}

export interface SessionState {
  config: SessionConfig;
  exchange_history: ExchangeTurn[];
  current_round: number;
  is_running: boolean;
  is_paused: boolean;
  termination_reason: string | null;
}

// UI-specific types
export interface ModelOption {
  value: ModelType;
  label: string;
  provider: ProviderType;
}

export const MODELS: ModelOption[] = [
  // Anthropic
  { value: 'claude-opus-4-5-20251101', label: 'Claude Opus 4', provider: 'anthropic' },
  { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4', provider: 'anthropic' },
  { value: 'claude-sonnet-4-thinking-20250514', label: 'Claude Sonnet 4 (Thinking)', provider: 'anthropic' },
  // Google
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'google' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'google' },
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', provider: 'google' },
  // OpenAI
  { value: 'gpt-4o', label: 'GPT-4o', provider: 'openai' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'openai' },
  { value: 'o1', label: 'o1', provider: 'openai' },
  { value: 'o1-mini', label: 'o1 Mini', provider: 'openai' },
  { value: 'o3-mini', label: 'o3 Mini', provider: 'openai' },
  // Perplexity (with web search)
  { value: 'sonar', label: 'Sonar', provider: 'perplexity' },
  { value: 'sonar-pro', label: 'Sonar Pro', provider: 'perplexity' },
  { value: 'sonar-reasoning', label: 'Sonar Reasoning', provider: 'perplexity' },
];

export const PROVIDERS: { value: ProviderType; label: string }[] = [
  { value: 'anthropic', label: 'Anthropic Claude' },
  { value: 'google', label: 'Google Gemini' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'perplexity', label: 'Perplexity' },
];

// Streaming event types
export type StreamEventType =
  | 'session_start'
  | 'round_start'
  | 'agent_start'
  | 'agent_token'
  | 'agent_retry'
  | 'agent_complete'
  | 'round_complete'
  | 'session_complete'
  | 'session_paused'
  | 'session_resumed'
  | 'credits_update'
  | 'credit_warning'
  | 'error';

export interface StreamEvent {
  type: StreamEventType;
  session_id?: string;
  timestamp: string;
  error_type?: string;
  [key: string]: unknown;
}

export interface AgentStreamState {
  agent_id: string;
  agent_name: string;
  status: 'idle' | 'generating' | 'complete' | 'error';
  content: string;
  errorMessage?: string;
  evaluation?: {
    overall_score: number | null;
    criteria_scores: { criterion: string; score: number }[];
  } | null;
}

// Preset prompt options
export * from './presets';

// Workflow roles
export * from './workflow';

// Credit system types
export interface CreditBalance {
  user_id: string;
  balance: number;
  lifetime_used: number;
  tier: string;
  tier_credits: number;
  last_grant_at: string | null;
}

export interface CreditTransaction {
  id: string;
  amount: number;
  type: 'initial_grant' | 'subscription_grant' | 'purchase' | 'usage' | 'refund' | 'admin_grant';
  description: string | null;
  session_id: string | null;
  balance_after: number;
  created_at: string;
}

export interface CreditEstimate {
  estimated_credits: number;
  current_balance: number;
  has_sufficient_credits: boolean;
  agents: Array<{
    agent_id: string;
    model: string;
    multiplier: number;
  }>;
}

export interface CreditUsage {
  input_tokens: number;
  output_tokens: number;
  credits_used: number;
  session_total_credits: number;
}

// Subscription types
export type SubscriptionTier = 'free' | 'starter' | 'pro';
export type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'incomplete';

export interface Subscription {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
}

export interface CheckoutResponse {
  checkout_url: string;
  session_id: string;
}

export interface PortalResponse {
  portal_url: string;
}
