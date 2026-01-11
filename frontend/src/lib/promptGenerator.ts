import {
  PresetSelections,
  OUTLET_TYPE_OPTIONS,
  AUDIENCE_OPTIONS,
  LENGTH_OPTIONS,
  READING_LEVEL_OPTIONS,
} from '@/types/presets';

export function generatePromptTemplate(selections: PresetSelections): string {
  const parts: string[] = [];

  // Outlet Type
  if (selections.outletType) {
    if (selections.outletType === 'other' && selections.customOutletType) {
      parts.push(`Write a ${selections.customOutletType.toLowerCase()}`);
    } else {
      const outlet = OUTLET_TYPE_OPTIONS.find((o) => o.value === selections.outletType);
      if (outlet && outlet.value !== 'other') {
        parts.push(`Write a ${outlet.label.toLowerCase()}`);
      }
    }
  }

  // Audience
  if (selections.audience) {
    if (selections.audience === 'other' && selections.customAudience) {
      parts.push(`for ${selections.customAudience.toLowerCase()}`);
    } else {
      const audience = AUDIENCE_OPTIONS.find((a) => a.value === selections.audience);
      if (audience && audience.value !== 'other') {
        parts.push(`for ${audience.label.toLowerCase()}`);
      }
    }
  }

  // Length
  if (selections.lengthRange) {
    const length = LENGTH_OPTIONS.find((l) => l.value === selections.lengthRange);
    if (length) {
      const match = length.label.match(/\((.+?)\)/);
      if (match) {
        parts.push(`that is approximately ${match[1]}`);
      }
    }
  }

  // Reading Level
  if (selections.readingLevel) {
    const level = READING_LEVEL_OPTIONS.find((r) => r.value === selections.readingLevel);
    if (level) {
      parts.push(`at a ${level.label.toLowerCase()} reading level`);
    }
  }

  // Build the prompt
  let prompt = parts.join(' ');

  if (prompt) {
    prompt += '.\n\n';
    prompt += 'Topic: [Describe your topic here]\n\n';
    prompt += 'Key points to cover:\n';
    prompt += '- [Point 1]\n';
    prompt += '- [Point 2]\n';
    prompt += '- [Point 3]\n\n';
    prompt += 'Additional requirements:\n';
    prompt += '- [Any specific requirements]';
  }

  return prompt;
}
