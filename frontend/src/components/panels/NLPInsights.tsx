import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../ui/Card';
import type { NLPInsights as NLPInsightsType } from '../../types';

const tooltipStyle = {
  backgroundColor: 'var(--surface-2)',
  border: '1px solid var(--glass-border)',
  borderRadius: '8px',
  fontSize: '12px',
  boxShadow: 'var(--glass-shadow)',
};

interface Props {
  insights: NLPInsightsType;
  isFiltered?: boolean;
}

const entityLabelColors: Record<string, string> = {
  PERSON: 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-400',
  ORG: 'bg-violet-500/10 border border-violet-500/20 text-violet-400',
  GPE: 'bg-amber-500/10 border border-amber-500/20 text-amber-400',
  NORP: 'bg-teal-500/10 border border-teal-500/20 text-teal-400',
  EVENT: 'bg-pink-500/10 border border-pink-500/20 text-pink-400',
  PRODUCT: 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-400',
  WORK_OF_ART: 'bg-rose-500/10 border border-rose-500/20 text-rose-400',
};

export function NLPInsights({ insights, isFiltered }: Props) {
  const { entities, bigrams, trigrams, text_stats } = insights;
  const topEntities = entities.slice(0, 15);
  const topBigrams = bigrams.slice(0, 10);
  const topTrigrams = trigrams.slice(0, 10);

  return (
    <Card
      title="Linguistic Profile"
      tooltip="Named entities, common phrases, and corpus metrics extracted from the analyzed content."
    >
      {isFiltered && (
        <p className="mb-4 text-xs italic text-[var(--text-muted)]">
          Showing full corpus linguistic profile (not filtered by community).
        </p>
      )}
      <div className="space-y-6">
        {/* Entities */}
        {topEntities.length > 0 && (
          <div>
            <h4 className="mb-2 text-sm font-medium text-[var(--text-muted)]">Named Entities</h4>
            <div className="flex flex-wrap gap-2">
              {topEntities.map((e, i) => (
                <span
                  key={i}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${entityLabelColors[e.label] || 'bg-gray-500/10 border border-gray-500/20 text-gray-400'}`}
                >
                  {e.text}
                  <span className="opacity-60">({e.count})</span>
                  <span className="ml-0.5 text-[10px] opacity-40">{e.label}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Bigrams */}
        {topBigrams.length > 0 && (
          <div>
            <h4 className="mb-2 text-sm font-medium text-[var(--text-muted)]">Frequent Bigrams</h4>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topBigrams} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 80 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} stroke="var(--text-muted)" />
                <YAxis type="category" dataKey="text" tick={{ fontSize: 11 }} stroke="var(--text-muted)" width={80} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill="#818cf8" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Trigrams */}
        {topTrigrams.length > 0 && (
          <div>
            <h4 className="mb-2 text-sm font-medium text-[var(--text-muted)]">Frequent Trigrams</h4>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topTrigrams} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 100 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} stroke="var(--text-muted)" />
                <YAxis type="category" dataKey="text" tick={{ fontSize: 11 }} stroke="var(--text-muted)" width={100} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill="#a78bfa" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Corpus Metrics */}
        <div>
          <h4 className="mb-2 text-sm font-medium text-[var(--text-muted)]">Corpus Metrics</h4>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Mean Post Length" value={`${Math.round(text_stats.avg_post_length)} chars`} />
            {text_stats.avg_comment_length != null && (
              <Stat label="Mean Comment Length" value={`${Math.round(text_stats.avg_comment_length)} chars`} />
            )}
            <Stat label="Vocabulary Richness" value={`${(text_stats.vocabulary_richness * 100).toFixed(1)}%`} />
            <Stat label="Reading Level" value={`Grade ${text_stats.reading_level.toFixed(1)}`} />
            <Stat label="Total Words" value={text_stats.total_words.toLocaleString()} />
          </div>
        </div>
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] p-3">
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-[var(--text-primary)]">{value}</div>
    </div>
  );
}
