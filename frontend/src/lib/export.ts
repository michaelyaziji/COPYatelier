import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { saveAs } from 'file-saver';

/**
 * Extract clean content from potentially JSON-wrapped output.
 */
function extractCleanContent(content: string): string {
  let cleaned = content.trim();

  // Try to parse as JSON and extract the "output" field
  try {
    // Check if it looks like JSON
    if (cleaned.startsWith('{') || cleaned.startsWith('```json')) {
      // Remove markdown code fence if present
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      }

      const parsed = JSON.parse(cleaned);
      if (parsed.output) {
        return parsed.output.trim();
      }
    }
  } catch {
    // Not valid JSON, continue with original content
  }

  // Check for "output": pattern even if not valid JSON
  const outputMatch = cleaned.match(/"output"\s*:\s*"([\s\S]*?)"\s*\}?\s*$/);
  if (outputMatch) {
    // Unescape JSON string
    return outputMatch[1]
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
      .trim();
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
