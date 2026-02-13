import type { AnalysisRequest, AnalysisResponse, KeywordAnalysisResponse, KeywordComparison, ProgressEvent, WordCloudResponse } from './types';

const BASE_URL = import.meta.env.VITE_API_URL || '';

export async function streamAnalysis(
  request: AnalysisRequest,
  onProgress: (event: ProgressEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${BASE_URL}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!response.body) throw new Error('No response body');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data: ')) {
        try {
          const json = JSON.parse(trimmed.slice(6));
          onProgress(json);
        } catch {
          // skip malformed events
        }
      }
    }
  }
}

export async function fetchAnalysis(analysisId: string): Promise<AnalysisResponse> {
  const res = await fetch(`${BASE_URL}/api/analysis/${analysisId}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchKeywordSentiment(keyword: string, analysisId: string): Promise<KeywordComparison> {
  const res = await fetch(`${BASE_URL}/api/keyword-sentiment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyword, analysis_id: analysisId }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchWordCloud(
  analysisId: string,
  sentiment: string,
  customStopwords?: string,
): Promise<WordCloudResponse> {
  const params = new URLSearchParams();
  if (customStopwords) params.set('custom_stopwords', customStopwords);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${BASE_URL}/api/analysis/${analysisId}/wordcloud/${sentiment}${qs}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchKeywordAnalysis(keywords: string[], analysisId: string): Promise<KeywordAnalysisResponse> {
  const res = await fetch(`${BASE_URL}/api/keyword-analysis`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keywords, analysis_id: analysisId }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function getExportUrl(analysisId: string, format: 'csv' | 'pdf'): string {
  return `${BASE_URL}/api/analysis/${analysisId}/export/${format}`;
}

export interface AnalysisHistoryItem {
  id: string;
  title: string;
  subreddits: string[];
  created_at: string;
  post_count: number;
  comment_count: number;
  overall_mean_sentiment: number;
}

export async function fetchAnalysisHistory(): Promise<AnalysisHistoryItem[]> {
  const res = await fetch(`${BASE_URL}/api/analyses`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchSavedAnalysis(id: string): Promise<AnalysisResponse> {
  const res = await fetch(`${BASE_URL}/api/analyses/${id}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function deleteAnalysis(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/analyses/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}
