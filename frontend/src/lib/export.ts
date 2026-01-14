import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { saveAs } from 'file-saver';

/**
 * Format an agent's full response for display.
 * Removes JSON syntax but keeps all content including thinking/comments.
 */
export function formatAgentResponse(content: string): string {
  let cleaned = content.trim();

  // Remove markdown code fences
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  cleaned = cleaned.trim();

  // Try to parse as JSON and format nicely
  try {
    if (cleaned.startsWith('{')) {
      const parsed = JSON.parse(cleaned);
      const parts: string[] = [];

      // Add thinking/reasoning if present
      if (parsed.thinking) {
        parts.push(`**Thinking:**\n${parsed.thinking}`);
      }
      if (parsed.reasoning) {
        parts.push(`**Reasoning:**\n${parsed.reasoning}`);
      }
      if (parsed.analysis) {
        parts.push(`**Analysis:**\n${parsed.analysis}`);
      }
      if (parsed.comments) {
        parts.push(`**Comments:**\n${parsed.comments}`);
      }
      if (parsed.feedback) {
        parts.push(`**Feedback:**\n${parsed.feedback}`);
      }
      if (parsed.suggestions) {
        parts.push(`**Suggestions:**\n${parsed.suggestions}`);
      }
      if (parsed.changes) {
        parts.push(`**Changes Made:**\n${parsed.changes}`);
      }

      // Add the output
      if (parsed.output) {
        parts.push(`**Output:**\n${parsed.output}`);
      }

      // Add evaluation summary if present
      if (parsed.evaluation?.criteria_scores) {
        const scores = parsed.evaluation.criteria_scores
          .map((c: { criterion: string; score: number }) => `  • ${c.criterion}: ${c.score}/10`)
          .join('\n');
        parts.push(`**Self-Evaluation:**\n${scores}`);
      }

      if (parts.length > 0) {
        return parts.join('\n\n');
      }
    }
  } catch {
    // Not valid JSON, continue with regex approach
  }

  // Try to extract and format key-value pairs from JSON-like structure
  const sections: string[] = [];

  // Extract common fields using regex
  const fieldPatterns = [
    { key: 'thinking', label: 'Thinking' },
    { key: 'reasoning', label: 'Reasoning' },
    { key: 'analysis', label: 'Analysis' },
    { key: 'comments', label: 'Comments' },
    { key: 'feedback', label: 'Feedback' },
    { key: 'suggestions', label: 'Suggestions' },
    { key: 'changes', label: 'Changes Made' },
    { key: 'output', label: 'Output' },
  ];

  for (const { key, label } of fieldPatterns) {
    const regex = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, 's');
    const match = cleaned.match(regex);
    if (match) {
      const value = match[1]
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
        .trim();
      if (value) {
        sections.push(`**${label}:**\n${value}`);
      }
    }
  }

  if (sections.length > 0) {
    return sections.join('\n\n');
  }

  // If no structure found, return as-is (removing any remaining JSON artifacts)
  return cleaned
    .replace(/^\s*\{\s*/, '')
    .replace(/\s*\}\s*$/, '')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

/**
 * Extract clean content from potentially JSON-wrapped output.
 * Preserves all content (including reasoning) that appears before the JSON block.
 * Only strips the JSON evaluation block itself.
 */
export function extractCleanContent(content: string): string {
  let cleaned = content.trim();

  // Check if there's a JSON code block at the end (```json ... ```)
  const jsonCodeBlockMatch = cleaned.match(/\n*```json\s*\n[\s\S]*?```\s*$/);
  if (jsonCodeBlockMatch) {
    // Remove the JSON code block, keep everything before it
    cleaned = cleaned.slice(0, jsonCodeBlockMatch.index).trim();
    return cleaned;
  }

  // Check for raw JSON object at the end (without code fences)
  // Look for a JSON object that starts with { and contains "output" or "evaluation"
  const jsonStartMatch = cleaned.match(/\n*\{\s*"(?:output|evaluation)"/);
  if (jsonStartMatch) {
    // Find where the JSON starts and keep everything before it
    const beforeJson = cleaned.slice(0, jsonStartMatch.index).trim();
    if (beforeJson) {
      return beforeJson;
    }
  }

  // Check if the entire content is JSON (starts with {)
  if (cleaned.startsWith('{')) {
    try {
      const parsed = JSON.parse(cleaned);
      // If it's valid JSON with an output field, return that
      if (parsed.output) {
        return parsed.output.trim();
      }
    } catch {
      // Not valid JSON, return as-is
    }
  }

  return cleaned;
}

/**
 * Parse text and create formatted TextRun children with bold/italic support.
 */
function parseFormattedText(text: string): TextRun[] {
  const runs: TextRun[] = [];
  // Pattern to match **bold**, *italic*, or ***bold italic***
  const pattern = /(\*\*\*.*?\*\*\*|\*\*.*?\*\*|\*[^*]+?\*)/g;

  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    // Add text before this match
    if (match.index > lastIndex) {
      runs.push(new TextRun({
        text: text.slice(lastIndex, match.index),
        size: 22, // 11pt
      }));
    }

    const matched = match[0];
    if (matched.startsWith('***') && matched.endsWith('***')) {
      runs.push(new TextRun({
        text: matched.slice(3, -3),
        bold: true,
        italics: true,
        size: 22,
      }));
    } else if (matched.startsWith('**') && matched.endsWith('**')) {
      runs.push(new TextRun({
        text: matched.slice(2, -2),
        bold: true,
        size: 22,
      }));
    } else if (matched.startsWith('*') && matched.endsWith('*')) {
      runs.push(new TextRun({
        text: matched.slice(1, -1),
        italics: true,
        size: 22,
      }));
    }

    lastIndex = match.index + matched.length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    runs.push(new TextRun({
      text: text.slice(lastIndex),
      size: 22,
    }));
  }

  return runs.length > 0 ? runs : [new TextRun({ text, size: 22 })];
}

/**
 * Generate and download a Word document from text content.
 */
export async function downloadAsWord(content: string, filename: string = 'document', title?: string) {
  // Extract clean content first
  const cleanContent = extractCleanContent(content);

  // Parse the content into paragraphs
  const lines = cleanContent.split('\n');
  const paragraphs: Paragraph[] = [];

  // Add title if provided
  if (title) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: title,
            bold: true,
            size: 36, // 18pt
          }),
        ],
        heading: HeadingLevel.TITLE,
        spacing: { after: 400 },
        alignment: 'center' as const,
      })
    );
  }

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines but add spacing
    if (!trimmed) {
      paragraphs.push(new Paragraph({ text: '' }));
      continue;
    }

    // Check for markdown-style headers
    if (trimmed.startsWith('### ')) {
      paragraphs.push(
        new Paragraph({
          text: trimmed.slice(4),
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 240, after: 120 },
        })
      );
    } else if (trimmed.startsWith('## ')) {
      paragraphs.push(
        new Paragraph({
          text: trimmed.slice(3),
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 280, after: 160 },
        })
      );
    } else if (trimmed.startsWith('# ')) {
      paragraphs.push(
        new Paragraph({
          text: trimmed.slice(2),
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 360, after: 200 },
        })
      );
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      // Bullet points
      paragraphs.push(
        new Paragraph({
          children: parseFormattedText(trimmed.slice(2)),
          bullet: { level: 0 },
          spacing: { after: 80 },
        })
      );
    } else if (/^\d+\.\s/.test(trimmed)) {
      // Numbered lists
      const text = trimmed.replace(/^\d+\.\s/, '');
      paragraphs.push(
        new Paragraph({
          children: parseFormattedText(text),
          numbering: { reference: 'default-numbering', level: 0 },
          spacing: { after: 80 },
        })
      );
    } else {
      // Regular paragraph with formatting support
      paragraphs.push(
        new Paragraph({
          children: parseFormattedText(trimmed),
          spacing: { after: 160, line: 276 }, // 1.15 line spacing
        })
      );
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440, // 1 inch
              right: 1800, // 1.25 inch
              bottom: 1440,
              left: 1800,
            },
          },
        },
        children: paragraphs,
      },
    ],
    numbering: {
      config: [
        {
          reference: 'default-numbering',
          levels: [
            {
              level: 0,
              format: 'decimal',
              text: '%1.',
              alignment: 'start' as const,
            },
          ],
        },
      ],
    },
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${filename}.docx`);
}
