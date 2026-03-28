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
  { y1: 71, y2: 100, fill: 'var(--color-strength)', label: 'Stable' },
  { y1: 51, y2: 71,  fill: 'var(--color-info)',     label: 'Watch' },
  { y1: 36, y2: 51,  fill: 'var(--color-warning)',  label: 'At Risk' },
  { y1: 0,  y2: 36,  fill: 'var(--color-danger)',   label: 'Critical' },
];

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload as ScorePoint & { dateLabel: string };
  return (
    <div className="paper-card px-3 py-2 text-xs shadow-lg">
      <div className="data-text font-medium text-base">{d.score}</div>
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
        <h3 className="section-label mb-4">Score Trend</h3>
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

  return (
    <div className="paper-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="section-label">Score Trend</h3>
        <div className="flex items-center gap-3">
          <TrajectoryBadge trajectory={trajectory} />
          {onAddAnnotation && (
            <button
              onClick={() => setShowAddEvent(!showAddEvent)}
              className="inline-flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              <Plus size={11} /> Add Event
            </button>
          )}
        </div>
      </div>

      {/* Add event form */}
      {showAddEvent && onAddAnnotation && (
        <div className="flex items-center gap-2 mb-3 p-2.5 rounded-lg bg-[var(--surface-1)] border border-[var(--border-subtle)]">
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
            placeholder="e.g. Product recall announced"
            className="flex-1 rounded border border-[var(--border-default)] bg-[var(--surface-card)] px-2 py-1 text-xs placeholder:text-[var(--text-muted)]"
            onKeyDown={e => e.key === 'Enter' && handleAddEvent()}
          />
          <button
            onClick={handleAddEvent}
            disabled={!eventDate || !eventLabel}
            className="rounded bg-[var(--color-accent-500)] text-white px-2.5 py-1 text-xs font-medium disabled:opacity-40 cursor-pointer"
          >
            Add
          </button>
        </div>
      )}

      {/* Zone legend */}
      <div className="flex items-center gap-3 mb-2">
        {scoreZones.map(z => (
          <div key={z.label} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: z.fill, opacity: 0.2 }} />
            <span className="text-[9px] text-[var(--text-muted)]">{z.label}</span>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
          <defs>
            <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent-500)" stopOpacity={0.15} />
              <stop offset="100%" stopColor="var(--color-accent-500)" stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* Score zone background bands — full 0-100 scale */}
          {scoreZones.map(zone => (
            <ReferenceArea
              key={zone.label}
              y1={zone.y1}
              y2={zone.y2}
              fill={zone.fill}
              fillOpacity={0.05}
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
            domain={[0, 100]}
            tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
            tickLine={false}
            axisLine={false}
            ticks={[0, 25, 50, 75, 100]}
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
            stroke="var(--color-accent-500)"
            strokeWidth={2}
            dot={{ r: 3, fill: 'var(--surface-card)', stroke: 'var(--color-accent-500)', strokeWidth: 2 }}
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
