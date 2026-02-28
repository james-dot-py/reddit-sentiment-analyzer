import { useState, useCallback } from 'react';
import { XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea, Area, ComposedChart, Line } from 'recharts';
import { Plus } from 'lucide-react';
import type { ScorePoint, Annotation, Trajectory } from '../../types';
import { TrajectoryBadge } from './StatusBadge';

interface Props {
  scoreHistory: ScorePoint[];
  annotations: Annotation[];
  trajectory: Trajectory | null;
  onAddAnnotation?: (date: string, label: string) => void;
}

function formatDate(dateStr: string) {
  try {
    const d = new Date(dateStr + 'T12:00:00Z');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  } catch { return dateStr; }
}

// Score zone definitions for background bands
const scoreZones = [
  { y1: 80, y2: 100, fill: '#059669', label: 'Thriving' },
  { y1: 60, y2: 80,  fill: '#16a34a', label: 'Positive' },
  { y1: 45, y2: 60,  fill: '#64748b', label: 'Stable' },
  { y1: 30, y2: 45,  fill: '#d97706', label: 'Watch' },
  { y1: 15, y2: 30,  fill: '#ea580c', label: 'At Risk' },
  { y1: 0,  y2: 15,  fill: '#dc2626', label: 'Crisis' },
];

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload as ScorePoint & { dateLabel: string };
  return (
    <div className="paper-card px-3 py-2 text-xs">
      <div className="data-text font-medium">{d.score}</div>
      <div className="text-[var(--text-muted)]">{d.dateLabel}</div>
    </div>
  );
}

export function ScoreTrendChart({ scoreHistory, annotations, trajectory, onAddAnnotation }: Props) {
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [eventDate, setEventDate] = useState('');
  const [eventLabel, setEventLabel] = useState('');

  const handleAddEvent = useCallback(() => {
    if (eventDate && eventLabel && onAddAnnotation) {
      onAddAnnotation(eventDate, eventLabel);
      setEventDate('');
      setEventLabel('');
      setShowAddEvent(false);
    }
  }, [eventDate, eventLabel, onAddAnnotation]);

  if (!scoreHistory.length) {
    return (
      <div className="paper-card p-6">
        <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-muted)] mb-4">
          Score Trend
        </h3>
        <p className="text-sm text-[var(--text-muted)] text-center py-8">
          Trend data requires at least 2 weeks of snapshots.
        </p>
      </div>
    );
  }

  const data = scoreHistory.map(p => ({
    ...p,
    dateLabel: formatDate(p.date),
  }));

  const scores = data.map(d => d.score);
  const minScore = Math.max(0, Math.min(...scores) - 10);
  const maxScore = Math.min(100, Math.max(...scores) + 10);

  // Filter zones to only those visible in the chart's Y range
  const visibleZones = scoreZones.filter(
    z => z.y2 > minScore && z.y1 < maxScore,
  );

  return (
    <div className="paper-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-muted)]">
          Score Trend
        </h3>
        <div className="flex items-center gap-3">
          <TrajectoryBadge trajectory={trajectory} />
          {onAddAnnotation && (
            <button
              onClick={() => setShowAddEvent(!showAddEvent)}
              className="inline-flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              <Plus size={11} /> Add Event
            </button>
          )}
        </div>
      </div>

      {/* Add event form */}
      {showAddEvent && onAddAnnotation && (
        <div className="flex items-center gap-2 mb-3 p-2 rounded bg-[var(--surface-1)]">
          <input
            type="date"
            value={eventDate}
            onChange={e => setEventDate(e.target.value)}
            className="rounded border border-[var(--border-default)] bg-[var(--surface-card)] px-2 py-1 text-xs"
          />
          <input
            type="text"
            value={eventLabel}
            onChange={e => setEventLabel(e.target.value)}
            placeholder="Event label..."
            className="flex-1 rounded border border-[var(--border-default)] bg-[var(--surface-card)] px-2 py-1 text-xs placeholder:text-[var(--text-muted)]"
            onKeyDown={e => e.key === 'Enter' && handleAddEvent()}
          />
          <button
            onClick={handleAddEvent}
            disabled={!eventDate || !eventLabel}
            className="rounded bg-[var(--text-primary)] text-[var(--surface-0)] px-2.5 py-1 text-xs font-medium disabled:opacity-40"
          >
            Add
          </button>
        </div>
      )}

      {/* Zone legend */}
      <div className="flex items-center gap-3 mb-2">
        {visibleZones.map(z => (
          <div key={z.label} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: z.fill, opacity: 0.15 }} />
            <span className="text-[9px] text-[var(--text-muted)]">{z.label}</span>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
          <defs>
            <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--text-primary)" stopOpacity={0.08} />
              <stop offset="100%" stopColor="var(--text-primary)" stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* Score zone background bands */}
          {visibleZones.map(zone => (
            <ReferenceArea
              key={zone.label}
              y1={Math.max(zone.y1, minScore)}
              y2={Math.min(zone.y2, maxScore)}
              fill={zone.fill}
              fillOpacity={0.06}
              strokeOpacity={0}
            />
          ))}

          <XAxis
            dataKey="dateLabel"
            tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={[minScore, maxScore]}
            tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="score"
            fill="url(#scoreGrad)"
            stroke="none"
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke="var(--text-primary)"
            strokeWidth={2}
            dot={{ r: 3, fill: 'var(--surface-card)', stroke: 'var(--text-primary)', strokeWidth: 2 }}
            activeDot={{ r: 5 }}
          />
          {annotations.map(a => (
            <ReferenceLine
              key={a.annotation_id}
              x={formatDate(a.date)}
              stroke="var(--text-muted)"
              strokeDasharray="3 3"
              label={{ value: a.label, position: 'top', fontSize: 9, fill: 'var(--text-muted)' }}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
