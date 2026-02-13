import { Info, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export function SettingsPage() {
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeft size={14} />
        Back to Analysis
      </Link>

      <div className="glass-card rounded-2xl p-6">
        <div className="mb-4 flex items-center gap-2">
          <Info size={20} className="text-indigo-500" />
          <h2 className="text-lg font-bold text-[var(--text-primary)]">About</h2>
        </div>

        <p className="text-sm text-[var(--text-muted)]">
          Reddit data is fetched directly by your browser using Reddit's public JSON API.
          No API credentials are needed. Your browser's residential IP avoids the rate limits
          that affect cloud servers.
        </p>
      </div>
    </div>
  );
}
