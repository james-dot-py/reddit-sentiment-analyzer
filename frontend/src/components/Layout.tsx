import { BarChart3, Clock, Moon, Settings, Sun } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTheme } from '../theme';

export function Layout({ children }: { children: ReactNode }) {
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  const navLinkClass = (path: string) =>
    `rounded-lg p-2 transition-colors hover:bg-[var(--surface-2)] ${
      location.pathname === path ? 'text-indigo-400' : 'text-[var(--text-muted)]'
    }`;

  return (
    <div className="min-h-screen bg-[var(--surface-0)] text-[var(--text-primary)]">
      <header className="sticky top-0 z-40 gradient-border-bottom bg-[var(--surface-0)]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 text-lg font-bold tracking-tight no-underline">
            <BarChart3 size={22} className="text-indigo-500" />
            <span className="accent-text">Discourse Analyzer</span>
          </Link>
          <div className="flex items-center gap-1">
            <button
              onClick={toggleTheme}
              className={`rounded-lg p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)]`}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
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
