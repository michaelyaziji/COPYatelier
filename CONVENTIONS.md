# Atelier Coding Conventions

## Project Structure

### Backend (Python/FastAPI)
```
backend/app/
├── main.py           # App entry, middleware, lifespan
├── api/routes.py     # All HTTP endpoints
├── core/             # Business logic
├── models/           # Pydantic data models
└── providers/        # AI service integrations
```

### Frontend (Next.js/React)
```
frontend/src/
├── app/              # Next.js App Router pages
├── components/       # React components
│   └── ui/           # Reusable UI primitives
├── lib/              # Utilities (API client, helpers)
├── store/            # Zustand state management
└── types/            # TypeScript definitions
```

---

## Naming Conventions

### Python (Backend)
- **Files:** `snake_case.py` (e.g., `anthropic_provider.py`)
- **Classes:** `PascalCase` (e.g., `SessionConfig`, `AnthropicProvider`)
- **Functions:** `snake_case` (e.g., `parse_evaluation`, `run_sequential`)
- **Constants:** `UPPER_SNAKE_CASE` (e.g., `MAX_TOKENS`)
- **Private methods:** `_prefixed` (e.g., `_build_agent_prompt`)
- **Enums:** `PascalCase` class, `UPPER_CASE` values
  ```python
  class ProviderType(str, Enum):
      ANTHROPIC = "anthropic"
  ```

### TypeScript (Frontend)
- **Files:** Match export name or descriptive (e.g., `SessionSetup.tsx`, `api.ts`)
- **Components:** `PascalCase` (e.g., `WorkflowPanel`, `LiveAgentPanel`)
- **Hooks:** `useCamelCase` (e.g., `useSessionStore`)
- **Types/Interfaces:** `PascalCase` (e.g., `AgentConfig`, `StreamEvent`)
- **Constants:** `UPPER_SNAKE_CASE` or `camelCase` for options arrays
- **Variables:** `camelCase`

---

## Code Patterns

### Backend Patterns

#### Pydantic Models
```python
class AgentConfig(BaseModel):
    """Docstring explaining the model."""
    agent_id: str = Field(..., description="Required field")
    is_active: bool = Field(default=True, description="Optional with default")
    score: float = Field(..., ge=0, le=10, description="With validation")

    class Config:
        use_enum_values = True  # Serialize enums as strings
```

#### Provider Interface
```python
class AIProvider(ABC):
    @abstractmethod
    async def generate(self, system_prompt, user_prompt, model, temperature=0.7):
        """All providers implement this interface."""
        pass
```

#### API Endpoints
```python
@router.post("/sessions")
async def create_session(config: SessionConfig) -> dict:
    """Endpoint with type hints and return type."""
    if not validation_check:
        raise HTTPException(status_code=400, detail="Clear error message")
    return {"session_id": id, "status": "created"}
```

#### Settings Management
```python
class Settings(BaseSettings):
    api_key: str = ""  # Empty default, checked at runtime

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False
    )

@lru_cache
def get_settings() -> Settings:
    return Settings()
```

### Frontend Patterns

#### Component Structure
```typescript
'use client';  // Required for client components

import { useState } from 'react';
import { ExternalLib } from 'external-lib';
import { InternalComponent } from '@/components/InternalComponent';
import { useSessionStore } from '@/store/session';

interface ComponentProps {
  requiredProp: string;
  optionalProp?: number;
}

export function ComponentName({ requiredProp, optionalProp = 10 }: ComponentProps) {
  const [localState, setLocalState] = useState(initialValue);
  const storeValue = useSessionStore((state) => state.value);

  return (
    <div className="tailwind-classes">
      {/* JSX */}
    </div>
  );
}
```

#### Zustand Store
```typescript
interface StoreState {
  // State
  value: string;

  // Actions
  setValue: (v: string) => void;
  computedGetter: () => DerivedType;
}

export const useStore = create<StoreState>((set, get) => ({
  value: '',

  setValue: (v) => set({ value: v }),

  computedGetter: () => {
    const { value } = get();
    return transform(value);
  },
}));
```

#### Type Definitions
```typescript
// Union types for string literals (preferred over enums)
type ProviderType = 'anthropic' | 'google' | 'openai';

// Interfaces for objects
interface AgentConfig {
  agent_id: string;
  provider: ProviderType;
  is_active: boolean;
}

// Optional fields
interface SessionConfig {
  required_field: string;
  optional_field?: number;
}
```

---

## Styling (Frontend)

### Tailwind CSS Usage
```tsx
// Use clsx for conditional classes
import { clsx } from 'clsx';

<div className={clsx(
  'base-classes px-4 py-2',
  isActive && 'bg-violet-100',
  isError && 'border-rose-500'
)}>
```

### Color Palette
- **Primary:** `violet-500/600/700` - Buttons, active states
- **Secondary:** `blue-500/600` - Information, links
- **Success:** `emerald-500/600` - Completed, positive
- **Error:** `rose-500/600` - Errors, destructive
- **Neutral:** `zinc-50/100/200/.../900` - Text, borders, backgrounds

### Component Sizing
- **Rounded corners:** `rounded-lg` (8px) or `rounded-xl` (12px)
- **Padding:** `px-4 py-2` standard, `px-6 py-4` for cards
- **Gaps:** `gap-2` (8px), `gap-4` (16px)
- **Icons:** `h-4 w-4` small, `h-5 w-5` default, `h-6 w-6` large

### UI Component Variants
```tsx
// Button variants
<Button variant="primary">Save</Button>      // Violet gradient
<Button variant="secondary">Cancel</Button>  // Gray
<Button variant="danger">Delete</Button>     // Rose
<Button variant="ghost">More</Button>        // Transparent
<Button variant="outline">Edit</Button>      // Violet border

// Button sizes
<Button size="sm">Small</Button>
<Button size="md">Medium</Button>  // Default
<Button size="lg">Large</Button>
```

---

## Error Handling

### Backend
```python
# API endpoints - use HTTPException
raise HTTPException(status_code=404, detail="Session not found")
raise HTTPException(status_code=400, detail="At least one agent required")

# Internal errors - log and re-raise or handle gracefully
try:
    response = await provider.generate(...)
except Exception as e:
    logger.error(f"Provider error: {e}")
    raise  # Or handle with fallback
```

### Frontend
```typescript
// API calls - try/catch with user-friendly errors
try {
  await api.createSession(config);
} catch (err) {
  set({ error: err instanceof Error ? err.message : 'Unknown error' });
}

// Store error state
const { error } = useSessionStore();
{error && <ErrorBanner message={error} />}
```

---

## Async Patterns

### Backend (Python)
```python
# All I/O operations are async
async def generate(self, ...):
    response = await self.client.messages.create(...)
    return response

# Streaming with async generators
async def generate_stream(self, ...) -> AsyncIterator[str]:
    async with self.client.messages.stream(...) as stream:
        async for token in stream.text_stream:
            yield token
```

### Frontend (TypeScript)
```typescript
// Async actions in Zustand
createAndStartStreamingSession: async () => {
  set({ isRunning: true, error: null });

  try {
    const response = await fetch(url);
    const reader = response.body?.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      // Process stream
    }
  } catch (err) {
    set({ error: err.message });
  } finally {
    set({ isRunning: false });
  }
}
```

---

## Import Organization

### Python
```python
# Standard library
import json
import logging
from datetime import datetime
from typing import Optional, AsyncIterator

# Third-party
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

# Local
from ..models.agent import AgentConfig
from ..providers import AIProvider
from .config import get_settings
```

### TypeScript
```typescript
// React/Next
import { useState, useEffect, useRef } from 'react';

// External libraries
import { clsx } from 'clsx';
import { PenLine, Settings } from 'lucide-react';

// Internal - absolute imports with @/
import { Button } from '@/components/ui/button';
import { useSessionStore } from '@/store/session';
import { AgentConfig, SessionState } from '@/types';
```

---

## Comments & Documentation

### When to Comment
- **Complex algorithms** - Explain the "why"
- **Workarounds** - Document why non-obvious code exists
- **TODOs** - Mark future improvements with context

### When NOT to Comment
- Self-explanatory code
- Type information (use types instead)
- What the code does (code should be readable)

### Docstrings (Python)
```python
def parse_evaluation(raw_response: str, expected_criteria: list[str]) -> Tuple[Optional[Evaluation], Optional[str]]:
    """
    Parse evaluation data from an agent's response.

    Args:
        raw_response: Full text response from the AI
        expected_criteria: List of criterion names to extract

    Returns:
        Tuple of (Evaluation object or None, error message or None)
    """
```

### JSDoc (TypeScript) - Use sparingly
```typescript
/**
 * Only for complex utility functions or exported library code.
 * Components are self-documenting via props interface.
 */
```

---

## Testing Conventions

### Backend (pytest)
```python
# File naming: test_*.py
# Function naming: test_*

def test_parse_evaluation_json():
    """Test name describes what's being tested."""
    result, error = parse_evaluation(input_json, criteria)
    assert result is not None
    assert result.overall_score == 7.5

@pytest.mark.asyncio
async def test_provider_generate():
    """Async tests marked explicitly."""
    response = await provider.generate(...)
```

### Frontend (Jest + RTL)
```typescript
// File naming: *.test.tsx

describe('ComponentName', () => {
  it('renders correctly with required props', () => {
    render(<Component prop="value" />);
    expect(screen.getByText('Expected')).toBeInTheDocument();
  });
});
```

---

## Git Conventions

### Commit Messages
```
feat: Add reference instructions field for document uploads
fix: Resolve agent color persistence across rounds
refactor: Extract prompt building into separate methods
docs: Update ARCHITECTURE.md with streaming flow
test: Add evaluation parsing edge cases
```

### Branch Naming
- `feature/description` - New features
- `fix/description` - Bug fixes
- `refactor/description` - Code improvements
- `docs/description` - Documentation only

---

## Library Choices & Rationale

| Library | Purpose | Why This One |
|---------|---------|--------------|
| FastAPI | Backend framework | Async-native, auto-docs, Pydantic integration |
| Pydantic | Data validation | Type-safe, FastAPI standard |
| Zustand | State management | Simple, TypeScript-first, no boilerplate |
| Radix UI | Accessible primitives | Unstyled, composable, accessible |
| Tailwind CSS | Styling | Utility-first, no CSS files to manage |
| clsx | Class merging | Tiny, handles conditionals well |
| Lucide | Icons | Tree-shakeable, consistent style |
