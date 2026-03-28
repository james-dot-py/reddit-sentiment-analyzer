import { type ReactNode } from 'react';

interface Props {
  content: string;
  children: ReactNode;
  position?: 'top' | 'bottom';
}

export function Tooltip({ content, children, position = 'top' }: Props) {
  const offsetClass = position === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5';
  return (
    <span className="relative inline-flex group">
      {children}
      <span
        role="tooltip"
        className={`
          pointer-events-none absolute ${offsetClass} left-1/2 -translate-x-1/2
          w-max max-w-[220px] rounded-md px-2.5 py-1.5
          bg-[var(--surface-card)] border border-[var(--border-default)]
          text-[11px] leading-snug text-[var(--text-secondary)]
          shadow-lg z-50
          opacity-0 scale-95
          group-hover:opacity-100 group-hover:scale-100
          transition-all duration-150
        `}
      >
        {content}
      </span>
    </span>
  );
}
