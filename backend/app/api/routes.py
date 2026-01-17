"""API routes for orchestration control."""

import io
import json
import logging
from typing import Dict, Optional

from fastapi import APIRouter, HTTPException, UploadFile, File, Depends, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.session import SessionConfig, SessionState
from ..core.orchestrator import Orchestrator
from ..core.streaming import StreamingOrchestrator
from ..core.auth import get_current_user, get_optional_user
from ..core.security import MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB, MAX_TITLE_LENGTH, limiter
from ..db.database import get_db
from ..db.repository import SessionRepository
from ..db.models import UserModel

router = APIRouter()
logger = logging.getLogger(__name__)

# In-memory runtime state for active sessions
# The database stores persistent data; this stores transient runtime state
# (is_running, is_paused, is_cancelled flags that need real-time access)
active_sessions: Dict[str, SessionState] = {}


class ReferenceFile(BaseModel):
    """A reference file with extracted content and description."""
    filename: str
    content: str
    description: str
    file_type: str


def extract_text_from_docx(file_content: bytes) -> str:
    """Extract text from a Word document."""
    try:
        from docx import Document
        doc = Document(io.BytesIO(file_content))
        paragraphs = [para.text for para in doc.paragraphs if para.text.strip()]
        return "\n\n".join(paragraphs)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse Word document: {str(e)}")


def extract_text_from_pdf(file_content: bytes) -> str:
    """Extract text from a PDF document."""
    try:
        from PyPDF2 import PdfReader
        reader = PdfReader(io.BytesIO(file_content))
        text_parts = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                text_parts.append(text)
        return "\n\n".join(text_parts)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse PDF document: {str(e)}")


def extract_text_from_txt(file_content: bytes) -> str:
    """Extract text from a plain text file."""
    try:
        return file_content.decode('utf-8')
    except UnicodeDecodeError:
        try:
            return file_content.decode('latin-1')
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to parse text file: {str(e)}")


@router.post("/files/parse")
@limiter.limit("20/minute")
async def parse_file(request: Request, file: UploadFile = File(...)) -> dict:
    """
    Parse an uploaded file and extract its text content.

    Supports: .docx, .pdf, .txt, .md
    Max file size: 10MB

    Returns:
        Extracted text content and file metadata
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    # Check file size by reading in chunks
    content_chunks = []
    total_size = 0
    chunk_size = 1024 * 1024  # 1MB chunks

    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
        total_size += len(chunk)
        if total_size > MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Maximum size is {MAX_FILE_SIZE_MB}MB"
            )
        content_chunks.append(chunk)

    content = b"".join(content_chunks)

    # Determine file type and extract text
    filename_lower = file.filename.lower()

    if filename_lower.endswith('.docx'):
        text = extract_text_from_docx(content)
        file_type = 'docx'
    elif filename_lower.endswith('.pdf'):
        text = extract_text_from_pdf(content)
        file_type = 'pdf'
    elif filename_lower.endswith('.txt') or filename_lower.endswith('.md'):
        text = extract_text_from_txt(content)
        file_type = 'txt' if filename_lower.endswith('.txt') else 'md'
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Supported: .docx, .pdf, .txt, .md"
        )

    return {
        "filename": file.filename,
        "content": text,
        "file_type": file_type,
        "char_count": len(text),
        "word_count": len(text.split()),
    }


@router.post("/sessions")
@limiter.limit("10/minute")
async def create_session(
    request: Request,
    config: SessionConfig,
    user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Create a new orchestration session.

    Requires authentication. Session will be associated with the authenticated user.
    If the session has a project_id, project files and instructions are automatically
    merged into the session's reference materials.

    Args:
        config: Session configuration with agents and orchestration settings
        user: Authenticated user (injected by dependency)

    Returns:
        Session metadata including session_id
    """
    # Validate at least one active agent
    active_agents = [a for a in config.agents if a.is_active]
    if not active_agents:
        raise HTTPException(status_code=400, detail="At least one active agent is required")

    # If session belongs to a project, merge project context
    if config.project_id:
        from ..db.repository import ProjectRepository, ProjectFileRepository

        project_repo = ProjectRepository(db)
        file_repo = ProjectFileRepository(db)

        # Verify project exists and belongs to user
        project = await project_repo.get_for_user(config.project_id, user.id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        # Get all project file content
        project_files = await file_repo.get_all_content_for_project(config.project_id)

        # Check context size limits
        total_project_chars = await file_repo.get_total_content_size(config.project_id)
        session_doc_chars = sum(len(v) for v in (config.reference_documents or {}).values())
        total_context_chars = total_project_chars + session_doc_chars

        if total_context_chars > file_repo.MAX_PROJECT_CONTEXT_CHARS:
            raise HTTPException(
                status_code=400,
                detail=f"Combined project and session files exceed context limit ({total_context_chars:,} chars). "
                       f"Maximum is {file_repo.MAX_PROJECT_CONTEXT_CHARS:,} chars. "
                       "Remove some files to proceed."
            )

        # Merge project files into reference_documents (session files take priority)
        merged_documents = {**project_files, **(config.reference_documents or {})}
        config.reference_documents = merged_documents

        # Prepend project instructions to reference_instructions
        if project.instructions:
            project_instructions = f"[Project Instructions]\n{project.instructions}\n\n"
            if config.reference_instructions:
                config.reference_instructions = project_instructions + config.reference_instructions
            else:
                config.reference_instructions = project_instructions

        logger.info(f"Merged project context into session: {len(project_files)} files, "
                   f"instructions={'yes' if project.instructions else 'no'}")

    # Credit validation before session creation
    from ..db.repository import CreditRepository
    from ..core.credits import estimate_session_credits

    credit_repo = CreditRepository(db)

    # Calculate estimated credits for this session configuration
    agents_for_estimate = [
        {"model": a.model, "agent_id": a.agent_id}
        for a in active_agents
    ]
    document_words = len(config.working_document.split()) if config.working_document else 0
    estimated_credits = estimate_session_credits(
        agents=agents_for_estimate,
        max_rounds=config.termination.max_rounds,
        document_words=document_words,
    )

    # Check if user has sufficient credits
    balance = await credit_repo.get_or_create_balance(user.id)
    if balance.balance < estimated_credits:
        raise HTTPException(
            status_code=402,  # Payment Required
            detail={
                "error": "insufficient_credits",
                "message": f"Insufficient credits. You have {balance.balance} credits but this session requires approximately {estimated_credits} credits.",
                "required_credits": estimated_credits,
                "available_credits": balance.balance,
                "shortfall": estimated_credits - balance.balance,
            }
        )

    # Create session in database with user association
    repo = SessionRepository(db)
    await repo.create(config, user_id=user.id)

    # Also keep in-memory state for runtime tracking
    state = SessionState(
        config=config,
        exchange_history=[],
        current_round=0,
        is_running=False,
        is_paused=False,
    )
    active_sessions[config.session_id] = state

    logger.info(f"Created session {config.session_id} for user {user.id}")

    return {
        "session_id": config.session_id,
        "title": config.title,
        "agent_count": len(active_agents),
        "flow_type": config.flow_type,
        "status": "created"
    }


async def get_session_state(
    session_id: str,
    db: AsyncSession,
    user: Optional[UserModel] = None,
) -> SessionState:
    """
    Get session state, checking in-memory first, then database.

    If user is provided, verifies the session belongs to that user.

    Args:
        session_id: Session identifier
        db: Database session
        user: Optional user for ownership verification

    Returns:
        SessionState

    Raises:
        HTTPException if session not found or doesn't belong to user
    """
    # Check in-memory first (for active sessions)
    if session_id in active_sessions:
        # If user provided, verify ownership from database
        if user:
            repo = SessionRepository(db)
            db_session = await repo.get_for_user(session_id, user.id)
            if not db_session:
                raise HTTPException(status_code=404, detail="Session not found")
        return active_sessions[session_id]

    # Fall back to database
    repo = SessionRepository(db)

    if user:
        # User-scoped lookup
        db_session = await repo.get_for_user(session_id, user.id)
    else:
        # Admin/system lookup (no user scope)
        db_session = await repo.get(session_id)

    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Convert to SessionState and cache
    state = repo.to_session_state(db_session)
    active_sessions[session_id] = state

    return state


@router.post("/sessions/{session_id}/start")
@limiter.limit("5/minute")
async def start_session(
    request: Request,
    session_id: str,
    user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Start orchestration for a session.

    Requires authentication. User must own the session.

    Args:
        session_id: Session identifier

    Returns:
        Status message
    """
    state = await get_session_state(session_id, db, user)

    if state.is_running:
        raise HTTPException(status_code=400, detail="Session is already running")

    # Update status in database
    repo = SessionRepository(db)
    await repo.update_status(session_id, "running")

    # Monitoring: mark session as started
    from ..core.monitoring import mark_session_started, mark_session_ended, record_session_failure
    mark_session_started(session_id, user.id)

    # Create orchestrator and run
    orchestrator = Orchestrator(state)

    try:
        await orchestrator.run()

        # Monitoring: mark session as ended
        mark_session_ended(session_id)

        # Persist final state to database
        await repo.update_status(
            session_id,
            "completed",
            termination_reason=state.termination_reason,
        )

        # Save exchange turns to database
        for turn in state.exchange_history:
            agent_config = next(
                (a for a in state.config.agents if a.agent_id == turn.agent_id),
                None
            )
            phase = getattr(agent_config, 'phase', 2) if agent_config else 2
            await repo.add_exchange_turn(session_id, turn, phase=phase)

        # Update working document
        if state.exchange_history:
            final_doc = state.exchange_history[-1].working_document
            await repo.update_working_document(session_id, final_doc)

        return {
            "session_id": session_id,
            "status": "completed",
            "rounds_completed": state.current_round,
            "total_turns": len(state.exchange_history),
            "termination_reason": state.termination_reason,
        }

    except Exception as e:
        state.is_running = False
        # Monitoring: record session failure and mark ended
        mark_session_ended(session_id)
        await record_session_failure(session_id, user.id, str(e))

        await repo.update_status(session_id, "failed", termination_reason=str(e))
        raise HTTPException(status_code=500, detail=f"Orchestration failed: {str(e)}")


@router.post("/sessions/{session_id}/start-stream")
@limiter.limit("5/minute")
async def start_session_stream(
    request: Request,
    session_id: str,
    user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Start orchestration with streaming output.

    Returns a Server-Sent Events stream with real-time agent output.
    Requires authentication. User must own the session.
    Credits are deducted based on token usage after the session completes.

    Args:
        session_id: Session identifier

    Returns:
        SSE stream with orchestration events
    """
    state = await get_session_state(session_id, db, user)

    if state.is_running:
        raise HTTPException(status_code=400, detail="Session is already running")

    # Update status in database
    repo = SessionRepository(db)
    await repo.update_status(session_id, "running")

    # Get user's current credit balance for mid-session tracking
    from ..db.repository import CreditRepository
    credit_repo = CreditRepository(db)
    balance = await credit_repo.get_or_create_balance(user.id)
    initial_balance = balance.balance

    # Create streaming orchestrator with user context for credit tracking
    orchestrator = StreamingOrchestrator(state, user_id=user.id, initial_balance=initial_balance)

    # Monitoring: mark session as started
    from ..core.monitoring import mark_session_started, mark_session_ended, record_session_failure, record_credit_usage
    mark_session_started(session_id, user.id)

    async def event_generator():
        try:
            async for event in orchestrator.run_streaming():
                yield event

            # Monitoring: mark session as ended
            mark_session_ended(session_id)

            # After streaming completes, persist to database
            # Note: We need a new db session here since the original one
            # may have been closed
            from ..db.database import async_session
            async with async_session() as db_session:
                repo = SessionRepository(db_session)

                # Check if session was already stopped by user - if so, skip persistence
                # since stop_session already persisted the data
                db_session_record = await repo.get(session_id)
                if db_session_record and db_session_record.status == "stopped":
                    logger.info(f"Session {session_id} was stopped by user, skipping stream cleanup persistence")
                else:
                    # Determine final status
                    final_status = "completed"
                    if state.is_cancelled:
                        final_status = "failed"

                    await repo.update_status(
                        session_id,
                        final_status,
                        termination_reason=state.termination_reason,
                    )

                    # Save exchange turns with token and credit info
                    for turn in state.exchange_history:
                        agent_config = next(
                            (a for a in state.config.agents if a.agent_id == turn.agent_id),
                            None
                        )
                        phase = getattr(agent_config, 'phase', 2) if agent_config else 2
                        await repo.add_exchange_turn(
                            session_id,
                            turn,
                            phase=phase,
                            tokens_input=turn.tokens_input,
                            tokens_output=turn.tokens_output,
                            credits_used=turn.credits_used,
                        )

                    # Update working document
                    if state.exchange_history:
                        final_doc = state.exchange_history[-1].working_document
                        await repo.update_working_document(session_id, final_doc)

                    # Deduct credits for the session
                    from ..db.repository import CreditRepository
                    credit_repo = CreditRepository(db_session)

                    total_credits = orchestrator.session_credits_used
                    if total_credits > 0:
                        # Deduct credits with description
                        await credit_repo.deduct(
                            user_id=user.id,
                            amount=total_credits,
                            session_id=session_id,
                            description=f"Session: {state.config.title or session_id}",
                        )

                        # Update session's total credits used
                        await credit_repo.update_session_credits(session_id, total_credits)

                        # Monitoring: track credit usage for anomaly detection
                        await record_credit_usage(user.id, user.email, total_credits, session_id)

                        logger.info(f"Deducted {total_credits} credits for session {session_id}")

        except Exception as e:
            logger.error(f"Streaming error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

            # Monitoring: record session failure and mark ended
            mark_session_ended(session_id)
            await record_session_failure(session_id, user.id, str(e))

            # Update status on error
            from ..db.database import async_session
            async with async_session() as db_session:
                repo = SessionRepository(db_session)
                await repo.update_status(session_id, "failed", termination_reason=str(e))

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


@router.post("/sessions/{session_id}/stop")
async def stop_session(
    session_id: str,
    user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Stop a running orchestration session.

    This will cancel the orchestration after the current agent turn completes.
    Any completed turns will be preserved in the session history.
    Also updates the database status to ensure the session is marked as stopped
    even if the backend process has crashed.
    Requires authentication. User must own the session.

    Args:
        session_id: Session identifier

    Returns:
        Status message with partial results info
    """
    state = await get_session_state(session_id, db, user)
    repo = SessionRepository(db)

    # Always update database status to "stopped" - this ensures the session
    # is marked as stopped even if the backend process has crashed
    await repo.update_status(session_id, "stopped", termination_reason="Stopped by user")

    # Persist the accumulated state before clearing cache
    # This ensures the frontend can reload the partial results
    if state.current_round > 0:
        await repo.update_round(session_id, state.current_round)

    # Save any completed exchange turns that haven't been persisted yet
    total_credits = 0
    if state.exchange_history:
        for turn in state.exchange_history:
            agent_config = next(
                (a for a in state.config.agents if a.agent_id == turn.agent_id),
                None
            )
            phase = getattr(agent_config, 'phase', 2) if agent_config else 2
            await repo.add_exchange_turn(
                session_id,
                turn,
                phase=phase,
                tokens_input=turn.tokens_input,
                tokens_output=turn.tokens_output,
            )
            # Sum up credits used
            if turn.credits_used:
                total_credits += turn.credits_used

        # Update working document with the latest version
        final_doc = state.exchange_history[-1].working_document
        await repo.update_working_document(session_id, final_doc)

    # Deduct credits for completed work
    if total_credits > 0:
        from ..db.repository import CreditRepository
        credit_repo = CreditRepository(db)
        await credit_repo.deduct(
            user_id=user.id,
            amount=total_credits,
            session_id=session_id,
            description=f"Session stopped: {state.config.title or session_id}",
        )
        await credit_repo.update_session_credits(session_id, total_credits)
        logger.info(f"Deducted {total_credits} credits for stopped session {session_id}")

    # Also set the cancellation flag on in-memory state if it exists and is running
    if state.is_running:
        state.is_cancelled = True

    # Remove from active sessions cache so next load gets fresh state from DB
    if session_id in active_sessions:
        del active_sessions[session_id]

    return {
        "session_id": session_id,
        "status": "stopped",
        "message": "Session stopped. Any completed work has been saved.",
        "turns_completed": len(state.exchange_history),
    }


@router.post("/sessions/{session_id}/reset")
async def reset_session(
    session_id: str,
    user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Reset a stuck session back to draft state.

    This allows users to recover from stuck sessions (e.g., when the backend
    process crashed but the database still shows "running"). Resets the session
    status to "draft" so users can try again.
    Requires authentication. User must own the session.

    Args:
        session_id: Session identifier

    Returns:
        Status message
    """
    # Verify ownership
    repo = SessionRepository(db)
    db_session = await repo.get_for_user(session_id, user.id)

    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Remove from active sessions cache
    if session_id in active_sessions:
        del active_sessions[session_id]

    # Reset status to draft
    await repo.update_status(session_id, "draft", termination_reason=None)

    return {
        "session_id": session_id,
        "status": "reset",
        "message": "Session reset to draft. You can now start it again.",
    }


@router.post("/sessions/{session_id}/pause")
async def pause_session(
    session_id: str,
    user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Pause a running session after the current agent turn. Requires authentication."""
    state = await get_session_state(session_id, db, user)

    if not state.is_running:
        return {"session_id": session_id, "status": "not_running"}

    state.is_paused = True

    # Update status in database
    repo = SessionRepository(db)
    await repo.update_status(session_id, "paused")

    return {"session_id": session_id, "status": "pausing"}


@router.post("/sessions/{session_id}/resume")
async def resume_session(
    session_id: str,
    user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Resume a paused session. Requires authentication."""
    state = await get_session_state(session_id, db, user)

    if not state.is_paused:
        return {"session_id": session_id, "status": "not_paused"}

    state.is_paused = False

    # Update status in database
    repo = SessionRepository(db)
    await repo.update_status(session_id, "running")

    return {"session_id": session_id, "status": "resumed"}


@router.get("/sessions/{session_id}")
async def get_session(
    session_id: str,
    user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SessionState:
    """
    Get session state including full exchange history.

    Requires authentication. User must own the session.

    Args:
        session_id: Session identifier

    Returns:
        Complete session state
    """
    return await get_session_state(session_id, db, user)


@router.get("/sessions/{session_id}/document")
async def get_current_document(
    session_id: str,
    user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Get the current working document.

    Requires authentication. User must own the session.

    Args:
        session_id: Session identifier

    Returns:
        Current document content
    """
    state = await get_session_state(session_id, db, user)

    if state.exchange_history:
        current_doc = state.exchange_history[-1].working_document
    else:
        current_doc = state.config.working_document

    return {
        "session_id": session_id,
        "document": current_doc,
        "last_updated_by": state.exchange_history[-1].agent_name if state.exchange_history else None,
        "turn_number": state.exchange_history[-1].turn_number if state.exchange_history else 0,
    }


@router.get("/sessions")
async def list_sessions(
    project_id: str | None = Query(default=None, description="Filter by project ID"),
    user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    List all sessions for the authenticated user.

    Requires authentication. Only returns sessions owned by the user.
    Optionally filter by project_id.

    Returns:
        List of session metadata
    """
    repo = SessionRepository(db)
    db_sessions = await repo.list_for_user(user.id)

    session_list = []
    for session in db_sessions:
        # Filter by project if specified
        if project_id is not None and session.project_id != project_id:
            continue

        # Count active agents from config
        agent_config = session.agent_config or []
        active_count = len([a for a in agent_config if a.get('is_active', True)])

        # Check if session is currently active in memory
        is_running = False
        if session.id in active_sessions:
            is_running = active_sessions[session.id].is_running

        session_list.append({
            "session_id": session.id,
            "title": session.title,
            "starred": getattr(session, 'starred', False),
            "status": session.status,
            "project_id": session.project_id,
            "agent_count": active_count,
            "current_round": session.current_round,
            "total_turns": len(session.exchange_turns) if session.exchange_turns else 0,
            "is_running": is_running,
            "termination_reason": session.termination_reason,
            "created_at": session.created_at.isoformat() if session.created_at else None,
        })

    return {"sessions": session_list}


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: str,
    user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Delete a session and all its data.

    Requires authentication. User must own the session.

    Args:
        session_id: Session identifier

    Returns:
        Deletion status
    """
    # Verify ownership first
    repo = SessionRepository(db)
    db_session = await repo.get_for_user(session_id, user.id)

    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Remove from in-memory cache
    if session_id in active_sessions:
        state = active_sessions[session_id]
        if state.is_running:
            raise HTTPException(
                status_code=400,
                detail="Cannot delete a running session. Stop it first."
            )
        del active_sessions[session_id]

    # Delete from database
    await repo.delete(session_id)

    return {"session_id": session_id, "status": "deleted"}


@router.patch("/sessions/{session_id}/rename")
async def rename_session(
    session_id: str,
    body: dict,
    user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Rename a session.

    Requires authentication. User must own the session.

    Args:
        session_id: Session identifier
        body: JSON body with 'title' field

    Returns:
        Updated session info
    """
    title = body.get("title")
    if not title or not title.strip():
        raise HTTPException(status_code=400, detail="Title is required")

    if len(title.strip()) > MAX_TITLE_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Title too long. Maximum length is {MAX_TITLE_LENGTH} characters"
        )

    repo = SessionRepository(db)
    db_session = await repo.get_for_user(session_id, user.id)

    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Update title in database
    db_session.title = title.strip()
    await db.commit()

    # Update in-memory cache if present
    if session_id in active_sessions:
        active_sessions[session_id].config.title = title.strip()

    return {"session_id": session_id, "status": "renamed", "title": title.strip()}


@router.patch("/sessions/{session_id}/star")
async def star_session(
    session_id: str,
    body: dict,
    user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Star or unstar a session.

    Requires authentication. User must own the session.

    Args:
        session_id: Session identifier
        body: JSON body with 'starred' boolean field

    Returns:
        Updated session info
    """
    starred = body.get("starred", False)

    repo = SessionRepository(db)
    db_session = await repo.get_for_user(session_id, user.id)

    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Update starred status in database
    db_session.starred = starred
    await db.commit()

    return {"session_id": session_id, "status": "updated", "starred": starred}


class EmailDocumentRequest(BaseModel):
    """Request body for emailing a document."""
    email: str
    content: str
    message: Optional[str] = None  # Optional personal message to include


@router.post("/sessions/{session_id}/email")
@limiter.limit("10/minute")
async def email_document(
    request: Request,
    session_id: str,
    body: EmailDocumentRequest,
    user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Email the session document to a specified address.

    Requires authentication. User must own the session.

    Args:
        session_id: Session identifier
        body: JSON body with 'email' and 'content' fields

    Returns:
        Status message
    """
    from ..core.email import send_document_email

    repo = SessionRepository(db)
    db_session = await repo.get_for_user(session_id, user.id)

    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        await send_document_email(
            to_email=body.email,
            document_content=body.content,
            session_title=db_session.title,
            personal_message=body.message,
        )
        return {"status": "sent", "message": f"Document emailed to {body.email}"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to send email: {e}")
        raise HTTPException(status_code=500, detail="Failed to send email")


# ============ User endpoints ============

@router.get("/users/me")
async def get_current_user_info(
    user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Get current authenticated user information with profile.

    Returns:
        User data with profile and preferences
    """
    from ..db.repository import UserProfileRepository
    from ..models.user import UserPreferences

    profile_repo = UserProfileRepository(db)
    profile = await profile_repo.get_or_create_profile(user.id)

    # Parse preferences with defaults
    prefs_dict = profile.preferences or {}
    preferences = UserPreferences(**prefs_dict)

    return {
        "id": user.id,
        "email": user.email,
        "display_name": user.display_name,
        "is_admin": user.is_admin,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "updated_at": user.updated_at.isoformat() if user.updated_at else None,
        "profile": {
            "id": profile.id,
            "timezone": profile.timezone,
            "preferences": preferences.model_dump(),
            "created_at": profile.created_at.isoformat() if profile.created_at else None,
            "updated_at": profile.updated_at.isoformat() if profile.updated_at else None,
        },
    }


@router.patch("/users/me")
async def update_current_user(
    user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    display_name: Optional[str] = None,
    timezone: Optional[str] = None,
) -> dict:
    """
    Update current user's profile information.

    Args:
        display_name: Optional new display name
        timezone: Optional new timezone

    Returns:
        Updated user data
    """
    from ..db.repository import UserProfileRepository

    profile_repo = UserProfileRepository(db)

    # Update user if display_name provided
    if display_name is not None:
        await profile_repo.update_user(user.id, display_name=display_name)

    # Update profile if timezone provided
    if timezone is not None:
        await profile_repo.update_profile(user.id, new_timezone=timezone)

    # Return updated user info
    return await get_current_user_info(user, db)


@router.put("/users/me/preferences")
async def update_user_preferences(
    preferences: dict,
    user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Update current user's preferences.

    Preferences are merged with existing values, so you can update
    individual preferences without sending the full object.

    Args:
        preferences: Dict of preferences to update

    Returns:
        Updated preferences
    """
    from ..db.repository import UserProfileRepository
    from ..models.user import UserPreferences

    profile_repo = UserProfileRepository(db)
    profile = await profile_repo.update_preferences(user.id, preferences)

    # Parse and return preferences
    prefs_dict = profile.preferences or {}
    prefs = UserPreferences(**prefs_dict)

    return {
        "preferences": prefs.model_dump(),
        "updated_at": profile.updated_at.isoformat() if profile.updated_at else None,
    }


@router.post("/users/me/export")
async def export_user_data(
    user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Export all user data for GDPR compliance.

    Returns a JSON object containing all user data including:
    - User profile
    - Preferences
    - All sessions
    - All exchange turns
    - All document versions

    Returns:
        Complete user data export
    """
    from ..db.repository import UserProfileRepository

    profile_repo = UserProfileRepository(db)
    export = await profile_repo.export_user_data(user.id)

    if not export:
        raise HTTPException(status_code=404, detail="User not found")

    return export


@router.delete("/users/me")
async def delete_user_account(
    confirmation: str,
    user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Delete user account and all associated data (GDPR compliance).

    This action is irreversible and will delete:
    - User profile and preferences
    - All sessions
    - All exchange turns
    - All document versions

    Args:
        confirmation: Must be "DELETE" to confirm deletion

    Returns:
        Deletion status
    """
    if confirmation != "DELETE":
        raise HTTPException(
            status_code=400,
            detail="Confirmation must be 'DELETE' to delete account"
        )

    from ..db.repository import UserProfileRepository

    profile_repo = UserProfileRepository(db)

    # Check for running sessions
    session_repo = SessionRepository(db)
    user_sessions = await session_repo.list_for_user(user.id, status="running")
    if user_sessions:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete account while sessions are running. Stop all sessions first."
        )

    # Delete user and all data
    deleted = await profile_repo.delete_user_and_data(user.id)

    if not deleted:
        raise HTTPException(status_code=404, detail="User not found")

    # Clear any in-memory sessions for this user
    sessions_to_remove = [
        sid for sid, state in active_sessions.items()
        if hasattr(state, 'config') and hasattr(state.config, 'user_id') and state.config.user_id == user.id
    ]
    for sid in sessions_to_remove:
        del active_sessions[sid]

    return {
        "status": "deleted",
        "message": "Account and all associated data have been permanently deleted",
    }


# ============ Project endpoints ============

@router.get("/projects")
async def list_projects(
    include_archived: bool = False,
    user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    List all projects for the authenticated user.

    Args:
        include_archived: Whether to include archived projects

    Returns:
        List of projects with session counts and file counts
    """
    from ..db.repository import ProjectRepository

    repo = ProjectRepository(db)
    projects = await repo.list_for_user(user.id, include_archived=include_archived)

    project_list = []
    for project in projects:
        session_count = await repo.get_session_count(project.id)
        file_count = await repo.get_file_count(project.id)
        project_list.append({
            "id": project.id,
            "user_id": project.user_id,
            "name": project.name,
            "description": project.description,
            "instructions": project.instructions,
            "default_agent_config": project.default_agent_config,
            "archived_at": project.archived_at.isoformat() if project.archived_at else None,
            "created_at": project.created_at.isoformat() if project.created_at else None,
            "updated_at": project.updated_at.isoformat() if project.updated_at else None,
            "session_count": session_count,
            "file_count": file_count,
        })

    return {"projects": project_list, "total": len(project_list)}


@router.post("/projects")
async def create_project(
    name: str,
    description: Optional[str] = None,
    instructions: Optional[str] = None,
    user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Create a new project.

    Args:
        name: Project name
        description: Optional project description
        instructions: Optional project-level instructions (like Claude's Memory)

    Returns:
        Created project data
    """
    from ..db.repository import ProjectRepository

    repo = ProjectRepository(db)
    project = await repo.create(
        user_id=user.id,
        name=name,
        description=description,
        instructions=instructions,
    )

    return {
        "id": project.id,
        "user_id": project.user_id,
        "name": project.name,
        "description": project.description,
        "instructions": project.instructions,
        "default_agent_config": project.default_agent_config,
        "archived_at": None,
        "created_at": project.created_at.isoformat() if project.created_at else None,
        "updated_at": project.updated_at.isoformat() if project.updated_at else None,
        "session_count": 0,
        "file_count": 0,
    }


@router.get("/projects/{project_id}")
async def get_project(
    project_id: str,
    user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Get a project by ID with session count and file count.

    Args:
        project_id: Project ID

    Returns:
        Project data with session count and file count
    """
    from ..db.repository import ProjectRepository

    repo = ProjectRepository(db)
    project = await repo.get_for_user(project_id, user.id)

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    session_count = await repo.get_session_count(project.id)
    file_count = await repo.get_file_count(project.id)

    return {
        "id": project.id,
        "user_id": project.user_id,
        "name": project.name,
        "description": project.description,
        "instructions": project.instructions,
        "default_agent_config": project.default_agent_config,
        "archived_at": project.archived_at.isoformat() if project.archived_at else None,
        "created_at": project.created_at.isoformat() if project.created_at else None,
        "updated_at": project.updated_at.isoformat() if project.updated_at else None,
        "session_count": session_count,
        "file_count": file_count,
    }


@router.patch("/projects/{project_id}")
async def update_project(
    project_id: str,
    name: Optional[str] = None,
    description: Optional[str] = None,
    instructions: Optional[str] = None,
    user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Update a project.

    Args:
        project_id: Project ID
        name: Optional new name
        description: Optional new description
        instructions: Optional new instructions

    Returns:
        Updated project data
    """
    from ..db.repository import ProjectRepository

    repo = ProjectRepository(db)

    # Verify ownership
    project = await repo.get_for_user(project_id, user.id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Update project
    updated = await repo.update(
        project_id,
        name=name,
        description=description,
        instructions=instructions,
    )

    session_count = await repo.get_session_count(project_id)
    file_count = await repo.get_file_count(project_id)

    return {
        "id": updated.id,
        "user_id": updated.user_id,
        "name": updated.name,
        "description": updated.description,
        "instructions": updated.instructions,
        "default_agent_config": updated.default_agent_config,
        "archived_at": updated.archived_at.isoformat() if updated.archived_at else None,
        "created_at": updated.created_at.isoformat() if updated.created_at else None,
        "updated_at": updated.updated_at.isoformat() if updated.updated_at else None,
        "session_count": session_count,
        "file_count": file_count,
    }


@router.delete("/projects/{project_id}")
async def archive_project(
    project_id: str,
    permanent: bool = False,
    user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Archive or permanently delete a project.

    By default, archives the project (soft delete).
    Use permanent=true to permanently delete.

    Args:
        project_id: Project ID
        permanent: If true, permanently delete instead of archiving

    Returns:
        Status message
    """
    from ..db.repository import ProjectRepository

    repo = ProjectRepository(db)

    # Verify ownership
    project = await repo.get_for_user(project_id, user.id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if permanent:
        await repo.delete(project_id)
        return {"status": "deleted", "project_id": project_id}
    else:
        await repo.archive(project_id)
        return {"status": "archived", "project_id": project_id}


@router.post("/projects/{project_id}/unarchive")
async def unarchive_project(
    project_id: str,
    user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Unarchive a project.

    Args:
        project_id: Project ID

    Returns:
        Unarchived project data
    """
    from ..db.repository import ProjectRepository

    repo = ProjectRepository(db)

    # Verify ownership (include archived to find it)
    projects = await repo.list_for_user(user.id, include_archived=True)
    project = next((p for p in projects if p.id == project_id), None)

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not project.archived_at:
        raise HTTPException(status_code=400, detail="Project is not archived")

    updated = await repo.unarchive(project_id)
    session_count = await repo.get_session_count(project_id)
    file_count = await repo.get_file_count(project_id)

    return {
        "id": updated.id,
        "user_id": updated.user_id,
        "name": updated.name,
        "description": updated.description,
        "instructions": updated.instructions,
        "default_agent_config": updated.default_agent_config,
        "archived_at": None,
        "created_at": updated.created_at.isoformat() if updated.created_at else None,
        "updated_at": updated.updated_at.isoformat() if updated.updated_at else None,
        "session_count": session_count,
        "file_count": file_count,
    }


# ============ Project File endpoints ============


@router.get("/projects/{project_id}/files")
async def list_project_files(
    project_id: str,
    user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    List all files in a project.

    Returns file metadata without content for efficiency.

    Args:
        project_id: Project ID

    Returns:
        List of project files (without content)
    """
    from ..db.repository import ProjectRepository, ProjectFileRepository

    project_repo = ProjectRepository(db)
    file_repo = ProjectFileRepository(db)

    # Verify ownership
    project = await project_repo.get_for_user(project_id, user.id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    files = await file_repo.list_for_project(project_id)

    return {
        "files": [
            {
                "id": f.id,
                "project_id": f.project_id,
                "filename": f.filename,
                "original_file_type": f.original_file_type,
                "description": f.description,
                "char_count": f.char_count,
                "word_count": f.word_count,
                "created_at": f.created_at.isoformat() if f.created_at else None,
            }
            for f in files
        ],
        "total": len(files),
    }


@router.post("/projects/{project_id}/files")
@limiter.limit("20/minute")
async def upload_project_file(
    request: Request,
    project_id: str,
    file: UploadFile = File(...),
    description: Optional[str] = None,
    user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Upload a file to a project.

    Extracts text content from the file and stores it.
    Supports: .docx, .pdf, .txt, .md
    Max file size: 10MB

    Args:
        project_id: Project ID
        file: File to upload
        description: Optional file description

    Returns:
        Created file data
    """
    from ..db.repository import ProjectRepository, ProjectFileRepository

    project_repo = ProjectRepository(db)
    file_repo = ProjectFileRepository(db)

    # Verify project ownership
    project = await project_repo.get_for_user(project_id, user.id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Check storage limits before upload
    limits = await file_repo.check_storage_limits(project_id)
    if not limits["can_add_file"]:
        raise HTTPException(
            status_code=400,
            detail=f"Project file limit reached. Maximum {limits['max_files']} files per project."
        )

    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    # Read file content with size check
    content_chunks = []
    total_size = 0
    chunk_size = 1024 * 1024  # 1MB chunks

    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
        total_size += len(chunk)
        if total_size > MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Maximum size is {MAX_FILE_SIZE_MB}MB"
            )
        content_chunks.append(chunk)

    content = b"".join(content_chunks)

    # Determine file type and extract text
    filename_lower = file.filename.lower()

    if filename_lower.endswith('.docx'):
        text = extract_text_from_docx(content)
        file_type = 'docx'
    elif filename_lower.endswith('.pdf'):
        text = extract_text_from_pdf(content)
        file_type = 'pdf'
    elif filename_lower.endswith('.txt') or filename_lower.endswith('.md'):
        text = extract_text_from_txt(content)
        file_type = 'txt' if filename_lower.endswith('.txt') else 'md'
    else:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Supported: .docx, .pdf, .txt, .md"
        )

    # Check content size limit
    if not limits["can_add_content"] or (limits["total_chars"] + len(text)) > file_repo.MAX_PROJECT_TOTAL_CHARS:
        raise HTTPException(
            status_code=400,
            detail=f"Project storage limit reached ({limits['usage_percent']}% used). Remove some files to add more."
        )

    # Create file record
    project_file = await file_repo.create(
        project_id=project_id,
        filename=file.filename,
        content=text,
        original_file_type=file_type,
        description=description,
    )

    return {
        "id": project_file.id,
        "project_id": project_file.project_id,
        "filename": project_file.filename,
        "original_file_type": project_file.original_file_type,
        "description": project_file.description,
        "char_count": project_file.char_count,
        "word_count": project_file.word_count,
        "created_at": project_file.created_at.isoformat() if project_file.created_at else None,
    }


@router.get("/projects/{project_id}/files/{file_id}")
async def get_project_file(
    project_id: str,
    file_id: str,
    user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Get a project file with full content.

    Args:
        project_id: Project ID
        file_id: File ID

    Returns:
        File data with content
    """
    from ..db.repository import ProjectRepository, ProjectFileRepository

    project_repo = ProjectRepository(db)
    file_repo = ProjectFileRepository(db)

    # Verify project ownership
    project = await project_repo.get_for_user(project_id, user.id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get file
    project_file = await file_repo.get_for_project(file_id, project_id)
    if not project_file:
        raise HTTPException(status_code=404, detail="File not found")

    return {
        "id": project_file.id,
        "project_id": project_file.project_id,
        "filename": project_file.filename,
        "original_file_type": project_file.original_file_type,
        "description": project_file.description,
        "content": project_file.content,
        "char_count": project_file.char_count,
        "word_count": project_file.word_count,
        "created_at": project_file.created_at.isoformat() if project_file.created_at else None,
        "updated_at": project_file.updated_at.isoformat() if project_file.updated_at else None,
    }


@router.patch("/projects/{project_id}/files/{file_id}")
async def update_project_file(
    project_id: str,
    file_id: str,
    filename: Optional[str] = None,
    description: Optional[str] = None,
    user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Update a project file's metadata.

    Args:
        project_id: Project ID
        file_id: File ID
        filename: Optional new filename
        description: Optional new description

    Returns:
        Updated file data (without content)
    """
    from ..db.repository import ProjectRepository, ProjectFileRepository

    project_repo = ProjectRepository(db)
    file_repo = ProjectFileRepository(db)

    # Verify project ownership
    project = await project_repo.get_for_user(project_id, user.id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Verify file exists in project
    existing = await file_repo.get_for_project(file_id, project_id)
    if not existing:
        raise HTTPException(status_code=404, detail="File not found")

    # Update file
    updated = await file_repo.update(file_id, filename=filename, description=description)

    return {
        "id": updated.id,
        "project_id": updated.project_id,
        "filename": updated.filename,
        "original_file_type": updated.original_file_type,
        "description": updated.description,
        "char_count": updated.char_count,
        "word_count": updated.word_count,
        "created_at": updated.created_at.isoformat() if updated.created_at else None,
        "updated_at": updated.updated_at.isoformat() if updated.updated_at else None,
    }


@router.delete("/projects/{project_id}/files/{file_id}")
async def delete_project_file(
    project_id: str,
    file_id: str,
    user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Delete a project file.

    Args:
        project_id: Project ID
        file_id: File ID

    Returns:
        Deletion status
    """
    from ..db.repository import ProjectRepository, ProjectFileRepository

    project_repo = ProjectRepository(db)
    file_repo = ProjectFileRepository(db)

    # Verify project ownership
    project = await project_repo.get_for_user(project_id, user.id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Verify file exists in project
    existing = await file_repo.get_for_project(file_id, project_id)
    if not existing:
        raise HTTPException(status_code=404, detail="File not found")

    # Delete file
    await file_repo.delete(file_id)

    return {"status": "deleted", "file_id": file_id, "project_id": project_id}


@router.get("/projects/{project_id}/storage")
async def get_project_storage(
    project_id: str,
    user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Get project storage usage and limits.

    Args:
        project_id: Project ID

    Returns:
        Storage usage information
    """
    from ..db.repository import ProjectRepository, ProjectFileRepository

    project_repo = ProjectRepository(db)
    file_repo = ProjectFileRepository(db)

    # Verify project ownership
    project = await project_repo.get_for_user(project_id, user.id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    limits = await file_repo.check_storage_limits(project_id)

    return limits


@router.get("/projects/{project_id}/sessions")
async def list_project_sessions(
    project_id: str,
    user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    List all sessions in a project.

    Args:
        project_id: Project ID

    Returns:
        List of sessions in the project
    """
    from ..db.repository import ProjectRepository

    repo = ProjectRepository(db)

    # Verify ownership
    project = await repo.get_for_user(project_id, user.id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    sessions = await repo.get_sessions_in_project(project_id, user.id)

    session_list = []
    for session in sessions:
        session_list.append({
            "session_id": session.id,
            "title": session.title,
            "status": session.status,
            "current_round": session.current_round,
            "termination_reason": session.termination_reason,
            "created_at": session.created_at.isoformat() if session.created_at else None,
            "completed_at": session.completed_at.isoformat() if session.completed_at else None,
        })

    return {"sessions": session_list, "project_id": project_id}


@router.post("/sessions/{session_id}/move")
async def move_session_to_project(
    session_id: str,
    project_id: Optional[str] = None,
    user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Move a session to a different project.

    Args:
        session_id: Session ID
        project_id: Target project ID (null to remove from project)

    Returns:
        Status message
    """
    from ..db.repository import ProjectRepository

    repo = ProjectRepository(db)
    moved = await repo.move_session(session_id, project_id, user.id)

    if not moved:
        raise HTTPException(
            status_code=404,
            detail="Session or project not found, or doesn't belong to you"
        )

    return {
        "status": "moved",
        "session_id": session_id,
        "project_id": project_id,
    }


# ============ Credit endpoints ============

@router.get("/credits/balance")
async def get_credit_balance(
    user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Get current user's credit balance.

    Returns balance, lifetime usage, and tier information.
    New users automatically receive 20 free credits.

    Returns:
        Credit balance information
    """
    from ..db.repository import CreditRepository

    repo = CreditRepository(db)
    balance = await repo.get_or_create_balance(user.id)

    return {
        "user_id": user.id,
        "balance": balance.balance,
        "lifetime_used": balance.lifetime_used,
        "tier": balance.tier,
        "tier_credits": balance.tier_credits,
        "last_grant_at": balance.last_grant_at.isoformat() if balance.last_grant_at else None,
    }


@router.get("/credits/history")
async def get_credit_history(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    transaction_type: Optional[str] = None,
    user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Get user's credit transaction history.

    Args:
        limit: Maximum transactions to return (1-100)
        offset: Number of transactions to skip
        transaction_type: Filter by type (usage, initial_grant, etc.)

    Returns:
        List of credit transactions
    """
    from ..db.repository import CreditRepository

    repo = CreditRepository(db)
    transactions = await repo.get_transactions(
        user.id,
        limit=limit,
        offset=offset,
        transaction_type=transaction_type,
    )

    return {
        "transactions": [
            {
                "id": t.id,
                "amount": t.amount,
                "type": t.type,
                "description": t.description,
                "session_id": t.session_id,
                "balance_after": t.balance_after,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            }
            for t in transactions
        ],
        "limit": limit,
        "offset": offset,
    }


class CreditEstimateRequest(BaseModel):
    """Request body for credit estimation."""
    agents: list[dict]
    max_rounds: int
    document_words: int = 0


@router.post("/credits/estimate")
@limiter.limit("30/minute")
async def estimate_session_credits(
    request: Request,
    body: CreditEstimateRequest,
    user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Estimate credits needed for a session before starting.

    This provides a conservative estimate assuming all rounds complete.

    Args:
        request: Session configuration for estimation

    Returns:
        Estimated credits and whether user has sufficient balance
    """
    from ..db.repository import CreditRepository
    from ..core.credits import estimate_session_credits as calc_estimate

    # Calculate estimate
    estimated = calc_estimate(
        agents=body.agents,
        max_rounds=body.max_rounds,
        document_words=body.document_words,
    )

    # Get current balance
    repo = CreditRepository(db)
    balance = await repo.get_or_create_balance(user.id)

    # Calculate per-agent breakdown
    agent_breakdown = []
    for agent in body.agents:
        model = agent.get("model", "claude-sonnet-4-5-20250929")
        from ..core.credits import get_model_multiplier
        multiplier = get_model_multiplier(model)
        agent_breakdown.append({
            "agent_id": agent.get("agent_id", "unknown"),
            "model": model,
            "multiplier": multiplier,
        })

    return {
        "estimated_credits": estimated,
        "current_balance": balance.balance,
        "has_sufficient_credits": balance.balance >= estimated,
        "agents": agent_breakdown,
    }


# ============ Feedback endpoint ============

class FeedbackRequest(BaseModel):
    """Request body for feedback submission."""
    category: str  # bug, feature, question, other, contact
    message: str
    email: Optional[str] = None


@router.post("/feedback")
@limiter.limit("10/minute")
async def submit_feedback(
    request: Request,
    body: FeedbackRequest,
    user: Optional[UserModel] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Submit user feedback via email.

    This endpoint accepts feedback from both authenticated and anonymous users.
    Feedback is sent directly to the admin email.

    Args:
        body: Feedback request with category, message, and optional email

    Returns:
        Status message
    """
    from ..core.email import send_email

    # Build email content
    user_info = ""
    if user:
        user_info = f"User: {user.email} (ID: {user.id})"
    elif body.email:
        user_info = f"Anonymous user provided email: {body.email}"
    else:
        user_info = "Anonymous user (no email provided)"

    category_labels = {
        "bug": "Bug Report",
        "feature": "Feature Request",
        "question": "Question",
        "contact": "Contact Form",
        "other": "General Feedback",
    }
    category_label = category_labels.get(body.category, body.category.title())

    subject = f"[Atelier Feedback] {category_label}"

    html_body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px;">
        <div style="background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white; padding: 20px; border-radius: 12px 12px 0 0;">
            <h2 style="margin: 0;">{category_label}</h2>
        </div>
        <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="color: #6b7280; font-size: 14px; margin-bottom: 16px;">
                {user_info}
            </p>
            <div style="background: white; padding: 16px; border-radius: 8px; border: 1px solid #e5e7eb;">
                <p style="white-space: pre-wrap; margin: 0; color: #374151; line-height: 1.6;">
{body.message}
                </p>
            </div>
        </div>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 16px;">
            Sent from Atelier feedback system
        </p>
    </body>
    </html>
    """

    try:
        await send_email(
            to_email="info@atelierwritereditor.com",
            subject=subject,
            html_body=html_body,
        )
        logger.info(f"Feedback submitted: {body.category} from {user_info}")
        return {"status": "sent", "message": "Thank you for your feedback!"}
    except Exception as e:
        logger.error(f"Failed to send feedback email: {e}")
        raise HTTPException(status_code=500, detail="Failed to send feedback. Please try again later.")
