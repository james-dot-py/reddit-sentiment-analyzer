import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { SubredditDashboardData } from '../../types';
import { StatusBadge } from './StatusBadge';

interface Props {
  data: SubredditDashboardData;
}

export function SubredditCard({ data }: Props) {
  const { subreddit, synthesis, deep_analysis_summary, community_profile } = data;
  const mentionCount = deep_analysis_summary?.mention_count ?? 0;
  const dist = deep_analysis_summary?.sentiment_distribution;
  const [expanded, setExpanded] = useState(false);
  const narrative = synthesis.narrative_summary || '';
  const isLong = narrative.length > 200;

  return (
    <div className="paper-card p-5 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h4 className="heading text-base">r/{subreddit}</h4>
        <StatusBadge status={synthesis.status_tag} size="sm" />
      </div>

      <div className="flex items-baseline gap-3 mb-3">
        <span className="data-text text-2xl font-medium">{synthesis.undercurrent_score}</span>
        <span className="text-xs text-[var(--text-muted)]">{mentionCount} mentions</span>
      </div>

      {dist && (
        <div className="flex gap-0.5 h-2 rounded-full overflow-hidden mb-3">
          {dist.positive > 0 && (
            <div className="bg-positive" style={{ width: `${dist.positive * 100}%` }} />
          )}
          {dist.neutral > 0 && (
            <div className="bg-neutral-sentiment" style={{ width: `${dist.neutral * 100}%` }} />
          )}
          {dist.mixed > 0 && (
            <div className="bg-mixed" style={{ width: `${dist.mixed * 100}%` }} />
          )}
          {dist.negative > 0 && (
            <div className="bg-negative" style={{ width: `${dist.negative * 100}%` }} />
          )}
        </div>
      )}

      {narrative && (
        <div className="flex-1 mt-1">
          <div className={`body-text text-sm leading-[1.8] text-[var(--text-secondary)] ${!expanded && isLong ? 'line-clamp-5' : ''}`}>
            {narrative}
          </div>
          {isLong && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="inline-flex items-center gap-1 mt-3 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors active:opacity-70"
            >
              {expanded ? (
                <><ChevronUp size={12} /> Show less</>
              ) : (
                <><ChevronDown size={12} /> Read full analysis</>
              )}
            </button>
          )}
        </div>
      )}

      {community_profile && (
        <div className="mt-3 pt-3 border-t border-[var(--border-subtle)]">
          <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
            {community_profile.dominant_tone}
          </span>
        </div>
      )}
    </div>
  );
}
