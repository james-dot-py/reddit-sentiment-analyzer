import { useMemo } from 'react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
  Label,
} from 'recharts';
import { Card } from '../ui/Card';
import type { TribalAnalysis, TribalClass, TribalTopic } from '../../types';

const TRIBAL_COLORS: Record<TribalClass, string> = {
  Sacred: '#2E5E4E',
  Blasphemous: '#8A1C1C',
  Controversial: '#D4A017',
  Neutral: '#B0B0B0',
};

const TRIBAL_LABELS: Record<TribalClass, string> = {
  Sacred: 'Sacred (Idols)',
  Blasphemous: 'Blasphemous (Taboos)',
  Controversial: 'Controversial (Battleground)',
  Neutral: 'Neutral',
};

interface ScatterPoint {
  x: number;
  y: number;
  z: number;
  topic: string;
  tribal_class: TribalClass;
  fill: string;
  sample: string;
  isHighlight?: boolean;
}

interface Props {
  tribalAnalysis: TribalAnalysis;
  highlightTopic?: TribalTopic | null;
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload as ScatterPoint;
  return (
    <div className="paper-card p-3 max-w-xs shadow-lg">
      <div className="heading text-sm mb-1">{d.topic}</div>
      <div
        className="data-text text-xs font-medium mb-2"
        style={{ color: d.fill }}
      >
        {TRIBAL_LABELS[d.tribal_class]}
      </div>
      <div className="data-text text-xs space-y-0.5 text-[var(--text-muted)]">
        <div>Sentiment: {d.x > 0 ? '+' : ''}{d.x.toFixed(3)}</div>
        <div>Consensus: {d.y.toFixed(1)}</div>
        <div>Mentions: {d.z}</div>
      </div>
      {d.sample && (
        <div className="mt-2 text-xs italic text-[var(--text-secondary)] border-t border-[var(--border-subtle)] pt-2">
          &ldquo;{d.sample}&rdquo;
        </div>
      )}
    </div>
  );
}

export function TribalMap({ tribalAnalysis, highlightTopic }: Props) {
  const data = useMemo(() => {
    const points: ScatterPoint[] = tribalAnalysis.topics.map((t) => ({
      x: t.mean_sentiment,
      y: t.consensus_score,
      z: t.mention_count,
      topic: t.topic,
      tribal_class: t.tribal_class,
      fill: TRIBAL_COLORS[t.tribal_class],
      sample: t.sample_texts[0] || '',
    }));

    // Add highlighted concept search result
    if (highlightTopic) {
      points.push({
        x: highlightTopic.mean_sentiment,
        y: highlightTopic.consensus_score,
        z: highlightTopic.mention_count,
        topic: highlightTopic.topic,
        tribal_class: highlightTopic.tribal_class,
        fill: '#222222',
        sample: highlightTopic.sample_texts[0] || '',
        isHighlight: true,
      });
    }

    return points;
  }, [tribalAnalysis.topics, highlightTopic]);

  if (data.length === 0) {
    return (
      <Card title="The Sentiment Landscape">
        <p className="body-text text-sm">
          Not enough data to map tribal patterns. Try analyzing more posts or
          including comments.
        </p>
      </Card>
    );
  }

  const maxY = Math.max(...data.map((d) => d.y), 10);

  return (
    <Card title="The Sentiment Landscape">
      <ResponsiveContainer width="100%" height={420}>
        <ScatterChart margin={{ top: 30, right: 30, bottom: 30, left: 20 }}>
          <XAxis
            type="number"
            dataKey="x"
            domain={[-1, 1]}
            tickCount={5}
            axisLine={false}
            tickLine={false}
          >
            <Label
              value="Sentiment"
              position="bottom"
              offset={10}
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: 11,
                fill: 'var(--text-muted)',
                textTransform: 'uppercase',
              }}
            />
          </XAxis>
          <YAxis
            type="number"
            dataKey="y"
            domain={[0, maxY * 1.1]}
            axisLine={false}
            tickLine={false}
          >
            <Label
              value="Consensus"
              angle={-90}
              position="insideLeft"
              offset={0}
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: 11,
                fill: 'var(--text-muted)',
                textTransform: 'uppercase',
              }}
            />
          </YAxis>
          <ZAxis type="number" dataKey="z" range={[40, 400]} />

          {/* Quadrant labels */}
          <ReferenceLine x={0} stroke="var(--border-default)" strokeDasharray="3 3" />

          <Tooltip
            content={<CustomTooltip />}
            cursor={false}
          />

          <Scatter data={data} isAnimationActive={false}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.fill}
                fillOpacity={entry.isHighlight ? 1 : entry.tribal_class === 'Neutral' ? 0.35 : 0.8}
                stroke={entry.isHighlight ? '#222' : 'none'}
                strokeWidth={entry.isHighlight ? 2 : 0}
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>

      {/* Direct labeling — no legend, inline key */}
      <div className="mt-4 flex flex-wrap gap-4 justify-center">
        {(Object.entries(TRIBAL_COLORS) as [TribalClass, string][]).map(
          ([cls, color]) => {
            const count = tribalAnalysis.topics.filter(
              (t) => t.tribal_class === cls
            ).length;
            if (count === 0 && cls === 'Neutral') return null;
            return (
              <div key={cls} className="flex items-center gap-1.5 data-text text-xs">
                <div
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="text-[var(--text-muted)]">
                  {TRIBAL_LABELS[cls]}{' '}
                  <span className="font-medium text-[var(--text-secondary)]">({count})</span>
                </span>
              </div>
            );
          }
        )}
      </div>
    </Card>
  );
}
