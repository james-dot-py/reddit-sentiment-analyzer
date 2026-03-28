import { BarChart3, Sun, Moon, ChevronLeft } from 'lucide-react';
import { lazy, Suspense, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { hasClerk } from '../App';

/** Clerk user controls — lazy-loaded so Clerk isn't imported without ClerkProvider. */
const ClerkUserControls = lazy(() =>
  import('./ClerkUserControls').then(m => ({ default: m.ClerkUserControls }))
);

export function Layout({ children }: { children: ReactNode }) {
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const isDashboard = location.pathname === '/dashboard';

  return (
    <div className="min-h-screen bg-[var(--surface-0)] text-[var(--text-primary)]">
      <header className="sticky top-0 z-40 border-b border-[var(--border-subtle)] bg-[var(--surface-0)]/80 backdrop-blur-lg">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-1">
            {isDashboard && (
              <Link
                to="/brands"
                className="flex items-center justify-center w-8 h-8 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-1)] transition-colors no-underline"
                aria-label="Back to brands"
              >
                <ChevronLeft size={18} />
              </Link>
            )}
            <Link to="/brands" className="flex items-center gap-2.5 no-underline">
              <BarChart3 size={20} className="text-accent-500" />
              <span className="heading text-lg">Undercurrent</span>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-btn)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-1)] transition-colors"
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              <div className="relative h-[18px] w-[18px]">
                <Sun
                  size={18}
                  className="absolute inset-0 transition-all duration-200"
                  style={{
                    opacity: theme === 'dark' ? 1 : 0,
                    transform: theme === 'dark' ? 'rotate(0deg) scale(1)' : 'rotate(-90deg) scale(0.5)',
                  }}
                />
                <Moon
                  size={18}
                  className="absolute inset-0 transition-all duration-200"
                  style={{
                    opacity: theme === 'light' ? 1 : 0,
                    transform: theme === 'light' ? 'rotate(0deg) scale(1)' : 'rotate(90deg) scale(0.5)',
                  }}
                />
              </div>
            </button>

            {hasClerk && (
              <Suspense fallback={null}>
                <ClerkUserControls />
              </Suspense>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
