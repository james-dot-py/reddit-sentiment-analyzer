import { useCallback, useRef, useState } from 'react';
import { streamAnalysis, streamSampleAnalysis } from '../api';
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
    setStage('');
    setMessage('');
    setError(null);
    setResult(null);

    try {
      await streamAnalysis(
        request,
        (event) => {
          setStage(event.stage);
          if (event.message) setMessage(event.message);
          if (event.progress !== undefined) setProgress(event.progress);

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

  const startSampleAnalysis = useCallback(async (subreddit: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus('loading');
    setProgress(0);
    setStage('');
    setMessage('');
    setError(null);
    setResult(null);

    try {
      await streamSampleAnalysis(
        subreddit,
        (event) => {
          setStage(event.stage);
          if (event.message) setMessage(event.message);
          if (event.progress !== undefined) setProgress(event.progress);

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

  const reset = useCallback(() => {
    setStatus('idle');
    setResult(null);
    setError(null);
    setProgress(0);
    setStage('');
    setMessage('');
  }, []);

  return { status, progress, stage, message, result, error, startAnalysis, startSampleAnalysis, cancel, loadResult, reset };
}
