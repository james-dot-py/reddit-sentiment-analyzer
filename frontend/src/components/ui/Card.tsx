import clsx from 'clsx';
import { Info } from 'lucide-react';
import { useState } from 'react';

interface CardProps {
  title: string;
  tooltip?: string;
  children: React.ReactNode;
  className?: string;
}

export function Card({ title, tooltip, children, className }: CardProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className={clsx(
      'glass-card rounded-2xl p-6 transition-glass glow-hover',
      className,
    )}>
      <div className="mb-4 flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-muted)]">
          {title}
        </h3>
        {tooltip && (
          <div className="relative">
            <Info
              size={14}
              className="cursor-help text-[var(--text-muted)] opacity-60"
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
            />
            {showTooltip && (
              <div className="absolute bottom-6 left-1/2 z-50 w-64 -translate-x-1/2 glass-card rounded-lg p-3 text-xs text-[var(--text-secondary)]">
                {tooltip}
              </div>
            )}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
