# Atelier - Multi-Agent Writing Orchestrator

Atelier is a production-ready SaaS application that enables users to configure multiple AI agents with distinct roles to collaboratively write and refine documents through structured feedback loops.

## Project Status

**Current Status: Production Ready (Chunks 0-10 Complete)**

The application implements a full productization stack:

### Core Features
- ✅ Three-phase editorial workflow (Writer → Editors → Synthesizer)
- ✅ Real-time SSE streaming of agent outputs
- ✅ Support for Anthropic Claude, Google Gemini, and OpenAI models
- ✅ Structured 3-tier evaluation parsing (JSON → NLP → Fallback)
- ✅ Configurable termination conditions (max rounds + score threshold)
- ✅ Human-in-the-loop (pause/resume/stop)

### Infrastructure
- ✅ SQLite/PostgreSQL database persistence
- ✅ Clerk authentication with JWT verification
- ✅ User profiles and preferences
- ✅ Projects for session organization

### Monetization
- ✅ Credit-based usage tracking with model multipliers
- ✅ Stripe subscription billing (Free, Starter $29, Pro $79)
- ✅ Tier-based feature gating
- ✅ Monthly credit grants

### Operations
- ✅ Admin dashboard with analytics
- ✅ User management and credit grants
- ✅ Session monitoring
- ✅ Rate limiting and security headers

**Remaining Work:**
- Chunk 11: Infrastructure & Deployment
- Chunk 12: Monitoring & Observability

See [CURRENT_STATE.md](CURRENT_STATE.md) for detailed status and [PRODUCTIZATION_ROADMAP.md](PRODUCTIZATION_ROADMAP.md) for implementation details.

## Architecture

```
atelier/
├── backend/
│   ├── app/
│   │   ├── core/
│   │   │   ├── orchestrator.py      # Core orchestration engine
│   │   │   ├── streaming.py         # SSE streaming orchestrator
│   │   │   ├── evaluation.py        # 3-tier evaluation parsing
│   │   │   ├── credits.py           # Credit calculation & deduction
│   │   │   ├── config.py            # Environment configuration
│   │   │   ├── auth.py              # Clerk JWT authentication
│   │   │   └── security.py          # Rate limiting, headers
│   │   ├── models/
│   │   │   ├── agent.py             # Agent configuration
│   │   │   ├── session.py           # Session config & state
│   │   │   ├── exchange.py          # Exchange turns & evaluations
│   │   │   └── user.py              # User preferences
│   │   ├── providers/
│   │   │   ├── base.py              # Abstract provider interface
│   │   │   ├── anthropic_provider.py
│   │   │   ├── google_provider.py
│   │   │   └── openai_provider.py
│   │   ├── db/
│   │   │   ├── database.py          # SQLAlchemy connection
│   │   │   ├── models.py            # Database models
│   │   │   └── repository.py        # Data access layer
│   │   ├── api/
│   │   │   ├── routes.py            # Session & orchestration API
│   │   │   ├── billing.py           # Stripe billing API
│   │   │   └── admin.py             # Admin dashboard API
│   │   └── main.py                  # FastAPI application
│   ├── migrations/                   # Alembic migrations
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── app/                     # Next.js pages
│   │   │   ├── page.tsx             # Main orchestration UI
│   │   │   ├── pricing/             # Subscription tiers
│   │   │   ├── billing/             # Manage subscription
│   │   │   ├── settings/            # User preferences
│   │   │   └── admin/               # Admin dashboard
│   │   ├── components/              # React components
│   │   ├── store/                   # Zustand state management
│   │   ├── lib/                     # API client
│   │   └── types/                   # TypeScript types
│   └── package.json
├── CURRENT_STATE.md                  # Detailed progress
├── PRODUCTIZATION_ROADMAP.md         # Implementation specs
└── README.md
```

## Supported AI Providers & Models

### Anthropic Claude
- Claude Opus 4.5
- Claude Sonnet 4.5
- Claude Sonnet 4 (Thinking mode)
- Claude Haiku 4.5

### Google Gemini
- Gemini 2.5 Pro
- Gemini 2.5 Flash
- Gemini 2.0 Flash

### OpenAI
- GPT-4o
- GPT-4o-mini
- o1
- o1-mini
- o3-mini

## Quick Start

### Prerequisites
- Python 3.11+
- At least one AI provider API key

### Installation

1. **Clone and navigate to the project:**
   ```bash
   cd atelier/backend
   ```

2. **Create a virtual environment:**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure API keys:**
   ```bash
   cp .env.example .env
   # Edit .env and add your API keys
   ```

   Example `.env`:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   GOOGLE_API_KEY=...
   OPENAI_API_KEY=sk-...
   ENVIRONMENT=development
   LOG_LEVEL=INFO
   ```

### Running the Example

The example script demonstrates a two-agent sequential workflow: an Academic Writer and a Critical Editor collaboratively refining an argument.

```bash
python example_usage.py
```

**Expected output:**
- Orchestration runs for up to 3 rounds (6 turns total)
- Each agent produces output with structured self-evaluation
- Terminates early if any agent scores ≥ 8.5
- Displays exchange summary and final document

### Running the API Server

```bash
uvicorn app.main:app --reload
```

API will be available at `http://localhost:8000`

**API Documentation:** `http://localhost:8000/docs`

### Testing

```bash
pytest tests/ -v
```

## Usage Example: API

### 1. Create a session

```bash
curl -X POST http://localhost:8000/api/v1/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "demo-123",
    "title": "Example Session",
    "agents": [
      {
        "agent_id": "writer-1",
        "display_name": "Academic Writer",
        "provider": "anthropic",
        "model": "claude-sonnet-4-5-20250929",
        "role_description": "You are an academic writer...",
        "evaluation_criteria": [
          {
            "name": "Clarity",
            "description": "How clear is the argument",
            "weight": 1.0
          }
        ],
        "is_active": true
      }
    ],
    "flow_type": "sequential",
    "termination": {
      "max_rounds": 3,
      "score_threshold": 8.5
    },
    "initial_prompt": "Write a 300-word argument...",
    "working_document": "",
    "reference_documents": {}
  }'
```

### 2. Start orchestration

```bash
curl -X POST http://localhost:8000/api/v1/sessions/demo-123/start
```

### 3. Get results

```bash
curl http://localhost:8000/api/v1/sessions/demo-123
```

### 4. Get final document

```bash
curl http://localhost:8000/api/v1/sessions/demo-123/document
```

## Key Concepts

### Agent Configuration

Each agent has:
- **Display name**: Human-readable identifier (e.g., "Cambridge Editor")
- **Provider + Model**: Which AI service and model to use
- **Role description**: System prompt defining persona and approach
- **Evaluation criteria**: Custom rubric (1-10 scale) for self-evaluation
- **Active/Inactive toggle**: Can disable agents mid-session (future phase)

### Orchestration Flow

**Sequential (Phase 1):**
- Agents take turns in order: A → B → A → B...
- Each agent sees full exchange history
- Continues until termination condition met

**Parallel Critique (Phase 6):**
- One writer, multiple critics evaluate in parallel
- Writer synthesizes all feedback

### Evaluation Parsing

The system uses a **three-tier parsing strategy** to extract structured evaluations:

1. **JSON extraction**: Looks for ```json blocks or raw JSON objects
2. **Natural language parsing**: Extracts scores from text like "Clarity: 8/10"
3. **Fallback extraction**: Finds any numbers that could be scores

This robust approach ensures evaluations are captured even when agents don't follow the exact JSON format.

### Termination Conditions

Orchestration stops when **either** condition is met:
- **Max rounds reached** (e.g., 5 rounds)
- **Score threshold met** (e.g., any agent scores ≥ 8.5)

## Design Decisions

### Why FastAPI?
- Excellent async support for streaming (Phase 3)
- Automatic OpenAPI documentation
- Type safety with Pydantic

### Why provider abstraction?
- Easy to add new AI providers
- Consistent interface across different APIs
- Can swap providers per-agent without code changes

### Why three-tier evaluation parsing?
- Real-world agents are inconsistent with format compliance
- Fallback strategies maximize data recovery
- Better user experience (fewer "parse failed" errors)

### Why in-memory state (Phase 1)?
- Simplifies initial implementation
- Fast iteration during development
- Persistence layer added in Phase 5

## Troubleshooting

### "No AI provider API keys configured"
- Check that `.env` file exists and contains valid API keys
- Ensure `.env` is in `backend/` directory, not project root

### "Provider not configured or API key missing"
- The agent's provider (e.g., `anthropic`) must have a valid API key in `.env`
- Check logs for which provider failed

### "Evaluation parse error"
- The agent's response didn't match expected format
- Check `turn.raw_response` to see what the agent actually returned
- Consider adjusting the role_description to emphasize JSON output format

### Rate limiting
- Phase 1 has no built-in rate limit handling
- If you hit rate limits, manually reduce `max_rounds` or add delays
- Proper retry logic coming in Phase 2

## Development Notes

### Adding a new AI provider

1. Create `app/providers/new_provider.py`:
   ```python
   from .base import AIProvider, ProviderResponse

   class NewProvider(AIProvider):
       async def generate(self, ...):
           # Implementation

       async def generate_stream(self, ...):
           # Implementation
   ```

2. Add to `ProviderType` enum in `app/models/agent.py`

3. Add model types to `ModelType` enum

4. Initialize in `Orchestrator._initialize_providers()`

### Extending evaluation criteria

Evaluation criteria are completely user-defined. Common patterns:

**Academic writing:**
- Argumentation clarity
- Evidence quality
- Scholarly rigor
- Citation appropriateness

**Creative writing:**
- Character development
- Plot coherence
- Prose style
- Emotional impact

**Technical writing:**
- Accuracy
- Clarity
- Completeness
- Code example quality

## Roadmap

### Completed Chunks (0-10)
- ✅ **Chunk 0:** Priority bug fixes (phase execution, evaluation criteria)
- ✅ **Chunk 1:** Database persistence (SQLAlchemy, Alembic)
- ✅ **Chunk 2:** Authentication (Clerk JWT)
- ✅ **Chunk 3:** User management & profiles
- ✅ **Chunk 4:** Projects & organization
- ✅ **Chunk 5:** Credit system & usage tracking
- ✅ **Chunk 6:** Stripe billing integration
- ✅ **Chunk 8:** Feature gating by tier
- ✅ **Chunk 9:** Admin dashboard
- ✅ **Chunk 10:** Security hardening

### Remaining Chunks
- **Chunk 7:** File storage (S3/R2) - Deferred, using local
- **Chunk 11:** Infrastructure & deployment (Railway/Render, CI/CD)
- **Chunk 12:** Monitoring & observability (Sentry, uptime monitoring)

## License

MIT (or specify your license)

## Contributing

This is a phased development project. Please wait for Phase completion announcements before submitting PRs.

## Contact

(Add your contact info or leave blank)
