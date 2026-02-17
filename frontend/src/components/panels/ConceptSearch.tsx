import { useState } from 'react';
import { Search } from 'lucide-react';
import { Card } from '../ui/Card';
import type { ConceptSearchResponse, TribalTopic } from '../../types';

const API_BASE = import.meta.env.VITE_API_URL || '';

interface Props {
  analysisId: string;
  onResult?: (topic: TribalTopic | null) => void;
}

export function ConceptSearch({ analysisId, onResult }: Props) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<ConceptSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/concept-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis_id: analysisId, query: query.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Request failed (${res.status})`);
      }
      const data: ConceptSearchResponse = await res.json();
      setResult(data);
      onResult?.(data.topic);
    } catch (err: any) {
      setError(err.message || 'Search failed');
      setResult(null);
      onResult?.(null);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setQuery('');
    setResult(null);
    setError('');
    onResult?.(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <Card
      title="Concept Explorer"
      tooltip="Search for multi-term concepts (comma-separated). Results appear on the Tribal Map above."
    >
      <p className="body-text text-sm mb-4">
        Search across related terms to see how the community discusses a concept.
        Separate synonyms with commas.
      </p>

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. apple, mango, kiwi"
          className="flex-1 rounded border border-[var(--border-default)] bg-[var(--surface-0)] px-3 py-2 text-sm data-text text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--text-muted)]"
        />
        <button
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          className="rounded px-4 py-2 text-sm font-medium accent-gradient disabled:opacity-40 flex items-center gap-1.5"
        >
          <Search size={14} />
          Search
        </button>
        {result && (
          <button
            onClick={handleClear}
            className="rounded px-3 py-2 text-sm text-[var(--text-muted)] border border-[var(--border-default)] hover:text-[var(--text-primary)]"
          >
            Clear
          </button>
        )}
      </div>

      {error && (
        <p className="text-sm text-[var(--tribal-blasphemous)] mb-3">{error}</p>
      )}

      {result && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="flex gap-6 data-text text-xs text-[var(--text-muted)]">
            <div>
              Terms:{' '}
              <span className="text-[var(--text-primary)] font-medium">
                {result.terms.join(', ')}
              </span>
            </div>
            <div>
              Posts:{' '}
              <span className="text-[var(--text-primary)] font-medium">
                {result.matching_post_count}
              </span>
            </div>
            <div>
              Comments:{' '}
              <span className="text-[var(--text-primary)] font-medium">
                {result.matching_comment_count}
              </span>
            </div>
          </div>

          {result.stats && (
            <div className="flex gap-6 data-text text-xs">
              <div className="text-[var(--text-muted)]">
                Mean sentiment:{' '}
                <span
                  className="font-medium"
                  style={{
                    color:
                      result.stats.mean > 0.1
                        ? 'var(--tribal-sacred)'
                        : result.stats.mean < -0.1
                          ? 'var(--tribal-blasphemous)'
                          : 'var(--text-primary)',
                  }}
                >
                  {result.stats.mean > 0 ? '+' : ''}
                  {result.stats.mean.toFixed(3)}
                </span>
              </div>
              <div className="text-[var(--text-muted)]">
                Std dev:{' '}
                <span className="text-[var(--text-primary)] font-medium">
                  {result.stats.std_dev.toFixed(3)}
                </span>
              </div>
            </div>
          )}

          {result.topic && (
            <div className="data-text text-xs text-[var(--text-muted)]">
              Classification:{' '}
              <span
                className="font-medium"
                style={{
                  color:
                    result.topic.tribal_class === 'Sacred'
                      ? 'var(--tribal-sacred)'
                      : result.topic.tribal_class === 'Blasphemous'
                        ? 'var(--tribal-blasphemous)'
                        : result.topic.tribal_class === 'Controversial'
                          ? 'var(--tribal-controversial)'
                          : 'var(--text-primary)',
                }}
              >
                {result.topic.tribal_class}
              </span>
              {' — now highlighted on the map above'}
            </div>
          )}

          {/* Snippets as pull quotes */}
          {result.snippets.length > 0 && (
            <div className="space-y-2">
              {result.snippets.slice(0, 3).map((s, i) => (
                <div
                  key={i}
                  className="pull-quote text-xs"
                  style={{
                    borderLeftColor:
                      s.sentiment_score > 0.1
                        ? 'var(--tribal-sacred)'
                        : s.sentiment_score < -0.1
                          ? 'var(--tribal-blasphemous)'
                          : 'var(--border-default)',
                  }}
                >
                  {s.text}
                  <span className="data-text not-italic ml-2 text-[var(--text-muted)]">
                    ({s.sentiment_score > 0 ? '+' : ''}{s.sentiment_score.toFixed(2)}, {s.source_type})
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
