import type { ReactNode } from 'react';

/** Convert **bold** markers to <strong> elements within a single text segment. */
function renderInlineFormatting(text: string): ReactNode {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : part,
  );
}

/**
 * Render text that may contain **bold** and bullet lists (`- ...`).
 *
 * Splits on double newlines into blocks. Blocks where every line starts
 * with `- ` are rendered as `<ul>/<li>`. Everything else becomes `<p>`.
 * Inline **bold** is converted to `<strong>` in all cases.
 */
export function renderFormattedText(text: string): ReactNode[] {
  const blocks = text.split('\n\n').filter(Boolean);

  return blocks.map((block, i) => {
    const lines = block.split('\n').filter(Boolean);
    const isBulletLine = (l: string) => /^\s*[-*]\s+/.test(l);
    const isBulletBlock = lines.length > 0 && lines.every(isBulletLine);

    if (isBulletBlock) {
      return (
        <ul key={i} className="list-disc pl-5 space-y-1">
          {lines.map((line, j) => (
            <li key={j} className="body-text text-sm">
              {renderInlineFormatting(line.replace(/^\s*[-*]\s+/, ''))}
            </li>
          ))}
        </ul>
      );
    }

    return (
      <p key={i} className="body-text text-sm">
        {renderInlineFormatting(block)}
      </p>
    );
  });
}
