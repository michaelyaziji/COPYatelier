'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Wand2 } from 'lucide-react';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  OutletType,
  AudienceType,
  LengthRange,
  ReadingLevel,
  OUTLET_TYPE_OPTIONS,
  AUDIENCE_OPTIONS,
  LENGTH_OPTIONS,
  READING_LEVEL_OPTIONS,
} from '@/types/presets';
import { generatePromptTemplate } from '@/lib/promptGenerator';
import { useSessionStore } from '@/store/session';
import { clsx } from 'clsx';

interface PromptBuilderProps {
  onGenerate: (prompt: string) => void;
}

export function PromptBuilder({ onGenerate }: PromptBuilderProps) {
  const { presetSelections, setPresetSelections } = useSessionStore();
  const [isExpanded, setIsExpanded] = useState(false);

  // Use store selections directly
  const selections = presetSelections;

  // Helper to update selections in the store
  const updateSelections = (updates: Partial<typeof selections>) => {
    setPresetSelections({ ...selections, ...updates });
  };

  const handleGenerate = () => {
    const prompt = generatePromptTemplate(selections);
    if (prompt) {
      onGenerate(prompt);
    }
  };

  const hasSelections =
    selections.outletType ||
    selections.audience ||
    selections.lengthRange ||
    selections.readingLevel;

  const handleClear = () => {
    setPresetSelections({
      outletType: '',
      customOutletType: '',
      audience: '',
      customAudience: '',
      lengthRange: '',
      readingLevel: '',
    });
  };

  return (
    <div className="mb-5">
      {/* Toggle Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={clsx(
          'w-full flex items-center justify-between px-4 py-3 rounded-xl',
          'border border-zinc-200 hover:border-zinc-300 transition-all',
          'text-left',
          isExpanded ? 'bg-violet-50 border-violet-200' : 'bg-zinc-50'
        )}
      >
        <div className="flex items-center gap-2">
          <Wand2
            className={clsx('h-4 w-4', isExpanded ? 'text-violet-600' : 'text-zinc-500')}
          />
          <span
            className={clsx(
              'text-sm font-medium',
              isExpanded ? 'text-violet-700' : 'text-zinc-700'
            )}
          >
            Prompt Builder
          </span>
          {!isExpanded && hasSelections && (
            <span className="px-2 py-0.5 text-xs bg-violet-100 text-violet-600 rounded-full">
              Configured
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-zinc-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-zinc-400" />
        )}
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="mt-3 p-4 bg-zinc-50 rounded-xl border border-zinc-200">
          <p className="text-sm text-zinc-600 mb-4">
            Select options to auto-generate a prompt template, then customize it as needed.
          </p>

          {/* 2x2 Grid of Dropdowns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Outlet Type */}
            <div>
              <Select
                label="Outlet Type"
                value={selections.outletType}
                onValueChange={(value) =>
                  updateSelections({
                    outletType: value as OutletType,
                    customOutletType: value !== 'other' ? '' : selections.customOutletType,
                  })
                }
                options={OUTLET_TYPE_OPTIONS}
                placeholder="Select type..."
              />
              {selections.outletType === 'other' && (
                <Input
                  value={selections.customOutletType}
                  onChange={(e) =>
                    updateSelections({
                      customOutletType: e.target.value,
                    })
                  }
                  placeholder="Specify outlet type..."
                  className="mt-2"
                />
              )}
            </div>

            {/* Audience */}
            <div>
              <Select
                label="Target Audience"
                value={selections.audience}
                onValueChange={(value) =>
                  updateSelections({
                    audience: value as AudienceType,
                    customAudience: value !== 'other' ? '' : selections.customAudience,
                  })
                }
                options={AUDIENCE_OPTIONS}
                placeholder="Select audience..."
              />
              {selections.audience === 'other' && (
                <Input
                  value={selections.customAudience}
                  onChange={(e) =>
                    updateSelections({
                      customAudience: e.target.value,
                    })
                  }
                  placeholder="Specify target audience..."
                  className="mt-2"
                />
              )}
            </div>

            {/* Length Range */}
            <Select
              label="Length Range"
              value={selections.lengthRange}
              onValueChange={(value) =>
                updateSelections({
                  lengthRange: value as LengthRange,
                })
              }
              options={LENGTH_OPTIONS}
              placeholder="Select length..."
            />

            {/* Reading Level */}
            <Select
              label="Reading Level"
              value={selections.readingLevel}
              onValueChange={(value) =>
                updateSelections({
                  readingLevel: value as ReadingLevel,
                })
              }
              options={READING_LEVEL_OPTIONS}
              placeholder="Select level..."
            />
          </div>

        </div>
      )}
    </div>
  );
}
