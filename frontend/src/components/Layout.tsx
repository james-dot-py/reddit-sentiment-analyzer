import { BarChart3, Clock, Settings } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();

  const navLinkClass = (path: string) =>
    `rounded p-2 transition-colors hover:bg-[var(--surface-1)] ${
      location.pathname === path ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
    }`;

  return (
    <div className="min-h-screen bg-[var(--surface-0)] text-[var(--text-primary)]">
      <header className="sticky top-0 z-40 bg-[var(--surface-0)] border-b border-[var(--border-subtle)]">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2.5 no-underline">
            <BarChart3 size={20} className="text-[var(--text-primary)]" />
            <span className="heading text-lg">Undercurrent</span>
          </Link>
          <div className="flex items-center gap-1">
            <Link to="/history" className={navLinkClass('/history')} title="Analysis Archive">
              <Clock size={18} />
            </Link>
            <Link to="/settings" className={navLinkClass('/settings')} title="Settings">
              <Settings size={18} />
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
