import { Heart, AlertTriangle } from 'lucide-react';
import type { CommunityAlignment } from '../../types';

interface Props {
  alignment: CommunityAlignment;
}

export function CommunityValues({ alignment }: Props) {
  const { aligned_values, friction_points } = alignment;

  if (!aligned_values.length && !friction_points.length) return null;

  return (
    <div className="paper-card p-6">
      <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-muted)] mb-4">
        Community Alignment
      </h3>
      <div className="grid grid-cols-2 gap-6">
        <div>
          <h4 className="text-[10px] uppercase tracking-wider text-emerald-600 font-medium flex items-center gap-1.5 mb-3">
            <Heart size={12} /> Values Aligned
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {aligned_values.map((v, i) => (
              <span key={i} className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] text-emerald-700">
                {v}
              </span>
            ))}
          </div>
        </div>
        <div>
          <h4 className="text-[10px] uppercase tracking-wider text-amber-600 font-medium flex items-center gap-1.5 mb-3">
            <AlertTriangle size={12} /> Friction Points
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {friction_points.map((v, i) => (
              <span key={i} className="rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[11px] text-amber-700">
                {v}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
