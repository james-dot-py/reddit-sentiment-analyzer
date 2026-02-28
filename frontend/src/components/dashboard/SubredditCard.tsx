import type { SubredditDashboardData } from '../../types';
import { StatusBadge } from './StatusBadge';

interface Props {
  data: SubredditDashboardData;
}

export function SubredditCard({ data }: Props) {
  const { subreddit, synthesis, deep_analysis_summary, community_profile } = data;
  const mentionCount = deep_analysis_summary?.mention_count ?? 0;
  const dist = deep_analysis_summary?.sentiment_distribution;

  return (
    <div className="paper-card p-5">
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
            <div className="bg-emerald-500" style={{ width: `${dist.positive * 100}%` }} />
          )}
          {dist.neutral > 0 && (
            <div className="bg-slate-300" style={{ width: `${dist.neutral * 100}%` }} />
          )}
          {dist.mixed > 0 && (
            <div className="bg-amber-400" style={{ width: `${dist.mixed * 100}%` }} />
          )}
          {dist.negative > 0 && (
            <div className="bg-red-500" style={{ width: `${dist.negative * 100}%` }} />
          )}
        </div>
      )}

      {synthesis.narrative_summary && (
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-3">
          {synthesis.narrative_summary.slice(0, 200)}
          {synthesis.narrative_summary.length > 200 ? '...' : ''}
        </p>
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
