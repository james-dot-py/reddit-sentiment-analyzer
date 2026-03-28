import type { BrandDashboard, Project, TrendData, CommunityProfile, Annotation } from './types';

const BASE_URL = import.meta.env.VITE_API_URL || '';

// ── Auth token management ────────────────────────────────────────────────

let _getToken: (() => Promise<string | null>) | null = null;

/**
 * Set the auth token getter. Called once from App.tsx with Clerk's getToken.
 * This avoids coupling every API call to React hooks.
 */
export function setAuthTokenGetter(getter: () => Promise<string | null>) {
  _getToken = getter;
}

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);

  // Attach auth token if available
  if (_getToken) {
    try {
      const token = await _getToken();
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
    } catch {
      // Silent — unauthenticated request
    }
  }

  const res = await fetch(`${BASE_URL}${url}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = body?.detail || res.statusText;
    throw new Error(`HTTP ${res.status}: ${detail}`);
  }
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

// ── Authenticated endpoints (/api/me/*) ─────────────────────────────────

export interface MeResponse {
  user: {
    id: number;
    email: string;
    display_name: string;
    tier: 'free' | 'pro' | 'enterprise';
  };
  projects: Project[];
}

export function fetchMe(): Promise<MeResponse> {
  return fetchJSON('/api/me');
}

export function fetchMyProjects(): Promise<Project[]> {
  return fetchJSON('/api/me/projects');
}

export interface CreateProjectPayload {
  project_name: string;
  category?: string;
  brands: Array<{
    brand_name: string;
    aliases?: string[];
    is_competitor?: boolean;
  }>;
  subreddits: string[];
}

export function createProject(payload: CreateProjectPayload): Promise<Project> {
  return fetchJSON('/api/me/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function deleteProject(projectId: number): Promise<void> {
  return fetchJSON(`/api/me/projects/${projectId}`, { method: 'DELETE' });
}

export function addBrand(
  projectId: number,
  brand: { brand_name: string; aliases?: string[]; is_competitor?: boolean },
): Promise<unknown> {
  return fetchJSON(`/api/me/projects/${projectId}/brands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(brand),
  });
}

export function removeBrand(projectId: number, brandId: number): Promise<void> {
  return fetchJSON(`/api/me/projects/${projectId}/brands/${brandId}`, {
    method: 'DELETE',
  });
}

export function addSubreddit(
  projectId: number,
  subredditName: string,
): Promise<unknown> {
  return fetchJSON(`/api/me/projects/${projectId}/subreddits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subreddit_name: subredditName }),
  });
}

export function removeSubreddit(projectId: number, subId: number): Promise<void> {
  return fetchJSON(`/api/me/projects/${projectId}/subreddits/${subId}`, {
    method: 'DELETE',
  });
}
