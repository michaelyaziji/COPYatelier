'use client';

import { useState, useEffect } from 'react';
import { FileText, Clock, CheckCircle2, XCircle, Loader2, Play, MoreHorizontal, FolderInput, Plus } from 'lucide-react';
import { api, Project } from '@/lib/api';
import { clsx } from 'clsx';

interface SessionSummary {
  session_id: string;
  title: string;
  status: string;
  project_id: string | null;
  agent_count: number;
  current_round: number;
  total_turns: number;
  is_running: boolean;
  termination_reason: string | null;
  created_at: string | null;
}

interface SessionHistoryProps {
  selectedProjectId: string | null;
  onSelectSession: (sessionId: string) => void;
  projects: Project[];
}

export function SessionHistory({
  selectedProjectId,
  onSelectSession,
  projects,
}: SessionHistoryProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [unassignedSessions, setUnassignedSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);

  useEffect(() => {
    loadSessions();
  }, [selectedProjectId]);

  const loadSessions = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.listSessions(selectedProjectId);
      setSessions(response.sessions);

      // When viewing a specific project, also fetch unassigned sessions
      if (selectedProjectId) {
        const allResponse = await api.listSessions(null);
        const unassigned = allResponse.sessions.filter(s => !s.project_id);
        setUnassignedSessions(unassigned);
      } else {
        setUnassignedSessions([]);
      }
    } catch (err) {
      console.error('Failed to load sessions:', err);
      setError('Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  const handleMoveToProject = async (sessionId: string, projectId: string | null) => {
    try {
      await api.moveSessionToProject(sessionId, projectId);
      // Reload sessions to reflect the change
      await loadSessions();
      setMenuOpenFor(null);
    } catch (err) {
      console.error('Failed to move session:', err);
    }
  };

  const getStatusIcon = (session: SessionSummary) => {
    if (session.is_running) {
      return <Loader2 className="h-4 w-4 text-violet-500 animate-spin" />;
    }
    if (session.status === 'completed') {
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    }
    if (session.status === 'failed') {
      return <XCircle className="h-4 w-4 text-red-500" />;
    }
    return <FileText className="h-4 w-4 text-zinc-400" />;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getProjectName = (projectId: string | null) => {
    if (!projectId) return null;
    const project = projects.find(p => p.id === projectId);
    return project?.name || null;
  };

  if (loading) {
    return (
      <div className="p-8 text-center">
        <Loader2 className="h-6 w-6 text-violet-500 animate-spin mx-auto mb-2" />
        <p className="text-sm text-zinc-500">Loading sessions...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <XCircle className="h-6 w-6 text-red-500 mx-auto mb-2" />
        <p className="text-sm text-red-600">{error}</p>
        <button
          onClick={loadSessions}
          className="mt-2 text-sm text-violet-600 hover:text-violet-700"
        >
          Try again
        </button>
      </div>
    );
  }

  // Helper to quickly add session to current project
  const handleAddToCurrentProject = async (sessionId: string) => {
    if (!selectedProjectId) return;
    await handleMoveToProject(sessionId, selectedProjectId);
  };

  // Render a single session row
  const renderSessionRow = (session: SessionSummary, showAddToProject: boolean = false) => (
    <div
      key={session.session_id}
      className="group relative"
    >
      <button
        onClick={() => onSelectSession(session.session_id)}
        className="w-full p-4 text-left hover:bg-zinc-50 transition-colors"
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            {getStatusIcon(session)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="font-medium text-zinc-900 truncate">
                {session.title}
              </h4>
              {session.is_running && (
                <span className="px-1.5 py-0.5 text-xs font-medium bg-violet-100 text-violet-700 rounded">
                  Running
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDate(session.created_at)}
              </span>
              <span>{session.total_turns} turns</span>
              <span>Round {session.current_round}</span>
            </div>
            {/* Show project badge if viewing all sessions */}
            {!selectedProjectId && session.project_id && (
              <div className="mt-1.5">
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs bg-zinc-100 text-zinc-600 rounded">
                  <FolderInput className="h-3 w-3" />
                  {getProjectName(session.project_id)}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            {session.is_running ? (
              <Play className="h-4 w-4 text-violet-500" />
            ) : session.status === 'completed' ? (
              <span className="text-xs text-emerald-600">
                {session.termination_reason || 'Completed'}
              </span>
            ) : null}
          </div>
        </div>
      </button>

      {/* Quick add to project button for unassigned sessions */}
      {showAddToProject && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleAddToCurrentProject(session.session_id);
          }}
          className="absolute right-12 top-4 p-1.5 opacity-0 group-hover:opacity-100 hover:bg-violet-100 text-violet-600 rounded transition-opacity"
          title="Add to this project"
        >
          <Plus className="h-4 w-4" />
        </button>
      )}

      {/* Context menu button */}
      <div className="absolute right-2 top-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpenFor(menuOpenFor === session.session_id ? null : session.session_id);
          }}
          className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-zinc-200 rounded transition-opacity"
        >
          <MoreHorizontal className="h-4 w-4 text-zinc-500" />
        </button>

        {/* Dropdown menu */}
        {menuOpenFor === session.session_id && (
          <div className="absolute right-0 top-full mt-1 bg-white border border-zinc-200 rounded-lg shadow-lg py-1 z-20 min-w-[180px]">
            <div className="px-3 py-1.5 text-xs font-medium text-zinc-400 uppercase">
              Move to Project
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleMoveToProject(session.session_id, null);
              }}
              className={clsx(
                'w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-zinc-100',
                !session.project_id ? 'text-violet-600 font-medium' : 'text-zinc-700'
              )}
            >
              No Project
            </button>
            {projects.map((project) => (
              <button
                key={project.id}
                onClick={(e) => {
                  e.stopPropagation();
                  handleMoveToProject(session.session_id, project.id);
                }}
                className={clsx(
                  'w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-zinc-100',
                  session.project_id === project.id ? 'text-violet-600 font-medium' : 'text-zinc-700'
                )}
              >
                {project.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // Handle case where project has no sessions but there are unassigned sessions
  if (sessions.length === 0 && unassignedSessions.length === 0) {
    return (
      <div className="p-8 text-center">
        <FileText className="h-8 w-8 text-zinc-300 mx-auto mb-3" />
        <p className="text-sm text-zinc-500">
          {selectedProjectId
            ? 'No sessions in this project yet'
            : 'No sessions yet'}
        </p>
        <p className="text-xs text-zinc-400 mt-1">
          Create a new session to get started
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Project sessions */}
      {sessions.length > 0 && (
        <div className="divide-y divide-zinc-100">
          {sessions.map((session) => renderSessionRow(session, false))}
        </div>
      )}

      {/* Empty state for project with unassigned sessions available */}
      {sessions.length === 0 && selectedProjectId && unassignedSessions.length > 0 && (
        <div className="p-6 text-center border-b border-zinc-100">
          <FileText className="h-6 w-6 text-zinc-300 mx-auto mb-2" />
          <p className="text-sm text-zinc-500">No sessions in this project yet</p>
        </div>
      )}

      {/* Unassigned sessions section - only shown when viewing a specific project */}
      {selectedProjectId && unassignedSessions.length > 0 && (
        <div className="border-t border-zinc-200 bg-zinc-50/50">
          <div className="px-4 py-3 border-b border-zinc-100">
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
              Unassigned Sessions ({unassignedSessions.length})
            </p>
            <p className="text-xs text-zinc-400 mt-0.5">
              Hover and click + to add to this project
            </p>
          </div>
          <div className="divide-y divide-zinc-100">
            {unassignedSessions.map((session) => renderSessionRow(session, true))}
          </div>
        </div>
      )}

      {/* Close menu on click outside */}
      {menuOpenFor && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setMenuOpenFor(null)}
        />
      )}
    </div>
  );
}
