import { BarChart3 } from 'lucide-react';

export function AnalysisPage() {
  return (
    <div className="flex flex-col items-center justify-center py-20 space-y-6">
      <BarChart3 size={48} className="text-[var(--text-muted)]" />
      <h1 className="heading text-3xl text-[var(--text-primary)]">Undercurrent v2</h1>
      <p className="body-text text-[var(--text-secondary)] text-center max-w-md">
        Longitudinal brand intelligence from Reddit. Dashboard coming soon.
      </p>
      <p className="text-xs text-[var(--text-muted)]">
        Built by Jimmy Friedman
      </p>
    </div>
  );
}
