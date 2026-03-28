import { useMemo } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';
import type { ThemeEntry, EmergingTheme, DecliningTheme } from '../../types';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { SectionVerdict } from './SectionVerdict';

interface Props {
  themes: ThemeEntry[];
  emergingThemes?: EmergingTheme[];
  decliningThemes?: DecliningTheme[];
  sectionVerdict?: string;
}

function formatThemeName(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function quadrantColor(sentiment: number, count: number, medianCount: number): string {
  const highVol = count >= medianCount;
  if (sentiment >= 0) return highVol ? 'var(--color-strength)' : 'var(--color-info)';
  return highVol ? 'var(--color-danger)' : 'var(--color-warning)';
}

const GROWTH_RATE_STYLE: Record<string, { label: string; color: string }> = {
  accelerating: { label: 'Accelerating', color: 'text-[var(--color-trend)]' },
  steady: { label: 'Steady', color: 'text-[var(--color-strength)]' },
  slowing: { label: 'Slowing', color: 'text-[var(--text-muted)]' },
};

const TREND_STYLE: Record<string, { label: string; color: string }> = {
  fading: { label: 'Fading', color: 'text-[var(--color-warning)]' },
  collapsed: { label: 'Collapsed', color: 'text-[var(--color-danger)]' },
  plateaued: { label: 'Plateaued', color: 'text-[var(--text-muted)]' },
};

function BubbleTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="paper-card px-3 py-2 text-xs shadow-lg">
      <div className="font-medium text-[var(--text-primary)] mb-1">{d.displayName}</div>
      <div className="space-y-0.5 text-[var(--text-secondary)]">
        <div>{d.count} mentions</div>
        <div>Sentiment: {d.avg_sentiment > 0 ? '+' : ''}{d.avg_sentiment.toFixed(2)}</div>
        {d.velocity != null && <div>Velocity: {d.velocity > 0 ? '+' : ''}{d.velocity.toFixed(2)}</div>}
      </div>
    </div>
  );
}

export function ThemeChart({ themes, emergingThemes, decliningThemes, sectionVerdict }: Props) {
  const { chartData, medianCount } = useMemo(() => {
    const sorted = [...themes].sort((a, b) => b.count - a.count).slice(0, 12);
    const counts = sorted.map(t => t.count);
    const median = counts.length > 0
      ? counts.sort((a, b) => a - b)[Math.floor(counts.length / 2)]
      : 1;

    const data = sorted.map(t => ({
      ...t,
      displayName: formatThemeName(t.theme),
      // Z-axis: bubble size from velocity (abs), default 0.5
      z: Math.max(0.3, Math.min(1, Math.abs(t.velocity ?? 0.5))),
    }));

    return { chartData: data, medianCount: median };
  }, [themes]);

  return (
    <div className="paper-card p-6">
      <h3 className="section-label mb-4">Theme Map</h3>

      <SectionVerdict verdict={sectionVerdict} />

      {chartData.length > 0 ? (
        <>
          <ResponsiveContainer width="100%" height={260}>
            <ScatterChart margin={{ top: 10, right: 10, bottom: 20, left: 10 }}>
              <XAxis
                type="number"
                dataKey="avg_sentiment"
                domain={[-1, 1]}
                tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                tickLine={false}
                axisLine={{ stroke: 'var(--border-subtle)' }}
                label={{ value: '← Negative    Positive →', position: 'bottom', offset: 5, fontSize: 9, fill: 'var(--text-muted)' }}
                tickFormatter={(v: number) => v.toFixed(1)}
              />
              <YAxis
                type="number"
                dataKey="count"
                tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                tickLine={false}
                axisLine={{ stroke: 'var(--border-subtle)' }}
                label={{ value: 'Volume', angle: -90, position: 'insideLeft', offset: 0, fontSize: 9, fill: 'var(--text-muted)' }}
              />
              <ZAxis type="number" dataKey="z" range={[120, 600]} />
              <Tooltip content={<BubbleTooltip />} />

              {/* Quadrant divider lines */}
              <ReferenceLine x={0} stroke="var(--border-default)" strokeDasharray="3 3" />
              <ReferenceLine y={medianCount} stroke="var(--border-default)" strokeDasharray="3 3" />

              <Scatter data={chartData} fillOpacity={0.7}>
                {chartData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={quadrantColor(entry.avg_sentiment, entry.count, medianCount)}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>

          {/* Theme name labels below chart */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {chartData.map((t, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] border border-[var(--border-subtle)] text-[var(--text-secondary)]"
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: quadrantColor(t.avg_sentiment, t.count, medianCount) }}
                />
                {t.displayName}
              </span>
            ))}
          </div>
        </>
      ) : (
        <p className="text-sm text-[var(--text-muted)] text-center py-4">No themes detected yet.</p>
      )}

      {/* Emerging & Fading signals */}
      {(emergingThemes?.length || decliningThemes?.length) ? (
        <div className="mt-4 pt-4 border-t border-[var(--border-subtle)] grid grid-cols-2 gap-4">
          {emergingThemes && emergingThemes.length > 0 && (
            <div>
              <h4 className="text-[10px] uppercase tracking-wider text-[var(--color-trend)] font-medium flex items-center gap-1 mb-2">
                <TrendingUp size={12} /> Emerging
              </h4>
              <div className="space-y-1.5">
                {emergingThemes.slice(0, 4).map((t, i) => {
                  const style = GROWTH_RATE_STYLE[t.growth_rate] || GROWTH_RATE_STYLE.steady;
                  return (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="text-[var(--text-secondary)]">{formatThemeName(t.theme)}</span>
                      <span className={`text-[10px] font-medium ${style.color}`}>{style.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {decliningThemes && decliningThemes.length > 0 && (
            <div>
              <h4 className="text-[10px] uppercase tracking-wider text-[var(--color-danger)] font-medium flex items-center gap-1 mb-2">
                <TrendingDown size={12} /> Fading
              </h4>
              <div className="space-y-1.5">
                {decliningThemes.slice(0, 4).map((t, i) => {
                  const style = TREND_STYLE[t.trend] || TREND_STYLE.fading;
                  return (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="text-[var(--text-secondary)]">{formatThemeName(t.theme)}</span>
                      <span className={`text-[10px] font-medium ${style.color}`}>{style.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
