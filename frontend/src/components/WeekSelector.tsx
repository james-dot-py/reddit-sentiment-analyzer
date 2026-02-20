import { ArrowLeft } from 'lucide-react';

interface Props {
  subreddit: string;
  availableWeeks: string[];
  selectedWeek: string | null;
  onSelect: (week: string) => void;
  onBack: () => void;
  compact?: boolean;
}

function formatWeek(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T12:00:00Z');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  } catch {
    return dateStr;
  }
}

export function WeekSelector({ subreddit, availableWeeks, selectedWeek, onSelect, onBack, compact = false }: Props) {
  if (compact) {
    return (
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors flex-shrink-0"
        >
          <ArrowLeft size={14} />
          Back to communities
        </button>

        <span className="text-[var(--text-muted)] text-sm">r/{subreddit}</span>

        <div className="flex items-center gap-2 flex-wrap">
          {availableWeeks.map((week) => (
            <button
              key={week}
              onClick={() => onSelect(week)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                week === selectedWeek
                  ? 'bg-indigo-600 text-white'
                  : 'border border-[var(--border)] text-[var(--text-secondary)] hover:border-indigo-500/40 hover:text-indigo-400'
              }`}
            >
              {formatWeek(week)}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 py-8">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
      >
        <ArrowLeft size={14} />
        Back to communities
      </button>

      <div>
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">r/{subreddit}</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1">Select a week to explore</p>
      </div>

      {availableWeeks.length === 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-8 text-center">
          <p className="text-[var(--text-muted)] text-sm">
            No weekly data yet — check back after the first Sunday scrape.
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {availableWeeks.map((week) => (
            <button
              key={week}
              onClick={() => onSelect(week)}
              className={`rounded-xl border px-5 py-3 text-sm font-medium transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg ${
                week === selectedWeek
                  ? 'border-indigo-500 bg-indigo-600 text-white shadow-indigo-500/20'
                  : 'border-[var(--border)] bg-[var(--card-bg)] text-[var(--text-secondary)] hover:border-indigo-500/40 hover:text-indigo-400'
              }`}
            >
              {formatWeek(week)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
