# Troubleshooting Guide - Atelier

## Common Issues & Solutions

### Authentication Issues (Clerk)

#### "Unauthorized" or 401 errors on API requests
**Problem:** JWT token is invalid or missing

**Solutions:**
1. Check frontend is sending auth header:
   ```typescript
   // In api.ts, ensure getToken() is called
   const token = await getToken();
   headers['Authorization'] = `Bearer ${token}`;
   ```
2. Verify Clerk environment variables in backend `.env`:
   ```bash
   CLERK_ISSUER=https://your-instance.clerk.accounts.dev
   CLERK_JWKS_URL=https://your-instance.clerk.accounts.dev/.well-known/jwks.json
   ```
3. Check token hasn't expired (Clerk tokens expire after ~1 hour)
4. Ensure frontend `.env.local` has correct Clerk keys

#### "User not found" after successful login
**Problem:** User exists in Clerk but not in local database

**Solution:**
- Users are auto-provisioned on first API request
- Check backend logs for provisioning errors
- Verify database connection is working
- Manual fix: The auth middleware should create the user automatically

---

### Billing Issues (Stripe)

#### "Subscription checkout fails"
**Problem:** Stripe checkout session creation fails

**Solutions:**
1. Verify Stripe keys in `.env`:
   ```bash
   STRIPE_SECRET_KEY=sk_test_...  # or sk_live_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   STRIPE_STARTER_PRICE_ID=price_...
   STRIPE_PRO_PRICE_ID=price_...
   ```
2. Check Price IDs exist in your Stripe dashboard
3. Ensure FRONTEND_URL is set correctly for redirects

#### "Credits not updating after payment"
**Problem:** Webhook not processing correctly

**Solutions:**
1. For local development, run Stripe CLI:
   ```bash
   stripe listen --forward-to localhost:8000/api/v1/billing/webhook
   ```
2. Check webhook secret matches the one from Stripe CLI
3. Verify webhook endpoint is accessible (not behind auth)
4. Check backend logs for webhook processing errors

#### "Insufficient credits" error
**Problem:** User's credit balance is too low

**Solutions:**
1. Check user's current balance at `/settings` page
2. Purchase additional credits or upgrade subscription
3. For testing, manually add credits via database

---

### Email Issues (Resend)

#### "Email service is not configured"
**Problem:** RESEND_API_KEY not set

**Solution:**
Add to backend `.env`:
```bash
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=Atelier <onboarding@resend.dev>
```

#### "Failed to send email" error
**Problem:** Resend API call failed

**Solutions:**
1. Verify API key is valid at https://resend.com/api-keys
2. Check from email domain is verified in Resend
3. For development, use `onboarding@resend.dev` (sandbox)
4. Check recipient email is valid
5. Review backend logs for specific error

#### "Email sent but not received"
**Problem:** Email delivered but not visible

**Solutions:**
1. Check spam/junk folder
2. Verify recipient email address is correct
3. Check Resend dashboard for delivery status
4. For `@resend.dev` addresses, emails only work in test mode

---

### Document Export Issues

#### "Word document contains JSON wrapper"
**Problem:** Export includes `{"output": "..."}` instead of clean content

**Solution:** This was fixed in the export code. Ensure you have the latest version of:
- `frontend/src/lib/export.ts`
- `backend/app/core/email.py`

Both files now include `extractCleanContent()` function that strips JSON wrappers.

#### "Word document is empty"
**Problem:** No content extracted from session

**Solutions:**
1. Verify session has completed successfully
2. Check `exchange_history` has entries
3. Look at raw `working_document` in session state
4. Ensure the last exchange has valid content

#### "Download doesn't start"
**Problem:** Browser not triggering download

**Solutions:**
1. Check for popup blockers
2. Verify `file-saver` package is installed in frontend
3. Check browser console for errors
4. Try a different browser

---

### Session Issues

#### "Sessions sidebar not refreshing"
**Problem:** Completed sessions don't appear in sidebar

**Solution:** Fixed by adding refresh on `currentSessionId` change. Ensure `SessionsSidebar.tsx` has:
```typescript
useEffect(() => {
  if (currentSessionId) {
    loadSessions();
  }
}, [currentSessionId]);
```

#### "Continue Editing doesn't preserve documents"
**Problem:** Reference documents lost when continuing

**Solution:** The `continueEditing` action in `session.ts` should preserve:
- `referenceDocuments`
- `referenceInstructions`
- `workflowRoles`
- `presetSelections`
- `maxRounds`
- `projectId`

Check the store implementation if these are being reset.

---

### Setup Issues

#### "Python 3.11+ required"
**Problem:** System Python version is too old

**Solution:**
```bash
# macOS with Homebrew
brew install python@3.11

# Ubuntu/Debian
sudo apt-get install python3.11

# Check version
python3.11 --version
```

#### "ModuleNotFoundError: No module named 'app'"
**Problem:** Running from wrong directory or virtual environment not activated

**Solution:**
```bash
# Ensure you're in backend/ directory
cd atelier/backend

# Activate virtual environment
source venv/bin/activate  # macOS/Linux
# OR
venv\Scripts\activate     # Windows

# Verify activation (should show venv path)
which python
```

#### ".env file not found" or "API key missing"
**Problem:** Environment variables not configured

**Solution:**
```bash
# Create .env from template
cp .env.example .env

# Edit with your favorite editor
nano .env  # or vim, code, etc.

# Required: At least one API key
ANTHROPIC_API_KEY=sk-ant-...
# OR
GOOGLE_API_KEY=...
# OR
OPENAI_API_KEY=sk-...
```

---

### API Key Issues

#### "No AI provider API keys configured"
**Problem:** All API keys are empty or invalid

**Solution:**
1. Check `.env` file exists in `backend/` directory
2. Ensure at least one key is set:
   ```bash
   cat .env | grep API_KEY
   ```
3. Restart server after modifying `.env`
4. Test with health endpoint:
   ```bash
   curl http://localhost:8000/health
   ```

#### "Provider not configured or API key missing"
**Problem:** Agent's provider doesn't have a valid key

**Solution:**
- If agent uses `anthropic`, ensure `ANTHROPIC_API_KEY` is set
- If agent uses `google`, ensure `GOOGLE_API_KEY` is set
- If agent uses `openai`, ensure `OPENAI_API_KEY` is set

**Check key validity:**
```bash
# Anthropic
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: YOUR_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-haiku-4-5-20250110","max_tokens":10,"messages":[{"role":"user","content":"Hi"}]}'

# OpenAI
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer YOUR_KEY"

# Google (check project permissions)
# API keys work via SDK automatically if valid
```

---

### Runtime Errors

#### "Evaluation parse error" on all turns
**Problem:** Agents not returning structured evaluations

**Possible causes:**
1. Model doesn't follow instructions well (try different model)
2. Role description too complex (simplify)
3. Criteria names have special characters (use simple names)

**Solutions:**

**A) Check raw response:**
```python
# Add logging to see what agent actually returned
import logging
logging.basicConfig(level=logging.DEBUG)

# Or check via API:
curl http://localhost:8000/api/v1/sessions/{session_id}
# Look at turn.raw_response
```

**B) Simplify criteria:**
```python
# Instead of:
EvaluationCriterion(
    name="Argumentative Rigor & Logical Coherence",
    description="Complex multi-faceted criterion..."
)

# Use:
EvaluationCriterion(
    name="Logic",
    description="Logical flow of arguments"
)
```

**C) Try different model:**
```python
# Claude Sonnet typically best for structured output
model=ModelType.CLAUDE_SONNET_4
```

#### "Context window exceeded" or "Input tokens limit"
**Problem:** Exchange history too long for model's context limit

**Current limitations:**
- Phase 1 has no sliding window
- Long exchanges (>10 rounds) may fail

**Workarounds:**
1. Reduce `max_rounds` in termination config
2. Use models with larger context windows:
   - Claude Opus 4: 200K tokens
   - Gemini 2.5 Pro: 1M tokens
3. Keep reference documents concise
4. Use shorter role descriptions

**Future:** Phase 2 will add intelligent history summarization

#### "Rate limit exceeded" errors
**Problem:** Too many API requests in short time

**Solutions:**

**A) Wait and retry:**
```bash
# Most provider rate limits reset after 1 minute
sleep 60
python example_usage.py
```

**B) Reduce termination rounds:**
```python
termination=TerminationCondition(max_rounds=2)  # Instead of 5
```

**C) Check provider rate limits:**
- **Anthropic**: 50 requests/min (free tier), 1000/min (paid)
- **OpenAI**: 500 requests/min (tier 1), higher for paid tiers
- **Google**: 60 requests/min (free), higher for paid

**Future:** Phase 2 will add retry with exponential backoff

---

### API Server Issues

#### "Address already in use" when starting server
**Problem:** Port 8000 already occupied

**Solution:**
```bash
# Find process using port 8000
lsof -i :8000

# Kill it
kill -9 <PID>

# Or use different port
uvicorn app.main:app --port 8001
```

#### "404 Not Found" on API endpoints
**Problem:** Wrong URL or route prefix

**Solution:**
- Routes are under `/api/v1/`, not root
- Correct: `http://localhost:8000/api/v1/sessions`
- Incorrect: `http://localhost:8000/sessions`

#### "422 Unprocessable Entity" on POST requests
**Problem:** Invalid request body schema

**Solution:**
1. Check OpenAPI docs: `http://localhost:8000/docs`
2. Use example request bodies from docs
3. Common mistakes:
   ```json
   {
     "agents": [
       {
         // ❌ Missing required fields
         "display_name": "Writer"
       }
     ]
   }
   ```

   Should be:
   ```json
   {
     "session_id": "unique-id",
     "agents": [
       {
         "agent_id": "writer-1",
         "display_name": "Writer",
         "provider": "anthropic",
         "model": "claude-sonnet-4-5-20250929",
         "role_description": "You are a writer...",
         "evaluation_criteria": [
           {
             "name": "Clarity",
             "description": "How clear is the text",
             "weight": 1.0
           }
         ],
         "is_active": true
       }
     ],
     "initial_prompt": "Write something",
     "working_document": "",
     "reference_documents": {}
   }
   ```

---

### Model-Specific Issues

#### Claude "overloaded_error"
**Problem:** Anthropic's servers temporarily overloaded

**Solution:**
- Wait 10-30 seconds and retry
- Switch to different Claude model (Haiku usually less loaded)
- Try different time of day

#### Gemini "RESOURCE_EXHAUSTED"
**Problem:** Google API quota exceeded

**Solution:**
- Check quota: https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com/quotas
- Free tier: 60 requests/min
- Consider paid tier for higher limits

#### OpenAI "insufficient_quota"
**Problem:** OpenAI account has no credits

**Solution:**
- Add credits: https://platform.openai.com/account/billing
- Check usage: https://platform.openai.com/usage

#### "Model not found" error
**Problem:** Model ID incorrect or deprecated

**Solution:**
Check model IDs in [backend/app/models/agent.py](backend/app/models/agent.py):

```python
class ModelType(str, Enum):
    # Anthropic
    CLAUDE_OPUS_4 = "claude-opus-4-5-20251101"
    CLAUDE_SONNET_4 = "claude-sonnet-4-5-20250929"
    # ...
```

**Note:** Model IDs include version dates. Check provider docs for latest:
- Anthropic: https://docs.anthropic.com/en/docs/models-overview
- OpenAI: https://platform.openai.com/docs/models
- Google: https://ai.google.dev/gemini-api/docs/models

---

### Testing Issues

#### "No tests ran" or "pytest not found"
**Problem:** pytest not installed or wrong directory

**Solution:**
```bash
# Ensure virtual environment active
source venv/bin/activate

# Install pytest
pip install pytest pytest-asyncio

# Run from backend/ directory
cd atelier/backend
pytest tests/ -v
```

#### Tests fail with "API key not set"
**Problem:** Some tests require API keys for integration testing

**Solution:**
- Unit tests (evaluation parsing) don't need keys
- Integration tests (orchestrator end-to-end) do need keys
- Skip integration tests if no keys:
  ```bash
  pytest tests/ -v -k "not integration"
  ```

---

### Example Script Issues

#### "example_usage.py" hangs or takes very long
**Problem:** Large models or slow network

**Expected behavior:**
- Phase 1 example: 3 rounds × 2 agents = 6 API calls
- Each call: 10-30 seconds (depending on model/output length)
- Total: 1-3 minutes normal

**If it takes >5 minutes:**
1. Check network connection
2. Try faster model (Claude Haiku, GPT-4o-mini)
3. Check provider status pages:
   - Anthropic: https://status.anthropic.com
   - OpenAI: https://status.openai.com
   - Google: https://status.cloud.google.com

#### "Orchestration failed: [error]"
**Problem:** Unhandled exception during execution

**Solution:**
1. Check full error message and traceback
2. Common causes:
   - Invalid API key → Fix `.env`
   - Network issue → Check connection
   - Model overload → Retry in a few minutes
3. Enable debug logging:
   ```python
   # In example_usage.py, before asyncio.run(main())
   import logging
   logging.basicConfig(level=logging.DEBUG)
   ```

---

### Performance Issues

#### Slow response times
**Problem:** Orchestration takes longer than expected

**Factors:**
- **Model size**: Opus/GPT-4o slower than Haiku/GPT-4o-mini
- **Output length**: Longer drafts take more time
- **Context size**: More history = slower processing
- **Provider load**: Peak times slower

**Optimizations:**
1. Use faster models for iteration, reserve slow models for final pass
2. Reduce `max_tokens` in provider calls (future config)
3. Keep reference documents concise
4. Phase 3 will add streaming for perceived performance

#### High memory usage
**Problem:** Process memory grows during long orchestrations

**Causes:**
- Exchange history stored in full
- No garbage collection between turns (Phase 1)

**Workarounds:**
1. Reduce `max_rounds`
2. Restart server between sessions
3. Future: Phase 5 will move history to database

---

## Debugging Tips

### Enable Debug Logging
```python
import logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
```

### Inspect Session State
```bash
# Via API
curl http://localhost:8000/api/v1/sessions/{session_id} | jq .

# In Python
from app.api.routes import sessions
state = sessions[session_id]
print(state.exchange_history[-1].raw_response)
```

### Test Provider Connectivity
```python
# test_provider.py
import asyncio
from app.core.config import get_settings
from app.providers import AnthropicProvider

async def test():
    settings = get_settings()
    provider = AnthropicProvider(settings.anthropic_api_key)

    response = await provider.generate(
        system_prompt="You are helpful.",
        user_prompt="Say 'test'",
        model="claude-haiku-4-5-20250110"
    )

    print(response.content)

asyncio.run(test())
```

### Minimal Reproduction
If you encounter a bug, create minimal reproduction:

```python
# minimal_repro.py
import asyncio
from app.models.agent import AgentConfig, ProviderType, ModelType, EvaluationCriterion
from app.models.session import SessionConfig, SessionState
from app.core.orchestrator import Orchestrator

async def main():
    config = SessionConfig(
        session_id="test",
        agents=[
            AgentConfig(
                agent_id="test-agent",
                display_name="Test",
                provider=ProviderType.ANTHROPIC,
                model=ModelType.CLAUDE_HAIKU,
                role_description="You are a test agent.",
                evaluation_criteria=[
                    EvaluationCriterion(name="Test", description="Test criterion")
                ],
            )
        ],
        initial_prompt="Say 'hello'",
        working_document="",
    )

    state = SessionState(config=config)
    orchestrator = Orchestrator(state)

    try:
        await orchestrator.run()
        print("Success!")
        print(state.exchange_history[-1].output)
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

asyncio.run(main())
```

---

## Getting Help

### Check Existing Documentation
1. [README.md](README.md) - Quick start and usage
2. [ARCHITECTURE.md](ARCHITECTURE.md) - System design and data flow
3. [PHASE_1_SUMMARY.md](PHASE_1_SUMMARY.md) - Feature overview

### Provider Documentation
- **Anthropic Claude**: https://docs.anthropic.com
- **OpenAI**: https://platform.openai.com/docs
- **Google Gemini**: https://ai.google.dev/docs

### FastAPI Documentation
- Official docs: https://fastapi.tiangolo.com
- Interactive API docs (when server running): http://localhost:8000/docs

### Pydantic Documentation
- https://docs.pydantic.dev

---

## Reporting Issues

If you encounter a bug not covered here, please report with:

1. **Environment:**
   - Python version: `python --version`
   - OS: macOS / Linux / Windows
   - Installed packages: `pip freeze`

2. **Steps to reproduce:**
   - Exact commands run
   - Configuration used (anonymize API keys!)
   - Expected vs actual behavior

3. **Error output:**
   - Full error message
   - Stack trace
   - Relevant logs

4. **Workarounds tried:**
   - What you've already attempted
   - Results of each attempt

---

## Known Limitations (Not Bugs)

Current expected limitations:

- ❌ No parallel critique mode (multiple agents reviewing simultaneously)
- ❌ No automatic retry on API failures
- ❌ No context window management for very long sessions
- ❌ No team workspaces / collaboration
- ❌ No custom workflow templates (beyond presets)

**Completed features:**
- ✅ Real-time streaming
- ✅ Session persistence (database)
- ✅ Pause/resume orchestration
- ✅ User authentication
- ✅ Credit-based billing
- ✅ Document export (Word)
- ✅ Email delivery

See [PHASE_1_SUMMARY.md](PHASE_1_SUMMARY.md) for full feature list and roadmap.
