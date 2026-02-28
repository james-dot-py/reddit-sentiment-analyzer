import { BarChart3 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--surface-0)] text-[var(--text-primary)]">
      <header className="sticky top-0 z-40 bg-[var(--surface-0)] border-b border-[var(--border-subtle)]">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2.5 no-underline">
            <BarChart3 size={20} className="text-[var(--text-primary)]" />
            <span className="heading text-lg">Undercurrent</span>
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
