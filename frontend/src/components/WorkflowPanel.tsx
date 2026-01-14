'use client';

import { useState } from 'react';
import { PenLine, BookOpen, Sparkles, Search, Layers, ChevronDown, ChevronUp, Check, Play } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { useSessionStore } from '@/store/session';
import { WorkflowRoleId, WorkflowRoleState, WORKFLOW_ROLES } from '@/types/workflow';
import { MODELS, PROVIDERS, ProviderType, ModelType } from '@/types';
import { clsx } from 'clsx';

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
  const filteredModels = MODELS.filter((m) => m.provider === role.provider);
  const modelLabel = MODELS.find((m) => m.value === role.model)?.label || role.model;

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
          'flex items-center gap-3 p-3 cursor-pointer',
          !role.isRequired && 'hover:bg-zinc-50'
        )}
        onClick={() => !role.isRequired && onToggleRole(role.id)}
      >
        {/* Checkbox or Required indicator */}
        <div
          className={clsx(
            'w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 transition-all',
            role.isRequired
              ? 'bg-violet-600 shadow-sm'
              : role.isActive
              ? 'bg-violet-600 shadow-sm'
              : 'border-2 border-zinc-300 hover:border-violet-400 hover:bg-violet-50'
          )}
        >
          {(role.isRequired || role.isActive) && (
            <Check className="w-4 h-4 text-white" />
          )}
        </div>

        {/* Icon */}
        <div
          className={clsx(
            'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
            role.isActive ? colors.bg : 'bg-zinc-100'
          )}
        >
          <Icon className={clsx('w-4 h-4', role.isActive ? colors.text : 'text-zinc-400')} />
        </div>

        {/* Name and Description */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p
              className={clsx(
                'font-medium text-sm',
                role.isActive ? 'text-zinc-900' : 'text-zinc-500'
              )}
            >
              {role.name}
              {role.isRequired && (
                <span className="ml-2 text-xs text-violet-600 font-normal">(Required)</span>
              )}
            </p>
            {role.isActive && (
              <span className="text-xs text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded">
                {modelLabel}
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 truncate">{role.description}</p>
        </div>

        {/* Expand button - visible labeled button for discoverability */}
        {role.isActive && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpanded(role.id);
            }}
            className={clsx(
              'flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all',
              isExpanded
                ? 'bg-violet-100 text-violet-700 hover:bg-violet-200'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            )}
          >
            <span>{isExpanded ? 'Hide options' : 'Choose model & customize'}</span>
            {isExpanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        )}
      </div>

      {/* Expanded Settings */}
      {role.isActive && isExpanded && (
        <div className="px-3 pb-3 border-t border-zinc-100 mt-1 pt-3 space-y-4">
          {/* Model Selection */}
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Provider"
              value={role.provider}
              onValueChange={(value) => {
                const newProvider = value as ProviderType;
                const firstModel = MODELS.find((m) => m.provider === newProvider);
                if (firstModel) {
                  onUpdateModel(role.id, newProvider, firstModel.value);
                }
              }}
              options={PROVIDERS}
            />
            <Select
              label="Model"
              value={role.model}
              onValueChange={(value) => onUpdateModel(role.id, role.provider, value as ModelType)}
              options={filteredModels}
            />
          </div>

          {/* Role Instructions */}
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1.5">
              Role Instructions
            </label>
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

interface WorkflowPanelProps {
  onGenerate?: () => void;
}

export function WorkflowPanel({ onGenerate }: WorkflowPanelProps) {
  const {
    workflowRoles,
    toggleWorkflowRole,
    updateWorkflowRolePrompt,
    updateWorkflowRoleModel,
  } = useSessionStore();

  const [expandedRole, setExpandedRole] = useState<WorkflowRoleId | null>('writer');

  const phase1Roles = workflowRoles.filter((r) => r.phase === 1);
  const phase2Roles = workflowRoles.filter((r) => r.phase === 2);
  const phase3Roles = workflowRoles.filter((r) => r.phase === 3);

  const activePhase2Count = phase2Roles.filter((r) => r.isActive).length;
  const hasActiveSynthesizer = phase3Roles.some((r) => r.isActive);

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
              <div className="w-6 h-6 rounded-full bg-violet-600 text-white text-xs font-bold flex items-center justify-center">
                1
              </div>
              <span className="text-sm font-semibold text-zinc-700">Writing Phase</span>
            </div>
            <div className="ml-3 border-l-2 border-violet-200 pl-4">
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
              <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
                2
              </div>
              <span className="text-sm font-semibold text-zinc-700">
                Editorial Review
                {activePhase2Count > 0 && (
                  <span className="text-zinc-500 font-normal ml-2">
                    ({activePhase2Count} active, run in parallel)
                  </span>
                )}
              </span>
            </div>
            <div className="ml-3 border-l-2 border-blue-200 pl-4 space-y-2">
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
              <div className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center">
                3
              </div>
              <span className="text-sm font-semibold text-zinc-700">
                Synthesis
                {!hasActiveSynthesizer && (
                  <span className="text-zinc-500 font-normal ml-2">(optional)</span>
                )}
              </span>
            </div>
            <div className="ml-3 border-l-2 border-emerald-200 pl-4">
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
          <div className="flex items-center justify-center gap-2 text-zinc-500">
            <div className="flex-1 h-px bg-zinc-200" />
            <span className="text-xs">Back to Writer for next round</span>
            <div className="flex-1 h-px bg-zinc-200" />
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200">
        <p className="text-sm text-zinc-600">
          <span className="font-medium">Active workflow:</span>{' '}
          {workflowRoles
            .filter((r) => r.isActive)
            .map((r) => r.name)
            .join(' → ')}
        </p>
      </div>

      {/* Generate Button */}
      {onGenerate && (
        <div className="flex justify-end pt-4">
          <Button
            size="lg"
            onClick={onGenerate}
            className="gap-2"
          >
            <Play className="h-4 w-4" />
            Generate
          </Button>
        </div>
      )}
    </div>
  );
}
