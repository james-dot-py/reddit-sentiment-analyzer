import { Download } from 'lucide-react';
import { getExportUrl } from '../../api';

export function ExportButtons({ analysisId }: { analysisId: string }) {
  return (
    <div className="flex gap-2">
      <a
        href={getExportUrl(analysisId, 'csv')}
        download
        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] transition-all hover:border-indigo-500/30 hover:text-indigo-400 glow-hover"
      >
        <Download size={14} />
        CSV
      </a>
      <a
        href={getExportUrl(analysisId, 'pdf')}
        download
        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] transition-all hover:border-indigo-500/30 hover:text-indigo-400 glow-hover"
      >
        <Download size={14} />
        PDF
      </a>
    </div>
  );
}
