import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { renderFormattedText } from '../../utils/formatText';
import { Card } from '../ui/Card';

export function AISummary({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card title="Synthesis" tooltip="A plain-English synthesis of the analysis findings, generated from computed statistics.">
      <div className="relative">
        <div
          className={`space-y-3 overflow-hidden transition-all duration-300 ${
            expanded ? '' : 'max-h-[268px]'
          }`}
        >
          {renderFormattedText(text)}
        </div>

        {/* Fade gradient — only shown when collapsed */}
        {!expanded && (
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[var(--card-bg)] to-transparent" />
        )}
      </div>

      <button
        onClick={() => setExpanded(!expanded)}
        className="mt-3 flex items-center gap-1 text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
      >
        {expanded ? (
          <><ChevronUp size={13} /> Show less</>
        ) : (
          <><ChevronDown size={13} /> Read more</>
        )}
      </button>
    </Card>
  );
}
