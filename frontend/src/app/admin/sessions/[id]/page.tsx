'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  AlertTriangle,
  Clock,
  Zap,
  User,
  Hash,
  FileText,
  ChevronDown,
  ChevronUp,
  PenLine,
  BookOpen,
  Sparkles,
  Search,
  Layers,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, AdminSessionDetail, AdminSessionTurn } from '@/lib/api';
import { clsx } from 'clsx';

const phaseIcons: Record<number, typeof PenLine> = {
  1: PenLine,      // Writer
  2: BookOpen,     // Editors (default)
  3: Layers,       // Synthesizer
};

const phaseColors: Record<number, { bg: string; text: string; border: string }> = {
  1: { bg: 'bg-violet-100', text: 'text-violet-600', border: 'border-violet-200' },
  2: { bg: 'bg-blue-100', text: 'text-blue-600', border: 'border-blue-200' },
  3: { bg: 'bg-emerald-100', text: 'text-emerald-600', border: 'border-emerald-200' },
};

const phaseNames: Record<number, string> = {
  1: 'Writer',
  2: 'Editor',
  3: 'Synthesizer',
};

function TurnCard({ turn, isExpanded, onToggle }: { turn: AdminSessionTurn; isExpanded: boolean; onToggle: () => void }) {
  const Icon = phaseIcons[turn.phase] || BookOpen;
  const colors = phaseColors[turn.phase] || phaseColors[2];
  const phaseName = phaseNames[turn.phase] || 'Editor';

  return (
    <div className={clsx('rounded-xl border', colors.border, 'bg-white overflow-hidden')}>
      {/* Header */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-zinc-50"
        onClick={onToggle}
      >
        {/* Phase Icon */}
        <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center', colors.bg)}>
          <Icon className={clsx('w-5 h-5', colors.text)} />
        </div>

        {/* Turn Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-zinc-900">{turn.agent_name}</span>
            <span className={clsx('text-xs px-2 py-0.5 rounded-full', colors.bg, colors.text)}>
              {phaseName}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-500 mt-0.5">
            <span>Turn {turn.turn_number}</span>
            <span>Round {turn.round_number}</span>
            {turn.evaluation_score && (
              <span className="text-amber-600">Score: {turn.evaluation_score.toFixed(1)}</span>
            )}
          </div>
        </div>

        {/* Token Stats */}
        <div className="flex items-center gap-4 text-sm">
          <div className="text-right">
            <p className="text-zinc-500 text-xs">Input</p>
            <p className="font-medium text-zinc-700">{turn.tokens_input.toLocaleString()}</p>
          </div>
          <div className="text-right">
            <p className="text-zinc-500 text-xs">Output</p>
            <p className="font-medium text-zinc-700">{turn.tokens_output.toLocaleString()}</p>
          </div>
          <div className="text-right">
            <p className="text-zinc-500 text-xs">Credits</p>
            <p className="font-semibold text-amber-600">{turn.credits_used}</p>
          </div>
        </div>

        {/* Expand Toggle */}
        <button className="p-1 hover:bg-zinc-100 rounded">
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-zinc-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-zinc-400" />
          )}
        </button>
      </div>

      {/* Expanded Content */}
      {isExpanded && turn.output_preview && (
        <div className="px-4 pb-4 border-t border-zinc-100">
          <p className="text-xs font-medium text-zinc-500 mt-3 mb-2">Output Preview</p>
          <div className="bg-zinc-50 rounded-lg p-3 text-sm text-zinc-700 whitespace-pre-wrap">
            {turn.output_preview}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminSessionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const [session, setSession] = useState<AdminSessionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedTurns, setExpandedTurns] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchSession = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await api.getAdminSessionDetail(sessionId);
        setSession(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load session');
      } finally {
        setIsLoading(false);
      }
    };

    if (sessionId) {
      fetchSession();
    }
  }, [sessionId]);

  const toggleTurn = (turnId: string) => {
    setExpandedTurns((prev) => {
      const next = new Set(prev);
      if (next.has(turnId)) {
        next.delete(turnId);
      } else {
        next.add(turnId);
      }
      return next;
    });
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: 'bg-zinc-100 text-zinc-600',
      running: 'bg-blue-100 text-blue-600',
      paused: 'bg-amber-100 text-amber-600',
      completed: 'bg-emerald-100 text-emerald-600',
      failed: 'bg-red-100 text-red-600',
      stopped: 'bg-orange-100 text-orange-600',
    };
    return (
      <span className={clsx('px-3 py-1 rounded-full text-sm font-medium capitalize', styles[status] || styles.draft)}>
        {status}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600 mx-auto mb-4" />
        <p className="text-zinc-600">Loading session details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-3" />
          <p className="text-red-700 font-medium">{error}</p>
          <Button variant="outline" className="mt-4" onClick={() => router.back()}>
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/admin/sessions"
          className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-700 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Sessions
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">{session.title}</h1>
            <p className="text-zinc-500 mt-1 font-mono text-sm">{session.id}</p>
          </div>
          {getStatusBadge(session.status)}
        </div>
      </div>

      {/* Session Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* User */}
        <div className="bg-white rounded-xl border border-zinc-200 p-4">
          <div className="flex items-center gap-2 text-zinc-500 mb-2">
            <User className="h-4 w-4" />
            <span className="text-sm">User</span>
          </div>
          {session.user_email ? (
            <Link
              href={`/admin/users/${session.user_id}`}
              className="text-violet-600 hover:text-violet-700 font-medium"
            >
              {session.user_email}
            </Link>
          ) : (
            <span className="text-zinc-400">Unknown</span>
          )}
        </div>

        {/* Rounds */}
        <div className="bg-white rounded-xl border border-zinc-200 p-4">
          <div className="flex items-center gap-2 text-zinc-500 mb-2">
            <Hash className="h-4 w-4" />
            <span className="text-sm">Rounds</span>
          </div>
          <p className="text-2xl font-bold text-zinc-900">{session.current_round}</p>
        </div>

        {/* Turns */}
        <div className="bg-white rounded-xl border border-zinc-200 p-4">
          <div className="flex items-center gap-2 text-zinc-500 mb-2">
            <FileText className="h-4 w-4" />
            <span className="text-sm">Total Turns</span>
          </div>
          <p className="text-2xl font-bold text-zinc-900">{session.turns.length}</p>
        </div>

        {/* Created */}
        <div className="bg-white rounded-xl border border-zinc-200 p-4">
          <div className="flex items-center gap-2 text-zinc-500 mb-2">
            <Clock className="h-4 w-4" />
            <span className="text-sm">Created</span>
          </div>
          <p className="text-sm font-medium text-zinc-900">{formatDate(session.created_at)}</p>
        </div>
      </div>

      {/* Token Usage Summary */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl border border-amber-200 p-6 mb-8">
        <h2 className="text-lg font-semibold text-zinc-900 mb-4 flex items-center gap-2">
          <Zap className="h-5 w-5 text-amber-500" />
          Token Usage Summary
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <p className="text-sm text-zinc-500 mb-1">Input Tokens</p>
            <p className="text-2xl font-bold text-zinc-900">
              {session.usage.total_input_tokens.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-sm text-zinc-500 mb-1">Output Tokens</p>
            <p className="text-2xl font-bold text-zinc-900">
              {session.usage.total_output_tokens.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-sm text-zinc-500 mb-1">Total Tokens</p>
            <p className="text-2xl font-bold text-zinc-900">
              {session.usage.total_tokens.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-sm text-zinc-500 mb-1">Credits Used</p>
            <p className="text-2xl font-bold text-amber-600">
              {session.usage.total_credits}
            </p>
          </div>
        </div>
      </div>

      {/* Termination Reason */}
      {session.termination_reason && (
        <div className="bg-zinc-50 rounded-xl border border-zinc-200 p-4 mb-8">
          <p className="text-sm text-zinc-500 mb-1">Termination Reason</p>
          <p className="text-zinc-900">{session.termination_reason}</p>
        </div>
      )}

      {/* Turns List */}
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 mb-4">
          Turn-by-Turn Breakdown ({session.turns.length} turns)
        </h2>
        <div className="space-y-3">
          {session.turns.map((turn) => (
            <TurnCard
              key={turn.id}
              turn={turn}
              isExpanded={expandedTurns.has(turn.id)}
              onToggle={() => toggleTurn(turn.id)}
            />
          ))}
        </div>
        {session.turns.length === 0 && (
          <div className="text-center py-8 text-zinc-500">
            No turns recorded for this session.
          </div>
        )}
      </div>
    </div>
  );
}
