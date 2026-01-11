'use client';

import { CheckCircle, AlertCircle, FileText, RotateCcw, StopCircle, PauseCircle, PlayCircle, Copy, Sparkles, Pencil, Download, Mail, X, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSessionStore } from '@/store/session';
import { LiveAgentPanel } from '@/components/LiveAgentPanel';
import { downloadAsWord, extractCleanContent, formatAgentResponse } from '@/lib/export';
import { api } from '@/lib/api';
import { clsx } from 'clsx';
import { useState, useEffect } from 'react';

export function ResultsView() {
  const { sessionState, isRunning, isStreaming, isPaused, error, reset, stopSession, pauseSession, resumeSession, continueEditing } = useSessionStore();
  const [copied, setCopied] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailAddress, setEmailAddress] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [showProcess, setShowProcess] = useState(false);
  const [expandedTurns, setExpandedTurns] = useState<Set<number>>(new Set());

  // Fetch user email on mount
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const user = await api.getCurrentUser();
        setUserEmail(user.email);
        setEmailAddress(user.email);
      } catch {
        // Ignore - user may not be logged in
      }
    };
    fetchUser();
  }, []);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleTurn = (index: number) => {
    setExpandedTurns(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleDownloadWord = async () => {
    if (!sessionState) return;
    const title = sessionState.config.title || 'document';
    const filename = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const rawDoc = sessionState.exchange_history[sessionState.exchange_history.length - 1]?.working_document || '';
    await downloadAsWord(rawDoc, filename);
  };

  const handleSendEmail = async () => {
    if (!sessionState || !emailAddress.trim()) return;

    setSendingEmail(true);
    setEmailError(null);

    try {
      const rawDoc = sessionState.exchange_history[sessionState.exchange_history.length - 1]?.working_document || '';
      await api.emailDocument(sessionState.config.session_id, emailAddress.trim(), rawDoc);
      setEmailSent(true);
      setTimeout(() => {
        setShowEmailModal(false);
        setEmailSent(false);
      }, 2000);
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Failed to send email');
    } finally {
      setSendingEmail(false);
    }
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
  const rawDocument = exchange_history[exchange_history.length - 1]?.working_document || '';
  const finalDocument = extractCleanContent(rawDocument);
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

      {/* Writing Process - Collapsible */}
      <Card>
        <CardHeader
          className="cursor-pointer select-none hover:bg-zinc-50 transition-colors rounded-t-xl"
          onClick={() => setShowProcess(!showProcess)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {showProcess ? (
                <ChevronDown className="h-5 w-5 text-zinc-500" />
              ) : (
                <ChevronRight className="h-5 w-5 text-zinc-500" />
              )}
              <CardTitle>Writing Process</CardTitle>
              <span className="text-sm text-zinc-500 font-normal">
                ({exchange_history.length} step{exchange_history.length !== 1 ? 's' : ''})
              </span>
            </div>
          </div>
        </CardHeader>
        {showProcess && (
          <CardContent className="space-y-3 pt-0">
            {exchange_history.map((turn, index) => {
              const isExpanded = expandedTurns.has(index);
              // Use raw_response if available, otherwise fall back to working_document
              const rawContent = turn.raw_response || turn.working_document;
              const formattedContent = formatAgentResponse(rawContent);

              return (
                <div
                  key={index}
                  className="rounded-xl border transition-all"
                >
                  {/* Turn Header - Clickable */}
                  <div
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-zinc-50 transition-colors"
                    onClick={() => toggleTurn(index)}
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-zinc-400" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-zinc-400" />
                      )}
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

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-0">
                      <div className="bg-zinc-50 rounded-lg p-4 border border-zinc-200 max-h-[400px] overflow-y-auto">
                        <div className="prose prose-sm prose-zinc max-w-none">
                          <pre className="whitespace-pre-wrap text-sm text-zinc-700 font-sans leading-relaxed">
                            {formattedContent}
                          </pre>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        )}
      </Card>

      {/* Final Document */}
      <Card variant="elevated">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>
            {wasStopped ? 'Latest Draft' : 'Final Document'}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => handleCopy(finalDocument)}
              className="bg-zinc-700 hover:bg-zinc-800 text-white"
            >
              <Copy className="h-4 w-4" />
              {copied ? 'Copied!' : 'Copy'}
            </Button>
            <Button
              size="sm"
              onClick={handleDownloadWord}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Download className="h-4 w-4" />
              Word
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEmailAddress(userEmail);
                setEmailError(null);
                setShowEmailModal(true);
              }}
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              <Mail className="h-4 w-4" />
              Email
            </Button>
          </div>
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

      {/* Email Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowEmailModal(false)}
          />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
            <button
              onClick={() => setShowEmailModal(false)}
              className="absolute top-4 right-4 p-1 rounded-lg hover:bg-zinc-100 transition-colors"
            >
              <X className="h-5 w-5 text-zinc-500" />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
                <Mail className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <h3 className="font-semibold text-zinc-900">Email Document</h3>
                <p className="text-sm text-zinc-500">Send the document to an email address</p>
              </div>
            </div>

            {emailSent ? (
              <div className="text-center py-6">
                <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle className="h-6 w-6 text-emerald-600" />
                </div>
                <p className="text-emerald-700 font-medium">Email sent successfully!</p>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={emailAddress}
                      onChange={(e) => setEmailAddress(e.target.value)}
                      placeholder="Enter email address"
                      className="w-full px-4 py-2.5 rounded-lg border border-zinc-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none transition-all"
                    />
                  </div>

                  {emailError && (
                    <div className="p-3 rounded-lg bg-rose-50 border border-rose-200">
                      <p className="text-sm text-rose-700">{emailError}</p>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-3 mt-6">
                  <Button
                    variant="secondary"
                    onClick={() => setShowEmailModal(false)}
                    disabled={sendingEmail}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSendEmail}
                    disabled={sendingEmail || !emailAddress.trim()}
                  >
                    {sendingEmail ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Mail className="h-4 w-4" />
                        Send Email
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
