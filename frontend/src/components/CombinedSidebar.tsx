'use client';

import { useState, useEffect, useRef } from 'react';
import {
  FileText, Plus, Clock, Loader2, CheckCircle2, XCircle, MoreVertical,
  Star, Pencil, Trash2, FolderOpen, ChevronRight, ChevronDown, File
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, Project } from '@/lib/api';
import { clsx } from 'clsx';

interface SessionSummary {
  session_id: string;
  title: string;
  starred?: boolean;
  status: string;
  project_id: string | null;
  current_round: number;
  total_turns: number;
  is_running: boolean;
  created_at: string | null;
}

interface CombinedSidebarProps {
  onSelectSession: (sessionId: string) => void;
  onSelectProject: (projectId: string) => void;
  onNewSession: (projectId?: string | null) => void;
  onNewProject: () => void;
  currentSessionId?: string | null;
  currentProjectId?: string | null;
}

export function CombinedSidebar({
  onSelectSession,
  onSelectProject,
  onNewSession,
  onNewProject,
  currentSessionId,
  currentProjectId,
}: CombinedSidebarProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const [menuType, setMenuType] = useState<'session' | 'project' | null>(null);
  const [renamingSession, setRenamingSession] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (currentSessionId || currentProjectId) {
      loadData();
    }
  }, [currentSessionId, currentProjectId]);

  useEffect(() => {
    if (renamingSession && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingSession]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [sessionsResponse, projectsResponse] = await Promise.all([
        api.listSessions(null),
        api.listProjects(),
      ]);
      setSessions(sessionsResponse.sessions);
      setProjects(projectsResponse.projects);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Standalone sessions (not in any project)
  const standaloneSessions = sessions.filter(s => !s.project_id);

  // Sessions grouped by project
  const sessionsByProject = sessions.reduce((acc, session) => {
    if (session.project_id) {
      if (!acc[session.project_id]) {
        acc[session.project_id] = [];
      }
      acc[session.project_id].push(session);
    }
    return acc;
  }, {} as Record<string, SessionSummary[]>);

  const toggleProjectExpanded = (projectId: string) => {
    const newExpanded = new Set(expandedProjects);
    if (newExpanded.has(projectId)) {
      newExpanded.delete(projectId);
    } else {
      newExpanded.add(projectId);
    }
    setExpandedProjects(newExpanded);
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to delete this session?')) return;
    try {
      await api.deleteSession(sessionId);
      setSessions(sessions.filter(s => s.session_id !== sessionId));
      setMenuOpenFor(null);
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!confirm('Are you sure you want to delete this project? Sessions will be moved to standalone.')) return;
    try {
      await api.archiveProject(projectId, true);
      setProjects(projects.filter(p => p.id !== projectId));
      setMenuOpenFor(null);
    } catch (err) {
      console.error('Failed to delete project:', err);
    }
  };

  const handleStar = async (sessionId: string, currentStarred: boolean) => {
    try {
      await api.starSession(sessionId, !currentStarred);
      setSessions(sessions.map(s =>
        s.session_id === sessionId ? { ...s, starred: !currentStarred } : s
      ));
      setMenuOpenFor(null);
    } catch (err) {
      console.error('Failed to star session:', err);
    }
  };

  const startRename = (session: SessionSummary) => {
    setRenamingSession(session.session_id);
    setRenameValue(session.title);
    setMenuOpenFor(null);
  };

  const handleRename = async (sessionId: string) => {
    if (!renameValue.trim()) {
      setRenamingSession(null);
      return;
    }
    try {
      await api.renameSession(sessionId, renameValue.trim());
      setSessions(sessions.map(s =>
        s.session_id === sessionId ? { ...s, title: renameValue.trim() } : s
      ));
    } catch (err) {
      console.error('Failed to rename session:', err);
    }
    setRenamingSession(null);
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

  const getStatusIcon = (session: SessionSummary) => {
    if (session.is_running) {
      return <Loader2 className="h-3 w-3 text-violet-500 animate-spin" />;
    }
    if (session.status === 'completed') {
      return <CheckCircle2 className="h-3 w-3 text-emerald-500" />;
    }
    if (session.status === 'failed') {
      return <XCircle className="h-3 w-3 text-red-500" />;
    }
    return <FileText className="h-3 w-3 text-zinc-400" />;
  };

  const renderSessionItem = (session: SessionSummary, indent = false) => (
    <div
      key={session.session_id}
      className={clsx(
        'group relative rounded-lg mb-1 transition-colors',
        currentSessionId === session.session_id
          ? 'bg-violet-100'
          : 'hover:bg-zinc-100'
      )}
    >
      <button
        onClick={() => onSelectSession(session.session_id)}
        className={clsx(
          'w-full text-left py-2 pr-8',
          indent ? 'pl-8' : 'pl-3',
          currentSessionId === session.session_id
            ? 'text-violet-900'
            : 'text-zinc-700'
        )}
      >
        <div className="flex items-start gap-2">
          <div className="mt-1">
            {session.starred ? (
              <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
            ) : (
              getStatusIcon(session)
            )}
          </div>
          <div className="flex-1 min-w-0">
            {renamingSession === session.session_id ? (
              <input
                ref={renameInputRef}
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => handleRename(session.session_id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename(session.session_id);
                  if (e.key === 'Escape') setRenamingSession(null);
                }}
                onClick={(e) => e.stopPropagation()}
                className="w-full text-sm font-medium bg-white border border-violet-300 rounded px-1 py-0.5 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            ) : (
              <p className="text-sm font-medium truncate">
                {session.title}
              </p>
            )}
            <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-500">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDate(session.created_at)}
              </span>
              {session.is_running && (
                <span className="text-violet-600 font-medium">Running</span>
              )}
            </div>
          </div>
        </div>
      </button>

      {/* Session menu button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpenFor(menuOpenFor === session.session_id ? null : session.session_id);
          setMenuType('session');
        }}
        className={clsx(
          'absolute right-1 top-2 p-1.5 rounded transition-opacity',
          menuOpenFor === session.session_id
            ? 'opacity-100 bg-zinc-200'
            : 'opacity-0 group-hover:opacity-100 hover:bg-zinc-200'
        )}
      >
        <MoreVertical className="h-4 w-4 text-zinc-500" />
      </button>

      {/* Session dropdown menu */}
      {menuOpenFor === session.session_id && menuType === 'session' && (
        <div className="absolute right-0 top-8 z-20 bg-white border border-zinc-200 rounded-lg shadow-lg py-1 min-w-[140px]">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleStar(session.session_id, session.starred || false);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100"
          >
            <Star className={clsx('h-4 w-4', session.starred ? 'text-amber-500 fill-amber-500' : '')} />
            {session.starred ? 'Unstar' : 'Star'}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              startRename(session);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100"
          >
            <Pencil className="h-4 w-4" />
            Rename
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteSession(session.session_id);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      )}
    </div>
  );

  const renderProjectItem = (project: Project) => {
    const projectSessions = sessionsByProject[project.id] || [];
    const isExpanded = expandedProjects.has(project.id);
    const isSelected = currentProjectId === project.id;

    return (
      <div key={project.id} className="mb-1">
        <div
          className={clsx(
            'group relative rounded-lg transition-colors',
            isSelected ? 'bg-violet-100' : 'hover:bg-zinc-100'
          )}
        >
          <div className="flex items-center">
            {/* Expand/collapse button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleProjectExpanded(project.id);
              }}
              className="p-2 hover:bg-zinc-200 rounded"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-zinc-500" />
              ) : (
                <ChevronRight className="h-4 w-4 text-zinc-500" />
              )}
            </button>

            {/* Project button */}
            <button
              onClick={() => onSelectProject(project.id)}
              className={clsx(
                'flex-1 text-left py-2 pr-8',
                isSelected ? 'text-violet-900' : 'text-zinc-700'
              )}
            >
              <div className="flex items-center gap-2">
                <FolderOpen className={clsx(
                  'h-4 w-4',
                  isSelected ? 'text-violet-600' : 'text-zinc-400'
                )} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{project.name}</p>
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <span>{project.session_count} sessions</span>
                    {project.file_count > 0 && (
                      <>
                        <span>&middot;</span>
                        <span className="flex items-center gap-1">
                          <File className="h-3 w-3" />
                          {project.file_count}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </button>

            {/* Project menu button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpenFor(menuOpenFor === project.id ? null : project.id);
                setMenuType('project');
              }}
              className={clsx(
                'absolute right-1 top-2 p-1.5 rounded transition-opacity',
                menuOpenFor === project.id
                  ? 'opacity-100 bg-zinc-200'
                  : 'opacity-0 group-hover:opacity-100 hover:bg-zinc-200'
              )}
            >
              <MoreVertical className="h-4 w-4 text-zinc-500" />
            </button>

            {/* Project dropdown menu */}
            {menuOpenFor === project.id && menuType === 'project' && (
              <div className="absolute right-0 top-8 z-20 bg-white border border-zinc-200 rounded-lg shadow-lg py-1 min-w-[160px]">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onNewSession(project.id);
                    setMenuOpenFor(null);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100"
                >
                  <Plus className="h-4 w-4" />
                  New Session
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteProject(project.id);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Project
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Nested sessions */}
        {isExpanded && projectSessions.length > 0 && (
          <div className="ml-2 border-l border-zinc-200 pl-1">
            {projectSessions.map((session) => renderSessionItem(session, true))}
          </div>
        )}
      </div>
    );
  };

  // Sort sessions: starred first
  const sortedStandaloneSessions = [...standaloneSessions].sort((a, b) => {
    if (a.starred && !b.starred) return -1;
    if (!a.starred && b.starred) return 1;
    return 0;
  });

  return (
    <div className="w-64 bg-zinc-50 border-r border-zinc-200 h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-zinc-200">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-zinc-900">Workspace</h2>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onNewProject}
            className="flex-1 h-8 text-xs"
          >
            <FolderOpen className="h-3.5 w-3.5 mr-1" />
            New Project
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => onNewSession(null)}
            className="flex-1 h-8 text-xs"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            New Session
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="px-3 py-4 text-center">
            <Loader2 className="h-5 w-5 text-violet-500 animate-spin mx-auto" />
            <p className="text-xs text-zinc-500 mt-2">Loading...</p>
          </div>
        ) : (
          <>
            {/* Projects section */}
            {projects.length > 0 && (
              <div className="mb-4">
                <h3 className="px-2 py-1 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  Projects
                </h3>
                {projects.map(renderProjectItem)}
              </div>
            )}

            {/* Standalone sessions section */}
            <div>
              <h3 className="px-2 py-1 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                Sessions
              </h3>
              {sortedStandaloneSessions.length === 0 ? (
                <div className="px-3 py-4 text-center">
                  <FileText className="h-6 w-6 text-zinc-300 mx-auto mb-2" />
                  <p className="text-xs text-zinc-500">No standalone sessions</p>
                </div>
              ) : (
                sortedStandaloneSessions.map((session) => renderSessionItem(session))
              )}
            </div>
          </>
        )}
      </div>

      {/* Click outside to close menu */}
      {menuOpenFor && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setMenuOpenFor(null)}
        />
      )}
    </div>
  );
}
