import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3, TrendingUp, Users } from 'lucide-react';
import { AnimatedSection } from '../ui/AnimatedSection';

export function ProductDemo() {
  return (
    <section className="py-20 md:py-28 bg-[var(--surface-1)]">
      <div className="mx-auto max-w-[1280px] px-4 md:px-8">
        <AnimatedSection>
          <div className="mb-12 text-center">
            <h2 className="heading mb-3 text-2xl md:text-3xl">
              See it in action
            </h2>
            <p className="body-text mx-auto max-w-xl text-base">
              A live brand intelligence dashboard — not a mockup.
            </p>
          </div>
        </AnimatedSection>

        <AnimatedSection delay={0.15}>
          {/* Stylized dashboard preview */}
          <div className="card mx-auto max-w-4xl overflow-hidden">
            <div className="border-b border-[var(--border-subtle)] px-6 py-4 flex items-center gap-3">
              <div className="flex gap-1.5">
                <div className="h-3 w-3 rounded-full bg-[#EF4444]/40" />
                <div className="h-3 w-3 rounded-full bg-[#F59E0B]/40" />
                <div className="h-3 w-3 rounded-full bg-[#10B981]/40" />
              </div>
              <span className="data-text text-xs text-[var(--text-muted)]">undercurrent / dashboard</span>
            </div>

            <div className="p-6 md:p-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {[
                  { label: 'Undercurrent Score', value: '69', icon: BarChart3, color: '#10B981' },
                  { label: 'Weekly Trajectory', value: 'Stable', icon: TrendingUp, color: '#F59E0B' },
                  { label: 'Communities Tracked', value: '2', icon: Users, color: '#8B5CF6' },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-xl bg-[var(--surface-1)] p-4 border border-[var(--border-subtle)]"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <stat.icon size={14} style={{ color: stat.color }} />
                      <span className="text-xs text-[var(--text-muted)]" style={{ fontFamily: "'Inter', sans-serif" }}>
                        {stat.label}
                      </span>
                    </div>
                    <span className="data-text text-2xl font-semibold text-[var(--text-primary)]">
                      {stat.value}
                    </span>
                  </div>
                ))}
              </div>

              {/* Fake chart area */}
              <div className="rounded-xl bg-[var(--surface-1)] border border-[var(--border-subtle)] p-6 mb-6">
                <div className="flex items-end gap-1 h-32">
                  {[40, 55, 48, 62, 58, 65, 60, 68, 64, 72, 69, 71].map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-t transition-all"
                      style={{
                        height: `${h}%`,
                        background: `linear-gradient(to top, rgba(13,148,136,0.3), rgba(13,148,136,0.08))`,
                      }}
                    />
                  ))}
                </div>
                <div className="mt-2 flex justify-between">
                  <span className="data-text text-xs text-[var(--text-muted)]">12 weeks ago</span>
                  <span className="data-text text-xs text-[var(--text-muted)]">This week</span>
                </div>
              </div>

              <div className="text-center">
                <Link
                  to="/brands"
                  className="inline-flex items-center gap-2 text-sm font-medium text-accent-500 hover:text-accent-400 transition-colors no-underline"
                >
                  See it live <ArrowRight size={16} />
                </Link>
              </div>
            </div>
          </div>
        </AnimatedSection>
      </div>
    </section>
  );
}
