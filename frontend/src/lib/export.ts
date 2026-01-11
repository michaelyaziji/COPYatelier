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
 * Removes JSON wrapper, evaluation scores, and code fences.
 */
export function extractCleanContent(content: string): string {
  let cleaned = content.trim();

  // Remove markdown code fences (```json ... ``` or ``` ... ```)
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  cleaned = cleaned.trim();

  // Try to parse as JSON and extract the "output" field
  try {
    if (cleaned.startsWith('{')) {
      const parsed = JSON.parse(cleaned);
      if (parsed.output) {
        return parsed.output.trim();
      }
    }
  } catch {
    // Not valid JSON, try regex approach
  }

  // Check for "output": pattern with various quote styles
  // Handle both "output": "value" and "output": "multi\nline\nvalue"
  const outputMatch = cleaned.match(/"output"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
  if (outputMatch) {
    // Unescape JSON string
    return outputMatch[1]
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
      .trim();
  }

  // If content still looks like it has JSON wrapper, try to extract more aggressively
  if (cleaned.includes('"output"')) {
    // Find everything after "output": " and before the closing "
    const startMatch = cleaned.indexOf('"output"');
    if (startMatch !== -1) {
      const afterOutput = cleaned.substring(startMatch);
      const colonQuote = afterOutput.indexOf('": "');
      if (colonQuote !== -1) {
        const contentStart = colonQuote + 4;
        let contentEnd = contentStart;
        let escaped = false;

        // Find the closing quote, handling escapes
        for (let i = contentStart; i < afterOutput.length; i++) {
          if (escaped) {
            escaped = false;
            continue;
          }
          if (afterOutput[i] === '\\') {
            escaped = true;
            continue;
          }
          if (afterOutput[i] === '"') {
            contentEnd = i;
            break;
          }
        }

        if (contentEnd > contentStart) {
          const extracted = afterOutput.substring(contentStart, contentEnd);
          return extracted
            .replace(/\\n/g, '\n')
            .replace(/\\t/g, '\t')
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\')
            .trim();
        }
      }
    }
  }

  return cleaned;
}

/**
 * Generate and download a Word document from text content.
 */
export async function downloadAsWord(content: string, filename: string = 'document') {
  // Extract clean content first
  const cleanContent = extractCleanContent(content);

  // Parse the content into paragraphs
  const lines = cleanContent.split('\n');
  const paragraphs: Paragraph[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines but add spacing
    if (!trimmed) {
      paragraphs.push(new Paragraph({ text: '' }));
      continue;
    }

    // Check for markdown-style headers
    if (trimmed.startsWith('# ')) {
      paragraphs.push(
        new Paragraph({
          text: trimmed.slice(2),
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 200 },
        })
      );
    } else if (trimmed.startsWith('## ')) {
      paragraphs.push(
        new Paragraph({
          text: trimmed.slice(3),
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 150 },
        })
      );
    } else if (trimmed.startsWith('### ')) {
      paragraphs.push(
        new Paragraph({
          text: trimmed.slice(4),
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 200, after: 100 },
        })
      );
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      // Bullet points
      paragraphs.push(
        new Paragraph({
          children: [new TextRun(trimmed.slice(2))],
          bullet: { level: 0 },
        })
      );
    } else if (/^\d+\.\s/.test(trimmed)) {
      // Numbered lists
      const text = trimmed.replace(/^\d+\.\s/, '');
      paragraphs.push(
        new Paragraph({
          children: [new TextRun(text)],
          numbering: { reference: 'default-numbering', level: 0 },
        })
      );
    } else {
      // Regular paragraph
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: trimmed,
              size: 24, // 12pt
            }),
          ],
          spacing: { after: 200 },
        })
      );
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
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
