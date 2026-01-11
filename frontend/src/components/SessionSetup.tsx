'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { PenTool, Settings2, FileText, Coins, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { ReferenceMaterials } from '@/components/ReferenceMaterials';
import { PromptBuilder } from '@/components/PromptBuilder';
import { useSessionStore } from '@/store/session';
import { useCreditsStore } from '@/store/credits';
import { clsx } from 'clsx';

export function SessionSetup() {
  const {
    title,
    setTitle,
    initialPrompt,
    setInitialPrompt,
    workingDocument,
    setWorkingDocument,
    maxRounds,
    setMaxRounds,
    scoreThreshold,
    setScoreThreshold,
    workflowRoles,
    getActiveWorkflowAgents,
  } = useSessionStore();

  const { estimateSessionCredits, lastEstimate, balance, fetchBalance } = useCreditsStore();

  // Calculate document word count
  const documentWords = useMemo(() =>
    workingDocument ? workingDocument.split(/\s+/).filter(w => w.length > 0).length : 0,
    [workingDocument]
  );

  // Fetch estimate when relevant parameters change
  useEffect(() => {
    const activeAgents = getActiveWorkflowAgents();
    if (activeAgents.length > 0 && maxRounds > 0) {
      estimateSessionCredits({
        agents: activeAgents.map(a => ({ agent_id: a.agent_id, model: a.model })),
        max_rounds: maxRounds,
        document_words: documentWords,
      });
    }
  }, [workflowRoles, maxRounds, documentWords, getActiveWorkflowAgents, estimateSessionCredits]);

  // Ensure balance is loaded
  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  return (
    <div className="space-y-6">
      {/* Main Task Prompt - Most Important */}
      <Card variant="elevated">
        <CardContent className="py-6">
          <div className="flex items-start gap-4 mb-5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-100 to-violet-50 flex items-center justify-center flex-shrink-0">
              <PenTool className="h-6 w-6 text-violet-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">What would you like to write?</h2>
              <p className="text-sm text-zinc-500 mt-1">
                Describe your writing task in detail. The more specific, the better the results.
              </p>
            </div>
          </div>

          {/* Prompt Builder */}
          <PromptBuilder onGenerate={setInitialPrompt} />

          <Textarea
            value={initialPrompt}
            onChange={(e) => setInitialPrompt(e.target.value)}
            placeholder="Example: Write a compelling 800-word blog post about the future of remote work. Include statistics, address common concerns, and end with actionable tips for companies transitioning to hybrid models."
            rows={5}
            className="text-base"
          />
        </CardContent>
      </Card>

      {/* Session Settings */}
      <Card>
        <CardContent className="py-5">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-lg bg-zinc-100 flex items-center justify-center">
              <Settings2 className="h-5 w-5 text-zinc-600" />
            </div>
            <div>
              <h3 className="font-semibold text-zinc-900">Session Settings</h3>
              <p className="text-sm text-zinc-500">Configure how agents collaborate</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              label="Session Name"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My Writing Project"
            />

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                Rounds
              </label>
              <input
                type="number"
                min={1}
                max={10}
                value={maxRounds}
                onChange={(e) => setMaxRounds(parseInt(e.target.value) || 3)}
                className="w-full px-4 py-2.5 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
              />
              <p className="mt-1 text-xs text-zinc-400">
                Refinement cycles
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                Target Score
              </label>
              <input
                type="number"
                min={1}
                max={10}
                step={0.5}
                value={scoreThreshold || ''}
                onChange={(e) =>
                  setScoreThreshold(
                    e.target.value ? parseFloat(e.target.value) : null
                  )
                }
                placeholder="Optional"
                className="w-full px-4 py-2.5 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
              />
              <p className="mt-1 text-xs text-zinc-400">
                Stop when reached
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Credit Estimate Card */}
      {lastEstimate && (
        <Card className={clsx(
          'border-2',
          lastEstimate.has_sufficient_credits
            ? 'border-emerald-200 bg-emerald-50/50'
            : 'border-red-200 bg-red-50/50'
        )}>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {lastEstimate.has_sufficient_credits ? (
                  <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <Coins className="h-5 w-5 text-emerald-600" />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                    <AlertCircle className="h-5 w-5 text-red-600" />
                  </div>
                )}
                <div>
                  <p className={clsx(
                    'font-medium',
                    lastEstimate.has_sufficient_credits ? 'text-emerald-900' : 'text-red-900'
                  )}>
                    Estimated Cost: {lastEstimate.estimated_credits} credits
                  </p>
                  <p className={clsx(
                    'text-sm',
                    lastEstimate.has_sufficient_credits ? 'text-emerald-700' : 'text-red-700'
                  )}>
                    Your balance: {lastEstimate.current_balance} credits
                    {!lastEstimate.has_sufficient_credits && (
                      <span className="ml-1">
                        (need {lastEstimate.estimated_credits - lastEstimate.current_balance} more)
                      </span>
                    )}
                  </p>
                </div>
              </div>
              {!lastEstimate.has_sufficient_credits && (
                <Link
                  href="/pricing"
                  className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors"
                >
                  Get More Credits
                </Link>
              )}
            </div>
            <p className="text-xs text-zinc-400 mt-3">
              * Estimate based on maximum rounds. Actual cost may be lower if session ends early.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Reference Materials */}
      <ReferenceMaterials />

      {/* Initial Document (optional) */}
      <Card>
        <CardContent className="py-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-zinc-100 flex items-center justify-center">
              <FileText className="h-5 w-5 text-zinc-600" />
            </div>
            <div>
              <h3 className="font-semibold text-zinc-900">Starting Document</h3>
              <p className="text-sm text-zinc-500">Optional - paste existing text to refine</p>
            </div>
          </div>

          <Textarea
            value={workingDocument}
            onChange={(e) => setWorkingDocument(e.target.value)}
            placeholder="Paste existing text here if you want agents to revise it, or leave blank to start fresh..."
            rows={4}
          />
        </CardContent>
      </Card>
    </div>
  );
}
