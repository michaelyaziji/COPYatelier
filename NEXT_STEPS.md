# Atelier Next Steps

## Priority 1: Bug Fixes (Do First)

### 1.1 Fix Phase Execution Order
**Current:** All agents run sequentially regardless of phase.
**Expected:** Writer → All Editors (can be sequential for now) → Synthesizer → Writer...
**Files:**
- `backend/app/core/streaming.py` - `run_streaming()` method
- `backend/app/core/orchestrator.py` - `run_sequential()` method

**Implementation:**
```python
# Group agents by phase
phase_1 = [a for a in active_agents if a.phase == 1]  # Writer
phase_2 = [a for a in active_agents if a.phase == 2]  # Editors
phase_3 = [a for a in active_agents if a.phase == 3]  # Synthesizer

# Execute in phase order per round
for agent in phase_1:
    # Execute writer
for agent in phase_2:
    # Execute editors
for agent in phase_3:
    # Execute synthesizer
```

### 1.2 Add Role-Specific Evaluation Criteria
**Current:** All roles get generic "Quality" criterion.
**Files:**
- `frontend/src/store/session.ts` - `getActiveWorkflowAgents()` around line 207
- `frontend/src/types/workflow.ts` - Add `evaluationCriteria` to `WorkflowRole`

**Implementation:**
```typescript
// In workflow.ts, add to each role definition:
{
  id: 'content_expert',
  evaluationCriteria: [
    { name: 'Accuracy', description: 'Factual correctness', weight: 1.0 },
    { name: 'Completeness', description: 'Coverage of topic', weight: 1.0 },
  ],
}

// In session.ts getActiveWorkflowAgents():
evaluation_criteria: role.evaluationCriteria || [defaultCriterion],
```

### 1.3 Fix Bare Except Clauses
**Files:**
- `backend/app/core/orchestrator.py` - Around line 350
- `backend/app/core/streaming.py` - Around line 295

**Change from:**
```python
except:
    output = full_response
```
**To:**
```python
except (json.JSONDecodeError, KeyError, TypeError) as e:
    logger.warning(f"Failed to parse JSON output: {e}")
    output = full_response
```

---

## Priority 2: UX Improvements

### 2.1 Enhanced Exchange History View
**Current:** Minimal info per turn (name, score, 200-char preview).
**Add:**
- Expandable full output view
- Evaluation criteria breakdown
- Copy button per turn
- Visual diff between document versions

**File:** `frontend/src/components/ResultsView.tsx`

### 2.2 Loading States
**Add skeleton loaders for:**
- Initial page load
- Session creation
- Document parsing

**Files:** Create `frontend/src/components/ui/skeleton.tsx`

### 2.3 Form Validation
**Current:** Errors shown after submission attempt.
**Add:** Inline validation for:
- Empty prompt (required)
- Invalid round count
- No active agents

**File:** `frontend/src/components/SessionSetup.tsx`

---

## Priority 3: Missing Features

### 3.1 Export Functionality
**Add ability to export:**
- Final document as TXT/MD
- Full session as JSON (for reimport)
- Exchange history as formatted report

**Files:**
- Add `frontend/src/lib/export.ts`
- Add export buttons in `ResultsView.tsx`

### 3.2 Session Templates
**Save and load workflow configurations:**
- Store template in localStorage
- "Save as template" button
- Template selector in WorkflowPanel

**Files:**
- `frontend/src/store/templates.ts` (new)
- `frontend/src/components/WorkflowPanel.tsx`

### 3.3 Cost Estimation
**Before running, show estimated:**
- Token count (rough)
- Estimated cost per provider
- Based on rounds × agents × avg output

**Files:**
- `frontend/src/lib/costEstimator.ts` (new)
- Show in SessionSetup before start

---

## Priority 4: Technical Improvements

### 4.1 Add Database Persistence (Phase 5)
**Current:** Sessions lost on restart.
**Add:**
- SQLite for development
- PostgreSQL for production
- Migration system (Alembic)

**New Files:**
```
backend/app/
├── db/
│   ├── database.py      # Connection setup
│   ├── models.py        # SQLAlchemy models
│   └── migrations/      # Alembic migrations
```

### 4.2 Add API Retry Logic
**Current:** Single failure kills session.
**Add:**
- Exponential backoff (1s, 2s, 4s, max 3 retries)
- Per-provider rate limiting
- Graceful degradation

**File:** `backend/app/providers/base.py` - Add retry decorator

### 4.3 Context Window Management
**Current:** No handling for long histories.
**Add:**
- Token counting before each turn
- Sliding window or summarization when approaching limit
- Per-model limit configuration

**Files:**
- `backend/app/core/context.py` (new)
- Integrate in `orchestrator.py` prompt building

### 4.4 Remove Legacy Code
**Delete unused files:**
- `frontend/src/components/AgentPanel.tsx`
- `frontend/src/components/AgentCard.tsx`

**Clean up:**
- Remove `agents` array from store (use `workflowRoles` only)
- Remove related type definitions

---

## Priority 5: Testing

### 5.1 Backend Unit Tests
```
tests/
├── test_evaluation.py     ✅ Exists
├── test_orchestrator.py   ❌ Add
├── test_providers.py      ❌ Add (with mocks)
├── test_routes.py         ❌ Add
```

### 5.2 Frontend Tests
```
src/
├── components/
│   └── __tests__/
│       ├── WorkflowPanel.test.tsx
│       ├── SessionSetup.test.tsx
│       └── ResultsView.test.tsx
├── store/
│   └── session.test.ts
```

### 5.3 E2E Tests
- Playwright or Cypress
- Full workflow: configure → run → view results
- Mock AI responses for deterministic testing

---

## Priority 6: Production Readiness

### 6.1 Docker Setup
```dockerfile
# backend/Dockerfile
FROM python:3.11-slim
# ...

# frontend/Dockerfile
FROM node:20-alpine
# ...

# docker-compose.yml
services:
  backend:
  frontend:
  db:  # PostgreSQL
```

### 6.2 Environment Configuration
**Add:**
- Production vs development settings
- CORS origin restrictions
- API rate limiting
- Request logging

### 6.3 Error Monitoring
**Options:**
- Sentry integration (frontend + backend)
- Structured logging
- Health check dashboards

---

## Quick Reference: File Locations

| Task | Primary Files |
|------|---------------|
| Workflow execution | `backend/app/core/orchestrator.py`, `streaming.py` |
| Agent configuration | `frontend/src/types/workflow.ts`, `store/session.ts` |
| UI components | `frontend/src/components/*.tsx` |
| API endpoints | `backend/app/api/routes.py` |
| Types | `frontend/src/types/index.ts` |
| State management | `frontend/src/store/session.ts` |
| Provider integration | `backend/app/providers/*_provider.py` |

---

## Starting a New Session

When picking up this project fresh:

1. **Read the docs:**
   - `ARCHITECTURE.md` - System overview
   - `CURRENT_STATE.md` - What's working/broken
   - `CONVENTIONS.md` - Coding patterns

2. **Run the project:**
   ```bash
   # Terminal 1 - Backend
   cd atelier/backend
   source venv/bin/activate
   uvicorn app.main:app --reload

   # Terminal 2 - Frontend
   cd atelier/frontend
   npm run dev
   ```

3. **Test the workflow:**
   - Open http://localhost:3000
   - Configure roles (Writer + 1-2 editors)
   - Enter a simple prompt
   - Run and observe streaming output

4. **Pick a task from Priority 1** and start coding!
