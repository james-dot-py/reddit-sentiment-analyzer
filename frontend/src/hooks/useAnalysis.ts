import { useCallback, useRef, useState } from 'react';
import { streamProcess } from '../api';
import { fetchAllRedditData } from '../lib/redditClient';
import type { AnalysisRequest, AnalysisResponse } from '../types';

export type AnalysisStatus = 'idle' | 'loading' | 'done' | 'error';

export function useAnalysis() {
  const [status, setStatus] = useState<AnalysisStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const startAnalysis = useCallback(async (request: AnalysisRequest) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus('loading');
    setProgress(0);
    setStage('fetching');
    setMessage('Starting Reddit fetch...');
    setError(null);
    setResult(null);

    try {
      // ── Phase 1: Client-side Reddit fetch (0–0.3) ──────────────────
      const { posts, comments } = await fetchAllRedditData(
        request.subreddits,
        request.sort,
        request.time_filter,
        request.post_limit,
        request.include_comments,
        request.comment_depth,
        controller.signal,
        (fetchProgress) => {
          setStage('fetching');
          setMessage(fetchProgress.message);
          setProgress(fetchProgress.progress * 0.3);
        },
      );

      if (posts.length === 0) {
        setStatus('error');
        setError('No posts fetched. Check subreddit names and try again.');
        return;
      }

      // ── Phase 2: Server-side NLP processing (0.3–1.0) ─────────────
      setStage('analyzing');
      setMessage('Sending data to server for analysis...');
      setProgress(0.3);

      await streamProcess(
        { posts, comments, subreddits: request.subreddits },
        (event) => {
          setStage(event.stage);
          if (event.message) setMessage(event.message);
          if (event.progress !== undefined) {
            // Map backend 0–1 to overall 0.3–1.0
            setProgress(0.3 + event.progress * 0.7);
          }

          if (event.stage === 'error') {
            setStatus('error');
            setError(event.message ?? 'Unknown error');
          } else if (event.stage === 'results' && event.data) {
            setResult(event.data);
            setStatus('done');
          }
        },
        controller.signal,
      );
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setStatus('error');
        setError((err as Error).message);
      }
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setStatus('idle');
  }, []);

  const loadResult = useCallback((data: AnalysisResponse) => {
    setResult(data);
    setStatus('done');
    setError(null);
    setProgress(1);
    setStage('complete');
    setMessage('');
  }, []);

  return { status, progress, stage, message, result, error, startAnalysis, cancel, loadResult };
}
