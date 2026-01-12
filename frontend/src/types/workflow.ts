import { ProviderType, ModelType, EvaluationCriterion } from './index';

// Workflow Role Types
export type WorkflowRoleId =
  | 'writer'
  | 'content_expert'
  | 'style_editor'
  | 'fact_checker'
  | 'synthesizer';

export type WorkflowPhase = 1 | 2 | 3;

// Default provider and model for all roles
export const DEFAULT_PROVIDER: ProviderType = 'anthropic';
export const DEFAULT_MODEL: ModelType = 'claude-sonnet-4-5-20250929';

export interface WorkflowRole {
  id: WorkflowRoleId;
  name: string;
  description: string;
  phase: WorkflowPhase;
  isRequired: boolean;
  defaultPrompt: string;
  evaluationCriteria: EvaluationCriterion[];
}

export interface WorkflowRoleState extends WorkflowRole {
  isActive: boolean;
  customPrompt: string;
  provider: ProviderType;
  model: ModelType;
}

// Pre-crafted role definitions with role-specific evaluation criteria
export const WORKFLOW_ROLES: WorkflowRole[] = [
  {
    id: 'writer',
    name: 'Writer',
    description: 'Creates and revises the document based on feedback',
    phase: 1,
    isRequired: true,
    defaultPrompt: `You are the writer. You own the text—its voice, structure, and argument.

When drafting: Build a clear throughline. Every paragraph must earn its place.

When revising: Treat editorial feedback as data, not commands. Accept what strengthens the work; push back (in your self-evaluation) on suggestions that would weaken it. Preserve what's working.`,
    evaluationCriteria: [
      { name: 'Clarity', description: 'Writing is clear and understandable', weight: 1.0 },
      { name: 'Engagement', description: 'Content is compelling and holds attention', weight: 1.0 },
      { name: 'Structure', description: 'Organization is logical with smooth flow', weight: 1.0 },
      { name: 'Completeness', description: 'All key points are addressed', weight: 1.0 },
    ],
  },
  {
    id: 'content_expert',
    name: 'Content Expert Editor',
    description: 'Reviews for accuracy, depth, and subject matter expertise',
    phase: 2,
    isRequired: false,
    defaultPrompt: `You are a subject-matter expert reviewing for intellectual substance.

Your focus: Is this *true*? Is it *complete*? Is it *sophisticated enough* for the audience?

Flag: Oversimplifications, missing nuance, gaps in the argument, claims that overreach the evidence. Suggest specific additions—examples, qualifications, counterarguments the author should address.

Ignore: Prose style, grammar, formatting. That's not your domain.`,
    evaluationCriteria: [
      { name: 'Accuracy', description: 'Information is factually correct', weight: 1.0 },
      { name: 'Depth', description: 'Topic is covered with appropriate sophistication', weight: 1.0 },
      { name: 'Completeness', description: 'No significant gaps or missing context', weight: 1.0 },
    ],
  },
  {
    id: 'style_editor',
    name: 'Style Editor',
    description: 'Reviews writing quality, clarity, and readability',
    phase: 2,
    isRequired: false,
    defaultPrompt: `You are a prose surgeon. You care about how the writing *reads*, not what it claims.

Your focus: Sentence rhythm, word choice, transitions, paragraph structure, clarity, economy.

Cut: Throat-clearing, redundancy, jargon that excludes rather than clarifies, passive constructions that obscure agency.

Preserve: The author's voice. Tighten without flattening.

Ignore: Factual accuracy, argument structure. That's not your domain.`,
    evaluationCriteria: [
      { name: 'Tone', description: 'Voice matches target audience and purpose', weight: 1.0 },
      { name: 'Flow', description: 'Transitions are smooth and logical', weight: 1.0 },
      { name: 'Economy', description: 'Writing is concise without unnecessary words', weight: 1.0 },
      { name: 'Readability', description: 'Prose is accessible and engaging', weight: 1.0 },
    ],
  },
  {
    id: 'fact_checker',
    name: 'Fact Checker',
    description: 'Verifies claims, statistics, and factual accuracy',
    phase: 2,
    isRequired: false,
    defaultPrompt: `You are a fact checker. You are the skeptic in the room.

Your focus: Verifiable claims—names, dates, statistics, attributions, causal assertions.

For each flagged item, specify: What's claimed, why it's problematic (unsourced? outdated? contested? misattributed?), and what would resolve it.

Distinguish clearly: Errors of fact vs. matters of interpretation vs. claims that are technically true but misleading.

Ignore: Writing quality, argument structure. That's not your domain.`,
    evaluationCriteria: [
      { name: 'Factual Accuracy', description: 'All verifiable claims are correct', weight: 1.0 },
      { name: 'Source Quality', description: 'Claims are properly attributed and sourced', weight: 1.0 },
      { name: 'Precision', description: 'Statistics and data are accurate and current', weight: 1.0 },
    ],
  },
  {
    id: 'synthesizer',
    name: 'Synthesizing Editor',
    description: 'Combines all feedback and provides unified direction',
    phase: 3,
    isRequired: true,
    defaultPrompt: `You are the senior editor. You see the whole board.

Your job: Arbitrate. The other editors serve different masters (truth, style, substance). Their suggestions will conflict. You decide what matters most *for this piece, this audience, this purpose.*

Produce: A prioritized revision directive. Not a list of everything—a clear hierarchy. What must change, what should change, what can be ignored.

When editors conflict: Make the call. Explain your reasoning. The writer needs clarity, not diplomatic hedging.`,
    evaluationCriteria: [
      { name: 'Prioritization', description: 'Feedback is clearly ranked by importance', weight: 1.0 },
      { name: 'Clarity', description: 'Direction is actionable and unambiguous', weight: 1.0 },
      { name: 'Judgment', description: 'Conflicts are resolved with sound reasoning', weight: 1.0 },
    ],
  },
];

// Helper to get initial workflow state
export function getInitialWorkflowState(): WorkflowRoleState[] {
  return WORKFLOW_ROLES.map((role) => ({
    ...role,
    isActive: role.isRequired, // Writer is active by default
    customPrompt: role.defaultPrompt,
    provider: DEFAULT_PROVIDER,
    model: DEFAULT_MODEL,
  }));
}

// Helper to get roles by phase
export function getRolesByPhase(
  roles: WorkflowRoleState[],
  phase: WorkflowPhase
): WorkflowRoleState[] {
  return roles.filter((r) => r.phase === phase && r.isActive);
}
