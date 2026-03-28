import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Sun, Moon, Menu, X } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

export function LandingNav() {
  const { theme, toggleTheme } = useTheme();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const isReturningUser = typeof window !== 'undefined' && localStorage.getItem('undercurrent-visited-dashboard') === 'true';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={{
        backgroundColor: scrolled
          ? `color-mix(in srgb, var(--surface-0) 85%, transparent)`
          : 'transparent',
        backdropFilter: scrolled ? 'blur(16px)' : 'none',
        borderBottom: scrolled ? '1px solid var(--border-subtle)' : '1px solid transparent',
      }}
    >
      <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-4 md:px-8">
        {/* Logo — static CSS gradient, NOT Neat */}
        <Link to="/" className="no-underline">
          <span
            className="text-xl font-bold"
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              background: 'linear-gradient(135deg, #0D9488, #3B82F6, #8B5CF6)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            undercurrent
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-6">
          <a
            href="#features"
            className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors no-underline"
          >
            Features
          </a>
          <a
            href="#how-it-works"
            className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors no-underline"
          >
            How It Works
          </a>
          <a
            href="#demo"
            className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors no-underline"
          >
            Demo
          </a>

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

          {isReturningUser ? (
            <Link
              to="/brands"
              className="text-sm font-medium text-accent-500 hover:text-accent-400 transition-colors no-underline"
            >
              Go to Dashboard
            </Link>
          ) : (
            <Link
              to="/sign-in"
              className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors no-underline"
            >
              Sign In
            </Link>
          )}

          <Link
            to="/sign-up"
            className="inline-flex items-center rounded-[var(--radius-btn)] bg-accent-500 px-5 py-2 text-sm font-medium text-white hover:bg-accent-600 transition-colors no-underline"
          >
            Start Free
          </Link>
        </div>

        {/* Mobile hamburger */}
        <div className="flex md:hidden items-center gap-3">
          <button
            onClick={toggleTheme}
            className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-btn)] text-[var(--text-secondary)]"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="flex h-9 w-9 items-center justify-center text-[var(--text-primary)]"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden border-t border-[var(--border-subtle)] bg-[var(--surface-0)] px-4 py-4 space-y-3">
          <a href="#features" onClick={() => setMobileOpen(false)} className="block text-sm text-[var(--text-secondary)] no-underline">Features</a>
          <a href="#how-it-works" onClick={() => setMobileOpen(false)} className="block text-sm text-[var(--text-secondary)] no-underline">How It Works</a>
          <a href="#demo" onClick={() => setMobileOpen(false)} className="block text-sm text-[var(--text-secondary)] no-underline">Demo</a>
          <Link to="/sign-in" onClick={() => setMobileOpen(false)} className="block text-sm text-[var(--text-secondary)] no-underline">Sign In</Link>
          <Link to="/sign-up" onClick={() => setMobileOpen(false)} className="block w-full text-center rounded-[var(--radius-btn)] bg-accent-500 px-5 py-2.5 text-sm font-medium text-white no-underline">
            Start Free
          </Link>
        </div>
      )}
    </nav>
  );
}
