'use client';

import { useState, useCallback, useRef } from 'react';
import { PenLine, BookOpen, Sparkles, Search, Layers, Check, Play, Pencil, ArrowLeft } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Toast } from '@/components/ui/toast';
import { AlertModal } from '@/components/ui/modal';
import { Tooltip } from '@/components/ui/tooltip';
import { ModelGuidanceModal } from '@/components/ModelGuidanceModal';
import { useSessionStore } from '@/store/session';
import { WorkflowRoleId, WorkflowRoleState, WORKFLOW_ROLES } from '@/types/workflow';
import { ProviderType, ModelType } from '@/types';
import { api } from '@/lib/api';
import { clsx } from 'clsx';

// Combined provider + model options for grouped dropdown
const GROUPED_MODEL_OPTIONS = [
  // Anthropic
  { value: 'anthropic:claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4' },
  { value: 'anthropic:claude-opus-4-5-20251101', label: 'Claude Opus 4' },
  { value: 'anthropic:claude-sonnet-4-thinking-20250514', label: 'Claude Sonnet 4 (Thinking)' },
  // Google
  { value: 'google:gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { value: 'google:gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'google:gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  // OpenAI
  { value: 'openai:gpt-4o', label: 'GPT-4o' },
  { value: 'openai:gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'openai:o1', label: 'o1' },
  { value: 'openai:o1-mini', label: 'o1 Mini' },
  { value: 'openai:o3-mini', label: 'o3 Mini' },
  // Perplexity
  { value: 'perplexity:sonar', label: 'Sonar' },
  { value: 'perplexity:sonar-pro', label: 'Sonar Pro' },
  { value: 'perplexity:sonar-reasoning', label: 'Sonar Reasoning' },
];

const roleIcons: Record<WorkflowRoleId, typeof PenLine> = {
  writer: PenLine,
  content_expert: BookOpen,
  style_editor: Sparkles,
  fact_checker: Search,
  synthesizer: Layers,
};

const roleColors: Record<WorkflowRoleId, { bg: string; text: string; border: string; activeBg: string }> = {
  writer: { bg: 'bg-violet-100', text: 'text-violet-600', border: 'border-violet-200', activeBg: 'bg-violet-50' },
  content_expert: { bg: 'bg-blue-100', text: 'text-blue-600', border: 'border-blue-200', activeBg: 'bg-blue-50' },
  style_editor: { bg: 'bg-teal-100', text: 'text-teal-600', border: 'border-teal-200', activeBg: 'bg-teal-50' },
  fact_checker: { bg: 'bg-amber-100', text: 'text-amber-600', border: 'border-amber-200', activeBg: 'bg-amber-50' },
  synthesizer: { bg: 'bg-emerald-100', text: 'text-emerald-600', border: 'border-emerald-200', activeBg: 'bg-emerald-50' },
};

// Tooltips for editorial review agents (phase 2)
const roleTooltips: Partial<Record<WorkflowRoleId, string>> = {
  content_expert: 'Adds domain knowledge, frameworks, and expert perspectives',
  style_editor: 'Focuses on clarity, flow, word choice, and readability',
  fact_checker: 'Verifies claims and suggests citations — may use web search',
};

// RoleCard component - defined outside to prevent re-creation on parent re-render
interface RoleCardProps {
  role: WorkflowRoleState;
  isExpanded: boolean;
  onToggleExpanded: (roleId: WorkflowRoleId) => void;
  onToggleRole: (roleId: WorkflowRoleId) => void;
  onUpdatePrompt: (roleId: WorkflowRoleId, prompt: string) => void;
  onUpdateModel: (roleId: WorkflowRoleId, provider: ProviderType, model: ModelType) => void;
}

function RoleCard({ role, isExpanded, onToggleExpanded, onToggleRole, onUpdatePrompt, onUpdateModel }: RoleCardProps) {
  const Icon = roleIcons[role.id];
  const colors = roleColors[role.id];

  // Get current combined value for the grouped dropdown
  const currentModelValue = `${role.provider}:${role.model}`;

  // Handle combined model selection
  const handleModelChange = (combinedValue: string) => {
    const [provider, model] = combinedValue.split(':') as [ProviderType, ModelType];
    onUpdateModel(role.id, provider, model);
  };

  return (
    <div
      className={clsx(
        'rounded-xl border-2 transition-all duration-200',
        role.isActive ? colors.border : 'border-zinc-200',
        role.isActive ? colors.activeBg : 'bg-white'
      )}
    >
      {/* Role Header */}
      <div
        className={clsx(
          'flex items-center gap-3 p-3',
          !role.isRequired && !role.isActive && 'cursor-pointer hover:bg-zinc-50'
        )}
        onClick={() => !role.isRequired && !role.isActive && onToggleRole(role.id)}
      >
        {/* Checkbox or Required indicator */}
        <div
          className={clsx(
            'w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 transition-all',
            role.isRequired
              ? 'bg-violet-600 shadow-sm'
              : role.isActive
              ? 'bg-violet-600 shadow-sm cursor-pointer hover:bg-violet-700'
              : 'border-2 border-zinc-300 hover:border-violet-400 hover:bg-violet-50 cursor-pointer'
          )}
          onClick={(e) => {
            if (!role.isRequired) {
              e.stopPropagation();
              onToggleRole(role.id);
            }
          }}
        >
          {(role.isRequired || role.isActive) && (
            <Check className="w-4 h-4 text-white" />
          )}
        </div>

        {/* Icon and Name - with tooltip for editorial agents */}
        {roleTooltips[role.id] ? (
          <Tooltip content={roleTooltips[role.id]!} side="top">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div
                className={clsx(
                  'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                  role.isActive ? colors.bg : 'bg-zinc-100'
                )}
              >
                <Icon className={clsx('w-4 h-4', role.isActive ? colors.text : 'text-zinc-400')} />
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className={clsx(
                    'font-medium text-sm',
                    role.isActive ? 'text-zinc-900' : 'text-zinc-700'
                  )}
                >
                  {role.name}
                  {role.isRequired && (
                    <Tooltip content="Every workflow needs a writer and synthesizing editor">
                      <span className="ml-2 text-xs text-violet-600 font-normal cursor-help">(Required)</span>
                    </Tooltip>
                  )}
                </p>
                {!role.isActive && (
                  <p className="text-xs text-zinc-600 truncate">{role.description}</p>
                )}
              </div>
            </div>
          </Tooltip>
        ) : (
          <>
            {/* Icon */}
            <div
              className={clsx(
                'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                role.isActive ? colors.bg : 'bg-zinc-100'
              )}
            >
              <Icon className={clsx('w-4 h-4', role.isActive ? colors.text : 'text-zinc-400')} />
            </div>

            {/* Name and Description (for inactive) */}
            <div className="flex-1 min-w-0">
              <p
                className={clsx(
                  'font-medium text-sm',
                  role.isActive ? 'text-zinc-900' : 'text-zinc-700'
                )}
              >
                {role.name}
                {role.isRequired && (
                  <Tooltip content="Every workflow needs a writer and synthesizing editor">
                    <span className="ml-2 text-xs text-violet-600 font-normal cursor-help">(Required)</span>
                  </Tooltip>
                )}
              </p>
              {!role.isActive && (
                <p className="text-xs text-zinc-600 truncate">{role.description}</p>
              )}
            </div>
          </>
        )}

        {/* Inline Model Dropdown - visible when active */}
        {role.isActive && (
          <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <ModelGuidanceModal />
            <Tooltip content="Different models vary in speed, cost, and capability" side="left">
              <div>
                <Select
                  value={currentModelValue}
                  onValueChange={handleModelChange}
                  options={GROUPED_MODEL_OPTIONS}
                  placeholder="Select model..."
                  className="w-44"
                />
              </div>
            </Tooltip>
          </div>
        )}
      </div>

      {/* Description and Edit Instructions link */}
      {role.isActive && (
        <div className="px-3 pb-3 pt-0 ml-[68px]">
          <p className="text-xs text-zinc-700 mb-2">{role.description}</p>
          <Tooltip content="Customize how this agent approaches its task" side="bottom">
            <button
              onClick={() => onToggleExpanded(role.id)}
              className="flex items-center gap-1 text-xs text-zinc-600 hover:text-violet-600 transition-colors"
            >
              <Pencil className="w-3 h-3" />
              <span>{isExpanded ? 'Hide instructions' : 'Edit instructions'}</span>
            </button>
          </Tooltip>
        </div>
      )}

      {/* Expanded Role Instructions */}
      {role.isActive && isExpanded && (
        <div className="px-3 pb-3 ml-[68px]">
          <div className="pt-2">
            <Textarea
              value={role.customPrompt}
              onChange={(e) => onUpdatePrompt(role.id, e.target.value)}
              rows={6}
              className="text-xs"
            />
            <button
              onClick={() => {
                const defaultRole = WORKFLOW_ROLES.find((r) => r.id === role.id);
                if (defaultRole) {
                  onUpdatePrompt(role.id, defaultRole.defaultPrompt);
                }
              }}
              className="mt-2 text-xs text-violet-600 hover:text-violet-700"
            >
              Reset to default
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Health check cache: provider -> { timestamp, healthy }
const healthCheckCache = new Map<string, { timestamp: number; healthy: boolean }>();
const CACHE_TTL_MS = 30000; // 30 seconds

function getCachedHealth(provider: string): boolean | null {
  const cached = healthCheckCache.get(provider);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.healthy;
  }
  return null;
}

function setCachedHealth(provider: string, healthy: boolean) {
  healthCheckCache.set(provider, { timestamp: Date.now(), healthy });
}

// Helper to get short model names
function getShortModelName(provider: ProviderType, model: ModelType): string {
  const shortNames: Record<string, string> = {
    'claude-sonnet-4-5-20250929': 'Sonnet 4',
    'claude-opus-4-5-20251101': 'Opus 4',
    'claude-sonnet-4-thinking-20250514': 'Sonnet 4 Thinking',
    'gemini-2.5-pro': 'Gemini 2.5 Pro',
    'gemini-2.5-flash': 'Gemini 2.5 Flash',
    'gemini-2.0-flash': 'Gemini 2.0 Flash',
    'gpt-4o': 'GPT-4o',
    'gpt-4o-mini': 'GPT-4o Mini',
    'o1': 'o1',
    'o1-mini': 'o1 Mini',
    'o3-mini': 'o3 Mini',
    'sonar': 'Sonar',
    'sonar-pro': 'Sonar Pro',
    'sonar-reasoning': 'Sonar Reasoning',
  };
  return shortNames[model] || model;
}

// Generate section with health check and workflow summary
interface GenerateSectionProps {
  onGenerate: () => void;
  onBack?: () => void;
  activeProviders: ProviderType[];
  activeRoles: WorkflowRoleState[];
  maxRounds: number;
  scoreThreshold: number | null;
}

function GenerateSection({ onGenerate, onBack, activeProviders, activeRoles, maxRounds, scoreThreshold }: GenerateSectionProps) {
  const [isChecking, setIsChecking] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalMessage, setModalMessage] = useState('');

  const handleGenerate = useCallback(async () => {
    // Get unique providers from active agents
    const uniqueProviders = [...new Set(activeProviders)];

    if (uniqueProviders.length === 0) {
      onGenerate();
      return;
    }

    // Check cache first
    const uncachedProviders: ProviderType[] = [];
    const cachedResults: Record<string, boolean> = {};

    for (const provider of uniqueProviders) {
      const cached = getCachedHealth(provider);
      if (cached !== null) {
        cachedResults[provider] = cached;
      } else {
        uncachedProviders.push(provider);
      }
    }

    // If all providers are cached and healthy, proceed immediately
    if (uncachedProviders.length === 0) {
      const allHealthy = Object.values(cachedResults).every((h) => h);
      if (allHealthy) {
        onGenerate();
        return;
      }
    }

    // Need to check at least some providers
    setIsChecking(true);
    setShowToast(true);

    try {
      // Run health check with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const healthResult = await api.healthCheck();
      clearTimeout(timeoutId);

      // Cache and collect results
      const providerHealth: Record<string, boolean> = { ...cachedResults };

      for (const provider of uncachedProviders) {
        const healthy = healthResult.providers[provider] ?? false;
        setCachedHealth(provider, healthy);
        providerHealth[provider] = healthy;
      }

      // Check results
      const failedProviders = uniqueProviders.filter((p) => !providerHealth[p]);

      setShowToast(false);

      if (failedProviders.length === 0) {
        // All healthy, proceed
        onGenerate();
      } else if (failedProviders.length === uniqueProviders.length) {
        // All failed
        setModalTitle('Unable to Connect');
        setModalMessage('Unable to reach any selected models. Please check your connection or try again later.');
        setShowModal(true);
      } else {
        // Some failed
        const failedNames = failedProviders.map((p) => {
          switch (p) {
            case 'anthropic': return 'Anthropic (Claude)';
            case 'google': return 'Google (Gemini)';
            case 'openai': return 'OpenAI (GPT)';
            case 'perplexity': return 'Perplexity (Sonar)';
            default: return p;
          }
        });
        setModalTitle('Model Unavailable');
        setModalMessage(
          `The following model(s) are currently unavailable: ${failedNames.join(', ')}. Please select a different model for the affected agents and try again.`
        );
        setShowModal(true);
      }
    } catch (error) {
      setShowToast(false);
      setModalTitle('Unable to Connect');
      setModalMessage('Unable to reach any selected models. Please check your connection or try again later.');
      setShowModal(true);
    } finally {
      setIsChecking(false);
    }
  }, [activeProviders, onGenerate]);

  // Check if all active agents use the same model
  const uniqueModels = [...new Set(activeRoles.map((r) => `${r.provider}:${r.model}`))];
  const allSameModel = uniqueModels.length === 1;

  // Build workflow summary
  const buildWorkflowSummary = () => {
    if (activeRoles.length === 0) return '';

    let summary: string;
    if (allSameModel) {
      // All same model: show names without models
      summary = activeRoles.map((r) => r.name).join(' → ');
    } else {
      // Different models: show name with model in parentheses
      summary = activeRoles
        .map((r) => `${r.name} (${getShortModelName(r.provider, r.model)})`)
        .join(' → ');
    }

    // Always end with "→ Writer" since Writer revises based on feedback
    return summary + ' → Writer';
  };

  // Get the common model name if all same
  const commonModelName = allSameModel && activeRoles.length > 0
    ? getShortModelName(activeRoles[0].provider, activeRoles[0].model)
    : null;

  return (
    <>
      {/* Confirmation Card */}
      <div className="bg-gradient-to-b from-violet-50/80 to-zinc-50 rounded-xl border border-violet-200/50 p-5 shadow-sm">
        {/* Workflow Summary */}
        <div className="space-y-1 mb-4 text-center">
          <p className="text-sm text-zinc-700">
            <span className="font-medium text-zinc-900">Your workflow:</span>{' '}
            {buildWorkflowSummary() || 'No agents selected'}
          </p>
          <p className="text-sm text-zinc-500">
            {allSameModel && commonModelName && (
              <>All agents: <span className="font-medium">{commonModelName}</span> · </>
            )}
            {maxRounds} round{maxRounds !== 1 ? 's' : ''}
            {scoreThreshold && (
              <span className="text-zinc-400"> (stop early at {scoreThreshold}+)</span>
            )}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-violet-100">
          {/* Back button - outlined style */}
          {onBack ? (
            <Button
              variant="outline"
              size="lg"
              onClick={onBack}
              className="gap-2 border-violet-600 text-violet-600 hover:bg-violet-50 hover:text-violet-700 hover:border-violet-700"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back to Project</span>
              <span className="sm:hidden">Back</span>
            </Button>
          ) : (
            <div /> /* Spacer for layout when no back button */
          )}

          {/* Generate button - primary style */}
          <Button
            size="lg"
            onClick={handleGenerate}
            disabled={isChecking}
            className="gap-2"
          >
            <Play className="h-4 w-4" />
            {isChecking ? 'Checking...' : 'Generate'}
          </Button>
        </div>
      </div>

      <Toast
        message="Checking that models are available..."
        type="loading"
        isVisible={showToast}
      />

      <AlertModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={modalTitle}
        message={modalMessage}
      />
    </>
  );
}

interface WorkflowPanelProps {
  onGenerate?: () => void;
  onBack?: () => void;
}

export function WorkflowPanel({ onGenerate, onBack }: WorkflowPanelProps) {
  const {
    workflowRoles,
    toggleWorkflowRole,
    updateWorkflowRolePrompt,
    updateWorkflowRoleModel,
    maxRounds,
    setMaxRounds,
    scoreThreshold,
    setScoreThreshold,
  } = useSessionStore();

  const [expandedRole, setExpandedRole] = useState<WorkflowRoleId | null>(null);

  const phase1Roles = workflowRoles.filter((r) => r.phase === 1);
  const phase2Roles = workflowRoles.filter((r) => r.phase === 2);
  const phase3Roles = workflowRoles.filter((r) => r.phase === 3);

  const activePhase2Count = phase2Roles.filter((r) => r.isActive).length;
  const hasActiveSynthesizer = phase3Roles.some((r) => r.isActive);

  // Get providers from all active roles for health check
  const activeProviders = workflowRoles
    .filter((r) => r.isActive)
    .map((r) => r.provider);

  const toggleExpanded = (roleId: WorkflowRoleId) => {
    setExpandedRole(expandedRole === roleId ? null : roleId);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card variant="elevated" className="border-2 border-violet-200 bg-gradient-to-b from-violet-50 to-white">
        <CardContent className="py-8 text-center">
          <h2 className="text-2xl font-bold text-zinc-900 mb-4">Who should work on your document?</h2>
          <p className="text-sm text-zinc-600 leading-relaxed max-w-2xl mx-auto">
            Build your AI editorial team. The <strong>Writer</strong> creates content,
            <strong> Editors</strong> review and suggest improvements, then the writer revises.
            Click any role to toggle it on/off.
          </p>
        </CardContent>
      </Card>

      {/* Visual Workflow */}
      <Card variant="elevated" className="border border-zinc-200">
        <CardContent className="py-5">
          {/* Phase 1: Writer */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-semibold text-zinc-700">
                <span className="text-violet-600">i.</span> Writing Phase
              </span>
            </div>
            <div className="ml-4 border-l-2 border-violet-200 pl-4">
              {phase1Roles.map((role) => (
                <RoleCard
                  key={role.id}
                  role={role}
                  isExpanded={expandedRole === role.id}
                  onToggleExpanded={toggleExpanded}
                  onToggleRole={toggleWorkflowRole}
                  onUpdatePrompt={updateWorkflowRolePrompt}
                  onUpdateModel={updateWorkflowRoleModel}
                />
              ))}
            </div>
          </div>

          {/* Arrow */}
          <div className="flex justify-center my-2">
            <div className="w-0.5 h-6 bg-zinc-200" />
          </div>

          {/* Phase 2: Parallel Editors */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-semibold text-zinc-700">
                <span className="text-violet-600">ii.</span> Editorial Review
                {activePhase2Count > 0 && (
                  <span className="text-zinc-500 font-normal ml-2">
                    ({activePhase2Count} active, run in parallel)
                  </span>
                )}
              </span>
            </div>
            <div className="ml-4 border-l-2 border-blue-200 pl-4 space-y-2">
              {phase2Roles.map((role) => (
                <RoleCard
                  key={role.id}
                  role={role}
                  isExpanded={expandedRole === role.id}
                  onToggleExpanded={toggleExpanded}
                  onToggleRole={toggleWorkflowRole}
                  onUpdatePrompt={updateWorkflowRolePrompt}
                  onUpdateModel={updateWorkflowRoleModel}
                />
              ))}
            </div>
          </div>

          {/* Arrow */}
          <div className="flex justify-center my-2">
            <div className="w-0.5 h-6 bg-zinc-200" />
          </div>

          {/* Phase 3: Synthesizer */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-semibold text-zinc-700">
                <span className="text-violet-600">iii.</span> Synthesis
                {!hasActiveSynthesizer && (
                  <span className="text-zinc-500 font-normal ml-2">(optional)</span>
                )}
              </span>
            </div>
            <div className="ml-4 border-l-2 border-emerald-200 pl-4">
              {phase3Roles.map((role) => (
                <RoleCard
                  key={role.id}
                  role={role}
                  isExpanded={expandedRole === role.id}
                  onToggleExpanded={toggleExpanded}
                  onToggleRole={toggleWorkflowRole}
                  onUpdatePrompt={updateWorkflowRolePrompt}
                  onUpdateModel={updateWorkflowRoleModel}
                />
              ))}
            </div>
          </div>

          {/* Arrow back to Writer */}
          <div className="flex items-center justify-center gap-2 text-zinc-600">
            <div className="flex-1 h-px bg-zinc-200" />
            <span className="text-xs">Back to Writer for next round</span>
            <div className="flex-1 h-px bg-zinc-200" />
          </div>

          {/* Divider */}
          <div className="my-6 border-t border-zinc-200" />

          {/* Phase 4: Iteration Settings */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-semibold text-zinc-700">
                <span className="text-violet-600">iv.</span> Iteration
              </span>
              <span className="text-xs text-zinc-600">Control how many revision cycles to run</span>
            </div>
            <div className="ml-4 border-l-2 border-zinc-200 pl-4">
              <div className="rounded-xl border-2 border-zinc-200 bg-white p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Number of Rounds */}
                  <div>
                    <Select
                      label="Number of Rounds"
                      value={String(maxRounds)}
                      onValueChange={(value) => setMaxRounds(parseInt(value))}
                      options={[
                        { value: '1', label: '1 round' },
                        { value: '2', label: '2 rounds' },
                        { value: '3', label: '3 rounds' },
                        { value: '4', label: '4 rounds' },
                        { value: '5', label: '5 rounds' },
                      ]}
                    />
                    <p className="mt-1.5 text-xs text-zinc-600">
                      Each round: Writer drafts → Editors review → Writer revises
                    </p>
                  </div>

                  {/* Early Stop Threshold */}
                  <div>
                    <Select
                      label="Early Stop Threshold"
                      labelTooltip="1 = needs major work, 5 = solid draft, 10 = publication-ready"
                      value={scoreThreshold ? String(scoreThreshold) : 'none'}
                      onValueChange={(value) => setScoreThreshold(value === 'none' ? null : parseFloat(value))}
                      options={[
                        { value: 'none', label: 'None' },
                        { value: '6', label: '6' },
                        { value: '7', label: '7' },
                        { value: '8', label: '8' },
                        { value: '9', label: '9' },
                        { value: '10', label: '10' },
                      ]}
                    />
                    <p className="mt-1.5 text-xs text-zinc-600">
                      Skip remaining rounds once the synthesizing editor scores this or higher
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Confirmation Zone with Summary and Action Buttons */}
      {(onGenerate || onBack) && (
        <GenerateSection
          onGenerate={onGenerate || (() => {})}
          onBack={onBack}
          activeProviders={activeProviders}
          activeRoles={workflowRoles.filter((r) => r.isActive)}
          maxRounds={maxRounds}
          scoreThreshold={scoreThreshold}
        />
      )}
    </div>
  );
}
