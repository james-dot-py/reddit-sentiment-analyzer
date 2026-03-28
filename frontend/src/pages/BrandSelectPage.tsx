import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, ArrowRight } from 'lucide-react';
import { fetchProjects } from '../api';
import { StatusBadge } from '../components/dashboard/StatusBadge';
import type { Project } from '../types';

interface ManifestBrand {
  brand_name: string;
  is_competitor: boolean;
  weeks_available: string[];
  latest_score: number;
  latest_status: string;
}

interface ManifestData {
  projects: Record<string, {
    project_name: string;
    brands: Record<string, ManifestBrand>;
  }>;
}

export function BrandSelectPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [manifest, setManifest] = useState<ManifestData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const base = import.meta.env.VITE_API_URL || '';
    Promise.all([
      fetchProjects().catch(() => [] as Project[]),
      fetch(`${base}/api/manifest`).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([proj, manifestData]) => {
      setProjects(proj);
      if (manifestData) setManifest(manifestData);
      setLoading(false);
    });
  }, []);

  function goToBrand(projectId: string, brandId: string) {
    navigate(`/dashboard?project=${projectId}&brand=${brandId}`);
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-6">
        <BarChart3 size={48} className="text-[var(--text-muted)] animate-pulse" />
        <p className="text-sm text-[var(--text-muted)]">Loading projects...</p>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-6">
        <BarChart3 size={48} className="text-[var(--text-muted)]" />
        <h1 className="heading text-3xl">Undercurrent</h1>
        <p className="body-text text-[var(--text-secondary)] text-center max-w-md">
          Longitudinal brand intelligence from Reddit communities.
          Configure a project and run the pipeline to get started.
        </p>
        <code className="block text-xs data-text text-[var(--text-muted)] bg-[var(--surface-1)] rounded px-3 py-2">
          python scripts/weekly_pipeline.py
        </code>
        <p className="text-xs text-[var(--text-muted)]">Built by Jimmy Friedman</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 space-y-10">
      <div className="text-center space-y-2">
        <h1 className="heading text-3xl">Brand Intelligence</h1>
        <p className="body-text text-sm text-[var(--text-secondary)]">
          Select a brand to view its Reddit perception dashboard
        </p>
      </div>

      {projects.map(project => (
        <div key={project.project_id} className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-muted)]">
            {project.project_name}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {project.brands.map(brand => {
              const manifestBrand = manifest?.projects?.[project.project_id]?.brands?.[brand.brand_id];
              const score = manifestBrand?.latest_score;
              const status = manifestBrand?.latest_status;
              const weeksCount = manifestBrand?.weeks_available?.length ?? 0;

              return (
                <button
                  key={brand.brand_id}
                  onClick={() => goToBrand(project.project_id, brand.brand_id)}
                  className="paper-card p-5 text-left transition-all hover:shadow-md active:scale-[0.98] active:shadow-sm cursor-pointer group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="heading text-lg">{brand.brand_name}</h3>
                      {brand.is_competitor && (
                        <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Competitor</span>
                      )}
                    </div>
                    {score != null && (
                      <span className={`data-text text-2xl font-medium ${
                        score >= 70 ? 'text-positive' :
                        score >= 50 ? 'text-[var(--text-primary)]' :
                        score >= 30 ? 'text-neutral-sentiment' : 'text-negative'
                      }`}>
                        {score}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {status && <StatusBadge status={status as any} size="sm" />}
                      {weeksCount > 0 && (
                        <span className="text-[10px] text-[var(--text-muted)]">
                          {weeksCount} week{weeksCount !== 1 ? 's' : ''} tracked
                        </span>
                      )}
                    </div>
                    <ArrowRight size={14} className="text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <p className="text-center text-xs text-[var(--text-muted)]">Built by Jimmy Friedman</p>
    </div>
  );
}
