import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { saveAs } from 'file-saver';

/**
 * Extract clean content from potentially JSON-wrapped output.
 */
function extractCleanContent(content: string): string {
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
