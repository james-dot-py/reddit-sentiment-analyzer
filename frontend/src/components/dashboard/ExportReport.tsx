import { useState } from 'react';
import { Download, FileText, Loader2 } from 'lucide-react';
import type { TrendData, StatusTag, ScoreComponents, ThemeEntry, EvidencePost } from '../../types';

interface Props {
  brandName: string;
  score: number;
  status: StatusTag;
  components: ScoreComponents;
  narrative: string;
  themes: ThemeEntry[];
  evidence: EvidencePost[];
  trends: TrendData | null;
  snapshotDate: string;
}

function statusLabel(s: StatusTag): string {
  const map: Record<StatusTag, string> = {
    thriving: 'Thriving', positive: 'Positive', stable: 'Stable',
    watch: 'Watch', at_risk: 'At Risk', declining: 'Declining', crisis: 'Crisis',
  };
  return map[s] || s;
}

function buildHtmlReport(props: Props): string {
  const { brandName, score, status, components, narrative, themes, evidence, trends, snapshotDate } = props;

  const scoreHistory = trends?.score_history ?? [];
  const scoreHistoryHtml = scoreHistory.length > 0
    ? `<table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:8px;">
        <tr style="border-bottom:1px solid #ddd;"><th style="text-align:left;padding:4px;">Week</th><th style="text-align:right;padding:4px;">Score</th><th style="text-align:right;padding:4px;">Status</th></tr>
        ${scoreHistory.map(p => `<tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:4px;">${p.date}</td><td style="text-align:right;padding:4px;font-family:monospace;">${p.score}</td><td style="text-align:right;padding:4px;">${statusLabel(p.status)}</td></tr>`).join('')}
       </table>`
    : '<p style="color:#757575;font-size:12px;">Trend data requires 2+ weeks of snapshots.</p>';

  const themesHtml = themes.length > 0
    ? themes.slice(0, 8).map(t =>
        `<div style="display:inline-block;margin:2px 4px 2px 0;padding:3px 10px;border-radius:12px;font-size:11px;background:${t.avg_sentiment > 0 ? '#ecfdf5' : t.avg_sentiment < -0.2 ? '#fef2f2' : '#f8fafc'};border:1px solid ${t.avg_sentiment > 0 ? '#a7f3d0' : t.avg_sentiment < -0.2 ? '#fecaca' : '#e2e8f0'};">${t.theme} (${t.count})</div>`
      ).join('')
    : '<p style="color:#757575;font-size:12px;">No themes detected.</p>';

  const evidenceHtml = evidence.length > 0
    ? `<table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:8px;">
        <tr style="border-bottom:1px solid #ddd;"><th style="text-align:left;padding:4px;">Post</th><th style="text-align:right;padding:4px;">Votes</th><th style="text-align:left;padding:4px;">Why Notable</th></tr>
        ${evidence.slice(0, 6).map(e => `<tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:4px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${e.post_title}</td><td style="text-align:right;padding:4px;font-family:monospace;">${e.upvotes}</td><td style="padding:4px;font-size:11px;color:#4a4a4a;">${e.why_notable}</td></tr>`).join('')}
       </table>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${brandName} — Undercurrent Report</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
  body { font-family: 'Inter', system-ui, sans-serif; color: #1A1A1A; margin: 0; padding: 40px; background: #FAFAF8; max-width: 800px; margin: 0 auto; }
  h1, h2, h3 { font-family: 'Space Grotesk', sans-serif; letter-spacing: -0.02em; }
  .score-box { display: inline-block; font-family: 'JetBrains Mono', monospace; font-size: 48px; font-weight: 500; padding: 0 20px; }
  .status { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
  .component-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 16px; }
  .component-cell { background: #F5F4F0; padding: 12px; border-radius: 12px; }
  .component-value { font-family: 'JetBrains Mono', monospace; font-size: 18px; font-weight: 500; }
  .component-label { font-size: 10px; color: #6B6B6B; text-transform: uppercase; letter-spacing: 0.1em; }
  .section { margin-top: 32px; padding-top: 24px; border-top: 1px solid rgba(0,0,0,0.06); }
  .section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.15em; color: #6B6B6B; margin-bottom: 12px; font-family: 'Inter', sans-serif; }
  .narrative { font-size: 14px; line-height: 1.75; color: #6B6B6B; }
  .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid rgba(0,0,0,0.06); font-size: 10px; color: #9CA3AF; text-align: center; }
  @media print { body { background: white; padding: 20px; } }
</style>
</head>
<body>
  <div style="display:flex;align-items:flex-start;justify-content:space-between;">
    <div>
      <h1 style="margin:0;font-size:28px;">${brandName}</h1>
      <p style="margin:4px 0 0;font-size:12px;color:#757575;">Undercurrent Brand Intelligence Report · ${snapshotDate}</p>
    </div>
    <div style="text-align:right;">
      <div class="score-box">${score}</div>
      <div><span class="status" style="background:#f0fdf4;color:#166534;">${statusLabel(status)}</span></div>
    </div>
  </div>

  <div class="component-grid">
    <div class="component-cell"><div class="component-value">${components.sentiment_mix}</div><div class="component-label">Sentiment Mix (40%)</div></div>
    <div class="component-cell"><div class="component-value">${components.community_alignment}</div><div class="component-label">Alignment (25%)</div></div>
    <div class="component-cell"><div class="component-value">${components.intensity}</div><div class="component-label">Intensity (20%)</div></div>
    <div class="component-cell"><div class="component-value">${components.trajectory}</div><div class="component-label">Trajectory (15%)</div></div>
  </div>

  <div class="section">
    <div class="section-title">Narrative Intelligence</div>
    <div class="narrative">${narrative.replace(/\n/g, '<br>')}</div>
  </div>

  ${trends?.narrative_delta ? `
  <div class="section">
    <div class="section-title">What Changed This Week</div>
    <div class="narrative">${trends.narrative_delta.replace(/\n/g, '<br>')}</div>
  </div>` : ''}

  <div class="section">
    <div class="section-title">Score History</div>
    ${scoreHistoryHtml}
  </div>

  <div class="section">
    <div class="section-title">Theme Map</div>
    ${themesHtml}
  </div>

  ${evidenceHtml ? `
  <div class="section">
    <div class="section-title">Key Evidence</div>
    ${evidenceHtml}
  </div>` : ''}

  <div class="footer">
    Generated by Undercurrent · Built by Jimmy Friedman
  </div>
</body>
</html>`;
}

export function ExportReport(props: Props) {
  const [exporting, setExporting] = useState(false);

  function handleExport() {
    setExporting(true);
    try {
      const html = buildHtmlReport(props);
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);

      // Open in new tab — user can Print → Save as PDF from there
      const win = window.open(url, '_blank');
      if (win) {
        win.addEventListener('load', () => {
          URL.revokeObjectURL(url);
        });
      }
    } finally {
      setExporting(false);
    }
  }

  function handleDownloadHtml() {
    const html = buildHtmlReport(props);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${props.brandName.toLowerCase().replace(/\s+/g, '-')}-undercurrent-report.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={handleExport}
        disabled={exporting}
        className="inline-flex items-center gap-1.5 rounded border border-[var(--border-default)] px-2.5 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-40"
        title="Open printable report (use browser Print → Save as PDF)"
      >
        {exporting ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
        Report
      </button>
      <button
        onClick={handleDownloadHtml}
        className="inline-flex items-center gap-1.5 rounded border border-[var(--border-default)] px-2 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        title="Download HTML report"
      >
        <Download size={12} />
      </button>
    </div>
  );
}
