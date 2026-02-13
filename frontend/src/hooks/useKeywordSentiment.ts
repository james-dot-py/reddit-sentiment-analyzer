import { useCallback, useState } from 'react';
import { fetchKeywordSentiment } from '../api';
import type { KeywordComparison } from '../types';

export function useKeywordSentiment(analysisId: string) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<KeywordComparison | null>(null);
  const [error, setError] = useState<string | null>(null);

  const compare = useCallback(async (keyword: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchKeywordSentiment(keyword, analysisId);
      setData(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [analysisId]);

  return { loading, data, error, compare };
}
