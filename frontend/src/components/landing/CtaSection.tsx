import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { AnimatedSection } from '../ui/AnimatedSection';

export function CtaSection() {
  return (
    <section className="py-20 md:py-28">
      <div className="mx-auto max-w-[1280px] px-4 md:px-8">
        <AnimatedSection>
          <div
            className="relative overflow-hidden rounded-2xl p-10 md:p-16 text-center"
            style={{
              background: 'linear-gradient(135deg, #0F0F10 0%, #1A1A2E 100%)',
              border: '1px solid rgba(13, 148, 136, 0.2)',
            }}
          >
            {/* Subtle gradient glow */}
            <div
              className="absolute inset-0 opacity-20"
              style={{
                background: 'radial-gradient(ellipse at center top, rgba(13,148,136,0.4) 0%, transparent 60%)',
              }}
            />

            <div className="relative z-10">
              <h2
                className="mb-4 text-2xl md:text-4xl font-bold"
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  color: '#EDEDEC',
                  letterSpacing: '-0.02em',
                }}
              >
                Want this analysis for your brand?
              </h2>
              <p
                className="mx-auto mb-8 max-w-lg text-base"
                style={{
                  fontFamily: "'Inter', sans-serif",
                  color: '#A1A1AA',
                  lineHeight: 1.6,
                }}
              >
                Set up weekly Reddit intelligence for your brands and competitors
                in under a minute. Free to start.
              </p>
              <Link
                to="/sign-up"
                className="inline-flex items-center gap-2 rounded-[var(--radius-btn)] bg-accent-500 px-8 py-3 text-base font-medium text-white hover:bg-accent-400 transition-colors no-underline"
              >
                Start Free <ArrowRight size={18} />
              </Link>
            </div>
          </div>
        </AnimatedSection>
      </div>
    </section>
  );
}
