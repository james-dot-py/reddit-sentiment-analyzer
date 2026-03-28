export function Footer() {
  return (
    <footer
      className="border-t py-10"
      style={{
        borderColor: 'var(--border-subtle)',
        background: 'var(--surface-0)',
      }}
    >
      <div className="mx-auto max-w-[1280px] px-4 md:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <span
            className="text-sm font-semibold"
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

          <p className="text-xs text-[var(--text-muted)]" style={{ fontFamily: "'Inter', sans-serif" }}>
            Built by Jimmy Friedman &middot; &copy; {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </footer>
  );
}
