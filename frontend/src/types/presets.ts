// Outlet Type Options
export type OutletType =
  | 'managerial_article'
  | 'academic_article'
  | 'nonfiction_book_chapter'
  | 'self_help_book'
  | 'blog_post'
  | 'linkedin_post'
  | 'fictional_story'
  | 'white_paper'
  | 'other';

export const OUTLET_TYPE_OPTIONS = [
  { value: 'managerial_article', label: 'Managerial Article' },
  { value: 'academic_article', label: 'Academic Article' },
  { value: 'nonfiction_book_chapter', label: 'Nonfiction Book Chapter' },
  { value: 'self_help_book', label: 'Self-Help Book' },
  { value: 'blog_post', label: 'Blog Post' },
  { value: 'linkedin_post', label: 'LinkedIn Post' },
  { value: 'fictional_story', label: 'Fictional Story / Chapter' },
  { value: 'white_paper', label: 'White Paper / Report' },
  { value: 'other', label: 'Other (specify)' },
];

// Audience Options
export type AudienceType =
  | 'general_public'
  | 'business_readers'
  | 'academics'
  | 'industry_professionals'
  | 'students'
  | 'executives'
  | 'other';

export const AUDIENCE_OPTIONS = [
  { value: 'general_public', label: 'General Public' },
  { value: 'business_readers', label: 'Business Readers' },
  { value: 'academics', label: 'Academics / Researchers' },
  { value: 'industry_professionals', label: 'Industry Professionals' },
  { value: 'students', label: 'Students' },
  { value: 'executives', label: 'Executives / Leadership' },
  { value: 'other', label: 'Other (specify)' },
];

// Length Range Options
export type LengthRange = 'brief' | 'short' | 'medium' | 'long' | 'very_long';

export const LENGTH_OPTIONS = [
  { value: 'brief', label: 'Brief (under 500 words)' },
  { value: 'short', label: 'Short (500-1,000 words)' },
  { value: 'medium', label: 'Medium (1,000-2,500 words)' },
  { value: 'long', label: 'Long (2,500-5,000 words)' },
  { value: 'very_long', label: 'Very Long (5,000+ words)' },
];

// Reading Level Options
export type ReadingLevel = 'accessible' | 'general' | 'educated' | 'expert';

export const READING_LEVEL_OPTIONS = [
  { value: 'accessible', label: 'Accessible (8th grade)' },
  { value: 'general', label: 'General (High School)' },
  { value: 'educated', label: 'Educated (College)' },
  { value: 'expert', label: 'Expert / Technical' },
];

// Preset State Interface
export interface PresetSelections {
  outletType: OutletType | '';
  customOutletType: string;
  audience: AudienceType | '';
  customAudience: string;
  lengthRange: LengthRange | '';
  readingLevel: ReadingLevel | '';
}

// Helper to generate context string for agents
export function generatePresetContext(selections: PresetSelections): string {
  const parts: string[] = [];

  // Outlet Type
  if (selections.outletType) {
    if (selections.outletType === 'other' && selections.customOutletType) {
      parts.push(`Document Type: ${selections.customOutletType}`);
    } else {
      const outlet = OUTLET_TYPE_OPTIONS.find((o) => o.value === selections.outletType);
      if (outlet && outlet.value !== 'other') {
        parts.push(`Document Type: ${outlet.label}`);
      }
    }
  }

  // Audience
  if (selections.audience) {
    if (selections.audience === 'other' && selections.customAudience) {
      parts.push(`Target Audience: ${selections.customAudience}`);
    } else {
      const audience = AUDIENCE_OPTIONS.find((a) => a.value === selections.audience);
      if (audience && audience.value !== 'other') {
        parts.push(`Target Audience: ${audience.label}`);
      }
    }
  }

  // Length
  if (selections.lengthRange) {
    const length = LENGTH_OPTIONS.find((l) => l.value === selections.lengthRange);
    if (length) {
      parts.push(`Target Length: ${length.label}`);
    }
  }

  // Reading Level
  if (selections.readingLevel) {
    const level = READING_LEVEL_OPTIONS.find((r) => r.value === selections.readingLevel);
    if (level) {
      parts.push(`Reading Level: ${level.label}`);
    }
  }

  if (parts.length === 0) {
    return '';
  }

  return `\n\n=== DOCUMENT REQUIREMENTS ===\n${parts.join('\n')}\n=============================`;
}
