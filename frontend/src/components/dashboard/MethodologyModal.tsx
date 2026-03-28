import { X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
}

const scoreRanges = [
  { range: '71–100', label: 'Stable', color: 'var(--color-strength)', desc: 'Brand is well-regarded with positive community sentiment.' },
  { range: '51–70', label: 'Watch', color: 'var(--color-warning)', desc: 'Mixed signals — some concerns emerging but manageable.' },
  { range: '36–50', label: 'At Risk', color: 'var(--color-danger)', desc: 'Significant negative sentiment or trust erosion detected.' },
  { range: '0–35', label: 'Critical', color: '#B91C1C', desc: 'Active crisis — widespread negative sentiment across communities.' },
];

const components = [
  { name: 'Brand Sentiment', weight: '40%', desc: 'Ratio of positive to negative mentions, weighted by engagement.' },
  { name: 'Community Alignment', weight: '25%', desc: 'How well the brand aligns with community values and expectations.' },
  { name: 'Discussion Heat', weight: '20%', desc: 'Intensity and volume of brand-related conversations.' },
  { name: 'Momentum', weight: '15%', desc: 'Direction of change — is sentiment improving or declining?' },
];

export function MethodologyModal({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-[var(--surface-card)] rounded-2xl shadow-xl max-w-lg w-full p-6 border border-[var(--border-subtle)]">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          <X size={18} />
        </button>

        <h3 className="heading text-lg mb-1">How the Undercurrent Score Works</h3>
        <p className="text-xs text-[var(--text-muted)] mb-5">
          A composite score from 0–100 measuring brand health across Reddit communities.
        </p>

        {/* Components */}
        <div className="space-y-2.5 mb-5">
          {components.map(c => (
            <div key={c.name} className="flex items-start gap-3">
              <span className="data-text text-xs font-semibold text-[var(--text-primary)] w-8 shrink-0 text-right">
                {c.weight}
              </span>
              <div>
                <span className="text-sm font-medium text-[var(--text-primary)]">{c.name}</span>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">{c.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Score ranges */}
        <h4 className="section-label mb-2">Score Ranges</h4>
        <div className="space-y-1.5">
          {scoreRanges.map(r => (
            <div key={r.label} className="flex items-center gap-3 text-xs">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: r.color }}
              />
              <span className="data-text w-12 shrink-0 text-[var(--text-secondary)]">{r.range}</span>
              <span className="font-medium text-[var(--text-primary)] w-14 shrink-0">{r.label}</span>
              <span className="text-[var(--text-muted)]">{r.desc}</span>
            </div>
          ))}
        </div>

        <p className="text-[10px] text-[var(--text-muted)] mt-5">
          Data sourced from Reddit communities. Scores update weekly.
        </p>
      </div>
    </div>
  );
}
