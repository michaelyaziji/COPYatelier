'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Sparkles, AlertTriangle, ChevronRight, Zap, Settings, PanelLeftClose, PanelLeft, CreditCard, AlertCircle, Shield } from 'lucide-react';
import { UserButton, SignedIn, SignedOut } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { WorkflowPanel } from '@/components/WorkflowPanel';
import { SessionSetup } from '@/components/SessionSetup';
import { ResultsView } from '@/components/ResultsView';
import { SessionsSidebar } from '@/components/SessionsSidebar';
import { CreditDisplay } from '@/components/CreditDisplay';
import { LandingPage } from '@/components/LandingPage';
import { useSessionStore } from '@/store/session';
import { useCreditsStore } from '@/store/credits';
import { api } from '@/lib/api';
import { clsx } from 'clsx';

type Step = 1 | 2 | 3;

export default function Home() {
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [providers, setProviders] = useState<Record<string, boolean>>({});
  const [backendConnected, setBackendConnected] = useState<boolean | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const {
    workflowRoles,
    initialPrompt,
    workingDocument,
    isRunning,
    isStreaming,
    sessionState,
    error,
    createAndStartStreamingSession,
    loadSession,
    reset,
  } = useSessionStore();

  // Clear error when navigating away from step 3
  const handleStepChange = (stepNumber: number) => {
    if (!isRunning) {
      if (stepNumber !== 3 && error) {
        reset(); // Clear error by resetting
      }
      setCurrentStep(stepNumber as Step);
    }
  };

  const activeRoles = workflowRoles.filter((r) => r.isActive);

  // Check backend connection on mount
  useEffect(() => {
    const checkBackend = async () => {
      try {
        const health = await api.healthCheck();
        setBackendConnected(true);
        setProviders(health.providers);
      } catch {
        setBackendConnected(false);
      }
    };
    checkBackend();
  }, []);

  // Check admin status
  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const user = await api.getCurrentUser();
        setIsAdmin(user.is_admin);
      } catch {
        setIsAdmin(false);
      }
    };
    if (backendConnected) {
      checkAdmin();
    }
  }, [backendConnected]);

  // Switch to results when session starts or completes
  useEffect(() => {
    if (isRunning || isStreaming) {
      setCurrentStep(3);
    } else if (sessionState && !isRunning) {
      setCurrentStep(3);
    }
  }, [sessionState, isRunning, isStreaming]);

  // Navigate to step 1 when "Continue Editing" is clicked (workingDocument has content but no session)
  useEffect(() => {
    if (workingDocument && !sessionState && !initialPrompt && !isRunning) {
      setCurrentStep(1);
    }
  }, [workingDocument, sessionState, initialPrompt, isRunning]);

  const { refreshBalance, lastEstimate } = useCreditsStore();

  const handleStart = async () => {
    setCurrentStep(3);
    await createAndStartStreamingSession();
    // Refresh credit balance after session completes
    refreshBalance();
  };

  const handleSelectSession = async (sessionId: string) => {
    await loadSession(sessionId);
    setCurrentStep(3);
  };

  const handleNewSession = () => {
    reset();
    setCurrentStep(1);
  };

  // Check if user has sufficient credits (default to true if no estimate yet)
  const hasSufficientCredits = lastEstimate?.has_sufficient_credits ?? true;

  const canStart =
    backendConnected &&
    activeRoles.length > 0 &&
    initialPrompt.trim().length > 0 &&
    !isRunning &&
    hasSufficientCredits;

  // Reason why start is disabled (for tooltip)
  const startDisabledReason = useMemo(() => {
    if (!backendConnected) return 'Backend not connected';
    if (activeRoles.length === 0) return 'No agents configured';
    if (!initialPrompt.trim()) return 'Enter a prompt first';
    if (isRunning) return 'Session already running';
    if (lastEstimate && !lastEstimate.has_sufficient_credits) {
      return `Insufficient credits (need ${lastEstimate.estimated_credits}, have ${lastEstimate.current_balance})`;
    }
    return null;
  }, [backendConnected, activeRoles, initialPrompt, isRunning, lastEstimate]);

  const steps = [
    {
      number: 1,
      title: 'Define Task',
      description: 'Describe what to write',
      complete: initialPrompt.trim().length > 0
    },
    {
      number: 2,
      title: 'Configure Workflow',
      description: 'Set up your editorial team',
      complete: activeRoles.length > 0
    },
    {
      number: 3,
      title: 'Generate',
      description: 'Watch agents collaborate',
      complete: sessionState !== null && !isRunning
    },
  ];

  return (
    <>
      {/* Landing page for signed-out users */}
      <SignedOut>
        <LandingPage />
      </SignedOut>

      {/* Main app for signed-in users */}
      <SignedIn>
        <div className="min-h-screen">
          {/* Header */}
          <header className="bg-white/80 backdrop-blur-md border-b border-zinc-200/50 sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-6 py-4">
              <div className="flex items-center justify-between">
                {/* Logo */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-violet-500 flex items-center justify-center shadow-lg shadow-violet-500/25">
                    <Sparkles className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-zinc-900">Atelier</h1>
                    <p className="text-xs text-zinc-500">AI Writing Studio</p>
                  </div>
                </div>

                {/* Provider Pills + Credits */}
                <div className="hidden md:flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    {backendConnected && Object.entries(providers).map(([name, active]) => (
                      <span
                        key={name}
                        className={clsx(
                          'px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                          active
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-zinc-100 text-zinc-400'
                        )}
                      >
                        {active && <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5" />}
                        {name}
                      </span>
                    ))}
                  </div>

                  {/* Credit Balance Display */}
                  <CreditDisplay />
                </div>

                {/* Start Button + Auth */}
                <div className="flex items-center gap-4">
                  <Button
                    onClick={handleStart}
                    disabled={!canStart}
                    size="lg"
                    className="min-w-[140px]"
                    title={startDisabledReason || undefined}
                  >
                    {isRunning ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                        Running...
                      </>
                    ) : lastEstimate && !lastEstimate.has_sufficient_credits ? (
                      <>
                        <AlertCircle className="h-4 w-4" />
                        Need Credits
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4" />
                        Start Writing
                      </>
                    )}
                  </Button>
                  <Link
                    href="/pricing"
                    className="p-2 rounded-lg text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
                    title="Pricing"
                  >
                    <CreditCard className="h-5 w-5" />
                  </Link>
                  <Link
                    href="/settings"
                    className="p-2 rounded-lg text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
                    title="Settings"
                  >
                    <Settings className="h-5 w-5" />
                  </Link>
                  {isAdmin && (
                    <Link
                      href="/admin"
                      className="p-2 rounded-lg text-violet-500 hover:text-violet-700 hover:bg-violet-50 transition-colors"
                      title="Admin Dashboard"
                    >
                      <Shield className="h-5 w-5" />
                    </Link>
                  )}
                  <UserButton
                    afterSignOutUrl="/"
                    appearance={{
                      elements: {
                        avatarBox: "w-9 h-9",
                      },
                    }}
                  />
                </div>
              </div>
            </div>
          </header>

      {/* Backend Warning */}
      {backendConnected === false && (
        <div className="bg-amber-50 border-b border-amber-200/50">
          <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-amber-800">
                <strong>Backend not running.</strong> Start it with:
              </p>
              <code className="text-xs bg-amber-100/50 px-2 py-1 rounded-md mt-1 inline-block font-mono">
                cd atelier/backend && source venv/bin/activate && uvicorn app.main:app --reload
              </code>
            </div>
          </div>
        </div>
      )}

          {/* Main Content with Optional Sidebar */}
          <div className="flex min-h-[calc(100vh-73px)]">
            {/* Sessions Sidebar */}
            {showSidebar && (
              <SessionsSidebar
                onSelectSession={handleSelectSession}
                onNewSession={handleNewSession}
                currentSessionId={sessionState?.config.session_id}
              />
            )}

            <main className="flex-1 px-6 py-8">
              {/* Sidebar Toggle + Step Progress */}
              <div className="mb-8">
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setShowSidebar(!showSidebar)}
                    className="p-2 rounded-lg text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
                    title={showSidebar ? 'Hide sessions' : 'Show sessions'}
                  >
                    {showSidebar ? (
                      <PanelLeftClose className="h-5 w-5" />
                    ) : (
                      <PanelLeft className="h-5 w-5" />
                    )}
                  </button>
                  <div className="flex-1 flex items-center justify-center gap-4">
                    {steps.map((step, index) => {
                      const isActive = currentStep === step.number;
                      const isPast = currentStep > step.number || step.complete;

                      return (
                        <div key={step.number} className="flex items-center">
                          <button
                            onClick={() => handleStepChange(step.number)}
                            disabled={isRunning}
                            className={clsx(
                              'flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200',
                              isActive
                                ? 'bg-white shadow-lg shadow-violet-500/10 border-2 border-violet-200'
                                : 'hover:bg-white/50',
                              isRunning && 'cursor-not-allowed opacity-50'
                            )}
                          >
                            <div className={clsx(
                              'w-10 h-10 rounded-xl flex items-center justify-center transition-all text-xl font-bold',
                              isActive
                                ? 'bg-gradient-to-br from-violet-600 to-violet-500 text-white shadow-lg shadow-violet-500/30'
                                : isPast
                                  ? 'bg-emerald-100 text-emerald-600'
                                  : 'bg-zinc-100 text-zinc-400'
                            )}>
                              {step.number}
                            </div>
                            <div className="text-left">
                              <p className={clsx(
                                'text-sm font-semibold',
                                isActive ? 'text-zinc-900' : 'text-zinc-500'
                              )}>
                                {step.title}
                              </p>
                              <p className="text-xs text-zinc-400">{step.description}</p>
                            </div>
                          </button>

                          {index < steps.length - 1 && (
                            <ChevronRight className={clsx(
                              'h-5 w-5 mx-2',
                              isPast ? 'text-emerald-400' : 'text-zinc-300'
                            )} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Content Area */}
              <div className="animate-fade-in">
                {currentStep === 1 && <SessionSetup />}
                {currentStep === 2 && <WorkflowPanel />}
                {currentStep === 3 && <ResultsView />}
              </div>
            </main>
          </div>
        </div>
      </SignedIn>
    </>
  );
}
