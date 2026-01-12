'use client';

import { useEffect, useRef, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useSessionStore } from '@/store/session';
import { clsx } from 'clsx';
import { Bot, Loader2 } from 'lucide-react';

/**
 * Extract clean content from potentially JSON-wrapped streaming output.
 * Handles partial JSON during streaming gracefully.
 */
function extractStreamContent(content: string): string {
  if (!content) return '';

  let cleaned = content.trim();

  // Remove markdown code fences
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  cleaned = cleaned.trim();

  // If it looks like JSON with an "output" field, try to extract it
  if (cleaned.includes('"output"')) {
    // Try full JSON parse first (for complete content)
    try {
      if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
        const parsed = JSON.parse(cleaned);
        if (parsed.output) {
          return parsed.output;
        }
      }
    } catch {
      // Not complete JSON yet, try regex extraction
    }

    // Try to extract partial output using regex
    const outputMatch = cleaned.match(/"output"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)/);
    if (outputMatch) {
      return outputMatch[1]
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    }
  }

  // If no JSON structure detected, return as-is (might be plain text output)
  // Remove common JSON artifacts if present
  if (cleaned.startsWith('{')) {
    cleaned = cleaned.replace(/^\{\s*"?output"?\s*:\s*"?/, '');
    cleaned = cleaned.replace(/\\n/g, '\n');
    cleaned = cleaned.replace(/\\"/g, '"');
  }

  return cleaned;
}

const agentColors = [
  { bg: 'bg-violet-100', text: 'text-violet-600', border: 'border-violet-200', ring: 'ring-violet-400' },
  { bg: 'bg-blue-100', text: 'text-blue-600', border: 'border-blue-200', ring: 'ring-blue-400' },
  { bg: 'bg-teal-100', text: 'text-teal-600', border: 'border-teal-200', ring: 'ring-teal-400' },
  { bg: 'bg-amber-100', text: 'text-amber-600', border: 'border-amber-200', ring: 'ring-amber-400' },
];

export function LiveAgentPanel() {
  const agentStreams = useSessionStore((state) => state.agentStreams);
  const currentRound = useSessionStore((state) => state.currentRound);
  const maxRounds = useSessionStore((state) => state.maxRounds);
  const isStreaming = useSessionStore((state) => state.isStreaming);
  const scrollRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Get agents in order
  const agents = Object.values(agentStreams);

  // Auto-scroll only the actively generating agent's panel
  useEffect(() => {
    agents.forEach((agent) => {
      // Only auto-scroll panels that are actively generating
      if (agent.status === 'generating') {
        const ref = scrollRefs.current[agent.agent_id];
        if (ref) {
          ref.scrollTop = ref.scrollHeight;
        }
      }
    });
  }, [agents]);

  if (agents.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Progress Header */}
      <Card className="bg-violet-50 border-violet-200">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
                <Loader2 className="w-4 h-4 text-violet-600 animate-spin" />
              </div>
              <div>
                <p className="font-semibold text-violet-900">
                  Round {currentRound} of {maxRounds}
                </p>
                <p className="text-sm text-violet-600">
                  {isStreaming ? 'Agents collaborating...' : 'Complete'}
                </p>
              </div>
            </div>

            {/* Progress dots */}
            <div className="flex items-center gap-1.5">
              {Array.from({ length: maxRounds }).map((_, i) => (
                <div
                  key={i}
                  className={clsx(
                    'w-2.5 h-2.5 rounded-full transition-all',
                    i < currentRound
                      ? 'bg-violet-500'
                      : i === currentRound - 1
                      ? 'bg-violet-500 animate-pulse'
                      : 'bg-violet-200'
                  )}
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Agent Windows */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {agents.map((agent, index) => {
          const color = agentColors[index % agentColors.length];
          const isActive = agent.status === 'generating';
          const isDone = agent.status === 'complete';

          return (
            <Card
              key={agent.agent_id}
              className={clsx(
                'overflow-hidden transition-all duration-300',
                isActive && `ring-2 ${color.ring} ring-offset-2`,
                isDone && 'border-emerald-200'
              )}
            >
              {/* Agent Header */}
              <div className={clsx(
                'px-4 py-3 border-b flex items-center justify-between',
                isDone ? 'bg-emerald-50' : 'bg-zinc-50'
              )}>
                <div className="flex items-center gap-3">
                  <div className={clsx(
                    'w-8 h-8 rounded-lg flex items-center justify-center',
                    isDone ? 'bg-emerald-100' : color.bg
                  )}>
                    {isActive ? (
                      <Loader2 className={clsx('w-4 h-4 animate-spin', color.text)} />
                    ) : isDone ? (
                      <span className="text-xs font-bold text-emerald-600">✓</span>
                    ) : (
                      <Bot className={clsx('w-4 h-4', color.text)} />
                    )}
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-zinc-900">{agent.agent_name}</p>
                    <p className="text-xs text-zinc-500">
                      {agent.status === 'idle' && 'Waiting...'}
                      {agent.status === 'generating' && 'Writing...'}
                      {agent.status === 'complete' && 'Done'}
                    </p>
                  </div>
                </div>

                {/* Score Badge */}
                {agent.evaluation?.overall_score && (
                  <span
                    className={clsx(
                      'px-2.5 py-1 rounded-full text-xs font-semibold',
                      agent.evaluation.overall_score >= 8
                        ? 'bg-emerald-100 text-emerald-700'
                        : agent.evaluation.overall_score >= 6
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-rose-100 text-rose-700'
                    )}
                  >
                    {agent.evaluation.overall_score.toFixed(1)}/10
                  </span>
                )}
              </div>

              {/* Content Area */}
              <div
                ref={(el) => {
                  scrollRefs.current[agent.agent_id] = el;
                }}
                className="h-72 overflow-y-auto p-4 bg-white scrollbar-thin scrollbar-thumb-zinc-300 scrollbar-track-transparent"
                style={{ maxHeight: '288px', overflowY: 'auto' }}
              >
                {agent.status === 'idle' ? (
                  <div className="h-full flex flex-col items-center justify-center text-zinc-400">
                    <Bot className="w-8 h-8 mb-2 opacity-30" />
                    <span className="text-sm">Waiting for turn...</span>
                  </div>
                ) : (
                  <div className="prose prose-sm max-w-none">
                    <pre className="whitespace-pre-wrap text-sm text-zinc-700 font-sans leading-relaxed">
                      {extractStreamContent(agent.content)}
                      {agent.status === 'generating' && (
                        <span className="inline-block w-0.5 h-4 bg-violet-500 animate-pulse ml-0.5 align-middle" />
                      )}
                    </pre>
                  </div>
                )}
              </div>

              {/* Evaluation Details */}
              {agent.status === 'complete' && agent.evaluation && agent.evaluation.criteria_scores.length > 0 && (
                <div className="px-4 py-2 bg-zinc-50 border-t border-zinc-100">
                  <div className="flex flex-wrap gap-2">
                    {agent.evaluation.criteria_scores.map((cs) => (
                      <span
                        key={cs.criterion}
                        className="px-2 py-0.5 bg-white rounded-md border border-zinc-200 text-xs text-zinc-600"
                      >
                        {cs.criterion}: <span className="font-medium">{cs.score}/10</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
