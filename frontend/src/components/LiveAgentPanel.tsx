'use client';

import { useEffect, useRef, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useSessionStore } from '@/store/session';
import { clsx } from 'clsx';
import { Bot, Loader2 } from 'lucide-react';

/**
 * Extract and format content from potentially JSON-wrapped streaming output.
 *
 * Strategy:
 * 1. If there's real prose BEFORE a JSON block, return that prose (includes reasoning)
 * 2. If the entire content is a JSON block, extract and format ALL fields (thinking, reasoning, output, etc.)
 */
function extractStreamContent(content: string): string {
  if (!content) return '';

  let cleaned = content.trim();

  // Check if there's content BEFORE a ```json block
  const jsonBlockStart = cleaned.indexOf('```json');
  if (jsonBlockStart > 0) {
    // There's something before the JSON - check if it's real prose (not just whitespace/fences)
    const beforeJson = cleaned.slice(0, jsonBlockStart).trim();
    if (beforeJson && !beforeJson.match(/^`*$/)) {
      return beforeJson;
    }
  }

  // Check if content starts with ```json - if so, it's a JSON code block
  if (cleaned.startsWith('```json') || cleaned.startsWith('```\n{') || cleaned.startsWith('{')) {
    // Strip code fences
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    cleaned = cleaned.trim();

    // Try full JSON parse to extract ALL fields (not just output)
    try {
      if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
        const parsed = JSON.parse(cleaned);
        const parts: string[] = [];

        // Add thinking/reasoning if present
        if (parsed.thinking) {
          parts.push(`**Thinking:**\n${parsed.thinking}`);
        }
        if (parsed.reasoning) {
          parts.push(`**Reasoning:**\n${parsed.reasoning}`);
        }
        if (parsed.analysis) {
          parts.push(`**Analysis:**\n${parsed.analysis}`);
        }
        if (parsed.comments) {
          parts.push(`**Comments:**\n${parsed.comments}`);
        }
        if (parsed.feedback) {
          parts.push(`**Feedback:**\n${parsed.feedback}`);
        }
        if (parsed.suggestions) {
          parts.push(`**Suggestions:**\n${parsed.suggestions}`);
        }
        if (parsed.changes) {
          parts.push(`**Changes Made:**\n${parsed.changes}`);
        }

        // Add the output
        if (parsed.output) {
          parts.push(`**Output:**\n${parsed.output}`);
        }

        if (parts.length > 0) {
          return parts.join('\n\n');
        }
      }
    } catch {
      // Not complete JSON yet, try regex extraction for streaming
    }

    // Regex extraction for streaming (partial JSON)
    const fieldPatterns = [
      { key: 'thinking', label: 'Thinking' },
      { key: 'reasoning', label: 'Reasoning' },
      { key: 'analysis', label: 'Analysis' },
      { key: 'comments', label: 'Comments' },
      { key: 'feedback', label: 'Feedback' },
      { key: 'suggestions', label: 'Suggestions' },
      { key: 'changes', label: 'Changes Made' },
      { key: 'output', label: 'Output' },
    ];

    const sections: string[] = [];
    for (const { key, label } of fieldPatterns) {
      // Match complete or partial field values
      const regex = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)(?:"|$)`, 's');
      const match = cleaned.match(regex);
      if (match) {
        const value = match[1]
          .replace(/\\n/g, '\n')
          .replace(/\\t/g, '\t')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\')
          .trim();
        if (value) {
          sections.push(`**${label}:**\n${value}`);
        }
      }
    }

    if (sections.length > 0) {
      return sections.join('\n\n');
    }

    // Fallback: clean up any remaining JSON artifacts
    if (cleaned.startsWith('{')) {
      cleaned = cleaned.replace(/^\{\s*/, '');
      cleaned = cleaned.replace(/\\n/g, '\n');
      cleaned = cleaned.replace(/\\"/g, '"');
    }

    return cleaned;
  }

  // Content doesn't start with JSON - check for JSON at the end
  const rawJsonMatch = cleaned.match(/\n\{\s*"(?:output|evaluation)"/);
  if (rawJsonMatch && rawJsonMatch.index && rawJsonMatch.index > 0) {
    const beforeJson = cleaned.slice(0, rawJsonMatch.index).trim();
    if (beforeJson) {
      return beforeJson;
    }
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
          const isError = agent.status === 'error';

          return (
            <Card
              key={agent.agent_id}
              className={clsx(
                'overflow-hidden transition-all duration-300',
                isActive && `ring-2 ${color.ring} ring-offset-2`,
                isDone && 'border-emerald-200',
                isError && 'border-red-300 ring-2 ring-red-200'
              )}
            >
              {/* Agent Header */}
              <div className={clsx(
                'px-4 py-3 border-b flex items-center justify-between',
                isDone ? 'bg-emerald-50' : isError ? 'bg-red-50' : 'bg-zinc-50'
              )}>
                <div className="flex items-center gap-3">
                  <div className={clsx(
                    'w-8 h-8 rounded-lg flex items-center justify-center',
                    isDone ? 'bg-emerald-100' : isError ? 'bg-red-100' : color.bg
                  )}>
                    {isActive ? (
                      <Loader2 className={clsx('w-4 h-4 animate-spin', color.text)} />
                    ) : isDone ? (
                      <span className="text-xs font-bold text-emerald-600">✓</span>
                    ) : isError ? (
                      <span className="text-xs font-bold text-red-600">!</span>
                    ) : (
                      <Bot className={clsx('w-4 h-4', color.text)} />
                    )}
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-zinc-900">{agent.agent_name}</p>
                    <p className={clsx('text-xs', isError ? 'text-red-600' : agent.errorMessage ? 'text-amber-600' : 'text-zinc-500')}>
                      {agent.status === 'idle' && 'Waiting...'}
                      {agent.status === 'generating' && (agent.errorMessage || 'Writing...')}
                      {agent.status === 'complete' && 'Done'}
                      {agent.status === 'error' && 'Error'}
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
                ) : agent.status === 'error' ? (
                  <div className="h-full flex flex-col items-center justify-center text-red-500 p-4">
                    <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-3">
                      <span className="text-2xl">!</span>
                    </div>
                    <p className="text-sm text-center font-medium mb-2">Generation Failed</p>
                    <p className="text-xs text-center text-red-400 max-w-xs">
                      {agent.errorMessage || 'The AI service encountered an error. Please try again or switch to a different model.'}
                    </p>
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
