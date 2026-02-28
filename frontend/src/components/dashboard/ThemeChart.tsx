import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { ThemeEntry, EmergingTheme, DecliningTheme } from '../../types';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface Props {
  themes: ThemeEntry[];
  emergingThemes?: EmergingTheme[];
  decliningThemes?: DecliningTheme[];
}

function sentimentColor(avg: number): string {
  if (avg > 0.3) return '#059669';
  if (avg > 0) return '#16a34a';
  if (avg > -0.3) return '#64748b';
  return '#dc2626';
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload as ThemeEntry;
  return (
    <div className="paper-card px-3 py-2 text-xs">
      <div className="font-medium">{d.theme}</div>
      <div className="text-[var(--text-muted)]">
        {d.count} mentions · avg sentiment {d.avg_sentiment.toFixed(2)}
      </div>
    </div>
  );
}

export function ThemeChart({ themes, emergingThemes, decliningThemes }: Props) {
  const sorted = [...themes].sort((a, b) => b.count - a.count).slice(0, 10);

  return (
    <div className="paper-card p-6">
      <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-muted)] mb-4">
        Theme Map
      </h3>

      {sorted.length > 0 ? (
        <ResponsiveContainer width="100%" height={sorted.length * 32 + 20}>
          <BarChart data={sorted} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 0 }}>
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="theme"
              tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
              tickLine={false}
              axisLine={false}
              width={140}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="count" radius={[0, 3, 3, 0]} maxBarSize={18}>
              {sorted.map((entry, i) => (
                <Cell key={i} fill={sentimentColor(entry.avg_sentiment)} fillOpacity={0.7} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-sm text-[var(--text-muted)] text-center py-4">No themes detected yet.</p>
      )}

      {(emergingThemes?.length || decliningThemes?.length) ? (
        <div className="mt-4 pt-4 border-t border-[var(--border-subtle)] grid grid-cols-2 gap-4">
          {emergingThemes && emergingThemes.length > 0 && (
            <div>
              <h4 className="text-[10px] uppercase tracking-wider text-emerald-600 font-medium flex items-center gap-1 mb-2">
                <TrendingUp size={12} /> Emerging
              </h4>
              <ul className="space-y-1">
                {emergingThemes.slice(0, 3).map((t, i) => (
                  <li key={i} className="text-xs text-[var(--text-secondary)]">
                    {t.theme} <span className="text-[var(--text-muted)]">({t.growth_rate})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {decliningThemes && decliningThemes.length > 0 && (
            <div>
              <h4 className="text-[10px] uppercase tracking-wider text-red-600 font-medium flex items-center gap-1 mb-2">
                <TrendingDown size={12} /> Fading
              </h4>
              <ul className="space-y-1">
                {decliningThemes.slice(0, 3).map((t, i) => (
                  <li key={i} className="text-xs text-[var(--text-secondary)]">
                    {t.theme} <span className="text-[var(--text-muted)]">({t.trend})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
