"""Repository pattern for database operations."""

import logging
from datetime import datetime, timezone as tz
from typing import Optional
from uuid import uuid4

from sqlalchemy import select, update, delete, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from .models import (
    SessionModel,
    ExchangeTurnModel,
    DocumentVersionModel,
    UserModel,
    UserProfileModel,
    ProjectModel,
    ProjectFileModel,
    CreditBalanceModel,
    CreditTransactionModel,
    SubscriptionModel,
)
from ..models.session import SessionConfig, SessionState, TerminationCondition, OrchestrationFlow
from ..models.agent import AgentConfig
from ..models.exchange import ExchangeTurn, Evaluation, CriterionScore

logger = logging.getLogger(__name__)


class SessionRepository:
    """
    Repository for session database operations.

    Provides a clean interface between the application and database,
    handling conversion between Pydantic models and SQLAlchemy models.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    # ============ Session CRUD ============

    async def create(self, config: SessionConfig, user_id: Optional[str] = None) -> SessionModel:
        """
        Create a new session from configuration.

        Args:
            config: Session configuration (Pydantic model)
            user_id: Optional user ID (required after auth is implemented)

        Returns:
            Created SessionModel
        """
        session = SessionModel(
            id=config.session_id,
            user_id=user_id,
            project_id=config.project_id,
            title=config.title,
            status="draft",
            initial_prompt=config.initial_prompt,
            working_document=config.working_document,
            reference_documents=config.reference_documents,
            reference_instructions=config.reference_instructions,
            agent_config=[a.model_dump() for a in config.agents],
            termination_config=config.termination.model_dump(),
            current_round=0,
        )

        self.db.add(session)
        await self.db.commit()
        await self.db.refresh(session)

        logger.info(f"Created session {session.id}")
        return session

    async def get(self, session_id: str) -> Optional[SessionModel]:
        """
        Get a session by ID.

        Args:
            session_id: Session UUID string

        Returns:
            SessionModel or None if not found
        """
        result = await self.db.execute(
            select(SessionModel)
            .where(SessionModel.id == session_id)
            .options(
                selectinload(SessionModel.exchange_turns),
                selectinload(SessionModel.document_versions),
            )
        )
        return result.scalar_one_or_none()

    async def get_for_user(self, session_id: str, user_id: str) -> Optional[SessionModel]:
        """
        Get a session by ID, ensuring it belongs to the user.

        Args:
            session_id: Session UUID string
            user_id: User UUID string

        Returns:
            SessionModel or None if not found or doesn't belong to user
        """
        result = await self.db.execute(
            select(SessionModel)
            .where(SessionModel.id == session_id, SessionModel.user_id == user_id)
            .options(
                selectinload(SessionModel.exchange_turns),
                selectinload(SessionModel.document_versions),
            )
        )
        return result.scalar_one_or_none()

    async def list_all(self, limit: int = 100, offset: int = 0) -> list[SessionModel]:
        """
        List all sessions (admin use).

        Args:
            limit: Maximum number of sessions to return
            offset: Number of sessions to skip

        Returns:
            List of SessionModel
        """
        result = await self.db.execute(
            select(SessionModel)
            .order_by(SessionModel.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all())

    async def list_for_user(
        self,
        user_id: str,
        limit: int = 100,
        offset: int = 0,
        status: Optional[str] = None,
    ) -> list[SessionModel]:
        """
        List sessions for a specific user.

        Args:
            user_id: User UUID string
            limit: Maximum number of sessions to return
            offset: Number of sessions to skip
            status: Optional status filter

        Returns:
            List of SessionModel
        """
        from sqlalchemy.orm import selectinload

        query = select(SessionModel).where(SessionModel.user_id == user_id)

        if status:
            query = query.where(SessionModel.status == status)

        # Eagerly load exchange_turns to avoid lazy load issues in async context
        query = query.options(selectinload(SessionModel.exchange_turns))
        query = query.order_by(SessionModel.created_at.desc()).limit(limit).offset(offset)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def update_status(
        self,
        session_id: str,
        status: str,
        termination_reason: Optional[str] = None,
    ) -> Optional[SessionModel]:
        """
        Update session status.

        Args:
            session_id: Session UUID string
            status: New status (draft, running, paused, completed, failed)
            termination_reason: Optional reason for termination

        Returns:
            Updated SessionModel or None if not found
        """
        values = {
            "status": status,
            "updated_at": datetime.now(tz.utc),
        }

        if termination_reason:
            values["termination_reason"] = termination_reason

        if status == "completed":
            values["completed_at"] = datetime.now(tz.utc)

        await self.db.execute(
            update(SessionModel)
            .where(SessionModel.id == session_id)
            .values(**values)
        )
        await self.db.commit()

        return await self.get(session_id)

    async def update_round(self, session_id: str, round_number: int) -> None:
        """
        Update the current round number.

        Args:
            session_id: Session UUID string
            round_number: New round number
        """
        await self.db.execute(
            update(SessionModel)
            .where(SessionModel.id == session_id)
            .values(current_round=round_number, updated_at=datetime.now(tz.utc))
        )
        await self.db.commit()

    async def update_working_document(self, session_id: str, document: str) -> None:
        """
        Update the working document.

        Args:
            session_id: Session UUID string
            document: New document content
        """
        await self.db.execute(
            update(SessionModel)
            .where(SessionModel.id == session_id)
            .values(working_document=document, updated_at=datetime.now(tz.utc))
        )
        await self.db.commit()

    async def delete(self, session_id: str) -> bool:
        """
        Delete a session and all related data.

        Args:
            session_id: Session UUID string

        Returns:
            True if deleted, False if not found
        """
        result = await self.db.execute(
            delete(SessionModel).where(SessionModel.id == session_id)
        )
        await self.db.commit()
        return result.rowcount > 0

    # ============ Exchange Turns ============

    async def add_exchange_turn(
        self,
        session_id: str,
        turn: ExchangeTurn,
        phase: int = 2,
        tokens_input: Optional[int] = None,
        tokens_output: Optional[int] = None,
        credits_used: Optional[int] = None,
    ) -> ExchangeTurnModel:
        """
        Add an exchange turn to a session.

        Args:
            session_id: Session UUID string
            turn: ExchangeTurn Pydantic model
            phase: Phase number (1=Writer, 2=Editor, 3=Synthesizer)
            tokens_input: Optional input token count
            tokens_output: Optional output token count
            credits_used: Optional credits consumed for this turn

        Returns:
            Created ExchangeTurnModel
        """
        db_turn = ExchangeTurnModel(
            id=str(uuid4()),
            session_id=session_id,
            turn_number=turn.turn_number,
            round_number=turn.round_number,
            phase=phase,
            agent_id=turn.agent_id,
            agent_name=turn.agent_name,
            output=turn.output,
            raw_response=turn.raw_response,
            working_document=turn.working_document,
            evaluation=turn.evaluation.model_dump() if turn.evaluation else None,
            parse_error=turn.parse_error,
            tokens_input=tokens_input,
            tokens_output=tokens_output,
            credits_used=credits_used,
            completed_at=turn.timestamp,
        )

        self.db.add(db_turn)
        await self.db.commit()
        await self.db.refresh(db_turn)

        return db_turn

    async def get_exchange_turns(
        self,
        session_id: str,
        round_number: Optional[int] = None,
    ) -> list[ExchangeTurnModel]:
        """
        Get exchange turns for a session.

        Args:
            session_id: Session UUID string
            round_number: Optional round filter

        Returns:
            List of ExchangeTurnModel
        """
        query = select(ExchangeTurnModel).where(ExchangeTurnModel.session_id == session_id)

        if round_number is not None:
            query = query.where(ExchangeTurnModel.round_number == round_number)

        query = query.order_by(ExchangeTurnModel.turn_number)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    # ============ Document Versions ============

    async def add_document_version(
        self,
        session_id: str,
        content: str,
        created_by: str,
        turn_id: Optional[str] = None,
    ) -> DocumentVersionModel:
        """
        Add a new document version.

        Args:
            session_id: Session UUID string
            content: Document content
            created_by: Agent ID or 'user'
            turn_id: Optional reference to the exchange turn

        Returns:
            Created DocumentVersionModel
        """
        # Get next version number
        result = await self.db.execute(
            select(DocumentVersionModel.version_number)
            .where(DocumentVersionModel.session_id == session_id)
            .order_by(DocumentVersionModel.version_number.desc())
            .limit(1)
        )
        last_version = result.scalar_one_or_none()
        next_version = (last_version or 0) + 1

        # Calculate word count
        word_count = len(content.split()) if content else 0

        version = DocumentVersionModel(
            id=str(uuid4()),
            session_id=session_id,
            version_number=next_version,
            content=content,
            word_count=word_count,
            created_by=created_by,
            turn_id=turn_id,
        )

        self.db.add(version)
        await self.db.commit()
        await self.db.refresh(version)

        return version

    async def get_document_versions(self, session_id: str) -> list[DocumentVersionModel]:
        """
        Get all document versions for a session.

        Args:
            session_id: Session UUID string

        Returns:
            List of DocumentVersionModel ordered by version number
        """
        result = await self.db.execute(
            select(DocumentVersionModel)
            .where(DocumentVersionModel.session_id == session_id)
            .order_by(DocumentVersionModel.version_number)
        )
        return list(result.scalars().all())

    async def get_latest_document_version(
        self,
        session_id: str,
    ) -> Optional[DocumentVersionModel]:
        """
        Get the latest document version for a session.

        Args:
            session_id: Session UUID string

        Returns:
            Latest DocumentVersionModel or None
        """
        result = await self.db.execute(
            select(DocumentVersionModel)
            .where(DocumentVersionModel.session_id == session_id)
            .order_by(DocumentVersionModel.version_number.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    # ============ Conversion Helpers ============

    def to_session_state(self, session: SessionModel) -> SessionState:
        """
        Convert a database SessionModel to a SessionState Pydantic model.

        Args:
            session: SessionModel from database

        Returns:
            SessionState Pydantic model
        """
        # Reconstruct agent configs
        agents = [AgentConfig(**a) for a in session.agent_config]

        # Reconstruct termination config
        termination = TerminationCondition(**session.termination_config)

        # Reconstruct session config
        config = SessionConfig(
            session_id=session.id,
            title=session.title,
            agents=agents,
            flow_type=OrchestrationFlow.SEQUENTIAL,  # Only sequential for now
            termination=termination,
            initial_prompt=session.initial_prompt,
            working_document=session.working_document or "",
            reference_documents=session.reference_documents or {},
            reference_instructions=session.reference_instructions or "",
        )

        # Reconstruct exchange history
        exchange_history = []
        for turn in session.exchange_turns:
            evaluation = None
            if turn.evaluation:
                criteria_scores = [
                    CriterionScore(**cs) for cs in turn.evaluation.get("criteria_scores", [])
                ]
                evaluation = Evaluation(
                    criteria_scores=criteria_scores,
                    overall_score=turn.evaluation.get("overall_score", 5.0),
                    summary=turn.evaluation.get("summary", ""),
                )

            exchange_history.append(
                ExchangeTurn(
                    turn_number=turn.turn_number,
                    round_number=turn.round_number,
                    agent_id=turn.agent_id,
                    agent_name=turn.agent_name,
                    timestamp=turn.completed_at or turn.created_at,
                    output=turn.output,
                    raw_response=turn.raw_response or turn.output,
                    evaluation=evaluation,
                    parse_error=turn.parse_error,
                    working_document=turn.working_document or "",
                )
            )

        # Determine runtime state from status
        is_running = session.status == "running"
        is_paused = session.status == "paused"
        is_cancelled = session.status == "failed" and session.termination_reason == "Stopped by user"

        return SessionState(
            config=config,
            exchange_history=exchange_history,
            current_round=session.current_round,
            is_running=is_running,
            is_paused=is_paused,
            is_cancelled=is_cancelled,
            termination_reason=session.termination_reason,
        )


class UserProfileRepository:
    """
    Repository for user profile database operations.

    Handles user profile CRUD and preferences management.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    # ============ Profile CRUD ============

    async def get_profile(self, user_id: str) -> Optional[UserProfileModel]:
        """
        Get a user's profile.

        Args:
            user_id: User ID string

        Returns:
            UserProfileModel or None if not found
        """
        result = await self.db.execute(
            select(UserProfileModel).where(UserProfileModel.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def get_or_create_profile(self, user_id: str) -> UserProfileModel:
        """
        Get a user's profile, creating one if it doesn't exist.

        Args:
            user_id: User ID string

        Returns:
            UserProfileModel
        """
        profile = await self.get_profile(user_id)
        if profile:
            return profile

        # Create new profile with defaults
        profile = UserProfileModel(
            user_id=user_id,
            timezone="UTC",
            preferences={},
        )
        self.db.add(profile)
        await self.db.commit()
        await self.db.refresh(profile)

        logger.info(f"Created profile for user {user_id}")
        return profile

    async def update_profile(
        self,
        user_id: str,
        new_timezone: Optional[str] = None,
    ) -> Optional[UserProfileModel]:
        """
        Update a user's profile settings.

        Args:
            user_id: User ID string
            new_timezone: Optional new timezone

        Returns:
            Updated UserProfileModel or None if not found
        """
        profile = await self.get_or_create_profile(user_id)

        if new_timezone is not None:
            profile.timezone = new_timezone

        profile.updated_at = datetime.now(tz.utc)
        await self.db.commit()
        await self.db.refresh(profile)

        return profile

    async def update_preferences(
        self,
        user_id: str,
        preferences: dict,
    ) -> Optional[UserProfileModel]:
        """
        Update a user's preferences (merge with existing).

        Args:
            user_id: User ID string
            preferences: Dict of preferences to update

        Returns:
            Updated UserProfileModel or None if not found
        """
        profile = await self.get_or_create_profile(user_id)

        # Merge preferences
        current_prefs = profile.preferences or {}
        current_prefs.update(preferences)
        profile.preferences = current_prefs

        profile.updated_at = datetime.now(tz.utc)
        await self.db.commit()
        await self.db.refresh(profile)

        return profile

    async def delete_profile(self, user_id: str) -> bool:
        """
        Delete a user's profile.

        Args:
            user_id: User ID string

        Returns:
            True if deleted, False if not found
        """
        result = await self.db.execute(
            delete(UserProfileModel).where(UserProfileModel.user_id == user_id)
        )
        await self.db.commit()
        return result.rowcount > 0

    # ============ User Management ============

    async def get_user(self, user_id: str) -> Optional[UserModel]:
        """
        Get a user by ID.

        Args:
            user_id: User ID string

        Returns:
            UserModel or None if not found
        """
        result = await self.db.execute(
            select(UserModel)
            .where(UserModel.id == user_id)
            .options(selectinload(UserModel.profile))
        )
        return result.scalar_one_or_none()

    async def update_user(
        self,
        user_id: str,
        display_name: Optional[str] = None,
    ) -> Optional[UserModel]:
        """
        Update user information.

        Args:
            user_id: User ID string
            display_name: Optional new display name

        Returns:
            Updated UserModel or None if not found
        """
        values = {"updated_at": datetime.now(tz.utc)}

        if display_name is not None:
            values["display_name"] = display_name

        await self.db.execute(
            update(UserModel)
            .where(UserModel.id == user_id)
            .values(**values)
        )
        await self.db.commit()

        return await self.get_user(user_id)

    async def delete_user_and_data(self, user_id: str) -> bool:
        """
        Delete a user and all associated data (GDPR compliance).

        This cascades to delete:
        - User profile
        - All sessions (which cascades to exchange turns and document versions)

        Args:
            user_id: User ID string

        Returns:
            True if deleted, False if not found
        """
        # Delete user (cascades to profile and sessions due to ON DELETE CASCADE)
        result = await self.db.execute(
            delete(UserModel).where(UserModel.id == user_id)
        )
        await self.db.commit()

        deleted = result.rowcount > 0
        if deleted:
            logger.info(f"Deleted user {user_id} and all associated data")

        return deleted

    async def export_user_data(self, user_id: str) -> dict:
        """
        Export all user data for GDPR compliance.

        Args:
            user_id: User ID string

        Returns:
            Dict containing all user data
        """
        # Get user with profile
        user = await self.get_user(user_id)
        if not user:
            return {}

        # Get all sessions
        sessions_result = await self.db.execute(
            select(SessionModel)
            .where(SessionModel.user_id == user_id)
            .options(
                selectinload(SessionModel.exchange_turns),
                selectinload(SessionModel.document_versions),
            )
        )
        sessions = list(sessions_result.scalars().all())

        # Build export
        export = {
            "user": {
                "id": user.id,
                "email": user.email,
                "display_name": user.display_name,
                "created_at": user.created_at.isoformat() if user.created_at else None,
                "updated_at": user.updated_at.isoformat() if user.updated_at else None,
            },
            "profile": None,
            "sessions": [],
            "exchange_turns": [],
            "document_versions": [],
            "exported_at": datetime.now(tz.utc).isoformat(),
        }

        # Add profile
        if user.profile:
            export["profile"] = {
                "id": user.profile.id,
                "timezone": user.profile.timezone,
                "preferences": user.profile.preferences,
                "created_at": user.profile.created_at.isoformat() if user.profile.created_at else None,
                "updated_at": user.profile.updated_at.isoformat() if user.profile.updated_at else None,
            }

        # Add sessions and related data
        for session in sessions:
            export["sessions"].append({
                "id": session.id,
                "title": session.title,
                "status": session.status,
                "initial_prompt": session.initial_prompt,
                "working_document": session.working_document,
                "reference_documents": session.reference_documents,
                "reference_instructions": session.reference_instructions,
                "agent_config": session.agent_config,
                "termination_config": session.termination_config,
                "current_round": session.current_round,
                "termination_reason": session.termination_reason,
                "created_at": session.created_at.isoformat() if session.created_at else None,
                "completed_at": session.completed_at.isoformat() if session.completed_at else None,
            })

            for turn in session.exchange_turns:
                export["exchange_turns"].append({
                    "id": turn.id,
                    "session_id": turn.session_id,
                    "turn_number": turn.turn_number,
                    "round_number": turn.round_number,
                    "phase": turn.phase,
                    "agent_id": turn.agent_id,
                    "agent_name": turn.agent_name,
                    "output": turn.output,
                    "evaluation": turn.evaluation,
                    "tokens_input": turn.tokens_input,
                    "tokens_output": turn.tokens_output,
                    "created_at": turn.created_at.isoformat() if turn.created_at else None,
                })

            for version in session.document_versions:
                export["document_versions"].append({
                    "id": version.id,
                    "session_id": version.session_id,
                    "version_number": version.version_number,
                    "content": version.content,
                    "word_count": version.word_count,
                    "created_by": version.created_by,
                    "created_at": version.created_at.isoformat() if version.created_at else None,
                })

        return export


class ProjectRepository:
    """
    Repository for project database operations.

    Handles project CRUD and session organization.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    # ============ Project CRUD ============

    async def create(
        self,
        user_id: str,
        name: str,
        description: Optional[str] = None,
        instructions: Optional[str] = None,
        default_agent_config: Optional[list] = None,
    ) -> ProjectModel:
        """
        Create a new project.

        Args:
            user_id: User ID string
            name: Project name
            description: Optional project description
            instructions: Optional project-level instructions (like Claude's Memory)
            default_agent_config: Optional default agent configuration

        Returns:
            Created ProjectModel
        """
        project = ProjectModel(
            user_id=user_id,
            name=name,
            description=description,
            instructions=instructions,
            default_agent_config=default_agent_config,
        )
        self.db.add(project)
        await self.db.commit()
        await self.db.refresh(project)

        logger.info(f"Created project {project.id} for user {user_id}")
        return project

    async def get(self, project_id: str) -> Optional[ProjectModel]:
        """
        Get a project by ID.

        Args:
            project_id: Project ID string

        Returns:
            ProjectModel or None if not found
        """
        result = await self.db.execute(
            select(ProjectModel)
            .where(ProjectModel.id == project_id)
            .options(selectinload(ProjectModel.sessions))
        )
        return result.scalar_one_or_none()

    async def get_for_user(self, project_id: str, user_id: str) -> Optional[ProjectModel]:
        """
        Get a project by ID, ensuring it belongs to the user.

        Args:
            project_id: Project ID string
            user_id: User ID string

        Returns:
            ProjectModel or None if not found or doesn't belong to user
        """
        result = await self.db.execute(
            select(ProjectModel)
            .where(ProjectModel.id == project_id, ProjectModel.user_id == user_id)
            .options(selectinload(ProjectModel.sessions))
        )
        return result.scalar_one_or_none()

    async def list_for_user(
        self,
        user_id: str,
        include_archived: bool = False,
    ) -> list[ProjectModel]:
        """
        List all projects for a user.

        Args:
            user_id: User ID string
            include_archived: Whether to include archived projects

        Returns:
            List of ProjectModel
        """
        query = select(ProjectModel).where(ProjectModel.user_id == user_id)

        if not include_archived:
            query = query.where(ProjectModel.archived_at.is_(None))

        query = query.order_by(ProjectModel.created_at.desc())

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def update(
        self,
        project_id: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
        instructions: Optional[str] = None,
        default_agent_config: Optional[list] = None,
    ) -> Optional[ProjectModel]:
        """
        Update a project.

        Args:
            project_id: Project ID string
            name: Optional new name
            description: Optional new description
            instructions: Optional new instructions
            default_agent_config: Optional new default agent config

        Returns:
            Updated ProjectModel or None if not found
        """
        values = {"updated_at": datetime.now(tz.utc)}

        if name is not None:
            values["name"] = name
        if description is not None:
            values["description"] = description
        if instructions is not None:
            values["instructions"] = instructions
        if default_agent_config is not None:
            values["default_agent_config"] = default_agent_config

        await self.db.execute(
            update(ProjectModel)
            .where(ProjectModel.id == project_id)
            .values(**values)
        )
        await self.db.commit()

        return await self.get(project_id)

    async def archive(self, project_id: str) -> Optional[ProjectModel]:
        """
        Archive a project (soft delete).

        Args:
            project_id: Project ID string

        Returns:
            Archived ProjectModel or None if not found
        """
        await self.db.execute(
            update(ProjectModel)
            .where(ProjectModel.id == project_id)
            .values(archived_at=datetime.now(tz.utc), updated_at=datetime.now(tz.utc))
        )
        await self.db.commit()

        return await self.get(project_id)

    async def unarchive(self, project_id: str) -> Optional[ProjectModel]:
        """
        Unarchive a project.

        Args:
            project_id: Project ID string

        Returns:
            Unarchived ProjectModel or None if not found
        """
        await self.db.execute(
            update(ProjectModel)
            .where(ProjectModel.id == project_id)
            .values(archived_at=None, updated_at=datetime.now(tz.utc))
        )
        await self.db.commit()

        return await self.get(project_id)

    async def delete(self, project_id: str) -> bool:
        """
        Permanently delete a project.

        Note: Sessions in this project will have their project_id set to NULL
        due to ON DELETE SET NULL.

        Args:
            project_id: Project ID string

        Returns:
            True if deleted, False if not found
        """
        result = await self.db.execute(
            delete(ProjectModel).where(ProjectModel.id == project_id)
        )
        await self.db.commit()
        return result.rowcount > 0

    async def get_session_count(self, project_id: str) -> int:
        """
        Get the number of sessions in a project.

        Args:
            project_id: Project ID string

        Returns:
            Number of sessions
        """
        result = await self.db.execute(
            select(func.count(SessionModel.id))
            .where(SessionModel.project_id == project_id)
        )
        return result.scalar() or 0

    # ============ Session-Project Association ============

    async def move_session(
        self,
        session_id: str,
        project_id: Optional[str],
        user_id: str,
    ) -> bool:
        """
        Move a session to a different project.

        Args:
            session_id: Session ID string
            project_id: Target project ID (None to remove from project)
            user_id: User ID for ownership verification

        Returns:
            True if moved, False if session not found or doesn't belong to user
        """
        # Verify session belongs to user
        session_result = await self.db.execute(
            select(SessionModel)
            .where(SessionModel.id == session_id, SessionModel.user_id == user_id)
        )
        session = session_result.scalar_one_or_none()
        if not session:
            return False

        # If project_id provided, verify it belongs to user
        if project_id:
            project = await self.get_for_user(project_id, user_id)
            if not project:
                return False

        # Update session's project_id
        await self.db.execute(
            update(SessionModel)
            .where(SessionModel.id == session_id)
            .values(project_id=project_id, updated_at=datetime.now(tz.utc))
        )
        await self.db.commit()

        return True

    async def get_sessions_in_project(
        self,
        project_id: str,
        user_id: str,
    ) -> list[SessionModel]:
        """
        Get all sessions in a project.

        Args:
            project_id: Project ID string
            user_id: User ID for ownership verification

        Returns:
            List of SessionModel
        """
        result = await self.db.execute(
            select(SessionModel)
            .where(
                SessionModel.project_id == project_id,
                SessionModel.user_id == user_id,
            )
            .order_by(SessionModel.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_file_count(self, project_id: str) -> int:
        """
        Get the number of files in a project.

        Args:
            project_id: Project ID string

        Returns:
            Number of files
        """
        result = await self.db.execute(
            select(func.count(ProjectFileModel.id))
            .where(ProjectFileModel.project_id == project_id)
        )
        return result.scalar() or 0


class ProjectFileRepository:
    """
    Repository for project file database operations.

    Handles project file CRUD and content management.
    Files store extracted text content only (no binary storage).
    """

    # Storage limits
    MAX_FILES_PER_PROJECT = 20
    MAX_PROJECT_TOTAL_CHARS = 1000000  # ~250K words
    MAX_PROJECT_CONTEXT_CHARS = 500000  # ~125K tokens for session context

    def __init__(self, db: AsyncSession):
        self.db = db

    # ============ File CRUD ============

    async def create(
        self,
        project_id: str,
        filename: str,
        content: str,
        original_file_type: str,
        description: Optional[str] = None,
    ) -> ProjectFileModel:
        """
        Create a new project file.

        Args:
            project_id: Project ID string
            filename: Original filename
            content: Extracted text content
            original_file_type: File type (pdf, docx, txt, md)
            description: Optional file description

        Returns:
            Created ProjectFileModel
        """
        # Calculate word and char counts
        char_count = len(content) if content else 0
        word_count = len(content.split()) if content else 0

        file = ProjectFileModel(
            project_id=project_id,
            filename=filename,
            content=content,
            original_file_type=original_file_type,
            description=description,
            char_count=char_count,
            word_count=word_count,
        )
        self.db.add(file)
        await self.db.commit()
        await self.db.refresh(file)

        logger.info(f"Created project file {file.id} for project {project_id}")
        return file

    async def get(self, file_id: str) -> Optional[ProjectFileModel]:
        """
        Get a project file by ID.

        Args:
            file_id: File ID string

        Returns:
            ProjectFileModel or None if not found
        """
        result = await self.db.execute(
            select(ProjectFileModel).where(ProjectFileModel.id == file_id)
        )
        return result.scalar_one_or_none()

    async def get_for_project(
        self,
        file_id: str,
        project_id: str,
    ) -> Optional[ProjectFileModel]:
        """
        Get a file by ID, ensuring it belongs to the specified project.

        Args:
            file_id: File ID string
            project_id: Project ID string

        Returns:
            ProjectFileModel or None if not found or doesn't belong to project
        """
        result = await self.db.execute(
            select(ProjectFileModel)
            .where(
                ProjectFileModel.id == file_id,
                ProjectFileModel.project_id == project_id,
            )
        )
        return result.scalar_one_or_none()

    async def list_for_project(self, project_id: str) -> list[ProjectFileModel]:
        """
        List all files in a project (metadata only, no content loaded).

        Args:
            project_id: Project ID string

        Returns:
            List of ProjectFileModel (without content for efficiency)
        """
        result = await self.db.execute(
            select(ProjectFileModel)
            .where(ProjectFileModel.project_id == project_id)
            .order_by(ProjectFileModel.created_at.desc())
        )
        return list(result.scalars().all())

    async def update(
        self,
        file_id: str,
        filename: Optional[str] = None,
        description: Optional[str] = None,
    ) -> Optional[ProjectFileModel]:
        """
        Update a project file's metadata.

        Args:
            file_id: File ID string
            filename: Optional new filename
            description: Optional new description

        Returns:
            Updated ProjectFileModel or None if not found
        """
        values = {"updated_at": datetime.now(tz.utc)}

        if filename is not None:
            values["filename"] = filename
        if description is not None:
            values["description"] = description

        await self.db.execute(
            update(ProjectFileModel)
            .where(ProjectFileModel.id == file_id)
            .values(**values)
        )
        await self.db.commit()

        return await self.get(file_id)

    async def delete(self, file_id: str) -> bool:
        """
        Delete a project file.

        Args:
            file_id: File ID string

        Returns:
            True if deleted, False if not found
        """
        result = await self.db.execute(
            delete(ProjectFileModel).where(ProjectFileModel.id == file_id)
        )
        await self.db.commit()
        return result.rowcount > 0

    # ============ Storage Management ============

    async def get_file_count(self, project_id: str) -> int:
        """
        Get the number of files in a project.

        Args:
            project_id: Project ID string

        Returns:
            Number of files
        """
        result = await self.db.execute(
            select(func.count(ProjectFileModel.id))
            .where(ProjectFileModel.project_id == project_id)
        )
        return result.scalar() or 0

    async def get_total_chars(self, project_id: str) -> int:
        """
        Get total character count for all files in a project.

        Args:
            project_id: Project ID string

        Returns:
            Total character count
        """
        result = await self.db.execute(
            select(func.coalesce(func.sum(ProjectFileModel.char_count), 0))
            .where(ProjectFileModel.project_id == project_id)
        )
        return result.scalar() or 0

    async def check_storage_limits(
        self,
        project_id: str,
        new_content_chars: int = 0,
    ) -> dict:
        """
        Check if project storage limits are exceeded.

        Args:
            project_id: Project ID string
            new_content_chars: Characters in new content to add

        Returns:
            Dict with limit status and usage info
        """
        file_count = await self.get_file_count(project_id)
        total_chars = await self.get_total_chars(project_id)

        return {
            "file_count": file_count,
            "total_chars": total_chars,
            "max_files": self.MAX_FILES_PER_PROJECT,
            "max_chars": self.MAX_PROJECT_TOTAL_CHARS,
            "can_add_file": file_count < self.MAX_FILES_PER_PROJECT,
            "can_add_content": (total_chars + new_content_chars) <= self.MAX_PROJECT_TOTAL_CHARS,
            "usage_percent": round((total_chars / self.MAX_PROJECT_TOTAL_CHARS) * 100, 1),
        }

    # ============ Content Retrieval ============

    async def get_all_content_for_project(self, project_id: str) -> dict[str, str]:
        """
        Get all file content for a project as a dictionary.

        Used when creating a new session to merge project files
        into the session's reference_documents.

        Args:
            project_id: Project ID string

        Returns:
            Dict mapping "[Project] filename" to content
        """
        result = await self.db.execute(
            select(ProjectFileModel.filename, ProjectFileModel.content)
            .where(ProjectFileModel.project_id == project_id)
        )

        # Prefix with "[Project] " to distinguish from session files
        return {
            f"[Project] {row.filename}": row.content
            for row in result
        }

    async def get_total_content_size(self, project_id: str) -> int:
        """
        Get total size of all file content for context size checking.

        Args:
            project_id: Project ID string

        Returns:
            Total character count of all content
        """
        return await self.get_total_chars(project_id)


class CreditRepository:
    """
    Repository for credit database operations.

    Handles credit balance tracking, transactions, and usage metering.
    """

    # Default credits for new users
    DEFAULT_INITIAL_CREDITS = 20

    def __init__(self, db: AsyncSession):
        self.db = db

    # ============ Balance Operations ============

    async def get_balance(self, user_id: str) -> Optional[CreditBalanceModel]:
        """
        Get a user's credit balance.

        Args:
            user_id: User ID string

        Returns:
            CreditBalanceModel or None if not found
        """
        result = await self.db.execute(
            select(CreditBalanceModel).where(CreditBalanceModel.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def get_balance_for_update(self, user_id: str) -> Optional[CreditBalanceModel]:
        """
        Get a user's credit balance with a row-level lock for atomic updates.

        Uses SELECT ... FOR UPDATE to prevent race conditions during
        concurrent credit operations.

        Args:
            user_id: User ID string

        Returns:
            CreditBalanceModel or None if not found
        """
        result = await self.db.execute(
            select(CreditBalanceModel)
            .where(CreditBalanceModel.user_id == user_id)
            .with_for_update()
        )
        return result.scalar_one_or_none()

    async def is_stripe_session_processed(self, stripe_session_id: str) -> bool:
        """
        Check if a Stripe checkout session has already been processed.

        Used to prevent duplicate credit grants from webhook retries.

        Args:
            stripe_session_id: Stripe checkout session ID

        Returns:
            True if already processed, False otherwise
        """
        result = await self.db.execute(
            select(CreditTransactionModel)
            .where(CreditTransactionModel.stripe_checkout_session_id == stripe_session_id)
        )
        return result.scalar_one_or_none() is not None

    async def get_or_create_balance(
        self,
        user_id: str,
        initial_credits: Optional[int] = None,
    ) -> CreditBalanceModel:
        """
        Get a user's balance, creating one with initial credits if it doesn't exist.

        Args:
            user_id: User ID string
            initial_credits: Initial credit grant (defaults to DEFAULT_INITIAL_CREDITS)

        Returns:
            CreditBalanceModel
        """
        balance = await self.get_balance(user_id)
        if balance:
            return balance

        # Create new balance with initial grant
        credits = initial_credits if initial_credits is not None else self.DEFAULT_INITIAL_CREDITS
        balance = CreditBalanceModel(
            user_id=user_id,
            balance=credits,
            lifetime_used=0,
            last_grant_at=datetime.now(tz.utc),
        )
        self.db.add(balance)

        # Also record the initial grant transaction
        if credits > 0:
            transaction = CreditTransactionModel(
                user_id=user_id,
                amount=credits,
                type="initial_grant",
                description="Welcome credits for new user",
                balance_after=credits,
            )
            self.db.add(transaction)

        await self.db.commit()
        await self.db.refresh(balance)

        logger.info(f"Created credit balance for user {user_id} with {credits} credits")
        return balance

    async def has_sufficient_credits(self, user_id: str, required_amount: int) -> bool:
        """
        Check if user has enough credits.

        Args:
            user_id: User ID string
            required_amount: Credits needed

        Returns:
            True if balance >= required_amount
        """
        balance = await self.get_or_create_balance(user_id)
        return balance.balance >= required_amount

    # ============ Credit Operations ============

    async def deduct(
        self,
        user_id: str,
        amount: int,
        session_id: Optional[str] = None,
        description: Optional[str] = None,
    ) -> Optional[CreditBalanceModel]:
        """
        Deduct credits from a user's balance atomically.

        Uses row-level locking to prevent race conditions when multiple
        requests try to deduct credits simultaneously.

        Args:
            user_id: User ID string
            amount: Credits to deduct (positive number)
            session_id: Optional related session ID
            description: Optional transaction description

        Returns:
            Updated CreditBalanceModel or None if insufficient credits
        """
        # First ensure balance exists (without lock)
        await self.get_or_create_balance(user_id)

        # Now get with lock for atomic check-and-deduct
        balance = await self.get_balance_for_update(user_id)
        if not balance:
            logger.error(f"Balance not found for user {user_id} after creation")
            return None

        if balance.balance < amount:
            logger.warning(f"Insufficient credits for user {user_id}: has {balance.balance}, needs {amount}")
            await self.db.rollback()  # Release the lock
            return None

        # Update balance (within the same transaction holding the lock)
        new_balance = balance.balance - amount
        balance.balance = new_balance
        balance.lifetime_used += amount
        balance.updated_at = datetime.now(tz.utc)

        # Record transaction
        transaction = CreditTransactionModel(
            user_id=user_id,
            amount=-amount,  # Negative for deductions
            type="usage",
            description=description or "AI usage",
            session_id=session_id,
            balance_after=new_balance,
        )
        self.db.add(transaction)

        await self.db.commit()
        await self.db.refresh(balance)

        logger.info(f"Deducted {amount} credits from user {user_id}, new balance: {new_balance}")
        return balance

    async def grant(
        self,
        user_id: str,
        amount: int,
        grant_type: str,
        description: Optional[str] = None,
        stripe_checkout_session_id: Optional[str] = None,
    ) -> Optional[CreditBalanceModel]:
        """
        Grant credits to a user.

        Args:
            user_id: User ID string
            amount: Credits to grant (positive number)
            grant_type: Type of grant (subscription_grant, purchase, refund, admin_grant)
            description: Optional transaction description
            stripe_checkout_session_id: Stripe checkout session ID for idempotency

        Returns:
            Updated CreditBalanceModel, or None if already processed (idempotent)
        """
        # Check idempotency for Stripe purchases
        if stripe_checkout_session_id:
            if await self.is_stripe_session_processed(stripe_checkout_session_id):
                logger.info(f"Stripe session {stripe_checkout_session_id} already processed, skipping grant")
                return await self.get_or_create_balance(user_id)

        balance = await self.get_or_create_balance(user_id)

        # Update balance
        new_balance = balance.balance + amount
        balance.balance = new_balance
        balance.last_grant_at = datetime.now(tz.utc)
        balance.updated_at = datetime.now(tz.utc)

        # Record transaction with stripe session ID for idempotency tracking
        transaction = CreditTransactionModel(
            user_id=user_id,
            amount=amount,  # Positive for grants
            type=grant_type,
            description=description,
            balance_after=new_balance,
            stripe_checkout_session_id=stripe_checkout_session_id,
        )
        self.db.add(transaction)

        await self.db.commit()
        await self.db.refresh(balance)

        logger.info(f"Granted {amount} credits to user {user_id}, new balance: {new_balance}")
        return balance

    async def refund(
        self,
        user_id: str,
        amount: int,
        session_id: Optional[str] = None,
        description: Optional[str] = None,
    ) -> CreditBalanceModel:
        """
        Refund credits to a user (e.g., for failed sessions).

        Args:
            user_id: User ID string
            amount: Credits to refund (positive number)
            session_id: Optional related session ID
            description: Optional transaction description

        Returns:
            Updated CreditBalanceModel
        """
        balance = await self.get_or_create_balance(user_id)

        # Update balance
        new_balance = balance.balance + amount
        balance.balance = new_balance
        # Also reduce lifetime_used since this was a refund
        balance.lifetime_used = max(0, balance.lifetime_used - amount)
        balance.updated_at = datetime.now(tz.utc)

        # Record transaction
        transaction = CreditTransactionModel(
            user_id=user_id,
            amount=amount,
            type="refund",
            description=description or "Credit refund",
            session_id=session_id,
            balance_after=new_balance,
        )
        self.db.add(transaction)

        await self.db.commit()
        await self.db.refresh(balance)

        logger.info(f"Refunded {amount} credits to user {user_id}, new balance: {new_balance}")
        return balance

    # ============ Transaction History ============

    async def get_transactions(
        self,
        user_id: str,
        limit: int = 50,
        offset: int = 0,
        transaction_type: Optional[str] = None,
    ) -> list[CreditTransactionModel]:
        """
        Get credit transaction history for a user.

        Args:
            user_id: User ID string
            limit: Maximum number of transactions to return
            offset: Number of transactions to skip
            transaction_type: Optional filter by type

        Returns:
            List of CreditTransactionModel
        """
        query = select(CreditTransactionModel).where(
            CreditTransactionModel.user_id == user_id
        )

        if transaction_type:
            query = query.where(CreditTransactionModel.type == transaction_type)

        query = (
            query
            .order_by(CreditTransactionModel.created_at.desc())
            .limit(limit)
            .offset(offset)
        )

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_session_credits_used(self, session_id: str) -> int:
        """
        Get total credits used for a session.

        Args:
            session_id: Session ID string

        Returns:
            Total credits used
        """
        result = await self.db.execute(
            select(func.sum(func.abs(CreditTransactionModel.amount)))
            .where(
                CreditTransactionModel.session_id == session_id,
                CreditTransactionModel.type == "usage",
            )
        )
        return result.scalar() or 0

    # ============ Session Credit Tracking ============

    async def update_session_credits(
        self,
        session_id: str,
        credits_used: int,
    ) -> None:
        """
        Update total credits used for a session.

        Args:
            session_id: Session ID string
            credits_used: Total credits used
        """
        await self.db.execute(
            update(SessionModel)
            .where(SessionModel.id == session_id)
            .values(total_credits_used=credits_used, updated_at=datetime.now(tz.utc))
        )
        await self.db.commit()

    # ============ Tier Management ============

    async def update_tier(
        self,
        user_id: str,
        tier: str,
        tier_credits: int,
    ) -> CreditBalanceModel:
        """
        Update user's tier and tier credits allocation.

        Args:
            user_id: User ID string
            tier: New tier (free, starter, pro)
            tier_credits: Monthly credit allocation for this tier

        Returns:
            Updated CreditBalanceModel
        """
        balance = await self.get_or_create_balance(user_id)

        balance.tier = tier
        balance.tier_credits = tier_credits
        balance.updated_at = datetime.now(tz.utc)

        await self.db.commit()
        await self.db.refresh(balance)

        logger.info(f"Updated tier for user {user_id} to {tier} with {tier_credits} tier credits")
        return balance


class SubscriptionRepository:
    """
    Repository for subscription database operations.

    Handles Stripe subscription tracking and management.
    """

    # Tier credit allocations
    TIER_CREDITS = {
        "free": 20,
        "starter": 150,
        "pro": 500,
    }

    def __init__(self, db: AsyncSession):
        self.db = db

    # ============ Subscription CRUD ============

    async def get(self, user_id: str) -> Optional[SubscriptionModel]:
        """
        Get a user's subscription.

        Args:
            user_id: User ID string

        Returns:
            SubscriptionModel or None if not found
        """
        result = await self.db.execute(
            select(SubscriptionModel).where(SubscriptionModel.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def get_by_stripe_customer(self, stripe_customer_id: str) -> Optional[SubscriptionModel]:
        """
        Get a subscription by Stripe customer ID.

        Args:
            stripe_customer_id: Stripe customer ID

        Returns:
            SubscriptionModel or None if not found
        """
        result = await self.db.execute(
            select(SubscriptionModel).where(
                SubscriptionModel.stripe_customer_id == stripe_customer_id
            )
        )
        return result.scalar_one_or_none()

    async def get_by_stripe_subscription(self, stripe_subscription_id: str) -> Optional[SubscriptionModel]:
        """
        Get a subscription by Stripe subscription ID.

        Args:
            stripe_subscription_id: Stripe subscription ID

        Returns:
            SubscriptionModel or None if not found
        """
        result = await self.db.execute(
            select(SubscriptionModel).where(
                SubscriptionModel.stripe_subscription_id == stripe_subscription_id
            )
        )
        return result.scalar_one_or_none()

    async def get_or_create(self, user_id: str) -> SubscriptionModel:
        """
        Get a user's subscription, creating a free tier one if it doesn't exist.

        Args:
            user_id: User ID string

        Returns:
            SubscriptionModel
        """
        subscription = await self.get(user_id)
        if subscription:
            return subscription

        # Create new subscription on free tier
        subscription = SubscriptionModel(
            user_id=user_id,
            tier="free",
            status="active",
        )
        self.db.add(subscription)
        await self.db.commit()
        await self.db.refresh(subscription)

        logger.info(f"Created free subscription for user {user_id}")
        return subscription

    async def create_or_update_from_stripe(
        self,
        user_id: str,
        stripe_customer_id: str,
        stripe_subscription_id: str,
        tier: str,
        status: str,
        current_period_start: Optional[datetime] = None,
        current_period_end: Optional[datetime] = None,
        cancel_at_period_end: bool = False,
    ) -> SubscriptionModel:
        """
        Create or update subscription from Stripe webhook data.

        Args:
            user_id: User ID string
            stripe_customer_id: Stripe customer ID
            stripe_subscription_id: Stripe subscription ID
            tier: Subscription tier (starter, pro)
            status: Stripe subscription status
            current_period_start: Period start datetime
            current_period_end: Period end datetime
            cancel_at_period_end: Whether subscription will cancel at period end

        Returns:
            Created or updated SubscriptionModel
        """
        subscription = await self.get(user_id)

        if subscription:
            # Update existing
            subscription.stripe_customer_id = stripe_customer_id
            subscription.stripe_subscription_id = stripe_subscription_id
            subscription.tier = tier
            subscription.status = status
            subscription.current_period_start = current_period_start
            subscription.current_period_end = current_period_end
            subscription.cancel_at_period_end = cancel_at_period_end
            subscription.updated_at = datetime.now(tz.utc)
        else:
            # Create new
            subscription = SubscriptionModel(
                user_id=user_id,
                stripe_customer_id=stripe_customer_id,
                stripe_subscription_id=stripe_subscription_id,
                tier=tier,
                status=status,
                current_period_start=current_period_start,
                current_period_end=current_period_end,
                cancel_at_period_end=cancel_at_period_end,
            )
            self.db.add(subscription)

        await self.db.commit()
        await self.db.refresh(subscription)

        logger.info(f"Updated subscription for user {user_id}: tier={tier}, status={status}")
        return subscription

    async def cancel(self, user_id: str, at_period_end: bool = True) -> Optional[SubscriptionModel]:
        """
        Cancel a subscription.

        Args:
            user_id: User ID string
            at_period_end: If True, cancel at end of period; if False, cancel immediately

        Returns:
            Updated SubscriptionModel or None if not found
        """
        subscription = await self.get(user_id)
        if not subscription:
            return None

        if at_period_end:
            subscription.cancel_at_period_end = True
        else:
            subscription.status = "canceled"
            subscription.tier = "free"

        subscription.updated_at = datetime.now(tz.utc)

        await self.db.commit()
        await self.db.refresh(subscription)

        logger.info(f"Cancelled subscription for user {user_id}, at_period_end={at_period_end}")
        return subscription

    async def reactivate(self, user_id: str) -> Optional[SubscriptionModel]:
        """
        Reactivate a cancelled subscription (before period end).

        Args:
            user_id: User ID string

        Returns:
            Updated SubscriptionModel or None if not found
        """
        subscription = await self.get(user_id)
        if not subscription:
            return None

        subscription.cancel_at_period_end = False
        subscription.updated_at = datetime.now(tz.utc)

        await self.db.commit()
        await self.db.refresh(subscription)

        logger.info(f"Reactivated subscription for user {user_id}")
        return subscription

    async def downgrade_to_free(self, user_id: str) -> Optional[SubscriptionModel]:
        """
        Downgrade subscription to free tier (after cancellation).

        Args:
            user_id: User ID string

        Returns:
            Updated SubscriptionModel or None if not found
        """
        subscription = await self.get(user_id)
        if not subscription:
            return None

        subscription.tier = "free"
        subscription.status = "active"
        subscription.stripe_subscription_id = None
        subscription.current_period_start = None
        subscription.current_period_end = None
        subscription.cancel_at_period_end = False
        subscription.updated_at = datetime.now(tz.utc)

        await self.db.commit()
        await self.db.refresh(subscription)

        logger.info(f"Downgraded subscription for user {user_id} to free tier")
        return subscription

    def get_tier_credits(self, tier: str) -> int:
        """
        Get credit allocation for a tier.

        Args:
            tier: Subscription tier

        Returns:
            Credit allocation
        """
        return self.TIER_CREDITS.get(tier, 20)


class AdminRepository:
    """
    Repository for admin dashboard operations.

    Provides aggregated queries and admin-only operations
    for user management, analytics, and system monitoring.
    """

    # Tier pricing for MRR calculation
    TIER_PRICES = {
        "free": 0,
        "starter": 15,  # $15/month
        "pro": 30,  # $30/month
    }

    def __init__(self, db: AsyncSession):
        self.db = db

    # ============ Dashboard Stats ============

    async def get_dashboard_stats(self) -> dict:
        """
        Get aggregated stats for the admin dashboard.

        Returns:
            Dict with user counts, revenue, usage, and health metrics
        """
        from datetime import timedelta

        now = datetime.now(tz.utc)
        week_ago = now - timedelta(days=7)
        day_ago = now - timedelta(days=1)

        # User counts by tier
        tier_counts_result = await self.db.execute(
            select(
                SubscriptionModel.tier,
                func.count(SubscriptionModel.id).label("count")
            )
            .group_by(SubscriptionModel.tier)
        )
        tier_counts = {row.tier: row.count for row in tier_counts_result}

        # Total users
        total_users_result = await self.db.execute(
            select(func.count(UserModel.id))
        )
        total_users = total_users_result.scalar() or 0

        # New users this week
        new_users_result = await self.db.execute(
            select(func.count(UserModel.id))
            .where(UserModel.created_at >= week_ago)
        )
        new_users_week = new_users_result.scalar() or 0

        # Calculate MRR
        starter_count = tier_counts.get("starter", 0)
        pro_count = tier_counts.get("pro", 0)
        starter_mrr = starter_count * self.TIER_PRICES["starter"]
        pro_mrr = pro_count * self.TIER_PRICES["pro"]
        mrr = starter_mrr + pro_mrr

        # Sessions today
        sessions_today_result = await self.db.execute(
            select(func.count(SessionModel.id))
            .where(SessionModel.created_at >= day_ago)
        )
        sessions_today = sessions_today_result.scalar() or 0

        # Sessions this week
        sessions_week_result = await self.db.execute(
            select(func.count(SessionModel.id))
            .where(SessionModel.created_at >= week_ago)
        )
        sessions_week = sessions_week_result.scalar() or 0

        # Credits used today
        credits_today_result = await self.db.execute(
            select(func.coalesce(func.sum(func.abs(CreditTransactionModel.amount)), 0))
            .where(CreditTransactionModel.type == "usage")
            .where(CreditTransactionModel.created_at >= day_ago)
        )
        credits_today = credits_today_result.scalar() or 0

        # Credits used this week
        credits_week_result = await self.db.execute(
            select(func.coalesce(func.sum(func.abs(CreditTransactionModel.amount)), 0))
            .where(CreditTransactionModel.type == "usage")
            .where(CreditTransactionModel.created_at >= week_ago)
        )
        credits_week = credits_week_result.scalar() or 0

        # Failed sessions in last 24h
        failed_sessions_result = await self.db.execute(
            select(func.count(SessionModel.id))
            .where(SessionModel.status == "failed")
            .where(SessionModel.updated_at >= day_ago)
        )
        failed_sessions = failed_sessions_result.scalar() or 0

        # Currently running sessions
        running_sessions_result = await self.db.execute(
            select(func.count(SessionModel.id))
            .where(SessionModel.status == "running")
        )
        running_sessions = running_sessions_result.scalar() or 0

        return {
            "users": {
                "total": total_users,
                "by_tier": {
                    "free": tier_counts.get("free", 0),
                    "starter": starter_count,
                    "pro": pro_count,
                },
                "new_this_week": new_users_week,
            },
            "revenue": {
                "mrr": mrr,
                "starter_mrr": starter_mrr,
                "pro_mrr": pro_mrr,
            },
            "usage": {
                "sessions_today": sessions_today,
                "sessions_this_week": sessions_week,
                "credits_used_today": credits_today,
                "credits_used_this_week": credits_week,
            },
            "health": {
                "failed_sessions_24h": failed_sessions,
                "active_sessions": running_sessions,
            },
        }

    # ============ User Management ============

    async def get_all_users(
        self,
        limit: int = 100,
        offset: int = 0,
        tier: Optional[str] = None,
        search: Optional[str] = None,
    ) -> list[dict]:
        """
        Get all users with optional filters.

        Args:
            limit: Max results
            offset: Results to skip
            tier: Filter by subscription tier
            search: Search by email or name

        Returns:
            List of user dicts with subscription and credit info
        """
        query = (
            select(UserModel)
            .options(
                selectinload(UserModel.subscription),
                selectinload(UserModel.credit_balance),
            )
            .order_by(UserModel.created_at.desc())
        )

        if search:
            search_pattern = f"%{search}%"
            query = query.where(
                (UserModel.email.ilike(search_pattern)) |
                (UserModel.display_name.ilike(search_pattern))
            )

        if tier:
            query = query.join(SubscriptionModel).where(SubscriptionModel.tier == tier)

        query = query.limit(limit).offset(offset)

        result = await self.db.execute(query)
        users = list(result.scalars().all())

        # Get session counts for each user
        user_list = []
        for user in users:
            session_count_result = await self.db.execute(
                select(func.count(SessionModel.id))
                .where(SessionModel.user_id == user.id)
            )
            session_count = session_count_result.scalar() or 0

            user_list.append({
                "id": user.id,
                "email": user.email,
                "display_name": user.display_name,
                "is_admin": user.is_admin,
                "tier": user.subscription.tier if user.subscription else "free",
                "subscription_status": user.subscription.status if user.subscription else "none",
                "credit_balance": user.credit_balance.balance if user.credit_balance else 0,
                "lifetime_credits_used": user.credit_balance.lifetime_used if user.credit_balance else 0,
                "session_count": session_count,
                "created_at": user.created_at.isoformat() if user.created_at else None,
            })

        return user_list

    async def get_user_count(
        self,
        tier: Optional[str] = None,
        search: Optional[str] = None,
    ) -> int:
        """Get total user count with filters."""
        query = select(func.count(UserModel.id))

        if search:
            search_pattern = f"%{search}%"
            query = query.where(
                (UserModel.email.ilike(search_pattern)) |
                (UserModel.display_name.ilike(search_pattern))
            )

        if tier:
            query = query.join(SubscriptionModel).where(SubscriptionModel.tier == tier)

        result = await self.db.execute(query)
        return result.scalar() or 0

    async def get_user_details(self, user_id: str) -> Optional[dict]:
        """
        Get detailed user information including recent activity.

        Args:
            user_id: User ID

        Returns:
            Detailed user dict or None if not found
        """
        result = await self.db.execute(
            select(UserModel)
            .where(UserModel.id == user_id)
            .options(
                selectinload(UserModel.subscription),
                selectinload(UserModel.credit_balance),
                selectinload(UserModel.profile),
            )
        )
        user = result.scalar_one_or_none()

        if not user:
            return None

        # Get recent sessions
        sessions_result = await self.db.execute(
            select(SessionModel)
            .where(SessionModel.user_id == user_id)
            .order_by(SessionModel.created_at.desc())
            .limit(10)
        )
        recent_sessions = list(sessions_result.scalars().all())

        # Get recent transactions
        transactions_result = await self.db.execute(
            select(CreditTransactionModel)
            .where(CreditTransactionModel.user_id == user_id)
            .order_by(CreditTransactionModel.created_at.desc())
            .limit(10)
        )
        recent_transactions = list(transactions_result.scalars().all())

        return {
            "id": user.id,
            "email": user.email,
            "display_name": user.display_name,
            "is_admin": user.is_admin,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "subscription": {
                "tier": user.subscription.tier if user.subscription else "free",
                "status": user.subscription.status if user.subscription else "none",
                "stripe_customer_id": user.subscription.stripe_customer_id if user.subscription else None,
                "current_period_end": user.subscription.current_period_end.isoformat() if user.subscription and user.subscription.current_period_end else None,
            },
            "credits": {
                "balance": user.credit_balance.balance if user.credit_balance else 0,
                "lifetime_used": user.credit_balance.lifetime_used if user.credit_balance else 0,
                "tier_credits": user.credit_balance.tier_credits if user.credit_balance else 20,
            },
            "recent_sessions": [
                {
                    "id": s.id,
                    "title": s.title,
                    "status": s.status,
                    "created_at": s.created_at.isoformat() if s.created_at else None,
                    "credits_used": s.total_credits_used or 0,
                }
                for s in recent_sessions
            ],
            "recent_transactions": [
                {
                    "id": t.id,
                    "amount": t.amount,
                    "type": t.type,
                    "description": t.description,
                    "created_at": t.created_at.isoformat() if t.created_at else None,
                }
                for t in recent_transactions
            ],
        }

    async def set_admin_status(self, user_id: str, is_admin: bool) -> Optional[UserModel]:
        """
        Set or remove admin status for a user.

        Args:
            user_id: User ID
            is_admin: New admin status

        Returns:
            Updated UserModel or None if not found
        """
        result = await self.db.execute(
            select(UserModel).where(UserModel.id == user_id)
        )
        user = result.scalar_one_or_none()

        if not user:
            return None

        user.is_admin = is_admin
        await self.db.commit()
        await self.db.refresh(user)

        logger.info(f"Set admin status for user {user_id} to {is_admin}")
        return user

    async def admin_grant_credits(
        self,
        user_id: str,
        amount: int,
        reason: str,
        admin_id: str,
    ) -> Optional[CreditTransactionModel]:
        """
        Grant credits to a user (admin action).

        Args:
            user_id: User to grant credits to
            amount: Number of credits to grant
            reason: Reason for grant
            admin_id: Admin performing the action

        Returns:
            CreditTransactionModel or None if user not found
        """
        # Get or create credit balance
        result = await self.db.execute(
            select(CreditBalanceModel).where(CreditBalanceModel.user_id == user_id)
        )
        balance = result.scalar_one_or_none()

        if not balance:
            # Check if user exists
            user_result = await self.db.execute(
                select(UserModel).where(UserModel.id == user_id)
            )
            if not user_result.scalar_one_or_none():
                return None

            balance = CreditBalanceModel(
                user_id=user_id,
                balance=0,
                lifetime_used=0,
            )
            self.db.add(balance)
            await self.db.commit()
            await self.db.refresh(balance)

        # Update balance
        balance.balance += amount
        new_balance = balance.balance

        # Create transaction
        transaction = CreditTransactionModel(
            id=str(uuid4()),
            user_id=user_id,
            amount=amount,
            type="admin_grant",
            description=f"Admin grant by {admin_id}: {reason}",
            balance_after=new_balance,
        )
        self.db.add(transaction)

        await self.db.commit()
        await self.db.refresh(transaction)

        logger.info(f"Admin {admin_id} granted {amount} credits to user {user_id}: {reason}")
        return transaction

    # ============ Session Monitoring ============

    async def get_all_sessions(
        self,
        limit: int = 100,
        offset: int = 0,
        status: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> list[dict]:
        """
        Get all sessions across all users.

        Args:
            limit: Max results
            offset: Results to skip
            status: Filter by status
            user_id: Filter by user

        Returns:
            List of session dicts
        """
        query = (
            select(SessionModel)
            .options(selectinload(SessionModel.user))
            .order_by(SessionModel.created_at.desc())
        )

        if status:
            query = query.where(SessionModel.status == status)

        if user_id:
            query = query.where(SessionModel.user_id == user_id)

        query = query.limit(limit).offset(offset)

        result = await self.db.execute(query)
        sessions = list(result.scalars().all())

        return [
            {
                "id": s.id,
                "title": s.title,
                "status": s.status,
                "user_id": s.user_id,
                "user_email": s.user.email if s.user else None,
                "current_round": s.current_round,
                "credits_used": s.total_credits_used or 0,
                "termination_reason": s.termination_reason,
                "created_at": s.created_at.isoformat() if s.created_at else None,
                "completed_at": s.completed_at.isoformat() if s.completed_at else None,
            }
            for s in sessions
        ]

    async def get_session_count(
        self,
        status: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> int:
        """Get total session count with filters."""
        query = select(func.count(SessionModel.id))

        if status:
            query = query.where(SessionModel.status == status)

        if user_id:
            query = query.where(SessionModel.user_id == user_id)

        result = await self.db.execute(query)
        return result.scalar() or 0

    async def get_failed_sessions(self, days: int = 7) -> list[dict]:
        """
        Get failed sessions from the last N days.

        Args:
            days: Number of days to look back

        Returns:
            List of failed session dicts
        """
        from datetime import timedelta

        cutoff = datetime.now(tz.utc) - timedelta(days=days)

        result = await self.db.execute(
            select(SessionModel)
            .where(SessionModel.status == "failed")
            .where(SessionModel.updated_at >= cutoff)
            .options(selectinload(SessionModel.user))
            .order_by(SessionModel.updated_at.desc())
        )
        sessions = list(result.scalars().all())

        return [
            {
                "id": s.id,
                "title": s.title,
                "user_id": s.user_id,
                "user_email": s.user.email if s.user else None,
                "termination_reason": s.termination_reason,
                "created_at": s.created_at.isoformat() if s.created_at else None,
                "failed_at": s.updated_at.isoformat() if s.updated_at else None,
            }
            for s in sessions
        ]

    async def get_session_detail(self, session_id: str) -> Optional[dict]:
        """
        Get detailed session information including all turns with token usage.

        Args:
            session_id: Session ID

        Returns:
            Session dict with turns and token breakdown, or None if not found
        """
        result = await self.db.execute(
            select(SessionModel)
            .where(SessionModel.id == session_id)
            .options(
                selectinload(SessionModel.user),
                selectinload(SessionModel.exchange_turns),
            )
        )
        session = result.scalar_one_or_none()

        if not session:
            return None

        # Calculate token totals
        total_input_tokens = 0
        total_output_tokens = 0
        total_credits = 0

        turns = []
        for turn in sorted(session.exchange_turns, key=lambda t: t.turn_number):
            input_tokens = turn.tokens_input or 0
            output_tokens = turn.tokens_output or 0
            credits = turn.credits_used or 0

            total_input_tokens += input_tokens
            total_output_tokens += output_tokens
            total_credits += credits

            turns.append({
                "id": turn.id,
                "turn_number": turn.turn_number,
                "round_number": turn.round_number,
                "phase": turn.phase,
                "agent_id": turn.agent_id,
                "agent_name": turn.agent_name,
                "tokens_input": input_tokens,
                "tokens_output": output_tokens,
                "tokens_total": input_tokens + output_tokens,
                "credits_used": credits,
                "output_preview": turn.output[:200] + "..." if turn.output and len(turn.output) > 200 else turn.output,
                "has_evaluation": turn.evaluation is not None,
                "evaluation_score": turn.evaluation.get("overall_score") if turn.evaluation else None,
                "created_at": turn.created_at.isoformat() if turn.created_at else None,
            })

        return {
            "id": session.id,
            "title": session.title,
            "status": session.status,
            "user_id": session.user_id,
            "user_email": session.user.email if session.user else None,
            "current_round": session.current_round,
            "termination_reason": session.termination_reason,
            "created_at": session.created_at.isoformat() if session.created_at else None,
            "updated_at": session.updated_at.isoformat() if session.updated_at else None,
            "completed_at": session.completed_at.isoformat() if session.completed_at else None,
            # Token usage summary
            "usage": {
                "total_input_tokens": total_input_tokens,
                "total_output_tokens": total_output_tokens,
                "total_tokens": total_input_tokens + total_output_tokens,
                "total_credits": total_credits,
            },
            # All turns with token breakdown
            "turns": turns,
        }

    # ============ Transactions ============

    async def get_all_transactions(
        self,
        limit: int = 100,
        offset: int = 0,
        user_id: Optional[str] = None,
        transaction_type: Optional[str] = None,
    ) -> list[dict]:
        """
        Get all credit transactions.

        Args:
            limit: Max results
            offset: Results to skip
            user_id: Filter by user
            transaction_type: Filter by type

        Returns:
            List of transaction dicts
        """
        query = (
            select(CreditTransactionModel)
            .options(selectinload(CreditTransactionModel.user))
            .order_by(CreditTransactionModel.created_at.desc())
        )

        if user_id:
            query = query.where(CreditTransactionModel.user_id == user_id)

        if transaction_type:
            query = query.where(CreditTransactionModel.type == transaction_type)

        query = query.limit(limit).offset(offset)

        result = await self.db.execute(query)
        transactions = list(result.scalars().all())

        return [
            {
                "id": t.id,
                "user_id": t.user_id,
                "user_email": t.user.email if t.user else None,
                "amount": t.amount,
                "type": t.type,
                "description": t.description,
                "session_id": t.session_id,
                "balance_after": t.balance_after,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            }
            for t in transactions
        ]

    async def get_transaction_count(
        self,
        user_id: Optional[str] = None,
        transaction_type: Optional[str] = None,
    ) -> int:
        """Get total transaction count with filters."""
        query = select(func.count(CreditTransactionModel.id))

        if user_id:
            query = query.where(CreditTransactionModel.user_id == user_id)

        if transaction_type:
            query = query.where(CreditTransactionModel.type == transaction_type)

        result = await self.db.execute(query)
        return result.scalar() or 0

    # ============ Analytics ============

    async def get_revenue_analytics(self, period: str = "month") -> dict:
        """
        Get revenue analytics for a period.

        Args:
            period: "week", "month", or "year"

        Returns:
            Revenue breakdown by tier
        """
        from datetime import timedelta

        now = datetime.now(tz.utc)

        if period == "week":
            start_date = now - timedelta(days=7)
        elif period == "year":
            start_date = now - timedelta(days=365)
        else:  # month
            start_date = now - timedelta(days=30)

        # Get active subscriptions by tier
        result = await self.db.execute(
            select(
                SubscriptionModel.tier,
                func.count(SubscriptionModel.id).label("count")
            )
            .where(SubscriptionModel.status == "active")
            .where(SubscriptionModel.tier != "free")
            .group_by(SubscriptionModel.tier)
        )

        tier_breakdown = {}
        total_mrr = 0
        for row in result:
            tier_breakdown[row.tier] = {
                "subscribers": row.count,
                "mrr": row.count * self.TIER_PRICES.get(row.tier, 0),
            }
            total_mrr += tier_breakdown[row.tier]["mrr"]

        # Get credit purchases in period
        purchases_result = await self.db.execute(
            select(func.count(CreditTransactionModel.id))
            .where(CreditTransactionModel.type == "purchase")
            .where(CreditTransactionModel.created_at >= start_date)
        )
        credit_purchases = purchases_result.scalar() or 0

        return {
            "period": period,
            "total_mrr": total_mrr,
            "tier_breakdown": tier_breakdown,
            "credit_purchases_in_period": credit_purchases,
        }

    async def get_usage_analytics(self, period: str = "month") -> dict:
        """
        Get usage analytics for a period.

        Args:
            period: "week", "month", or "year"

        Returns:
            Usage statistics
        """
        from datetime import timedelta

        now = datetime.now(tz.utc)

        if period == "week":
            start_date = now - timedelta(days=7)
        elif period == "year":
            start_date = now - timedelta(days=365)
        else:  # month
            start_date = now - timedelta(days=30)

        # Sessions in period
        sessions_result = await self.db.execute(
            select(func.count(SessionModel.id))
            .where(SessionModel.created_at >= start_date)
        )
        total_sessions = sessions_result.scalar() or 0

        # Completed sessions
        completed_result = await self.db.execute(
            select(func.count(SessionModel.id))
            .where(SessionModel.status == "completed")
            .where(SessionModel.created_at >= start_date)
        )
        completed_sessions = completed_result.scalar() or 0

        # Failed sessions
        failed_result = await self.db.execute(
            select(func.count(SessionModel.id))
            .where(SessionModel.status == "failed")
            .where(SessionModel.created_at >= start_date)
        )
        failed_sessions = failed_result.scalar() or 0

        # Credits used
        credits_result = await self.db.execute(
            select(func.coalesce(func.sum(func.abs(CreditTransactionModel.amount)), 0))
            .where(CreditTransactionModel.type == "usage")
            .where(CreditTransactionModel.created_at >= start_date)
        )
        credits_used = credits_result.scalar() or 0

        # Average credits per session
        avg_credits = credits_used / total_sessions if total_sessions > 0 else 0

        return {
            "period": period,
            "total_sessions": total_sessions,
            "completed_sessions": completed_sessions,
            "failed_sessions": failed_sessions,
            "success_rate": round(completed_sessions / total_sessions * 100, 1) if total_sessions > 0 else 0,
            "credits_used": credits_used,
            "avg_credits_per_session": round(avg_credits, 2),
        }
