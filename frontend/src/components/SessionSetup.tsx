'use client';

import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { PenTool, FileText, AlertCircle, Upload, X, ArrowRight, AlertTriangle } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ReferenceMaterials } from '@/components/ReferenceMaterials';
import { PromptBuilder } from '@/components/PromptBuilder';
import { Select } from '@/components/ui/select';
import { useSessionStore } from '@/store/session';
import { DRAFT_TREATMENT_OPTIONS, DraftTreatmentType } from '@/types/presets';
import { useCreditsStore } from '@/store/credits';
import { API_BASE } from '@/lib/api';
import { clsx } from 'clsx';

interface SessionSetupProps {
  onNext?: () => void;
}

export function SessionSetup({ onNext }: SessionSetupProps) {
  const {
    initialPrompt,
    setInitialPrompt,
    workingDocument,
    setWorkingDocument,
    referenceDocuments,
    maxRounds,
    workflowRoles,
    getActiveWorkflowAgents,
    presetSelections,
    setPresetSelections,
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

  // Calculate total word count including reference documents
  const referenceWords = useMemo(() => {
    return Object.values(referenceDocuments).reduce((total, content) => {
      return total + content.split(/\s+/).filter(w => w.length > 0).length;
    }, 0);
  }, [referenceDocuments]);

  const totalWords = documentWords + referenceWords;
  const WORD_WARNING_THRESHOLD = 8000;
  const isLongDocument = totalWords > WORD_WARNING_THRESHOLD;

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
      <Card variant="elevated" className="border-2 border-violet-200 bg-gradient-to-b from-violet-50 to-white">
        <CardContent className="py-8 text-center">
          <h2 className="text-2xl font-bold text-zinc-900 mb-4">Tell us about your writing project</h2>
          <p className="text-sm text-zinc-600 leading-relaxed mb-6 max-w-2xl mx-auto">
            The more context you provide, the better your results will be.
          </p>
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm text-zinc-700">
            <span><span className="font-semibold text-violet-600">i.</span> Describe your task</span>
            <span><span className="font-semibold text-violet-600">ii.</span> Upload a draft <span className="text-zinc-500">(optional)</span></span>
            <span><span className="font-semibold text-violet-600">iii.</span> Add references <span className="text-zinc-500">(optional)</span></span>
          </div>
        </CardContent>
      </Card>

      {/* Main Task Prompt - Most Important */}
      <Card variant="elevated" className="border border-zinc-200">
        <CardContent className="py-6">
          <div className="flex items-start gap-4 mb-5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-100 to-violet-50 flex items-center justify-center flex-shrink-0">
              <PenTool className="h-6 w-6 text-violet-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900"><span className="text-violet-600">i.</span> What would you like to write?</h2>
              <p className="text-sm text-zinc-700 mt-1">
                What do you want to write? Include who it's for and how it will be used.
              </p>
            </div>
          </div>

          <Textarea
            value={initialPrompt}
            onChange={(e) => setInitialPrompt(e.target.value)}
            placeholder="Example: A board memo summarizing Q1 results for investors who haven't seen our product roadmap. Professional tone, confident but not defensive."
            rows={5}
            className="text-base !border-2 !border-violet-300 focus:!border-violet-500 mb-5"
          />

          {/* Prompt Builder */}
          <PromptBuilder onGenerate={setInitialPrompt} />
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

      {/* Long Document Warning */}
      {isLongDocument && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">
              Large document detected ({totalWords.toLocaleString()} words)
            </p>
            <p className="text-sm text-amber-700 mt-1">
              For documents over {WORD_WARNING_THRESHOLD.toLocaleString()} words, we recommend using Claude or Gemini models
              which have larger context windows. GPT-4o may truncate very long content.
            </p>
          </div>
        </div>
      )}

      {/* Initial Document (optional) */}
      <Card className="border border-zinc-200">
        <CardContent className="py-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-zinc-100 flex items-center justify-center">
                <FileText className="h-5 w-5 text-zinc-600" />
              </div>
              <div>
                <h3 className="font-semibold text-zinc-900"><span className="text-violet-600">ii.</span> Do you have a draft to improve?</h3>
                <p className="text-sm text-zinc-700">Optional - upload or paste existing text to refine</p>
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
                    <span className="font-medium text-violet-600">Click to upload</span>{' '}
                    or drag and drop
                  </>
                )}
              </p>
              <p className="text-xs text-zinc-500 mt-1">
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
            <p className="mt-2 text-xs text-zinc-600">
              {documentWords.toLocaleString()} words
            </p>
          )}

          {/* Draft Treatment Selector */}
          <div className="mt-5">
            <Select
              label="How should we treat your draft?"
              value={presetSelections.draftTreatment}
              onValueChange={(value) => setPresetSelections({ ...presetSelections, draftTreatment: value as DraftTreatmentType })}
              options={DRAFT_TREATMENT_OPTIONS}
              placeholder="Select treatment..."
            />
            <p className="mt-1.5 text-xs text-zinc-600">
              Applies when you upload or paste a draft above
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Reference Materials */}
      <ReferenceMaterials />

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
