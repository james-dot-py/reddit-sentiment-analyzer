import { useState } from 'react';
import { Heart, AlertTriangle, TrendingUp, ArrowRight, TrendingDown } from 'lucide-react';
import type { CommunityAlignment, DetailedItem } from '../../types';
import { SectionVerdict } from './SectionVerdict';

interface Props {
  alignment: CommunityAlignment;
  frictionDetails?: DetailedItem[];
  alignedDetails?: DetailedItem[];
  sectionVerdict?: string;
}

const TREND_ICONS = {
  rising: TrendingUp,
  stable: ArrowRight,
  declining: TrendingDown,
};

function DetailedPill({ item }: { item: DetailedItem; type: 'aligned' | 'friction' }) {
  const TrendIcon = TREND_ICONS[item.trend || 'stable'];
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-[var(--text-secondary)]">{item.text}</span>
      {item.trend && (
        <TrendIcon size={10} className="text-[var(--text-muted)] shrink-0" />
      )}
      {item.mention_count != null && (
        <span className="text-[10px] data-text text-[var(--text-muted)] shrink-0">
          {item.mention_count}
        </span>
      )}
    </div>
  );
}

function SimplePill({ text, type }: { text: string; type: 'aligned' | 'friction' }) {
  const colors = type === 'aligned'
    ? 'bg-[var(--color-strength)]/10 border-[var(--color-strength)]/20 text-[var(--color-strength)]'
    : 'bg-[var(--color-warning)]/10 border-[var(--color-warning)]/20 text-[var(--color-warning)]';
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] ${colors}`}>
      {text}
    </span>
  );
}

export function CommunityValues({ alignment, frictionDetails, alignedDetails, sectionVerdict }: Props) {
  const { aligned_values, friction_points } = alignment;
  const [showAllAligned, setShowAllAligned] = useState(false);
  const [showAllFriction, setShowAllFriction] = useState(false);

  if (!aligned_values.length && !friction_points.length) return null;

  const VISIBLE_LIMIT = 4;

  // Use detailed items if available, sorted by mention count
  const sortedAligned = alignedDetails
    ? [...alignedDetails].sort((a, b) => (b.mention_count ?? 0) - (a.mention_count ?? 0))
    : null;
  const sortedFriction = frictionDetails
    ? [...frictionDetails].sort((a, b) => (b.mention_count ?? 0) - (a.mention_count ?? 0))
    : null;

  const alignedCount = sortedAligned?.length ?? aligned_values.length;
  const frictionCount = sortedFriction?.length ?? friction_points.length;

  return (
    <div className="paper-card p-6">
      <h3 className="section-label mb-4">Community Alignment</h3>

      <SectionVerdict verdict={sectionVerdict} />

      <div className="grid grid-cols-2 gap-6">
        {/* Aligned Values */}
        <div>
          <h4 className="text-[10px] uppercase tracking-wider text-[var(--color-strength)] font-medium flex items-center gap-1.5 mb-3">
            <Heart size={12} /> Values Aligned
          </h4>
          {sortedAligned ? (
            <div className="space-y-2">
              {(showAllAligned ? sortedAligned : sortedAligned.slice(0, VISIBLE_LIMIT)).map((item, i) => (
                <DetailedPill key={i} item={item} type="aligned" />
              ))}
              {alignedCount > VISIBLE_LIMIT && (
                <button
                  onClick={() => setShowAllAligned(!showAllAligned)}
                  className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] cursor-pointer"
                >
                  {showAllAligned ? 'Show less' : `Show all (${alignedCount})`}
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {(showAllAligned ? aligned_values : aligned_values.slice(0, VISIBLE_LIMIT)).map((v, i) => (
                <SimplePill key={i} text={v} type="aligned" />
              ))}
              {alignedCount > VISIBLE_LIMIT && (
                <button
                  onClick={() => setShowAllAligned(!showAllAligned)}
                  className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] cursor-pointer self-center"
                >
                  {showAllAligned ? 'Less' : `+${alignedCount - VISIBLE_LIMIT}`}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Friction Points */}
        <div>
          <h4 className="text-[10px] uppercase tracking-wider text-[var(--color-warning)] font-medium flex items-center gap-1.5 mb-3">
            <AlertTriangle size={12} /> Friction Points
          </h4>
          {sortedFriction ? (
            <div className="space-y-2">
              {(showAllFriction ? sortedFriction : sortedFriction.slice(0, VISIBLE_LIMIT)).map((item, i) => (
                <DetailedPill key={i} item={item} type="friction" />
              ))}
              {frictionCount > VISIBLE_LIMIT && (
                <button
                  onClick={() => setShowAllFriction(!showAllFriction)}
                  className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] cursor-pointer"
                >
                  {showAllFriction ? 'Show less' : `Show all (${frictionCount})`}
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {(showAllFriction ? friction_points : friction_points.slice(0, VISIBLE_LIMIT)).map((v, i) => (
                <SimplePill key={i} text={v} type="friction" />
              ))}
              {frictionCount > VISIBLE_LIMIT && (
                <button
                  onClick={() => setShowAllFriction(!showAllFriction)}
                  className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] cursor-pointer self-center"
                >
                  {showAllFriction ? 'Less' : `+${frictionCount - VISIBLE_LIMIT}`}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
