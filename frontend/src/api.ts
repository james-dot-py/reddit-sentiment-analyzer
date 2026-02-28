import type { BrandDashboard, Project, TrendData, CommunityProfile, Annotation } from './types';

const BASE_URL = import.meta.env.VITE_API_URL || '';

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${url}`, init);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

// ── Projects ────────────────────────────────────────────────────────────

export function fetchProjects(): Promise<Project[]> {
  return fetchJSON('/api/projects');
}

export function fetchProject(projectId: string): Promise<Project> {
  return fetchJSON(`/api/projects/${projectId}`);
}

// ── Brand dashboard ─────────────────────────────────────────────────────

export function fetchBrandDashboard(
  projectId: string,
  brandId: string,
  week?: string,
): Promise<BrandDashboard> {
  const params = week ? `?week=${week}` : '';
  return fetchJSON(`/api/projects/${projectId}/brands/${brandId}/dashboard${params}`);
}

// ── Trends ──────────────────────────────────────────────────────────────

export function fetchBrandTrends(
  projectId: string,
  brandId: string,
  weeks = 12,
): Promise<TrendData> {
  return fetchJSON(`/api/projects/${projectId}/brands/${brandId}/trends?weeks=${weeks}`);
}

// ── Annotations ─────────────────────────────────────────────────────────

export function addAnnotation(
  projectId: string,
  brandId: string,
  date: string,
  label: string,
): Promise<Annotation> {
  return fetchJSON(
    `/api/projects/${projectId}/brands/${brandId}/trends/annotations`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, label }),
    },
  );
}

export function deleteAnnotation(
  projectId: string,
  brandId: string,
  annotationId: string,
): Promise<void> {
  return fetchJSON(
    `/api/projects/${projectId}/brands/${brandId}/trends/annotations/${annotationId}`,
    { method: 'DELETE' },
  );
}

// ── Community profile ───────────────────────────────────────────────────

export function fetchCommunityProfile(
  projectId: string,
  subreddit: string,
): Promise<CommunityProfile> {
  return fetchJSON(`/api/projects/${projectId}/subreddits/${subreddit}/community-profile`);
}

// ── Available weeks ─────────────────────────────────────────────────────

export function fetchAvailableWeeks(): Promise<{ available_weeks: string[] }> {
  return fetchJSON('/api/snapshots/available-weeks');
}

export interface PipelineStatus {
  last_updated: string | null;
  last_pipeline_status: string;
  available_weeks: string[];
}

export function fetchPipelineStatus(): Promise<PipelineStatus> {
  return fetchJSON('/api/pipeline/status');
}
