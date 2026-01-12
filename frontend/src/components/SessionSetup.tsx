'use client';

import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { PenTool, Settings2, FileText, AlertCircle, Upload, X, ArrowRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ReferenceMaterials } from '@/components/ReferenceMaterials';
import { PromptBuilder } from '@/components/PromptBuilder';
import { useSessionStore } from '@/store/session';
import { useCreditsStore } from '@/store/credits';
import { API_BASE } from '@/lib/api';
import { clsx } from 'clsx';

interface SessionSetupProps {
  onNext?: () => void;
}

export function SessionSetup({ onNext }: SessionSetupProps) {
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

  // Starting document file upload state
  const [isDraggingDoc, setIsDraggingDoc] = useState(false);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [docUploadError, setDocUploadError] = useState<string | null>(null);
  const docFileInputRef = useRef<HTMLInputElement>(null);

  // Process uploaded file for starting document
  const processStartingDocument = useCallback(async (file: File) => {
    const allowedExtensions = ['.docx', '.pdf', '.txt', '.md'];
    if (!allowedExtensions.some((ext) => file.name.toLowerCase().endsWith(ext))) {
      setDocUploadError(`Invalid file type. Allowed: Word, PDF, Text, Markdown`);
      return;
    }

    setIsUploadingDoc(true);
    setDocUploadError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API_BASE}/files/parse`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Failed to parse file');
      }

      const result = await response.json();
      setWorkingDocument(result.content);
      setUploadedFileName(result.filename);
    } catch (err) {
      setDocUploadError(err instanceof Error ? err.message : 'Failed to upload file');
    } finally {
      setIsUploadingDoc(false);
    }
  }, [setWorkingDocument]);

  const handleDocFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processStartingDocument(file);
    }
    if (docFileInputRef.current) {
      docFileInputRef.current.value = '';
    }
  };

  const handleDocDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingDoc(true);
  }, []);

  const handleDocDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setIsDraggingDoc(false);
    }
  }, []);

  const handleDocDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDocDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingDoc(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      await processStartingDocument(file);
    }
  }, [processStartingDocument]);

  const clearUploadedDocument = () => {
    setWorkingDocument('');
    setUploadedFileName(null);
    setDocUploadError(null);
  };

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
      {/* Intro Explainer */}
      <Card variant="elevated">
        <CardContent className="py-6">
          <h2 className="text-xl font-semibold text-zinc-900 mb-3">Tell us about your writing project</h2>
          <p className="text-sm text-zinc-600 leading-relaxed mb-4">
            Describe what you want to create, set your preferences, and optionally provide reference materials
            or an existing draft to improve. The more context you provide, the better your results will be.
          </p>
          <p className="text-xs text-zinc-400">
            All fields except the main prompt are optional — use what's helpful for your project.
          </p>
        </CardContent>
      </Card>

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
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-zinc-100 flex items-center justify-center">
              <Settings2 className="h-5 w-5 text-zinc-600" />
            </div>
            <div>
              <h3 className="font-semibold text-zinc-900">How polished should it be?</h3>
              <p className="text-sm text-zinc-500">More rounds = more refined output (uses more credits)</p>
            </div>
          </div>
          <p className="text-xs text-zinc-400 mb-5 ml-[52px]">
            Each round: Writer drafts → Editors review → Writer revises based on feedback
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              label="Session Name"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My Writing Project"
            />

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-2">
                Number of Rounds
              </label>
              <input
                type="number"
                min={1}
                max={10}
                value={maxRounds}
                onChange={(e) => setMaxRounds(parseInt(e.target.value) || 3)}
                className="w-full px-4 py-3 border-2 border-zinc-200 rounded-xl text-sm bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent focus:bg-white hover:border-violet-300 hover:bg-white transition-all"
              />
              <p className="mt-1.5 text-xs text-zinc-400">
                More rounds = more polished (uses more credits)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-2">
                Target Quality (1-10)
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
                className="w-full px-4 py-3 border-2 border-zinc-200 rounded-xl text-sm bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent focus:bg-white hover:border-violet-300 hover:bg-white transition-all placeholder:text-zinc-400"
              />
              <p className="mt-1.5 text-xs text-zinc-400">
                Stop early when the synthesizing editor scores this or higher
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Insufficient Credits Warning - only show when there's a problem */}
      {lastEstimate && !lastEstimate.has_sufficient_credits && (
        <div className="flex items-center justify-between p-4 bg-red-50 border border-red-200 rounded-xl">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <p className="text-sm text-red-700">
              This session needs <span className="font-medium">{lastEstimate.estimated_credits}</span> credits.
              You have <span className="font-medium">{lastEstimate.current_balance}</span>.
            </p>
          </div>
          <Link
            href="/pricing"
            className="px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
          >
            Get Credits
          </Link>
        </div>
      )}

      {/* Reference Materials */}
      <ReferenceMaterials />

      {/* Initial Document (optional) */}
      <Card>
        <CardContent className="py-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-zinc-100 flex items-center justify-center">
                <FileText className="h-5 w-5 text-zinc-600" />
              </div>
              <div>
                <h3 className="font-semibold text-zinc-900">Do you have a draft to improve?</h3>
                <p className="text-sm text-zinc-500">Optional - upload or paste existing text to refine</p>
              </div>
            </div>
            {uploadedFileName && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg">
                <FileText className="h-4 w-4 text-blue-600" />
                <span className="text-sm text-blue-700 font-medium">{uploadedFileName}</span>
                <button
                  onClick={clearUploadedDocument}
                  className="p-0.5 hover:bg-blue-100 rounded transition-colors"
                >
                  <X className="h-4 w-4 text-blue-500" />
                </button>
              </div>
            )}
          </div>

          {/* Upload Zone - shown when no document */}
          {!workingDocument && (
            <div
              className={clsx(
                'border-2 border-dashed rounded-xl p-5 text-center transition-all duration-200 cursor-pointer mb-3',
                isDraggingDoc
                  ? 'border-blue-500 bg-blue-100 scale-[1.01]'
                  : isUploadingDoc
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-zinc-200 hover:border-blue-300 hover:bg-blue-50/30'
              )}
              onClick={() => docFileInputRef.current?.click()}
              onDragEnter={handleDocDragEnter}
              onDragLeave={handleDocDragLeave}
              onDragOver={handleDocDragOver}
              onDrop={handleDocDrop}
            >
              <input
                ref={docFileInputRef}
                type="file"
                accept=".docx,.pdf,.txt,.md"
                onChange={handleDocFileUpload}
                className="hidden"
              />
              <div className={clsx(
                "w-10 h-10 rounded-lg flex items-center justify-center mx-auto mb-2 transition-colors",
                isDraggingDoc ? "bg-blue-200" : "bg-zinc-100"
              )}>
                <Upload className={clsx(
                  "h-5 w-5 transition-colors",
                  isDraggingDoc ? "text-blue-600" : isUploadingDoc ? "text-blue-500" : "text-zinc-400"
                )} />
              </div>
              <p className="text-sm text-zinc-600">
                {isDraggingDoc ? (
                  <span className="text-blue-600 font-medium">Drop file here...</span>
                ) : isUploadingDoc ? (
                  <span className="text-blue-600">Processing...</span>
                ) : (
                  <>
                    <span className="font-medium text-blue-600">Click to upload</span>{' '}
                    or drag and drop
                  </>
                )}
              </p>
              <p className="text-xs text-zinc-400 mt-1">
                Word, PDF, Text, or Markdown
              </p>
            </div>
          )}

          {/* Error Message */}
          {docUploadError && (
            <div className="mb-3 bg-rose-50 border border-rose-200 rounded-lg p-3 text-sm text-rose-700">
              {docUploadError}
            </div>
          )}

          {/* Textarea - always visible for editing */}
          <Textarea
            value={workingDocument}
            onChange={(e) => {
              setWorkingDocument(e.target.value);
              if (!e.target.value) setUploadedFileName(null);
            }}
            placeholder="Paste existing text here if you want agents to revise it, or leave blank to start fresh..."
            rows={workingDocument ? 6 : 3}
          />
          {workingDocument && (
            <p className="mt-2 text-xs text-zinc-400">
              {documentWords.toLocaleString()} words
            </p>
          )}
        </CardContent>
      </Card>

      {/* Next Step Button */}
      {onNext && (
        <div className="flex justify-end pt-4">
          <Button
            size="lg"
            onClick={onNext}
            disabled={!initialPrompt.trim()}
            className="gap-2"
          >
            Next: Configure Workflow
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
