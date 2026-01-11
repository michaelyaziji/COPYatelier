'use client';

import { CheckCircle, AlertCircle, FileText, RotateCcw, StopCircle, PauseCircle, PlayCircle, Copy, Sparkles, Pencil } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSessionStore } from '@/store/session';
import { LiveAgentPanel } from '@/components/LiveAgentPanel';
import { clsx } from 'clsx';
import { useState } from 'react';

export function ResultsView() {
  const { sessionState, isRunning, isStreaming, isPaused, error, reset, stopSession, pauseSession, resumeSession, continueEditing } = useSessionStore();
  const [copied, setCopied] = useState(false);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (error) {
    return (
      <Card className="border-rose-200 bg-rose-50">
        <CardContent className="py-10 text-center">
          <div className="w-16 h-16 rounded-2xl bg-rose-100 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-8 w-8 text-rose-600" />
          </div>
          <h3 className="text-lg font-semibold text-rose-900 mb-2">Something went wrong</h3>
          <p className="text-rose-700 mb-6 max-w-md mx-auto">{error}</p>
          <Button onClick={reset} variant="secondary">
            <RotateCcw className="h-4 w-4" />
            Start Over
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (isRunning) {
    // Show live agent panels when streaming
    if (isStreaming) {
      return (
        <div className="space-y-4">
          <LiveAgentPanel />

          {/* Control Buttons */}
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center justify-center gap-3">
                {isPaused ? (
                  <Button
                    onClick={resumeSession}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    <PlayCircle className="h-4 w-4" />
                    Resume
                  </Button>
                ) : (
                  <Button
                    onClick={pauseSession}
                    variant="secondary"
                    className="bg-amber-100 hover:bg-amber-200 text-amber-700"
                  >
                    <PauseCircle className="h-4 w-4" />
                    Pause
                  </Button>
                )}
                <Button
                  onClick={stopSession}
                  variant="secondary"
                  className="bg-rose-100 hover:bg-rose-200 text-rose-700"
                >
                  <StopCircle className="h-4 w-4" />
                  Stop
                </Button>
              </div>
              <p className="text-xs text-zinc-500 text-center mt-2">
                {isPaused
                  ? 'Session paused. Click Resume to continue.'
                  : 'Actions take effect after current agent finishes'}
              </p>
            </CardContent>
          </Card>
        </div>
      );
    }

    // Fallback for non-streaming mode
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-violet-100 flex items-center justify-center mx-auto mb-4">
            <div className="w-8 h-8 border-3 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
          </div>
          <h3 className="text-lg font-semibold text-zinc-900 mb-2">
            Agents are writing...
          </h3>
          <p className="text-zinc-500 mb-6 max-w-md mx-auto">
            This may take a minute or two depending on the number of agents and rounds.
          </p>
          <Button
            onClick={stopSession}
            variant="secondary"
            className="bg-rose-100 hover:bg-rose-200 text-rose-700"
          >
            <StopCircle className="h-4 w-4" />
            Stop and Get Results
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!sessionState) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-zinc-100 flex items-center justify-center mx-auto mb-4">
            <Sparkles className="h-8 w-8 text-zinc-400" />
          </div>
          <h3 className="text-lg font-semibold text-zinc-900 mb-2">Ready to generate</h3>
          <p className="text-zinc-500">Configure your agents and task, then click &quot;Start Writing&quot;</p>
        </CardContent>
      </Card>
    );
  }

  const { exchange_history, termination_reason, current_round } = sessionState;
  const finalDocument = exchange_history[exchange_history.length - 1]?.working_document || '';
  const wasStopped = termination_reason === 'Stopped by user';

  return (
    <div className="space-y-6">
      {/* Status Header */}
      <Card className={wasStopped ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}>
        <CardContent className="py-4">
          <div className="flex items-center gap-4">
            <div className={clsx(
              'w-12 h-12 rounded-xl flex items-center justify-center',
              wasStopped ? 'bg-amber-100' : 'bg-emerald-100'
            )}>
              {wasStopped ? (
                <StopCircle className="h-6 w-6 text-amber-600" />
              ) : (
                <CheckCircle className="h-6 w-6 text-emerald-600" />
              )}
            </div>
            <div className="flex-1">
              <h3 className={clsx(
                'font-semibold',
                wasStopped ? 'text-amber-900' : 'text-emerald-900'
              )}>
                {wasStopped ? 'Stopped Early' : 'Writing Complete'}
              </h3>
              <p className={clsx(
                'text-sm',
                wasStopped ? 'text-amber-700' : 'text-emerald-700'
              )}>
                {current_round} round{current_round !== 1 ? 's' : ''} • {exchange_history.length} turn{exchange_history.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={continueEditing} variant="primary" size="sm">
                <Pencil className="h-4 w-4" />
                Continue Editing
              </Button>
              <Button onClick={reset} variant="outline" size="sm">
                <RotateCcw className="h-4 w-4" />
                New Session
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Final Document */}
      <Card variant="elevated">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>
            {wasStopped ? 'Latest Draft' : 'Final Document'}
          </CardTitle>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleCopy(finalDocument)}
          >
            <Copy className="h-4 w-4" />
            {copied ? 'Copied!' : 'Copy'}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="bg-zinc-50 rounded-xl p-5 border border-zinc-200 max-h-[500px] overflow-y-auto">
            <div className="prose prose-zinc prose-sm max-w-none">
              <pre className="whitespace-pre-wrap text-sm text-zinc-800 font-sans leading-relaxed">
                {finalDocument}
              </pre>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Exchange History */}
      <Card>
        <CardHeader>
          <CardTitle>Writing Process</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {exchange_history.map((turn, index) => (
            <div
              key={index}
              className={clsx(
                'p-4 rounded-xl border transition-all',
                'hover:shadow-sm'
              )}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={clsx(
                    'w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold',
                    index % 2 === 0
                      ? 'bg-violet-100 text-violet-600'
                      : 'bg-blue-100 text-blue-600'
                  )}>
                    {turn.turn_number}
                  </div>
                  <div>
                    <span className="font-medium text-zinc-900">
                      {turn.agent_name}
                    </span>
                    <span className="text-xs text-zinc-400 ml-2">
                      Round {turn.round_number}
                    </span>
                  </div>
                </div>
                {turn.evaluation && (
                  <span className={clsx(
                    'px-2.5 py-1 rounded-full text-xs font-semibold',
                    turn.evaluation.overall_score >= 8
                      ? 'bg-emerald-100 text-emerald-700'
                      : turn.evaluation.overall_score >= 6
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-rose-100 text-rose-700'
                  )}>
                    {turn.evaluation.overall_score.toFixed(1)}/10
                  </span>
                )}
              </div>

              {/* Preview */}
              <p className="text-sm text-zinc-600 line-clamp-2">
                {turn.working_document.substring(0, 200)}
                {turn.working_document.length > 200 ? '...' : ''}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
