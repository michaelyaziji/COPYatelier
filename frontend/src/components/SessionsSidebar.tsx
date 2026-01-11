'use client';

import { useState, useEffect, useRef } from 'react';
import { FileText, Plus, Clock, Loader2, CheckCircle2, XCircle, MoreVertical, Star, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { clsx } from 'clsx';

interface SessionSummary {
  session_id: string;
  title: string;
  starred?: boolean;
  status: string;
  current_round: number;
  total_turns: number;
  is_running: boolean;
  created_at: string | null;
}

interface SessionsSidebarProps {
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  currentSessionId?: string | null;
}

export function SessionsSidebar({
  onSelectSession,
  onNewSession,
  currentSessionId,
}: SessionsSidebarProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const [renamingSession, setRenamingSession] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    if (renamingSession && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingSession]);

  const loadSessions = async () => {
    try {
      setLoading(true);
      const response = await api.listSessions(null);
      setSessions(response.sessions);
    } catch (err) {
      console.error('Failed to load sessions:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (sessionId: string) => {
    if (!confirm('Are you sure you want to delete this session?')) return;
    try {
      await api.deleteSession(sessionId);
      setSessions(sessions.filter(s => s.session_id !== sessionId));
      setMenuOpenFor(null);
    } catch (err) {
      console.error('Failed to delete session:', err);
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

  // Sort sessions: starred first, then by date
  const sortedSessions = [...sessions].sort((a, b) => {
    if (a.starred && !b.starred) return -1;
    if (!a.starred && b.starred) return 1;
    return 0;
  });

  return (
    <div className="w-64 bg-zinc-50 border-r border-zinc-200 h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-zinc-200">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-zinc-900">Sessions</h2>
          <Button
            variant="primary"
            size="sm"
            onClick={onNewSession}
            className="h-9 w-9 p-0 rounded-full"
            title="New session"
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Session List */}
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="px-3 py-4 text-center">
            <Loader2 className="h-5 w-5 text-violet-500 animate-spin mx-auto" />
            <p className="text-xs text-zinc-500 mt-2">Loading...</p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <FileText className="h-8 w-8 text-zinc-300 mx-auto mb-2" />
            <p className="text-sm text-zinc-500">No sessions yet</p>
            <p className="text-xs text-zinc-400 mt-1">
              Start writing to create one
            </p>
          </div>
        ) : (
          sortedSessions.map((session) => (
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
                  'w-full text-left px-3 py-2.5 pr-8',
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

              {/* Three-dot menu button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpenFor(menuOpenFor === session.session_id ? null : session.session_id);
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

              {/* Dropdown menu */}
              {menuOpenFor === session.session_id && (
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
                      handleDelete(session.session_id);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))
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
