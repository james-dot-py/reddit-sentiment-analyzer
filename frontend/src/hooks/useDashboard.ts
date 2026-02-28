import { useState, useEffect, useCallback } from 'react';
import type { BrandDashboard, TrendData, Project } from '../types';
import { fetchBrandDashboard, fetchBrandTrends, fetchProjects } from '../api';

interface DashboardState {
  projects: Project[];
  dashboard: BrandDashboard | null;
  trends: TrendData | null;
  loading: boolean;
  error: string | null;
}

export function useDashboard(projectId?: string, brandId?: string, week?: string) {
  const [state, setState] = useState<DashboardState>({
    projects: [],
    dashboard: null,
    trends: null,
    loading: true,
    error: null,
  });

  const loadProjects = useCallback(async () => {
    try {
      const projects = await fetchProjects();
      setState(s => ({ ...s, projects }));
      return projects;
    } catch (e) {
      setState(s => ({ ...s, error: String(e) }));
      return [];
    }
  }, []);

  const loadDashboard = useCallback(async (pid: string, bid: string, w?: string) => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const [dashboard, trends] = await Promise.all([
        fetchBrandDashboard(pid, bid, w),
        fetchBrandTrends(pid, bid).catch(() => null),
      ]);
      setState(s => ({ ...s, dashboard, trends, loading: false }));
    } catch (e) {
      setState(s => ({
        ...s,
        loading: false,
        error: e instanceof Error ? e.message : String(e),
      }));
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (projectId && brandId) {
      loadDashboard(projectId, brandId, week);
    } else {
      setState(s => ({ ...s, loading: false }));
    }
  }, [projectId, brandId, week, loadDashboard]);

  return {
    ...state,
    refresh: () => {
      if (projectId && brandId) loadDashboard(projectId, brandId, week);
    },
  };
}
