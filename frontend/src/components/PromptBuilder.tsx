'use client';

import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
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
import { useSessionStore } from '@/store/session';

interface PromptBuilderProps {
  onGenerate: (prompt: string) => void;
}

export function PromptBuilder({ onGenerate }: PromptBuilderProps) {
  const { presetSelections, setPresetSelections } = useSessionStore();

  // Use store selections directly
  const selections = presetSelections;

  // Helper to update selections in the store
  const updateSelections = (updates: Partial<typeof selections>) => {
    setPresetSelections({ ...selections, ...updates });
  };

  return (
    <div className="mb-5">
      <p className="text-sm text-zinc-700 mb-3">
        Optional: Set document preferences to guide the AI
      </p>

      {/* 2x2 Grid of Dropdowns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Outlet Type */}
        <div>
          <Select
            label="Document Type"
            labelTooltip="Helps the writer match genre conventions"
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
              placeholder="Specify document type..."
              className="mt-2"
            />
          )}
        </div>

        {/* Audience */}
        <div>
          <Select
            label="Target Audience"
            labelTooltip="Adjusts vocabulary, assumed knowledge, and framing"
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
          label="Target Length"
          labelTooltip="Approximate word count — the writer will aim for this range"
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
          labelTooltip="Controls sentence complexity and terminology"
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
  );
}
