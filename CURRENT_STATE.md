# Atelier Current State

**Last Updated:** 2026-01-11
**Chunks Completed:** 0-10 (of 12)

---

## Chunk Completion Status

| Chunk | Name | Status |
|-------|------|--------|
| 0 | Priority Bug Fixes | COMPLETE |
| 1 | Database Schema & Persistence | COMPLETE |
| 2 | Authentication System | COMPLETE |
| 3 | User Management & Profiles | COMPLETE |
| 4 | Projects & Organization | COMPLETE |
| 5 | Credit System & Usage | COMPLETE |
| 6 | Stripe Integration | COMPLETE |
| 7 | File Storage (S3/R2) | SKIPPED (using local) |
| 8 | Feature Gating | COMPLETE |
| 9 | Admin Dashboard | COMPLETE |
| 10 | Security Hardening | COMPLETE |
| 11 | Infrastructure & Deployment | PENDING |
| 12 | Monitoring & Observability | PENDING |

---

## What's Built and Working

### Backend (Fully Functional)

#### Core Orchestration
- **Sequential orchestration** (`orchestrator.py`) - Agents execute in phase order, passing context
- **Streaming orchestration** (`streaming.py`) - Real-time SSE token streaming
- **Phase-based execution** - Writer (phase 1) → Editors (phase 2) → Synthesizer (phase 3)
- **Role-aware task instructions** - Different prompts for Writer vs Editors vs Synthesizer
- **Phase-based document updates** - Only Writer (phase 1) modifies the working document
- **Feedback aggregation** - Editors' feedback combined for Writer revision rounds
- **Termination conditions** - Max rounds and score threshold both working

#### AI Provider Integration
- **Anthropic** - Claude models (Opus 4, Sonnet 4, Sonnet 4 Thinking, Haiku)
- **Google** - Gemini models (2.5 Pro, 2.5 Flash, 2.0 Flash)
- **OpenAI** - GPT models (4o, 4o-mini, o1, o1-mini, o3-mini)
- All providers support both sync and streaming generation

#### Evaluation System
- **3-tier parsing** - JSON → Natural Language → Fallback extraction
- **Self-assessment** - Agents score their own output
- **Role-specific criteria** - Each role has domain-specific evaluation criteria
- **Weighted scoring** - Configurable criterion weights

#### File Processing
- **DOCX parsing** - python-docx extraction
- **PDF parsing** - PyPDF2 text extraction
- **TXT/MD support** - Direct text loading
- Word count and character count returned

#### Database Persistence (Chunk 1)
- **SQLAlchemy 2.0** with async support
- **SQLite** for development, **PostgreSQL** ready for production
- **Alembic migrations** for schema management
- **Repository pattern** for clean data access
- Sessions survive server restarts

#### Authentication (Chunk 2)
- **Clerk integration** - JWT token verification
- **User provisioning** - Auto-create users on first login
- **Protected routes** - All API endpoints require authentication
- **Development mode** - Uses dev_user when auth disabled

#### User Management (Chunk 3)
- **User profiles** with timezone and preferences
- **Preferences storage** - Default provider, model, max rounds, theme
- **Data export** - GDPR-compliant JSON export
- **Account deletion** - Full data cleanup

#### Projects & Organization (Chunk 4)
- **Project CRUD** - Create, update, archive, unarchive
- **Session grouping** - Sessions can belong to projects
- **Session management** - Move sessions between projects
- **Session history** - List sessions with filters

#### Credit System (Chunk 5)
- **Token-to-credit conversion** with model multipliers
- **Balance tracking** - Real-time balance updates
- **Transaction history** - All credit changes logged
- **Pre-session estimation** - Cost estimate before starting
- **Insufficient credits blocking** - Sessions blocked when balance too low
- **Credits display** - Live balance in header

#### Billing Integration (Chunk 6)
- **Stripe Checkout** - Subscription purchase flow
- **Webhook handling** - Subscription lifecycle events
- **Billing portal** - Manage payment methods
- **Tier management** - Free, Starter ($29), Pro ($79)
- **Monthly credit grants** - Automatic on subscription renewal
- **Cancel/reactivate** - Self-service subscription management

#### Feature Gating (Chunk 8)
- **Tier-based limits** - Agents, rounds, models per tier
- **Model restrictions** - Premium models for paid tiers
- **Document word limits** - Per-tier maximums
- **Entitlement checking** - Server-side enforcement

#### Admin Dashboard (Chunk 9)
- **Dashboard stats** - Users, revenue (MRR), sessions, credits
- **User management** - List, search, view details
- **Credit grants** - Admin can grant credits with audit trail
- **Admin status** - Toggle admin flag on users
- **Analytics** - Revenue and usage metrics by period
- **Session monitoring** - All sessions, failed sessions
- **Transaction history** - All credit transactions

#### Security Hardening (Chunk 10)
- **Rate limiting** - slowapi on all endpoints
- **Security headers** - X-Content-Type-Options, X-Frame-Options, etc.
- **Request logging** - Audit trail with timing
- **CORS configuration** - Environment-based origins
- **Input validation** - File size, title length, etc.
- **User-scoped queries** - All data filtered by user_id

#### API Endpoints
```
Sessions:
  POST   /api/v1/sessions           - Create session
  GET    /api/v1/sessions           - List user's sessions
  GET    /api/v1/sessions/:id       - Get session state
  POST   /api/v1/sessions/:id/start - Start orchestration
  POST   /api/v1/sessions/:id/start-stream - Start with SSE streaming
  POST   /api/v1/sessions/:id/stop  - Stop session
  POST   /api/v1/sessions/:id/pause - Pause session
  POST   /api/v1/sessions/:id/resume - Resume session
  GET    /api/v1/sessions/:id/document - Get current document
  DELETE /api/v1/sessions/:id       - Delete session
  PATCH  /api/v1/sessions/:id/rename - Rename session
  POST   /api/v1/sessions/:id/move  - Move to project

Projects:
  GET    /api/v1/projects           - List projects
  POST   /api/v1/projects           - Create project
  GET    /api/v1/projects/:id       - Get project
  PATCH  /api/v1/projects/:id       - Update project
  DELETE /api/v1/projects/:id       - Archive/delete project
  POST   /api/v1/projects/:id/unarchive - Restore project
  GET    /api/v1/projects/:id/sessions - Project sessions

Users:
  GET    /api/v1/users/me           - Get current user + profile
  PATCH  /api/v1/users/me           - Update profile
  PUT    /api/v1/users/me/preferences - Update preferences
  POST   /api/v1/users/me/export    - Export user data
  DELETE /api/v1/users/me           - Delete account

Credits:
  GET    /api/v1/credits/balance    - Get balance
  GET    /api/v1/credits/history    - Transaction history
  POST   /api/v1/credits/estimate   - Estimate session cost

Billing:
  GET    /api/v1/billing/subscription - Current subscription
  POST   /api/v1/billing/checkout   - Create Stripe checkout
  POST   /api/v1/billing/checkout/credits - Buy extra credits
  POST   /api/v1/billing/cancel     - Cancel subscription
  POST   /api/v1/billing/reactivate - Reactivate subscription
  POST   /api/v1/billing/portal     - Get Stripe portal URL
  POST   /api/v1/billing/sync       - Sync subscription from Stripe
  POST   /api/v1/webhooks/stripe    - Stripe webhook handler

Admin:
  GET    /api/v1/admin/stats        - Dashboard statistics
  GET    /api/v1/admin/users        - List all users
  GET    /api/v1/admin/users/:id    - User details
  POST   /api/v1/admin/users/:id/grant-credits - Grant credits
  PATCH  /api/v1/admin/users/:id/admin-status - Toggle admin
  GET    /api/v1/admin/analytics/revenue - Revenue metrics
  GET    /api/v1/admin/analytics/usage - Usage metrics
  GET    /api/v1/admin/sessions     - All sessions
  GET    /api/v1/admin/sessions/failed - Failed sessions
  GET    /api/v1/admin/transactions - All transactions

Files:
  POST   /api/v1/files/parse        - Parse uploaded file
```

### Frontend (Fully Functional)

#### User Interface
- **3-step workflow** - Configure → Task → Results
- **WorkflowPanel** - Visual 3-phase editorial role configuration
- **SessionSetup** - Task prompt, settings, document upload
- **PromptBuilder** - Preset-based prompt template generation
- **ReferenceMaterials** - File upload with reference instructions field
- **LiveAgentPanel** - Real-time streaming agent output display
- **ResultsView** - Final document display with copy, exchange history
- **SessionsSidebar** - Session history with project grouping
- **CreditDisplay** - Live balance in header

#### Pages
- `/` - Main orchestration app
- `/pricing` - Subscription tiers
- `/billing` - Manage subscription
- `/settings` - User preferences
- `/admin` - Admin dashboard (admin only)
- `/admin/users` - User management
- `/admin/users/:id` - User details
- `/admin/analytics` - Revenue and usage analytics
- `/admin/sessions` - Session monitoring
- `/admin/transactions` - Transaction history

#### State Management
- **Zustand store** - Centralized state for configuration and runtime
- **Credits store** - Balance, estimates, refresh
- **Workflow roles** - 5 pre-defined editorial roles
- **Streaming state** - Per-agent content accumulation

#### Authentication
- **Clerk integration** - Sign in/out, user management
- **Protected routes** - Redirect to sign-in when needed
- **Admin detection** - Show admin link for admin users
- **Auth token** - Automatic injection in API calls

---

## Database Schema

```sql
-- Users (synced from Clerk)
users (id, email, display_name, is_admin, created_at, updated_at)

-- User profiles
user_profiles (id, user_id, timezone, preferences, created_at, updated_at)

-- Projects
projects (id, user_id, name, description, default_agent_config, archived_at, created_at, updated_at)

-- Sessions
sessions (id, user_id, project_id, title, status, initial_prompt, working_document,
         reference_documents, reference_instructions, agent_config, termination_config,
         current_round, total_credits_used, termination_reason, starred, created_at,
         updated_at, completed_at)

-- Exchange turns
exchange_turns (id, session_id, agent_id, agent_name, round_number, turn_number, phase,
               output, raw_response, working_document, parse_error, evaluation,
               tokens_input, tokens_output, credits_used, created_at)

-- Document versions
document_versions (id, session_id, version_number, content, word_count, created_by, created_at)

-- Credit balances
credit_balances (id, user_id, balance, lifetime_used, tier, tier_credits, last_grant_at, created_at, updated_at)

-- Credit transactions
credit_transactions (id, user_id, amount, type, description, session_id, balance_after, created_at)

-- Subscriptions
subscriptions (id, user_id, tier, status, stripe_subscription_id, stripe_customer_id,
              current_period_start, current_period_end, cancel_at_period_end, created_at, updated_at)
```

---

## Environment Variables

### Backend (.env)
```bash
# Environment
ENVIRONMENT=development

# Database
DATABASE_URL=sqlite+aiosqlite:///./atelier.db
# For production: postgresql+asyncpg://user:pass@host:5432/atelier

# AI Providers (at least one required)
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
OPENAI_API_KEY=sk-...

# Authentication (Clerk)
CLERK_ISSUER=https://your-app.clerk.accounts.dev
CLERK_JWKS_URL=https://your-app.clerk.accounts.dev/.well-known/jwks.json

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_STARTER_PRICE_ID=price_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_CREDIT_PRICE_ID=price_...

# Security
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

### Frontend (.env.local)
```bash
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
```

---

## Known Issues / Technical Debt

### Minor Bugs
1. **Agent colors don't persist across rounds** - Color assignment based on array index
2. **Pause/resume may miss tokens** - Backend continues generating during pause
3. **File upload error recovery** - Failed parse doesn't clear state properly

### Technical Debt
1. **No retry logic** - API failures cause immediate session failure
2. **No context window management** - Very long sessions may exceed limits
3. **No loading skeletons** - Components show nothing while loading
4. **No error boundaries** - React errors crash entire app

---

## What's Not Built Yet

### Chunk 7: File Storage (S3/R2)
- Currently using local file handling
- Will implement when scaling requires

### Chunk 11: Infrastructure & Deployment
- [ ] Production deployment (Railway/Render)
- [ ] CI/CD pipeline
- [ ] Environment management

### Chunk 12: Monitoring & Observability
- [ ] Sentry error tracking
- [ ] Uptime monitoring
- [ ] Structured logging

### Nice-to-Haves
- [ ] Export to Word/PDF
- [ ] Session templates
- [ ] Prompt library
- [ ] Keyboard shortcuts
- [ ] Dark mode

---

## Running the Project

### Backend
```bash
cd atelier/backend
source venv/bin/activate
uvicorn app.main:app --reload
```

### Frontend
```bash
cd atelier/frontend
npm run dev
```

### Setting Up First Admin
After creating your user account via Clerk sign-up:
```sql
UPDATE users SET is_admin = true WHERE email = 'your-email@example.com';
```
