# Atelier Productization Roadmap

## Document Purpose

This document contains specifications for productizing Atelier from its current working prototype into a production-ready SaaS application. Each section is designed as an independent **chunk** that can be handed to a fresh Claude Code session as a self-contained brief.

**How to use this document:**
1. Complete chunks in order (dependencies noted where relevant)
2. Before starting each chunk, ensure prerequisite chunks are complete
3. Begin each session with: "Read PRODUCTIZATION_ROADMAP.md and implement Chunk N. Ask clarifying questions before starting if anything is ambiguous."
4. Reference ARCHITECTURE.md, CURRENT_STATE.md, and CONVENTIONS.md for context
5. End each session by updating CURRENT_STATE.md with progress

---

## Project Context (Current State)

```
PROJECT: Atelier
DESCRIPTION: Multi-agent AI writing orchestration platform implementing a three-phase
editorial workflow (Writer → Editors → Synthesizer) for collaborative document refinement.

CORE FUNCTIONALITY (ALREADY BUILT):
- Role-aware three-phase workflow (Writer phase 1, Editors phase 2, Synthesizer phase 3)
- Multi-provider AI integration (Anthropic, Google, OpenAI)
- Real-time SSE streaming of agent outputs
- Phase-based document updates (only Writer modifies document)
- Aggregated feedback from Editors to Writer
- Structured 3-tier evaluation parsing (JSON → NLP → Fallback)
- File upload and parsing (DOCX, PDF, TXT, MD)
- Reference document instructions field
- Termination conditions (max rounds, score threshold)
- Human-in-the-loop (pause/resume/stop)

TECH STACK:
- Frontend: Next.js 16, React 19, TypeScript 5, Tailwind CSS 4, Zustand 5
- Backend: FastAPI 0.115, Python 3.11+, Pydantic 2.10
- AI SDKs: anthropic 0.40, google-generativeai 0.8, openai 1.58
- Database: In-memory (to be replaced with PostgreSQL)
- File Storage: Local (to be replaced with S3/R2)

CURRENT LIMITATIONS:
- No user authentication
- Sessions stored in memory (lost on restart)
- No usage tracking or billing
- Single-tenant architecture

BUSINESS MODEL (PROPOSED):
- Tiered subscriptions: Free, Starter ($29), Pro ($79), Enterprise ($199)
- Credit-based usage tracking (abstracts token costs)
- Model access gated by tier
```

---

## Chunk Overview

| Chunk | Name | Status | Completed |
|-------|------|--------|-----------|
| 0 | Priority Bug Fixes | ✅ COMPLETE | 2026-01-09 |
| 1 | Database Schema & Persistence | ✅ COMPLETE | 2026-01-09 |
| 2 | Authentication System | ✅ COMPLETE | 2026-01-09 |
| 3 | User Management & Profiles | ✅ COMPLETE | 2026-01-10 |
| 4 | Projects & Organization | ✅ COMPLETE | 2026-01-10 |
| 5 | Credit System & Usage | ✅ COMPLETE | 2026-01-10 |
| 6 | Stripe Integration | ✅ COMPLETE | 2026-01-10 |
| 7 | File Storage (S3/R2) | ⏸️ DEFERRED | Using local storage |
| 8 | Feature Gating | ✅ COMPLETE | 2026-01-10 |
| 9 | Admin Dashboard | ✅ COMPLETE | 2026-01-11 |
| 10 | Security Hardening | ✅ COMPLETE | 2026-01-11 |
| 11 | Infrastructure & Deployment | 🔲 PENDING | - |
| 12 | Monitoring & Observability | 🔲 PENDING | - |

**Progress: 10 of 12 chunks complete (83%)**

---

# CHUNK 0: Priority Bug Fixes

## Prerequisites
- None (do this first)

## Objective
Fix the known bugs and technical debt before adding new features. A stable foundation is essential.

## Current Issues (from CURRENT_STATE.md)

### 0.1 Fix Phase Execution Order

**Current behavior:** All agents execute sequentially in array order.
**Expected behavior:** Phase 1 (Writer) → Phase 2 (all Editors) → Phase 3 (Synthesizer) → back to Phase 1

**Files to modify:**
- `backend/app/core/streaming.py` - `run_streaming()` method
- `backend/app/core/orchestrator.py` - `run_sequential()` method

**Implementation:**
```python
# In both orchestrator.py and streaming.py

def _get_agents_by_phase(self) -> dict[int, list[AgentConfig]]:
    """Group active agents by phase."""
    active = [a for a in self.state.config.agents if a.is_active]
    phases = {1: [], 2: [], 3: []}
    for agent in active:
        phase = getattr(agent, 'phase', 2)  # Default to editor if not set
        phases[phase].append(agent)
    return phases

# In run_sequential/run_streaming, execute in phase order:
phases = self._get_agents_by_phase()
for phase_num in [1, 2, 3]:
    for agent in phases[phase_num]:
        # Execute agent
        pass
```

### 0.2 Add Role-Specific Evaluation Criteria

**Current:** All roles get generic "Quality" criterion.
**Expected:** Each role has domain-specific criteria.

**Files to modify:**
- `frontend/src/types/workflow.ts` - Add `evaluationCriteria` to `WorkflowRole`
- `frontend/src/store/session.ts` - Update `getActiveWorkflowAgents()` (~line 207)

**Implementation:**
```typescript
// In workflow.ts, add to each DEFAULT_WORKFLOW_ROLES entry:
{
  id: 'writer',
  name: 'Writer',
  phase: 1,
  evaluationCriteria: [
    { name: 'Clarity', description: 'Writing is clear and understandable', weight: 1.0 },
    { name: 'Engagement', description: 'Content is compelling to read', weight: 1.0 },
    { name: 'Completeness', description: 'All key points are addressed', weight: 1.0 },
  ],
  // ... rest of role config
},
{
  id: 'content_expert',
  name: 'Content Expert Editor',
  phase: 2,
  evaluationCriteria: [
    { name: 'Accuracy', description: 'Information is factually correct', weight: 1.0 },
    { name: 'Depth', description: 'Topic is covered thoroughly', weight: 1.0 },
  ],
  // ...
},
{
  id: 'style_editor',
  name: 'Style Editor',
  phase: 2,
  evaluationCriteria: [
    { name: 'Tone', description: 'Voice matches target audience', weight: 1.0 },
    { name: 'Flow', description: 'Transitions are smooth', weight: 1.0 },
  ],
  // ...
},
// etc.

// In session.ts getActiveWorkflowAgents():
evaluation_criteria: role.evaluationCriteria || [{ name: 'Quality', weight: 1.0 }],
```

### 0.3 Fix Bare Except Clauses

**Files:**
- `backend/app/core/orchestrator.py` - Around JSON parsing
- `backend/app/core/streaming.py` - Around JSON parsing

**Change from:**
```python
except:
    output = full_response
```

**To:**
```python
except (json.JSONDecodeError, KeyError, TypeError, ValueError) as e:
    logger.warning(f"Failed to parse structured output: {e}")
    output = full_response
```

### 0.4 Fix datetime.utcnow() Deprecation

**Files:** `orchestrator.py`, `streaming.py`

**Change from:**
```python
from datetime import datetime
datetime.utcnow()
```

**To:**
```python
from datetime import datetime, timezone
datetime.now(timezone.utc)
```

### 0.5 Clean Up Unused Code

**Delete legacy files (if unused):**
- `frontend/src/components/AgentPanel.tsx`
- `frontend/src/components/AgentCard.tsx`

**Verify they're not imported anywhere before deletion.**

## Deliverables
1. Phase execution order fixed and tested
2. Role-specific evaluation criteria added
3. Bare except clauses replaced with specific exceptions
4. datetime.utcnow() replaced with timezone-aware version
5. Dead code removed

## Verification
- [x] Agents execute in correct phase order: Writer → Editors → Synthesizer
- [x] Each role shows its own evaluation criteria in prompts
- [x] No `except:` without specific exception types
- [x] No deprecation warnings in logs
- [x] Codebase has no unused component imports

### ✅ CHUNK 0 COMPLETE (2026-01-09)
All bug fixes implemented and verified.

---

# CHUNK 1: Database Schema & Persistence

## Prerequisites
- Chunk 0 complete

## Objective
Replace in-memory session storage with PostgreSQL database persistence.

## Specifications

### 1.1 Technology Choice

**Database:** PostgreSQL (production) + SQLite (development)
**ORM:** SQLAlchemy 2.0 with async support
**Migrations:** Alembic

### 1.2 Core Schema

```sql
-- Sessions (maps to existing SessionState)
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,  -- NULL for now, required after auth
    title VARCHAR(200) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',  -- draft, running, paused, completed, failed
    initial_prompt TEXT NOT NULL,
    working_document TEXT,
    reference_documents JSONB DEFAULT '{}',
    reference_instructions TEXT,
    agent_config JSONB NOT NULL,  -- Full AgentConfig[] snapshot
    termination_config JSONB NOT NULL,  -- TerminationCondition
    current_round INTEGER DEFAULT 0,
    termination_reason VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Exchange history (maps to ExchangeTurn[])
CREATE TABLE exchange_turns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    agent_id VARCHAR(100) NOT NULL,
    agent_name VARCHAR(200) NOT NULL,
    round_number INTEGER NOT NULL,
    phase INTEGER NOT NULL,
    output TEXT NOT NULL,
    working_document TEXT,  -- Document state after this turn (NULL for editors)
    evaluation JSONB,  -- Evaluation scores
    tokens_input INTEGER,
    tokens_output INTEGER,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Document versions (for future version history feature)
CREATE TABLE document_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    content TEXT NOT NULL,
    word_count INTEGER,
    created_by VARCHAR(100) NOT NULL,  -- agent_id or 'user'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(session_id, version_number)
);

-- Indexes
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_exchange_turns_session ON exchange_turns(session_id);
CREATE INDEX idx_document_versions_session ON document_versions(session_id);
```

### 1.3 File Structure

```
backend/app/
├── db/
│   ├── __init__.py
│   ├── database.py      # Connection setup, session factory
│   ├── models.py        # SQLAlchemy models
│   └── repository.py    # Data access layer
├── migrations/          # Alembic migrations
│   ├── env.py
│   └── versions/
│       └── 001_initial_schema.py
```

### 1.4 Database Connection

```python
# backend/app/db/database.py
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "sqlite+aiosqlite:///./atelier.db"  # Dev default
)

engine = create_async_engine(DATABASE_URL, echo=False)
async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def get_db():
    async with async_session() as session:
        yield session
```

### 1.5 Repository Pattern

```python
# backend/app/db/repository.py
class SessionRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, config: SessionConfig) -> Session:
        session = Session(
            title=config.title or "Untitled Session",
            initial_prompt=config.initial_prompt,
            working_document=config.working_document,
            reference_documents=config.reference_documents,
            reference_instructions=config.reference_instructions,
            agent_config=[a.model_dump() for a in config.agents],
            termination_config=config.termination.model_dump(),
        )
        self.db.add(session)
        await self.db.commit()
        await self.db.refresh(session)
        return session

    async def get(self, session_id: UUID) -> Optional[Session]:
        return await self.db.get(Session, session_id)

    async def update(self, session: Session) -> Session:
        session.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        return session

    async def add_exchange_turn(self, session_id: UUID, turn: ExchangeTurn) -> None:
        db_turn = ExchangeTurnModel(
            session_id=session_id,
            agent_id=turn.agent_id,
            agent_name=turn.agent_name,
            round_number=turn.round_number,
            phase=turn.phase,
            output=turn.output,
            working_document=turn.working_document,
            evaluation=turn.evaluation.model_dump() if turn.evaluation else None,
        )
        self.db.add(db_turn)
        await self.db.commit()
```

### 1.6 Migration from In-Memory

**Current in-memory storage in routes.py:**
```python
sessions: dict[str, SessionState] = {}  # Remove this
```

**Replace with dependency injection:**
```python
@router.post("/sessions")
async def create_session(
    config: SessionConfig,
    db: AsyncSession = Depends(get_db)
):
    repo = SessionRepository(db)
    session = await repo.create(config)
    return {"session_id": str(session.id), "status": "created"}
```

### 1.7 Update Orchestrators

Both `orchestrator.py` and `streaming.py` need to:
1. Accept a database session
2. Persist state changes as they happen
3. Save exchange turns immediately after each agent completes

### 1.8 Environment Variables

```bash
# .env additions
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/atelier
# Or for SQLite dev: sqlite+aiosqlite:///./atelier.db
```

## Deliverables
1. SQLAlchemy models matching schema
2. Alembic migrations
3. Repository pattern implementation
4. Routes updated to use database
5. Orchestrators save state to database
6. Remove in-memory `sessions` dict
7. .env.example updated

## Verification
- [x] Can create session (persisted to database)
- [x] Can retrieve session after server restart
- [x] Exchange turns saved during orchestration
- [x] Session status updates persisted
- [x] Migration can be run on fresh database
- [x] SQLite works for local development

### ✅ CHUNK 1 COMPLETE (2026-01-09)
Database persistence fully implemented with SQLAlchemy 2.0 async, repository pattern, and auto-migration on startup.

---

# CHUNK 2: Authentication System

## Prerequisites
- Chunk 1 (Database) complete

## Objective
Add user authentication to enable multi-tenancy.

## Specifications

### 2.1 Provider Recommendation

**Recommended: Clerk** (best DX, generous free tier, React components)
- Hosted authentication (no password management)
- React hooks and components
- Webhook for user provisioning

**Alternative: Auth.js (NextAuth)** if you prefer self-hosted

### 2.2 Database Additions

```sql
-- Users table (synced from auth provider)
CREATE TABLE users (
    id UUID PRIMARY KEY,  -- From auth provider
    email VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(200),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Update sessions table
ALTER TABLE sessions
    ALTER COLUMN user_id SET NOT NULL,
    ADD CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id);
```

### 2.3 Backend Integration

```python
# backend/app/core/auth.py
from fastapi import Depends, HTTPException, Request
from clerk_backend_api import Clerk

clerk = Clerk(api_key=os.environ["CLERK_SECRET_KEY"])

async def get_current_user(request: Request, db: AsyncSession = Depends(get_db)):
    """Verify Clerk session and return user."""
    session_token = request.headers.get("Authorization", "").replace("Bearer ", "")

    if not session_token:
        raise HTTPException(401, "Not authenticated")

    try:
        session = await clerk.sessions.verify(session_token)
        user_id = session.user_id
    except Exception:
        raise HTTPException(401, "Invalid session")

    # Get or create local user record
    user = await db.get(User, user_id)
    if not user:
        clerk_user = await clerk.users.get(user_id)
        user = User(
            id=user_id,
            email=clerk_user.email_addresses[0].email_address,
            display_name=clerk_user.first_name,
        )
        db.add(user)
        await db.commit()

    return user

# Apply to routes
@router.post("/sessions")
async def create_session(
    config: SessionConfig,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    repo = SessionRepository(db)
    session = await repo.create(config, user_id=user.id)
    return {"session_id": str(session.id)}
```

### 2.4 Frontend Integration

```typescript
// frontend/src/app/layout.tsx
import { ClerkProvider } from '@clerk/nextjs';

export default function RootLayout({ children }) {
  return (
    <ClerkProvider>
      <html>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}

// frontend/src/app/page.tsx
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/nextjs';

export default function Home() {
  return (
    <div>
      <SignedOut>
        <SignInButton />
      </SignedOut>
      <SignedIn>
        <UserButton />
        <MainApp />  {/* Your existing app */}
      </SignedIn>
    </div>
  );
}

// frontend/src/lib/api.ts - Add auth header
async function authFetch(url: string, options: RequestInit = {}) {
  const { getToken } = useAuth();
  const token = await getToken();

  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
    },
  });
}
```

### 2.5 Data Isolation

**Critical:** All queries must be scoped by user_id.

```python
class SessionRepository:
    async def list_for_user(self, user_id: UUID) -> list[Session]:
        result = await self.db.execute(
            select(Session).where(Session.user_id == user_id)
        )
        return result.scalars().all()

    async def get_for_user(self, session_id: UUID, user_id: UUID) -> Optional[Session]:
        result = await self.db.execute(
            select(Session).where(
                Session.id == session_id,
                Session.user_id == user_id
            )
        )
        return result.scalar_one_or_none()
```

### 2.6 Environment Variables

```bash
# Backend
CLERK_SECRET_KEY=sk_live_...

# Frontend
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
```

## Deliverables
1. Clerk account setup
2. Users table and migration
3. Backend auth middleware
4. Frontend Clerk integration
5. API client with auth headers
6. All routes protected
7. User-scoped data access

## Verification
- [x] Can sign up new account
- [x] Can sign in/out
- [x] Unauthenticated requests return 401
- [x] Users can only see their own sessions
- [x] User record created on first auth

### ✅ CHUNK 2 COMPLETE (2026-01-09)
Clerk JWT authentication implemented with auto-provisioning of users on first login. Development mode with dev_user when auth is disabled.

---

# CHUNK 3: User Management & Profiles

## Prerequisites
- Chunks 1, 2 complete

## Objective
User settings, preferences, and account management.

## Specifications

### 3.1 Database Additions

```sql
CREATE TABLE user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    timezone VARCHAR(50) DEFAULT 'UTC',
    preferences JSONB DEFAULT '{}',  -- UI preferences, default agent configs
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 3.2 Preferences Structure

```python
class UserPreferences(BaseModel):
    """User preferences stored in JSONB."""
    default_provider: Optional[str] = None  # anthropic, google, openai
    default_model: Optional[str] = None
    default_max_rounds: int = 5
    show_evaluation_details: bool = True
    theme: str = "light"  # For future dark mode
```

### 3.3 API Routes

```
GET    /users/me              - Get current user with profile
PATCH  /users/me              - Update display name
PUT    /users/me/preferences  - Update preferences
DELETE /users/me              - Delete account (GDPR)
POST   /users/me/export       - Export all user data (GDPR)
```

### 3.4 Frontend Settings Page

```
/settings
├── /settings/profile     - Display name, timezone
├── /settings/preferences - Default agent config, UI settings
└── /settings/account     - Delete account, export data
```

### 3.5 Account Deletion

```python
async def delete_user_account(user_id: UUID, db: AsyncSession):
    """GDPR-compliant account deletion."""
    # Delete all user data
    await db.execute(delete(Session).where(Session.user_id == user_id))
    await db.execute(delete(UserProfile).where(UserProfile.user_id == user_id))
    await db.execute(delete(User).where(User.id == user_id))
    await db.commit()

    # Also delete from Clerk
    await clerk.users.delete(user_id)
```

## Deliverables
1. UserProfile model and migration
2. Profile API endpoints
3. Settings page UI
4. Preferences management
5. Account deletion flow
6. Data export (JSON download)

## Verification
- [x] Can update display name
- [x] Preferences persist across sessions
- [x] Account deletion removes all data
- [x] Data export includes all user content

### ✅ CHUNK 3 COMPLETE (2026-01-10)
User profiles with preferences (default provider, model, theme), GDPR-compliant data export, and account deletion.

---

# CHUNK 4: Projects & Workspace Organization

## Prerequisites
- Chunks 1, 2 complete

## Objective
Allow users to organize sessions into projects.

## Specifications

### 4.1 Database

```sql
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    default_agent_config JSONB,  -- Default agents for new sessions
    archived_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE sessions ADD COLUMN project_id UUID REFERENCES projects(id);
CREATE INDEX idx_sessions_project ON sessions(project_id);
CREATE INDEX idx_projects_user ON projects(user_id);
```

### 4.2 API Routes

```
GET    /projects              - List user's projects
POST   /projects              - Create project
GET    /projects/:id          - Get project with sessions
PATCH  /projects/:id          - Update project
DELETE /projects/:id          - Archive project
GET    /projects/:id/sessions - List sessions in project
```

### 4.3 Frontend Components

**Sidebar with project tree:**
```
Projects
├── All Sessions
├── Blog Posts (5)
│   ├── Article Draft
│   └── Review Response
├── Reports (3)
└── + New Project
```

**Components needed:**
- ProjectList (sidebar)
- CreateProjectModal
- ProjectSettingsModal
- MoveSessionModal (move session to different project)

## Deliverables
1. Projects table and migration
2. Project CRUD endpoints
3. Session-project association
4. Sidebar navigation component
5. Project management modals

## Verification
- [x] Can create/rename/archive projects
- [x] Sessions can be assigned to projects
- [x] Sessions can be moved between projects
- [x] Archived projects hidden from main view

### ✅ CHUNK 4 COMPLETE (2026-01-10)
Projects for session organization with full CRUD, archive/unarchive, and session movement between projects.

---

# CHUNK 5: Credit System & Usage Tracking

## Prerequisites
- Chunks 1, 2 complete

## Objective
Implement credit-based usage metering.

## Specifications

### 5.1 Credit Economics

```python
# Token to credit conversion
BASE_TOKENS_PER_CREDIT = 10_000  # 1 credit = 10K tokens

# Model multipliers (more expensive models cost more credits)
MODEL_CREDIT_MULTIPLIERS = {
    # Anthropic
    'claude-opus-4-5-20251101': 3.0,
    'claude-sonnet-4-5-20250929': 1.0,
    'claude-sonnet-4-thinking-20250514': 1.5,
    'claude-haiku-4-5-20250110': 0.25,

    # Google
    'gemini-2.5-pro': 1.2,
    'gemini-2.5-flash': 0.4,
    'gemini-2.0-flash': 0.3,

    # OpenAI
    'gpt-4o': 1.0,
    'gpt-4o-mini': 0.25,
    'o1': 4.0,
    'o1-mini': 1.5,
    'o3-mini': 2.0,
}

def calculate_credits(model: str, input_tokens: int, output_tokens: int) -> int:
    total_tokens = input_tokens + output_tokens
    base_credits = total_tokens / BASE_TOKENS_PER_CREDIT
    multiplier = MODEL_CREDIT_MULTIPLIERS.get(model, 1.0)
    return math.ceil(base_credits * multiplier)
```

### 5.2 Database

```sql
CREATE TABLE credit_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    balance INTEGER NOT NULL DEFAULT 0,
    lifetime_used INTEGER NOT NULL DEFAULT 0,
    last_grant_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    amount INTEGER NOT NULL,  -- Positive = grant, negative = usage
    type VARCHAR(50) NOT NULL,  -- 'subscription_grant', 'purchase', 'usage', 'refund'
    description TEXT,
    session_id UUID REFERENCES sessions(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add token tracking to exchange_turns
ALTER TABLE exchange_turns
    ADD COLUMN tokens_input INTEGER,
    ADD COLUMN tokens_output INTEGER,
    ADD COLUMN credits_used INTEGER;

-- Add total to sessions
ALTER TABLE sessions ADD COLUMN total_credits_used INTEGER DEFAULT 0;
```

### 5.3 Tier Allocations

```python
TIER_MONTHLY_CREDITS = {
    'free': 20,
    'starter': 150,
    'pro': 500,
    'enterprise': 2000,
}
```

### 5.4 Integration with Orchestrators

```python
# In streaming.py after each agent completes
tokens_in = response.usage.input_tokens
tokens_out = response.usage.output_tokens
credits = calculate_credits(agent.model, tokens_in, tokens_out)

# Deduct credits
await credit_service.deduct(user_id, credits, session_id, f"Agent: {agent.display_name}")

# Store in exchange turn
turn.tokens_input = tokens_in
turn.tokens_output = tokens_out
turn.credits_used = credits
```

### 5.5 Pre-Session Estimation

Show estimated cost before starting:

```python
def estimate_session_credits(
    document_words: int,
    agents: list[AgentConfig],
    max_rounds: int
) -> int:
    """Rough estimate of session cost."""
    avg_tokens_per_round = document_words * 1.5 * 2  # Input + output
    total_estimate = 0

    for agent in agents:
        multiplier = MODEL_CREDIT_MULTIPLIERS.get(agent.model, 1.0)
        agent_credits = (avg_tokens_per_round / BASE_TOKENS_PER_CREDIT) * multiplier
        total_estimate += agent_credits

    return math.ceil(total_estimate * max_rounds / len(agents))
```

### 5.6 API Routes

```
GET  /credits/balance   - Current balance
GET  /credits/history   - Transaction history
POST /credits/estimate  - Estimate session cost
```

### 5.7 Frontend Components

**Credit display in header:**
```
Credits: 142 / 500 [████████░░]
```

**Pre-session estimate in SessionSetup:**
```
Estimated cost: ~12 credits
Your balance: 142 credits
[Start Session]
```

## Deliverables
1. Credit calculation logic
2. Database tables for balances and transactions
3. Credit deduction during orchestration
4. Token tracking per exchange turn
5. Credit display in UI header
6. Pre-session estimate display
7. Insufficient credits blocking

## Verification
- [x] Credits calculated correctly per model
- [x] Balance updates after each API call
- [x] Transaction history accurate
- [x] Session blocked if insufficient credits
- [x] Estimate shown before session start

### ✅ CHUNK 5 COMPLETE (2026-01-10)
Full credit system with model multipliers, real-time balance tracking, transaction history, pre-session estimation, and insufficient credits blocking.

---

# CHUNK 6: Stripe Integration & Subscriptions

## Prerequisites
- Chunks 1, 2, 5 complete

## Objective
Implement subscription billing with Stripe.

## Specifications

### 6.1 Database

```sql
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id),
    tier VARCHAR(20) NOT NULL DEFAULT 'free',  -- free, starter, pro, enterprise
    status VARCHAR(20) NOT NULL DEFAULT 'active',  -- active, canceled, past_due
    stripe_subscription_id VARCHAR(100) UNIQUE,
    stripe_customer_id VARCHAR(100),
    current_period_start TIMESTAMP WITH TIME ZONE,
    current_period_end TIMESTAMP WITH TIME ZONE,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 6.2 Stripe Setup

Create in Stripe Dashboard:
- Product: "Atelier Subscription"
- Prices: Starter ($29/mo), Pro ($79/mo), Enterprise ($199/mo)

### 6.3 Checkout Flow

```python
@router.post("/billing/checkout")
async def create_checkout(
    tier: str,
    user: User = Depends(get_current_user)
):
    price_id = STRIPE_PRICE_IDS[tier]

    # Get or create Stripe customer
    sub = await get_subscription(user.id)
    if not sub.stripe_customer_id:
        customer = stripe.Customer.create(email=user.email)
        sub.stripe_customer_id = customer.id
        await db.commit()

    session = stripe.checkout.Session.create(
        customer=sub.stripe_customer_id,
        line_items=[{'price': price_id, 'quantity': 1}],
        mode='subscription',
        success_url=f"{FRONTEND_URL}/settings/billing?success=true",
        cancel_url=f"{FRONTEND_URL}/settings/billing",
        metadata={'user_id': str(user.id), 'tier': tier}
    )

    return {"url": session.url}
```

### 6.4 Webhook Handler

```python
@router.post("/webhooks/stripe")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get('stripe-signature')
    event = stripe.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)

    if event['type'] == 'checkout.session.completed':
        # Activate subscription, grant credits
        pass
    elif event['type'] == 'invoice.paid':
        # Monthly renewal - grant credits
        pass
    elif event['type'] == 'customer.subscription.deleted':
        # Downgrade to free
        pass

    return {"status": "ok"}
```

### 6.5 API Routes

```
GET  /billing/subscription  - Current subscription status
POST /billing/checkout      - Create checkout session
POST /billing/cancel        - Cancel at period end
POST /billing/portal        - Get Stripe portal URL
```

### 6.6 Frontend

**Billing page components:**
- Current plan display
- Upgrade/downgrade buttons
- Cancel subscription
- Invoice history (via Stripe portal)

## Deliverables
1. Stripe account and products configured
2. Subscriptions table
3. Checkout flow
4. Webhook handling
5. Credit grant on subscription/renewal
6. Billing settings page

## Verification
- [x] Can subscribe to paid tier
- [x] Credits granted after checkout
- [x] Monthly renewal grants credits
- [x] Can cancel subscription
- [x] Downgrade to free works

### ✅ CHUNK 6 COMPLETE (2026-01-10)
Stripe integration with checkout flow, webhook handling, billing portal, subscription management, and automatic monthly credit grants.

---

# CHUNK 7: File Storage (S3/R2)

## Prerequisites
- Chunks 1, 2 complete

## Objective
Replace local file handling with cloud storage.

## Specifications

### 7.1 Storage Choice

**Recommended:** Cloudflare R2 (S3-compatible, no egress fees)
**Alternative:** AWS S3

### 7.2 Database

```sql
CREATE TABLE files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    session_id UUID REFERENCES sessions(id),
    project_id UUID REFERENCES projects(id),
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_type VARCHAR(50) NOT NULL,  -- reference, export
    mime_type VARCHAR(100) NOT NULL,
    size_bytes INTEGER NOT NULL,
    storage_path VARCHAR(500) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 7.3 Upload Flow

```python
@router.post("/files/upload")
async def upload_file(
    file: UploadFile,
    session_id: Optional[UUID] = None,
    user: User = Depends(get_current_user)
):
    # Validate
    if file.size > MAX_FILE_SIZE:
        raise HTTPException(400, "File too large")

    # Upload to R2/S3
    file_id = uuid4()
    storage_path = f"users/{user.id}/files/{file_id}_{file.filename}"

    s3.upload_fileobj(file.file, BUCKET, storage_path)

    # Parse content for reference documents
    content = await parse_file(file)

    # Save record
    db_file = File(
        id=file_id,
        user_id=user.id,
        session_id=session_id,
        filename=file.filename,
        storage_path=storage_path,
        # ...
    )

    return {"file_id": file_id, "content": content}
```

### 7.4 Update ReferenceMaterials Component

Instead of sending full file content to backend, upload file and reference by ID.

## Deliverables
1. R2/S3 bucket setup
2. Files table
3. Upload endpoint
4. Download with pre-signed URLs
5. Storage quota per tier
6. Update frontend file handling

## Verification
- [ ] Files upload to cloud storage
- [ ] Files retrievable via pre-signed URL
- [ ] Storage quota enforced
- [ ] File deletion cleans up storage

### ⏸️ CHUNK 7 DEFERRED
Using local file handling for now. Will implement S3/R2 when scaling requires it.

---

# CHUNK 8: Feature Gating / Entitlements

## Prerequisites
- Chunks 2, 5, 6 complete

## Objective
Gate features based on subscription tier.

## Specifications

### 8.1 Entitlement Definitions

```python
TIER_ENTITLEMENTS = {
    'free': {
        'max_sessions_per_month': 5,
        'max_projects': 2,
        'max_agents': 2,
        'max_rounds': 3,
        'max_document_words': 3000,
        'models': ['claude-haiku-4-5-20250110', 'gemini-2.0-flash', 'gpt-4o-mini'],
        'version_history': False,
    },
    'starter': {
        'max_sessions_per_month': 30,
        'max_projects': 10,
        'max_agents': 3,
        'max_rounds': 6,
        'max_document_words': 15000,
        'models': ['claude-haiku-4-5-20250110', 'claude-sonnet-4-5-20250929',
                   'gemini-2.5-flash', 'gemini-2.0-flash', 'gpt-4o-mini', 'gpt-4o'],
        'version_history': True,
    },
    'pro': {
        'max_sessions_per_month': 100,
        'max_projects': 50,
        'max_agents': 4,  # All roles
        'max_rounds': 12,
        'max_document_words': 50000,
        'models': ['claude-haiku-4-5-20250110', 'claude-sonnet-4-5-20250929',
                   'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash',
                   'gpt-4o-mini', 'gpt-4o', 'o1-mini'],
        'version_history': True,
    },
    'enterprise': {
        'max_sessions_per_month': None,  # Unlimited
        'max_projects': None,
        'max_agents': 4,
        'max_rounds': 20,
        'max_document_words': 100000,
        'models': ['*'],  # All including Opus, o1, o3
        'version_history': True,
    },
}
```

### 8.2 Enforcement

```python
class EntitlementChecker:
    def __init__(self, user_id: UUID, db: AsyncSession):
        self.subscription = await get_subscription(user_id, db)
        self.entitlements = TIER_ENTITLEMENTS[self.subscription.tier]

    def can_use_model(self, model: str) -> tuple[bool, str]:
        allowed = self.entitlements['models']
        if '*' in allowed or model in allowed:
            return True, ""
        return False, f"Model {model} requires upgrade to access."

    def can_create_session(self) -> tuple[bool, str]:
        # Check monthly limit
        # ...
```

### 8.3 Frontend Gating

```typescript
// Disable/lock models not in user's tier
<ModelSelector
  allowedModels={entitlements.models}
  onUpgradeClick={() => setShowUpgradeModal(true)}
/>
```

## Deliverables
1. Entitlement definitions
2. EntitlementChecker class
3. Backend enforcement on routes
4. Frontend model/feature gating
5. Upgrade prompts when hitting limits

## Verification
- [x] Free tier limited to 2 agents
- [x] Free tier cannot use Sonnet
- [x] Session blocked at monthly limit
- [x] Upgrade prompts shown appropriately

### ✅ CHUNK 8 COMPLETE (2026-01-10)
Tier-based feature gating with entitlement definitions, server-side enforcement, and frontend model/feature restrictions.

---

# CHUNK 9: Admin Dashboard

## Prerequisites
- Chunks 1-6 complete

## Objective
Administrative interface for monitoring and management.

## Specifications

### 9.1 Admin Routes

```
GET /admin/stats         - Dashboard metrics
GET /admin/users         - User list
GET /admin/users/:id     - User detail
POST /admin/users/:id/credits  - Grant credits
GET /admin/sessions      - All sessions
```

### 9.2 Dashboard Metrics

- Total users by tier
- Active users (last 7 days)
- Sessions today/week/month
- Credits consumed
- Revenue (MRR)

### 9.3 Admin Authorization

```python
def require_admin(user: User = Depends(get_current_user)):
    if user.email not in ADMIN_EMAILS:
        raise HTTPException(403, "Admin access required")
    return user
```

## Deliverables
1. Admin authentication
2. Stats endpoints
3. User management
4. Dashboard UI
5. Manual credit grants

## Verification
- [x] Non-admin user gets 403 on /admin/* endpoints
- [x] Admin user can access all admin endpoints
- [x] List users with pagination
- [x] Search users by email
- [x] Grant credits with audit trail
- [x] Toggle admin status
- [x] Dashboard shows correct counts
- [x] Revenue calculated correctly by tier
- [x] All sessions visible across users
- [x] Failed sessions highlighted
- [x] Can filter by status/user

### ✅ CHUNK 9 COMPLETE (2026-01-11)
Admin dashboard with full operational visibility: dashboard stats (users, MRR, sessions, credits), user management with search/filter, credit grants with audit trail, admin status toggling, revenue and usage analytics, session monitoring with failed session alerts, and transaction history. Rate-limited endpoints (60/min reads, 30/min grants, 10/min admin changes).

---

# CHUNK 10: Security Hardening

## Prerequisites
- All above chunks

## Objective
Production security review and hardening.

## Checklist

- [x] All endpoints require authentication
- [x] All data queries scoped by user_id
- [x] Rate limiting on all endpoints (slowapi)
- [x] CORS configured for environment-based origins
- [x] Input validation on all endpoints
- [x] No secrets in code
- [x] SQL injection prevented (using ORM)
- [x] XSS prevented (security headers)
- [x] Security headers (X-Content-Type-Options, X-Frame-Options, X-XSS-Protection)
- [x] Request logging with timing audit trail

## Implementation

```python
# Rate limiting
from slowapi import Limiter
limiter = Limiter(key_func=get_remote_address)

@router.post("/sessions")
@limiter.limit("10/minute")
async def create_session(...):
    pass

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ["FRONTEND_URL"]],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### ✅ CHUNK 10 COMPLETE (2026-01-11)
Security hardening implemented with slowapi rate limiting on all endpoints, security headers middleware (X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy), request logging with timing audit trail, environment-based CORS configuration, and user-scoped data access enforcement.

---

# CHUNK 11: Infrastructure & Deployment

## Prerequisites
- All above chunks

## Objective
Deploy to production.

## Recommended Stack

**Hosting:** Railway or Render (simplest)
**Database:** Managed PostgreSQL (from hosting provider)
**Files:** Cloudflare R2
**Domain/CDN:** Cloudflare

## Environment Variables

```bash
# App
APP_ENV=production
FRONTEND_URL=https://app.atelier.com

# Database
DATABASE_URL=postgresql+asyncpg://...

# Auth
CLERK_SECRET_KEY=sk_live_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...

# AI
ANTHROPIC_API_KEY=...
GOOGLE_API_KEY=...
OPENAI_API_KEY=...

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Storage
R2_BUCKET=...
R2_ACCESS_KEY=...
R2_SECRET_KEY=...
```

## CI/CD

```yaml
# .github/workflows/deploy.yml
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy
        run: railway up
```

---

# CHUNK 12: Monitoring & Observability

## Prerequisites
- Chunk 11 complete

## Objective
Production monitoring and error tracking.

## Implementation

### Sentry (Error Tracking)

```python
import sentry_sdk
sentry_sdk.init(dsn=os.environ["SENTRY_DSN"])
```

### Health Endpoint

```python
@app.get("/health")
async def health():
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc)}
```

### Uptime Monitoring

Use UptimeRobot or Better Uptime to monitor `/health`.

---

# Quick Reference

## Starting a Fresh Session

1. Read: ARCHITECTURE.md, CURRENT_STATE.md, CONVENTIONS.md
2. Check: Which chunk to implement
3. Run project:
   ```bash
   # Backend
   cd atelier/backend && source venv/bin/activate && uvicorn app.main:app --reload

   # Frontend
   cd atelier/frontend && npm run dev
   ```
4. Implement chunk deliverables
5. Update CURRENT_STATE.md with progress

## Key File Locations

| Task | Files |
|------|-------|
| Orchestration | `backend/app/core/orchestrator.py`, `streaming.py` |
| Routes | `backend/app/api/routes.py` |
| Models | `backend/app/models/*.py` |
| Store | `frontend/src/store/session.ts` |
| Types | `frontend/src/types/index.ts`, `workflow.ts` |
| Components | `frontend/src/components/*.tsx` |
