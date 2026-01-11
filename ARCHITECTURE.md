# Atelier Architecture

## Overview

Atelier is a multi-agent AI writing orchestrator that enables collaborative document creation through specialized AI roles. The system implements a three-phase editorial workflow where AI agents take on distinct roles (Writer, Editors, Synthesizer) to iteratively refine written content.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Frontend (Next.js)                            │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │ WorkflowPanel│  │ SessionSetup │  │  ResultsView │  │LiveAgentPanel│ │
│  │  (config)    │  │   (task)     │  │  (results)   │  │ (streaming) │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘ │
│                              ↓                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                    Zustand Store (session.ts)                       │ │
│  │  • workflowRoles    • sessionState    • agentStreams               │ │
│  │  • presetSelections • streamEvents    • referenceInstructions      │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                              ↓                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                      API Client (api.ts)                            │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                               │ HTTP/SSE
                               ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                           Backend (FastAPI)                             │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                    API Routes (routes.py)                           │ │
│  │  POST /sessions          POST /sessions/{id}/start-stream           │ │
│  │  POST /files/parse       GET /sessions/{id}                         │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                              ↓                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │              StreamingOrchestrator / Orchestrator                   │ │
│  │  • Role-aware task instructions                                     │ │
│  │  • Feedback aggregation (Editors → Writer)                          │ │
│  │  • Phase-based document updates                                     │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                              ↓                                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐      │
│  │ AnthropicProvider│  │  GoogleProvider  │  │  OpenAIProvider  │      │
│  │    (Claude)      │  │    (Gemini)      │  │     (GPT)        │      │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘      │
└─────────────────────────────────────────────────────────────────────────┘
```

## File Structure

### Backend (`/atelier/backend/`)

```
app/
├── main.py                 # FastAPI app entry point, CORS, lifespan
├── api/
│   └── routes.py           # REST endpoints, file parsing, session management
├── core/
│   ├── config.py           # Settings (Pydantic BaseSettings, @lru_cache)
│   ├── orchestrator.py     # Sequential orchestration engine
│   ├── streaming.py        # SSE streaming orchestration
│   └── evaluation.py       # 3-tier evaluation parsing
├── models/
│   ├── agent.py            # AgentConfig, ProviderType, ModelType enums
│   ├── session.py          # SessionConfig, SessionState, TerminationCondition
│   └── exchange.py         # ExchangeTurn, Evaluation, CriterionScore
└── providers/
    ├── base.py             # Abstract AIProvider interface
    ├── anthropic_provider.py
    ├── google_provider.py
    └── openai_provider.py
```

### Frontend (`/atelier/frontend/`)

```
src/
├── app/
│   ├── layout.tsx          # Root layout, Inter font
│   └── page.tsx            # Main app with 3-step workflow
├── components/
│   ├── WorkflowPanel.tsx   # Role configuration (Writer, Editors, Synthesizer)
│   ├── SessionSetup.tsx    # Task prompt, settings, documents
│   ├── PromptBuilder.tsx   # Preset-based prompt generation
│   ├── ReferenceMaterials.tsx  # Document upload with instructions
│   ├── ResultsView.tsx     # Final document, exchange history
│   ├── LiveAgentPanel.tsx  # Real-time streaming display
│   └── ui/                 # Reusable components (Button, Card, Input, etc.)
├── lib/
│   ├── api.ts              # ApiClient with typed methods
│   └── promptGenerator.ts  # Prompt template generation
├── store/
│   └── session.ts          # Zustand store (config, runtime, streaming state)
└── types/
    ├── index.ts            # Core types matching backend models
    ├── workflow.ts         # WorkflowRole definitions, phases
    └── presets.ts          # Document requirement presets
```

## Data Models

### Core Session Flow

```
SessionConfig (input)
    │
    ├── agents: AgentConfig[]         # Configured roles with phase
    ├── initial_prompt: string        # User's writing task
    ├── working_document: string      # Initial/existing document
    ├── reference_documents: dict     # Supporting materials
    ├── reference_instructions: str   # How to use references
    └── termination: TerminationCondition
            │
            ↓
SessionState (runtime)
    │
    ├── exchange_history: ExchangeTurn[]  # All agent outputs
    ├── current_round: int
    ├── is_running / is_paused / is_cancelled
    └── termination_reason: str | null
            │
            ↓
ExchangeTurn (per agent output)
    │
    ├── agent_id / agent_name
    ├── output: string                # Agent's text output
    ├── working_document: string      # Document state after turn
    └── evaluation: Evaluation | null # Self-assessment scores
```

### Agent Configuration

```python
class AgentConfig:
    agent_id: str              # "writer", "content_expert", etc.
    display_name: str          # "Writer", "Content Expert Editor"
    provider: ProviderType     # anthropic | google | openai
    model: ModelType           # claude-sonnet-4-5-20250929, etc.
    role_description: str      # System prompt / persona
    evaluation_criteria: list  # Self-eval rubric
    is_active: bool
    phase: int                 # 1=Writer, 2=Editors, 3=Synthesizer
```

## API Routes

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/v1/files/parse` | Parse DOCX/PDF/TXT/MD files |
| POST | `/api/v1/sessions` | Create new session |
| POST | `/api/v1/sessions/{id}/start` | Run non-streaming |
| POST | `/api/v1/sessions/{id}/start-stream` | Run with SSE streaming |
| POST | `/api/v1/sessions/{id}/stop` | Cancel session |
| POST | `/api/v1/sessions/{id}/pause` | Pause session |
| POST | `/api/v1/sessions/{id}/resume` | Resume session |
| GET | `/api/v1/sessions/{id}` | Get full session state |
| GET | `/api/v1/sessions/{id}/document` | Get current document |
| GET | `/api/v1/sessions` | List all sessions |
| GET | `/health` | Provider availability check |

## Three-Phase Editorial Workflow

```
Phase 1: Writing
┌─────────────────────────────────────────────────────────┐
│ WRITER (required)                                       │
│ • Creates initial draft from prompt                     │
│ • Receives aggregated feedback in revision rounds       │
│ • Updates the working document                          │
└─────────────────────────────────────────────────────────┘
                          ↓
Phase 2: Editorial Review (parallel, optional)
┌────────────────┐ ┌────────────────┐ ┌────────────────┐
│ CONTENT EXPERT │ │ STYLE EDITOR   │ │ FACT CHECKER   │
│ • Accuracy     │ │ • Clarity      │ │ • Verifiable   │
│ • Completeness │ │ • Rhythm       │ │   claims       │
│ • Depth        │ │ • Economy      │ │ • Sources      │
│                │ │                │ │                │
│ Feedback only  │ │ Feedback only  │ │ Feedback only  │
│ (no rewrites)  │ │ (no rewrites)  │ │ (no rewrites)  │
└────────────────┘ └────────────────┘ └────────────────┘
                          ↓
Phase 3: Synthesis (optional)
┌─────────────────────────────────────────────────────────┐
│ SYNTHESIZING EDITOR                                     │
│ • Arbitrates conflicting editor feedback                │
│ • Creates prioritized revision directive                │
│ • Provides clear hierarchy: MUST/SHOULD/can ignore      │
└─────────────────────────────────────────────────────────┘
                          ↓
                    Back to Phase 1
                  (next revision round)
```

## Streaming Architecture

```
Frontend                              Backend
   │                                     │
   │  POST /sessions/{id}/start-stream   │
   │ ─────────────────────────────────►  │
   │                                     │
   │    SSE: session_start               │
   │ ◄───────────────────────────────    │
   │                                     │
   │    SSE: round_start                 │
   │ ◄───────────────────────────────    │
   │                                     │
   │    SSE: agent_start                 │
   │ ◄───────────────────────────────    │
   │                                     │
   │    SSE: agent_token (×N)            │  ← Real-time tokens
   │ ◄───────────────────────────────    │
   │                                     │
   │    SSE: agent_complete              │
   │ ◄───────────────────────────────    │
   │                                     │
   │    ... (repeat for each agent)      │
   │                                     │
   │    SSE: round_complete              │
   │ ◄───────────────────────────────    │
   │                                     │
   │    SSE: session_complete            │
   │ ◄───────────────────────────────    │
```

## State Management (Zustand)

```typescript
useSessionStore = {
  // Configuration
  workflowRoles: WorkflowRoleState[],     // 5 editorial roles
  presetSelections: PresetSelections,      // Document requirements
  referenceInstructions: string,           // How to use uploads

  // Runtime
  sessionId: string | null,
  sessionState: SessionState | null,
  isRunning: boolean,

  // Streaming
  isStreaming: boolean,
  agentStreams: Record<string, AgentStreamState>,
  streamEvents: StreamEvent[],

  // Actions
  getActiveWorkflowAgents(): AgentConfig[],  // Convert roles → agents
  createAndStartStreamingSession(): Promise<void>,
  handleStreamEvent(event): void,
}
```

## Key Design Decisions

### 1. Phase-Based Document Updates
**Decision:** Only Writer (phase 1) modifies the working document.
**Rationale:** Editors should provide feedback, not rewrites. This preserves the writer's voice and prevents conflicting document versions.

### 2. Aggregated Feedback
**Decision:** Writer receives combined feedback from all editors in one prompt.
**Rationale:** Easier for the writer to process all suggestions at once rather than responding to each editor separately.

### 3. Three-Tier Evaluation Parsing
**Decision:** Fall back through JSON → Natural Language → Number Extraction.
**Rationale:** LLMs don't always follow JSON format perfectly. Multiple parsing strategies ensure evaluation data is captured.

### 4. SSE Over WebSockets
**Decision:** Server-Sent Events for real-time streaming.
**Rationale:** Simpler implementation, one-way data flow is sufficient, better HTTP/2 compatibility.

### 5. In-Memory Session Storage (Phase 1)
**Decision:** Store sessions in Python dict rather than database.
**Rationale:** Simplicity for initial development. Database persistence planned for Phase 5.

### 6. Workflow Roles vs Custom Agents
**Decision:** Pre-defined editorial roles with customizable prompts.
**Rationale:** Provides sensible defaults for common use cases while allowing advanced customization.

### 7. Reference Instructions Field
**Decision:** Single textarea for explaining all reference documents.
**Rationale:** More natural than per-file metadata. Users can describe relationships between documents in their own words.

## Supported Models

| Provider | Models |
|----------|--------|
| Anthropic | claude-opus-4-5-20251101, claude-sonnet-4-5-20250929, claude-sonnet-4-thinking-20250514, claude-haiku-4-5-20250110 |
| Google | gemini-2.5-pro, gemini-2.5-flash, gemini-2.0-flash |
| OpenAI | gpt-4o, gpt-4o-mini, o1, o1-mini, o3-mini |

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, React 19, TypeScript 5, Tailwind CSS 4 |
| State | Zustand 5 |
| UI Components | Radix UI primitives, Lucide icons |
| Backend | FastAPI 0.115, Python 3.11+, Pydantic 2.10 |
| AI SDKs | anthropic 0.40, google-generativeai 0.8, openai 1.58 |
| Document Parsing | python-docx, PyPDF2 |
