import { Lock, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

interface FeatureGateProps {
  /** Whether the feature is available to the current user */
  allowed: boolean;
  /** Feature name shown in the upgrade prompt */
  featureName: string;
  /** The gated content */
  children: ReactNode;
  /** Optional: show a preview (blurred) instead of hiding completely */
  showPreview?: boolean;
}

/**
 * Wraps content that requires a higher tier.
 * When not allowed, shows a blurred preview with an upgrade prompt overlay.
 */
export function FeatureGate({ allowed, featureName, children, showPreview = true }: FeatureGateProps) {
  if (allowed) return <>{children}</>;

  return (
    <div className="relative">
      {showPreview ? (
        <div className="pointer-events-none select-none" style={{ filter: 'blur(6px)', opacity: 0.5 }}>
          {children}
        </div>
      ) : (
        <div className="h-48 rounded-xl bg-[var(--surface-1)]" />
      )}

      {/* Overlay */}
      <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-[var(--surface-0)]/60 backdrop-blur-sm">
        <div className="text-center px-6 py-5 max-w-xs">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-accent-500/10">
            <Lock size={18} className="text-accent-500" />
          </div>
          <p className="text-sm font-medium text-[var(--text-primary)] mb-1">
            {featureName}
          </p>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            Upgrade to Pro to unlock this feature
          </p>
          <Link
            to="/pricing"
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-btn)] bg-accent-500 px-4 py-2 text-xs font-medium text-white hover:bg-accent-600 transition-colors no-underline"
          >
            Upgrade <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Inline upgrade prompt — used for smaller features like buttons.
 */
export function UpgradeChip({ featureName }: { featureName: string }) {
  return (
    <Link
      to="/pricing"
      className="inline-flex items-center gap-1 rounded-full bg-accent-500/10 px-2.5 py-1 text-[10px] font-medium text-accent-500 hover:bg-accent-500/20 transition-colors no-underline"
      title={`Upgrade to Pro to unlock ${featureName}`}
    >
      <Lock size={10} /> PRO
    </Link>
  );
}
