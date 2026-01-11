# Atelier - Project Status

## Overview

Atelier is a multi-agent AI writing studio that enables collaborative document refinement through sequential agent workflows. Multiple AI agents (writers, editors, critics) take turns improving a document based on configurable evaluation criteria.

**Last Updated:** 2026-01-11

---

## Current Status: Production-Ready MVP

The application is fully functional with:
- Complete frontend (Next.js 15 + React 19)
- Backend API (FastAPI + SQLite)
- User authentication (Clerk)
- Credit-based usage system with subscriptions (Stripe)
- Session persistence (SQLite with async support)
- Document export (Word .docx)
- Email delivery (Resend)

---

## Completed Features

### 1. Core Orchestration Engine
- Sequential agent workflow (A → B → A → B...)
- Support for 2-4 agents per session
- Configurable termination (max rounds + score threshold)
- Working document state management
- Real-time streaming with Server-Sent Events
- Pause/resume orchestration support

**Key Files:**
- `backend/app/core/orchestrator.py`
- `backend/app/core/evaluation.py`

### 2. Multi-Provider AI Integration
All three major AI providers with consistent abstraction:

| Provider | Models |
|----------|--------|
| Anthropic | Claude Opus 4, Sonnet 4, Sonnet 4 (thinking), Haiku |
| Google | Gemini 2.5 Pro, 2.5 Flash, 2.0 Flash |
| OpenAI | GPT-4o, GPT-4o-mini, o1, o1-mini, o3-mini |

**Key Files:**
- `backend/app/providers/base.py`
- `backend/app/providers/anthropic_provider.py`
- `backend/app/providers/google_provider.py`
- `backend/app/providers/openai_provider.py`

### 3. User Authentication (Clerk)
- Sign up / Sign in with email or OAuth
- JWT-based API authentication
- Automatic user provisioning on first login
- Protected routes in frontend

**Key Files:**
- `backend/app/core/auth.py`
- `frontend/src/middleware.ts`

### 4. Credit System & Subscriptions
Three-tier pricing model:

| Tier | Monthly Price | Credits/Month | Features |
|------|---------------|---------------|----------|
| Free | $0 | 100 | Basic access |
| Starter | $15 | 1,000 | Priority support |
| Pro | $30 | Unlimited | All features |

**Features:**
- Monthly credit allocation
- Pay-as-you-go credit purchases
- Stripe Checkout integration
- Webhook handling for subscription events
- Credit deduction per session

**Key Files:**
- `backend/app/api/billing.py`
- `backend/app/db/repository.py` (UserRepository)
- `frontend/src/app/settings/page.tsx`

### 5. Session Persistence
- SQLite database with async support (aiosqlite)
- Full session state saved to database
- Session history in sidebar
- Load and view past sessions
- Auto-refresh sidebar on session completion

**Key Files:**
- `backend/app/db/models.py`
- `backend/app/db/database.py`
- `backend/app/db/repository.py`

### 6. Document Export
**Word Document (.docx):**
- Download completed documents as Word files
- Automatic formatting (headings, lists, paragraphs)
- Clean content extraction from JSON-wrapped output

**Email Delivery:**
- Send documents via email with Word attachment
- Beautiful HTML email template
- Preview text in email body
- Uses Resend API

**Key Files:**
- `frontend/src/lib/export.ts`
- `backend/app/core/email.py`
- `backend/app/api/routes.py` (email endpoint)

### 7. Continue Editing
- After generation completes, continue refining with same reference documents
- Preserves workflow configuration and context
- Seamless UX for iterative refinement

**Key Files:**
- `frontend/src/store/session.ts` (continueEditing action)
- `frontend/src/components/ResultsView.tsx`

### 8. Landing Page
- Marketing landing page for signed-out users
- Feature highlights and pricing display
- Call-to-action for sign up

**Key File:**
- `frontend/src/app/page.tsx`

### 9. Workflow Presets
Pre-configured agent combinations:
- Academic Paper (Research Writer + Critical Editor)
- Creative Writing (Storyteller + Literary Critic)
- Technical Docs (Technical Writer + Simplifier)
- Debate (Pro Advocate + Counterpoint)
- Legal Review (Legal Drafter + Compliance Reviewer)

**Key File:**
- `frontend/src/lib/presets.ts`

---

## Project Structure

```
atelier/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── routes.py          # Session & orchestration endpoints
│   │   │   └── billing.py         # Stripe & subscription endpoints
│   │   ├── core/
│   │   │   ├── orchestrator.py    # Multi-agent orchestration
│   │   │   ├── evaluation.py      # Score parsing
│   │   │   ├── auth.py            # Clerk JWT verification
│   │   │   ├── config.py          # Environment settings
│   │   │   └── email.py           # Resend email service
│   │   ├── db/
│   │   │   ├── models.py          # SQLAlchemy models
│   │   │   ├── database.py        # Database setup
│   │   │   └── repository.py      # Data access layer
│   │   ├── models/                # Pydantic schemas
│   │   ├── providers/             # AI provider integrations
│   │   └── main.py                # FastAPI app
│   ├── requirements.txt
│   └── .env
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx           # Landing/main page
│   │   │   └── settings/page.tsx  # User settings & billing
│   │   ├── components/
│   │   │   ├── SessionsSidebar.tsx
│   │   │   ├── ResultsView.tsx
│   │   │   ├── AgentPanel.tsx
│   │   │   └── ...
│   │   ├── lib/
│   │   │   ├── api.ts             # API client
│   │   │   ├── export.ts          # Word export
│   │   │   └── presets.ts         # Workflow presets
│   │   └── store/
│   │       └── session.ts         # Zustand state management
│   ├── package.json
│   └── .env.local
│
├── PHASE_1_SUMMARY.md             # This file
└── TROUBLESHOOTING.md             # Troubleshooting guide
```

---

## Environment Configuration

### Backend (.env)
```bash
# AI Providers (at least one required)
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
OPENAI_API_KEY=sk-...

# Database
DATABASE_URL=sqlite+aiosqlite:///./atelier.db

# Clerk Authentication
CLERK_ISSUER=https://your-clerk-instance.clerk.accounts.dev
CLERK_JWKS_URL=https://your-clerk-instance.clerk.accounts.dev/.well-known/jwks.json

# Stripe Billing
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_STARTER_PRICE_ID=price_...
STRIPE_PRO_PRICE_ID=price_...

# Email (Resend)
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=Atelier <onboarding@resend.dev>

# Frontend URL (for redirects)
FRONTEND_URL=http://localhost:3000
```

### Frontend (.env.local)
```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## Running the Application

### Backend
```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend
```bash
cd frontend
npm run dev
```

### Access
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

---

## API Endpoints

### Sessions
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/sessions` | Create new session |
| GET | `/api/v1/sessions` | List user's sessions |
| GET | `/api/v1/sessions/{id}` | Get session details |
| POST | `/api/v1/sessions/{id}/start` | Start orchestration |
| POST | `/api/v1/sessions/{id}/pause` | Pause orchestration |
| POST | `/api/v1/sessions/{id}/resume` | Resume orchestration |
| GET | `/api/v1/sessions/{id}/stream` | SSE stream for real-time updates |
| POST | `/api/v1/sessions/{id}/email` | Email document |

### Billing
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/billing/status` | Get subscription & credits |
| POST | `/api/v1/billing/checkout` | Create Stripe checkout |
| POST | `/api/v1/billing/portal` | Access billing portal |
| POST | `/api/v1/billing/credits/checkout` | Purchase credits |
| POST | `/api/v1/billing/webhook` | Stripe webhook handler |

### User
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/user/me` | Get current user |

---

## Technical Highlights

### 1. Streaming Architecture
Real-time updates via Server-Sent Events (SSE):
- Agent responses stream token-by-token
- Progress indicators for each agent
- Pause/resume without losing state

### 2. Evaluation Parsing
Three-tier strategy for robust score extraction:
1. JSON parsing from code blocks
2. Natural language patterns ("Score: 8/10")
3. Fallback numeric extraction

### 3. Credit System
- Per-session credit deduction
- Monthly allocation based on tier
- Automatic refill on subscription renewal
- Pay-as-you-go top-ups

### 4. Export Pipeline
Clean content extraction handles various AI output formats:
- JSON-wrapped responses (`{"output": "..."}`)
- Markdown code fences
- Raw text
- Escaped characters

---

## Future Enhancements

### Planned Features
- [ ] Admin dashboard for user management
- [ ] Analytics and usage metrics
- [ ] Team workspaces
- [ ] Custom workflow templates
- [ ] API access for programmatic usage
- [ ] Parallel critique mode (multiple agents review simultaneously)

### Technical Debt
- Add comprehensive test suite
- Implement rate limiting per user
- Add request/response logging
- Improve error handling with retries

---

## Development Notes

### Database Migrations
Currently using auto-migrate on startup. For production, implement proper migrations with Alembic.

### Stripe Testing
Use Stripe CLI for webhook testing:
```bash
stripe listen --forward-to localhost:8000/api/v1/billing/webhook
```

### Clerk Development
Ensure Clerk webhook is configured for user.created events if provisioning users on signup.

---

## Changelog

### 2026-01-11
- Added Word document export (.docx)
- Added email document with attachment
- Added "Continue Editing" feature
- Fixed sessions sidebar auto-refresh
- Added clean content extraction for exports

### 2026-01-10
- Implemented Stripe billing integration
- Added subscription tiers (Free, Starter, Pro)
- Added credit purchase flow
- Implemented landing page for signed-out users

### 2026-01-09
- Added Clerk authentication
- Implemented session persistence (SQLite)
- Added sessions sidebar
- Real-time streaming with SSE

### 2026-01-08
- Initial Phase 1 completion
- Core orchestration engine
- Multi-provider AI integration
- REST API implementation
