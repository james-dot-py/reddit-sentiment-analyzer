import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Finding, ViewMode } from '../../types';
import { SectionVerdict } from './SectionVerdict';
import { Tooltip } from '../ui/Tooltip';

interface Props {
  headline: string;
  signals: string[];
  deepDive: string;
  narrativeDelta?: string;
  bluntVerdict?: string;
  findings?: Finding[];
  sectionVerdict?: string;
  viewMode?: ViewMode;
}

const SEVERITY_CONFIG = {
  critical: { label: 'Critical', badge: 'severity-badge-critical', border: 'severity-critical', tooltip: 'A strong negative signal with meaningful volume behind it this week.' },
  elevated: { label: 'Elevated', badge: 'severity-badge-elevated', border: 'severity-elevated', tooltip: 'A notable pattern that has appeared more than once across conversations.' },
  monitor:  { label: 'Monitor',  badge: 'severity-badge-monitor',  border: 'severity-monitor',  tooltip: 'An early or low-volume signal worth keeping an eye on.' },
};

const CATEGORY_LABELS: Record<string, string> = {
  product_issue: 'Product Issue',
  trust_issue: 'Trust Issue',
  channel_risk: 'Channel Risk',
  trend_signal: 'Trend Signal',
};

export function NarrativeSection({
  headline, signals, deepDive, narrativeDelta,
  bluntVerdict, findings, sectionVerdict, viewMode = 'deep-dive',
}: Props) {
  const [deepDiveOpen, setDeepDiveOpen] = useState(false);

  // Use findings if available, otherwise fall back to signals mapped as monitor-level findings
  const displayFindings: Finding[] = findings?.length
    ? findings
    : signals.map(s => ({ severity: 'monitor' as const, category: 'trend_signal' as const, text: s }));

  // Use bluntVerdict if available, otherwise fall back to headline
  const verdict = bluntVerdict || headline;

  return (
    <div className="paper-card p-6">
      <h3 className="section-label mb-4">Narrative Intelligence</h3>

      <SectionVerdict verdict={sectionVerdict} />

      {/* Tier 1: Blunt Verdict */}
      {verdict && (
        <p className="text-base font-semibold leading-snug mb-5 text-[var(--text-primary)]">
          {verdict}
        </p>
      )}

      {/* Tier 2: Key Findings (replaces signals) */}
      {displayFindings.length > 0 && (
        <div className="space-y-2.5 mb-4">
          {displayFindings.slice(0, viewMode === 'briefing' ? 3 : undefined).map((finding, i) => {
            const config = SEVERITY_CONFIG[finding.severity] || SEVERITY_CONFIG.monitor;
            return (
              <div key={i} className={`pl-3 py-2 ${config.border}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Tooltip content={config.tooltip}>
                    <span className={`severity-badge ${config.badge} cursor-help`}>{config.label}</span>
                  </Tooltip>
                  {finding.category && (
                    <span className="category-tag">{CATEGORY_LABELS[finding.category] || finding.category}</span>
                  )}
                  {finding.mention_count != null && (
                    <span className="text-[10px] text-[var(--text-muted)] data-text">
                      {finding.mention_count} mentions
                    </span>
                  )}
                </div>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  {finding.text}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Tier 3: Full Narrative (expandable, deep-dive only) */}
      {deepDive && viewMode === 'deep-dive' && (
        <div>
          <button
            onClick={() => setDeepDiveOpen(v => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer mb-2"
          >
            {deepDiveOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {deepDiveOpen ? 'Hide full analysis' : 'Read full analysis'}
          </button>

          {deepDiveOpen && (
            <div className="pl-3 border-l-2 border-[var(--border-subtle)]">
              <div className="body-text text-sm leading-relaxed text-[var(--text-secondary)]">
                {deepDive.split('\n').map((para, i) =>
                  para.trim() ? <p key={i} className="mb-3 last:mb-0">{para}</p> : null,
                )}
              </div>

              {/* What Changed callout */}
              {narrativeDelta && (
                <div className="mt-4 rounded-lg bg-[var(--surface-1)] px-4 py-3">
                  <h4 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)] mb-1.5">
                    What Changed This Week
                  </h4>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                    {narrativeDelta}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
