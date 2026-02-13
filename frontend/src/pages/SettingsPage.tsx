import { Key, ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { saveCredentials } from '../api';

export function SettingsPage() {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('saving');
    try {
      await saveCredentials(clientId, clientSecret);
      setStatus('saved');
    } catch (err) {
      setStatus('error');
      setErrorMsg((err as Error).message);
    }
  };

  const inputClass =
    'w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-primary)]';

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
          <Key size={20} className="text-indigo-500" />
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Reddit API Credentials</h2>
        </div>

        <p className="mb-4 text-sm text-[var(--text-muted)]">
          Optional. Enter your Reddit API credentials for higher rate limits (100 req/min vs 10 req/min).
          The app works fully without credentials using public JSON endpoints.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
              Client ID
            </label>
            <input
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="Your Reddit app client ID"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
              Client Secret
            </label>
            <input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder="Your Reddit app client secret"
              className={inputClass}
            />
          </div>
          <button
            type="submit"
            disabled={!clientId || !clientSecret || status === 'saving'}
            className="w-full rounded-lg accent-gradient px-4 py-2 text-sm font-medium text-white transition-all glow-hover disabled:opacity-40"
          >
            {status === 'saving' ? 'Saving...' : 'Save Credentials'}
          </button>
        </form>

        {status === 'saved' && (
          <p className="mt-3 text-sm text-emerald-400">
            Credentials saved. OAuth will be used for faster rate limits.
          </p>
        )}
        {status === 'error' && (
          <p className="mt-3 text-sm text-red-400">{errorMsg}</p>
        )}
      </div>
    </div>
  );
}
