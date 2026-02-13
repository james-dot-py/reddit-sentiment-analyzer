import { useCallback, useEffect, useState } from 'react';
import { fetchWordCloud } from '../api';
import type { WordCloudResponse } from '../types';

export function useWordCloud(analysisId: string, sentiment: string) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<WordCloudResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchWordCloud(analysisId, sentiment);
      setData(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [analysisId, sentiment]);

  useEffect(() => {
    if (analysisId) load();
  }, [analysisId, load]);

  return { loading, data, error, reload: load };
}
