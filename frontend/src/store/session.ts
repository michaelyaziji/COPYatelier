// Zustand store for session state management

import { create } from 'zustand';
import { AgentConfig, SessionConfig, SessionState, ProviderType, ModelType, AgentStreamState, StreamEvent, WorkflowRoleState, WorkflowRoleId, getInitialWorkflowState, PresetSelections, generatePresetContext } from '@/types';
import { api } from '@/lib/api';

// Helper to generate unique IDs
const generateId = () => Math.random().toString(36).substring(2, 9);

// Helper to generate a short title from the initial prompt
const generateTitleFromPrompt = (prompt: string): string => {
  if (!prompt.trim()) return 'New Session';

  // Take the first line or first 50 chars, whichever is shorter
  const firstLine = prompt.split('\n')[0].trim();
  const truncated = firstLine.length > 50 ? firstLine.slice(0, 47) + '...' : firstLine;

  // Capitalize first letter
  return truncated.charAt(0).toUpperCase() + truncated.slice(1);
};

// Default agent template
const createDefaultAgent = (index: number): AgentConfig => ({
  agent_id: generateId(),
  display_name: index === 0 ? 'Writer' : index === 1 ? 'Editor' : `Agent ${index + 1}`,
  provider: 'anthropic' as ProviderType,
  model: 'claude-sonnet-4-5-20250929' as ModelType,
  role_description: index === 0
    ? 'You are a skilled writer. Create clear, engaging content based on the prompt.'
    : 'You are a careful editor. Review and improve the text for clarity and quality.',
  evaluation_criteria: [
    {
      name: 'Quality',
      description: 'Overall quality of the output',
      weight: 1.0,
    },
  ],
  is_active: true,
});

interface SessionStore {
  // Configuration state
  agents: AgentConfig[];
  title: string;
  initialPrompt: string;
  workingDocument: string;
  referenceDocuments: Record<string, string>;
  referenceInstructions: string;
  maxRounds: number;
  scoreThreshold: number | null;
  projectId: string | null;

  // Workflow state
  workflowRoles: WorkflowRoleState[];

  // Preset selections (for document requirements context)
  presetSelections: PresetSelections;

  // Runtime state
  sessionId: string | null;
  sessionState: SessionState | null;
  isRunning: boolean;
  error: string | null;

  // Streaming state
  isStreaming: boolean;
  isPaused: boolean;
  currentRound: number;
  agentStreams: Record<string, AgentStreamState>;
  streamEvents: StreamEvent[];

  // Actions - Agent management
  addAgent: () => void;
  removeAgent: (agentId: string) => void;
  updateAgent: (agentId: string, updates: Partial<AgentConfig>) => void;
  reorderAgents: (fromIndex: number, toIndex: number) => void;

  // Actions - Session configuration
  setTitle: (title: string) => void;
  setInitialPrompt: (prompt: string) => void;
  setWorkingDocument: (doc: string) => void;
  setReferenceDocuments: (docs: Record<string, string>) => void;
  setReferenceInstructions: (instructions: string) => void;
  setMaxRounds: (rounds: number) => void;
  setScoreThreshold: (threshold: number | null) => void;
  setProjectId: (projectId: string | null) => void;

  // Actions - Workflow management
  toggleWorkflowRole: (roleId: WorkflowRoleId) => void;
  updateWorkflowRolePrompt: (roleId: WorkflowRoleId, prompt: string) => void;
  updateWorkflowRoleModel: (roleId: WorkflowRoleId, provider: ProviderType, model: ModelType) => void;
  setPresetSelections: (selections: PresetSelections) => void;
  getActiveWorkflowAgents: () => AgentConfig[];

  // Actions - Session execution
  createAndStartSession: () => Promise<void>;
  createAndStartStreamingSession: () => Promise<void>;
  handleStreamEvent: (event: StreamEvent) => void;
  stopSession: () => Promise<void>;
  resetSession: () => Promise<void>;
  pauseSession: () => Promise<void>;
  resumeSession: () => Promise<void>;
  pollSessionStatus: () => Promise<void>;
  loadSession: (sessionId: string) => Promise<void>;
  continueEditing: () => void;
  reset: () => void;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  // Initial state
  agents: [createDefaultAgent(0), createDefaultAgent(1)],
  title: 'New Writing Session',
  initialPrompt: '',
  workingDocument: '',
  referenceDocuments: {},
  referenceInstructions: '',
  maxRounds: 2,
  scoreThreshold: null,
  projectId: null,

  // Workflow state
  workflowRoles: getInitialWorkflowState(),

  // Preset selections
  presetSelections: {
    outletType: '',
    customOutletType: '',
    audience: '',
    customAudience: '',
    lengthRange: '',
    readingLevel: '',
    draftTreatment: 'moderate_revision',
  },

  sessionId: null,
  sessionState: null,
  isRunning: false,
  error: null,

  // Streaming state
  isStreaming: false,
  isPaused: false,
  currentRound: 0,
  agentStreams: {},
  streamEvents: [],

  // Agent management
  addAgent: () => {
    const { agents } = get();
    if (agents.length >= 4) return;
    set({ agents: [...agents, createDefaultAgent(agents.length)] });
  },

  removeAgent: (agentId) => {
    const { agents } = get();
    if (agents.length <= 1) return;
    set({ agents: agents.filter((a) => a.agent_id !== agentId) });
  },

  updateAgent: (agentId, updates) => {
    const { agents } = get();
    set({
      agents: agents.map((a) =>
        a.agent_id === agentId ? { ...a, ...updates } : a
      ),
    });
  },

  reorderAgents: (fromIndex, toIndex) => {
    const { agents } = get();
    const newAgents = [...agents];
    const [removed] = newAgents.splice(fromIndex, 1);
    newAgents.splice(toIndex, 0, removed);
    set({ agents: newAgents });
  },

  // Session configuration
  setTitle: (title) => set({ title }),
  setInitialPrompt: (prompt) => set({ initialPrompt: prompt }),
  setWorkingDocument: (doc) => set({ workingDocument: doc }),
  setReferenceDocuments: (docs) => set({ referenceDocuments: docs }),
  setReferenceInstructions: (instructions) => set({ referenceInstructions: instructions }),
  setMaxRounds: (rounds) => set({ maxRounds: rounds }),
  setScoreThreshold: (threshold) => set({ scoreThreshold: threshold }),
  setProjectId: (projectId) => set({ projectId }),

  // Workflow management
  toggleWorkflowRole: (roleId) => {
    const { workflowRoles } = get();
    set({
      workflowRoles: workflowRoles.map((role) =>
        role.id === roleId && !role.isRequired
          ? { ...role, isActive: !role.isActive }
          : role
      ),
    });
  },

  updateWorkflowRolePrompt: (roleId, prompt) => {
    const { workflowRoles } = get();
    set({
      workflowRoles: workflowRoles.map((role) =>
        role.id === roleId ? { ...role, customPrompt: prompt } : role
      ),
    });
  },

  updateWorkflowRoleModel: (roleId, provider, model) => {
    const { workflowRoles } = get();
    set({
      workflowRoles: workflowRoles.map((role) =>
        role.id === roleId ? { ...role, provider, model } : role
      ),
    });
  },

  setPresetSelections: (selections) => set({ presetSelections: selections }),

  getActiveWorkflowAgents: () => {
    const { workflowRoles, presetSelections } = get();
    const presetContext = generatePresetContext(presetSelections);

    return workflowRoles
      .filter((role) => role.isActive)
      .map((role) => ({
        agent_id: role.id,
        display_name: role.name,
        provider: role.provider,
        model: role.model,
        // Append preset context to the role description so agents know the requirements
        role_description: role.customPrompt + presetContext,
        // Use role-specific evaluation criteria instead of generic "Quality"
        evaluation_criteria: role.evaluationCriteria,
        is_active: true,
        phase: role.phase, // Pass workflow phase: 1=Writer, 2=Editors, 3=Synthesizer
      }));
  },

  // Session execution
  createAndStartSession: async () => {
    const {
      agents,
      title,
      initialPrompt,
      workingDocument,
      referenceDocuments,
      referenceInstructions,
      maxRounds,
      scoreThreshold,
    } = get();

    if (!initialPrompt.trim()) {
      set({ error: 'Please enter a prompt for the agents' });
      return;
    }

    const activeAgents = agents.filter((a) => a.is_active);
    if (activeAgents.length === 0) {
      set({ error: 'At least one agent must be active' });
      return;
    }

    set({ isRunning: true, error: null });

    try {
      const sessionId = generateId();

      const { presetSelections } = get();

      const config: SessionConfig = {
        session_id: sessionId,
        title,
        agents: activeAgents,
        flow_type: 'sequential',
        termination: {
          max_rounds: maxRounds,
          score_threshold: scoreThreshold,
        },
        initial_prompt: initialPrompt,
        working_document: workingDocument,
        reference_documents: referenceDocuments,
        reference_instructions: referenceInstructions,
        // Only include draft_treatment if there's a working document
        draft_treatment: workingDocument ? presetSelections.draftTreatment || null : null,
      };

      // Create session
      await api.createSession(config);
      set({ sessionId });

      // Start session (this will block until complete in Phase 1)
      await api.startSession(sessionId);

      // Get final state
      const sessionState = await api.getSession(sessionId);
      set({ sessionState, isRunning: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Unknown error occurred',
        isRunning: false,
      });
    }
  },

  createAndStartStreamingSession: async () => {
    const {
      initialPrompt,
      workingDocument,
      referenceDocuments,
      referenceInstructions,
      maxRounds,
      scoreThreshold,
      projectId,
      handleStreamEvent,
      getActiveWorkflowAgents,
      presetSelections,
    } = get();

    if (!initialPrompt.trim()) {
      set({ error: 'Please enter a prompt for the agents' });
      return;
    }

    // Use workflow agents instead of the old agents array
    const activeAgents = getActiveWorkflowAgents();
    if (activeAgents.length === 0) {
      set({ error: 'At least one workflow role must be active' });
      return;
    }

    // Generate title from prompt
    const sessionTitle = generateTitleFromPrompt(initialPrompt);

    // Initialize agent streams
    const initialStreams: Record<string, AgentStreamState> = {};
    activeAgents.forEach((agent) => {
      initialStreams[agent.agent_id] = {
        agent_id: agent.agent_id,
        agent_name: agent.display_name,
        status: 'idle',
        content: '',
        evaluation: null,
      };
    });

    set({
      isRunning: true,
      isStreaming: true,
      error: null,
      agentStreams: initialStreams,
      streamEvents: [],
      currentRound: 0,
      title: sessionTitle, // Update the title in state
    });

    try {
      const sessionId = generateId();

      const config: SessionConfig = {
        session_id: sessionId,
        title: sessionTitle,
        project_id: projectId,
        agents: activeAgents,
        flow_type: 'sequential',
        termination: {
          max_rounds: maxRounds,
          score_threshold: scoreThreshold,
        },
        initial_prompt: initialPrompt,
        working_document: workingDocument,
        reference_documents: referenceDocuments,
        reference_instructions: referenceInstructions,
        // Only include draft_treatment if there's a working document
        draft_treatment: workingDocument ? presetSelections.draftTreatment || null : null,
      };

      // Create session first
      await api.createSession(config);
      set({ sessionId });

      // Start streaming session using fetch with ReadableStream and auth
      const response = await api.startStreamingSession(sessionId);

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('Failed to get stream reader');
      }

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE messages
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const eventData = JSON.parse(line.slice(6)) as StreamEvent;
              handleStreamEvent(eventData);
            } catch (e) {
              console.error('Failed to parse SSE event:', e);
            }
          }
        }
      }

      // Get final state
      const sessionState = await api.getSession(sessionId);
      set({ sessionState, isRunning: false, isStreaming: false });

    } catch (err) {
      // Handle specific credit errors (402)
      const error = err as Error & { status?: number; errorData?: { required_credits?: number; available_credits?: number } };

      if (error.status === 402 && error.errorData) {
        set({
          error: `Insufficient credits: You need ${error.errorData.required_credits} credits but have ${error.errorData.available_credits}. Please add more credits to continue.`,
          isRunning: false,
          isStreaming: false,
        });
      } else {
        set({
          error: err instanceof Error ? err.message : 'Unknown error occurred',
          isRunning: false,
          isStreaming: false,
        });
      }
    }
  },

  handleStreamEvent: (event: StreamEvent) => {
    const { agentStreams, streamEvents, sessionId } = get();

    // Ignore events from other sessions (prevents stale data from previous sessions)
    if (event.session_id && sessionId && event.session_id !== sessionId) {
      console.warn(`Ignoring event for different session: ${event.session_id} (current: ${sessionId})`);
      return;
    }

    // Add event to history
    set({ streamEvents: [...streamEvents, event] });

    switch (event.type) {
      case 'session_start':
        // Session started
        break;

      case 'round_start':
        set({ currentRound: event.round as number });
        break;

      case 'agent_start': {
        const agentId = event.agent_id as string;
        if (agentStreams[agentId]) {
          set({
            agentStreams: {
              ...agentStreams,
              [agentId]: {
                ...agentStreams[agentId],
                status: 'generating',
                content: '',
                evaluation: null,
              },
            },
          });
        }
        break;
      }

      case 'agent_token': {
        const agentId = event.agent_id as string;
        const token = event.token as string;
        if (agentStreams[agentId]) {
          set({
            agentStreams: {
              ...agentStreams,
              [agentId]: {
                ...agentStreams[agentId],
                content: agentStreams[agentId].content + token,
              },
            },
          });
        }
        break;
      }

      case 'agent_retry': {
        const agentId = event.agent_id as string;
        const attempt = event.attempt as number;
        const maxRetries = event.max_retries as number;
        const reason = event.reason as string;
        if (agentStreams[agentId]) {
          set({
            agentStreams: {
              ...agentStreams,
              [agentId]: {
                ...agentStreams[agentId],
                status: 'generating',
                errorMessage: `Retrying (${attempt}/${maxRetries})... ${reason}`,
              },
            },
          });
        }
        break;
      }

      case 'agent_complete': {
        const agentId = event.agent_id as string;
        if (agentStreams[agentId]) {
          set({
            agentStreams: {
              ...agentStreams,
              [agentId]: {
                ...agentStreams[agentId],
                status: 'complete',
                evaluation: event.evaluation as AgentStreamState['evaluation'],
              },
            },
          });
        }
        break;
      }

      case 'round_complete':
        // Round finished
        break;

      case 'session_complete':
        // Check if session ended due to credit depletion
        if (event.reason === 'credit_depleted') {
          set({
            error: 'Session stopped due to insufficient credits. Your work has been saved.',
            isStreaming: false,
            isPaused: false,
          });
        } else {
          set({ isStreaming: false, isPaused: false });
        }
        break;

      case 'credit_warning':
        // Log credit warning - could also show a toast notification
        console.warn('Credit warning:', event.message);
        // Optionally set a warning state that could be displayed in the UI
        // set({ creditWarning: event.message as string });
        break;

      case 'session_paused':
        set({ isPaused: true });
        break;

      case 'session_resumed':
        set({ isPaused: false });
        break;

      case 'error': {
        console.error('Stream error:', event.message);
        const errorAgentId = event.agent_id as string | undefined;
        const errorMessage = event.message as string;
        const errorType = event.error_type as string | undefined;

        // If error is associated with an agent, mark that agent as errored
        if (errorAgentId && agentStreams[errorAgentId]) {
          set({
            agentStreams: {
              ...agentStreams,
              [errorAgentId]: {
                ...agentStreams[errorAgentId],
                status: 'error',
                errorMessage: errorMessage,
              },
            },
          });
        }

        // Set user-friendly global error
        if (errorType === 'overload') {
          set({ error: errorMessage });
        } else {
          set({ error: `Error: ${errorMessage}` });
        }
        break;
      }
    }
  },

  stopSession: async () => {
    const { sessionId } = get();
    if (!sessionId) return;

    try {
      const result = await api.stopSession(sessionId);
      // Update frontend state to reflect stopped status
      set({
        isRunning: false,
        isStreaming: false,
      });
      // Reload session to get final state from database
      if (result.status === 'stopped') {
        await get().loadSession(sessionId);
      }
    } catch (err) {
      console.error('Failed to stop session:', err);
      // Even on error, try to reset the running state
      set({ isRunning: false, isStreaming: false });
    }
  },

  resetSession: async () => {
    const { sessionId } = get();
    if (!sessionId) return;

    try {
      await api.resetSession(sessionId);
      // Reset frontend state completely
      set({
        isRunning: false,
        isStreaming: false,
        sessionState: null,
        error: null,
      });
    } catch (err) {
      console.error('Failed to reset session:', err);
      // Even on error, try to reset the running state
      set({ isRunning: false, isStreaming: false });
    }
  },

  pauseSession: async () => {
    const { sessionId } = get();
    if (!sessionId) return;

    try {
      await api.pauseSession(sessionId);
      // isPaused will be set when we receive the session_paused event
    } catch (err) {
      console.error('Failed to pause session:', err);
    }
  },

  resumeSession: async () => {
    const { sessionId } = get();
    if (!sessionId) return;

    try {
      await api.resumeSession(sessionId);
      // isPaused will be cleared when we receive the session_resumed event
    } catch (err) {
      console.error('Failed to resume session:', err);
    }
  },

  pollSessionStatus: async () => {
    const { sessionId } = get();
    if (!sessionId) return;

    try {
      const sessionState = await api.getSession(sessionId);
      set({ sessionState });
    } catch (err) {
      console.error('Failed to poll session status:', err);
    }
  },

  loadSession: async (sessionId: string) => {
    set({ error: null });

    try {
      const sessionState = await api.getSession(sessionId);

      // Initialize agent streams from the session's agent config
      const initialStreams: Record<string, AgentStreamState> = {};
      sessionState.config.agents.forEach((agent) => {
        // Find the last turn for this agent to get their content
        const agentTurns = sessionState.exchange_history.filter(
          (turn) => turn.agent_id === agent.agent_id
        );
        const lastTurn = agentTurns[agentTurns.length - 1];

        initialStreams[agent.agent_id] = {
          agent_id: agent.agent_id,
          agent_name: agent.display_name,
          status: 'complete',
          content: lastTurn?.output || '',
          evaluation: lastTurn?.evaluation
            ? {
                overall_score: lastTurn.evaluation.overall_score,
                criteria_scores: lastTurn.evaluation.criteria_scores.map((cs) => ({
                  criterion: cs.criterion,
                  score: cs.score,
                })),
              }
            : null,
        };
      });

      set({
        sessionId,
        sessionState,
        title: sessionState.config.title,
        initialPrompt: sessionState.config.initial_prompt,
        workingDocument: sessionState.exchange_history.length > 0
          ? sessionState.exchange_history[sessionState.exchange_history.length - 1].working_document
          : sessionState.config.working_document,
        isRunning: sessionState.is_running,
        isPaused: sessionState.is_paused,
        currentRound: sessionState.current_round,
        agentStreams: initialStreams,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to load session',
      });
    }
  },

  continueEditing: () => {
    const { sessionState, referenceDocuments, referenceInstructions, workflowRoles, presetSelections, maxRounds, projectId } = get();

    if (!sessionState) return;

    // Get the final document from the last turn
    const finalDocument = sessionState.exchange_history.length > 0
      ? sessionState.exchange_history[sessionState.exchange_history.length - 1].working_document
      : '';

    // Keep workflow roles, reference documents, preset selections
    // Reset session state but keep the document as "working document" for further editing
    set({
      // Keep these settings
      referenceDocuments,
      referenceInstructions,
      workflowRoles,
      presetSelections,
      maxRounds,
      projectId,
      // Set final document as working document for continuation
      workingDocument: finalDocument,
      // Clear the prompt so user can add new instructions
      initialPrompt: '',
      title: 'New Writing Session',
      // Reset session state
      sessionId: null,
      sessionState: null,
      isRunning: false,
      error: null,
      isStreaming: false,
      isPaused: false,
      currentRound: 0,
      agentStreams: {},
      streamEvents: [],
    });
  },

  reset: () => {
    set({
      agents: [createDefaultAgent(0), createDefaultAgent(1)],
      title: 'New Writing Session',
      initialPrompt: '',
      workingDocument: '',
      referenceDocuments: {},
      referenceInstructions: '',
      maxRounds: 2,
      scoreThreshold: null,
      projectId: null,
      workflowRoles: getInitialWorkflowState(),
      presetSelections: {
        outletType: '',
        customOutletType: '',
        audience: '',
        customAudience: '',
        lengthRange: '',
        readingLevel: '',
        draftTreatment: 'moderate_revision',
      },
      sessionId: null,
      sessionState: null,
      isRunning: false,
      error: null,
      isStreaming: false,
      isPaused: false,
      currentRound: 0,
      agentStreams: {},
      streamEvents: [],
    });
  },
}));
