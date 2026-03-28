import { useEffect, useRef } from 'react';
import { NeatGradient } from '@firecms/neat';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';

export function Hero() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const neatRef = useRef<NeatGradient | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    neatRef.current = new NeatGradient({
      ref: canvasRef.current,
      colors: [
        { color: '#0D9488', enabled: true },
        { color: '#3B82F6', enabled: true },
        { color: '#8B5CF6', enabled: true },
        { color: '#14B8A6', enabled: true },
        { color: '#6366F1', enabled: true },
      ],
      speed: prefersReducedMotion ? 0 : 3,
      horizontalPressure: 3,
      verticalPressure: 4,
      waveFrequencyX: 3,
      waveFrequencyY: 3,
      waveAmplitude: 5,
      shadows: 0,
      highlights: 2,
      colorSaturation: -2,
      wireframe: false,
      colorBlending: 6,
      backgroundColor: '#000000',
      backgroundAlpha: 0,
    });

    return () => {
      neatRef.current?.destroy();
    };
  }, []);

  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden">
      {/* Neat gradient canvas — background ambiance */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ opacity: 0.12 }}
      />

      {/* Content */}
      <div className="relative z-10 mx-auto max-w-4xl px-4 text-center">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="mb-6 font-bold"
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 'clamp(48px, 8vw, 96px)',
            fontWeight: 700,
            lineHeight: 1,
            letterSpacing: '-0.04em',
            background: 'linear-gradient(135deg, #0D9488 0%, #3B82F6 50%, #8B5CF6 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          undercurrent
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="mx-auto mb-10 max-w-2xl text-lg md:text-xl"
          style={{
            fontFamily: "'Inter', sans-serif",
            color: 'var(--text-secondary)',
            lineHeight: 1.6,
          }}
        >
          What Reddit really thinks about your brand — analyzed weekly.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Link
            to="/brands"
            className="inline-flex items-center rounded-[var(--radius-btn)] bg-accent-500 px-8 py-3 text-base font-medium text-white hover:bg-accent-600 transition-colors no-underline"
          >
            Explore Demo Data
          </Link>
          <a
            href="#features"
            className="inline-flex items-center rounded-[var(--radius-btn)] border border-[var(--border-default)] px-8 py-3 text-base font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-muted)] transition-colors no-underline"
          >
            Learn More
          </a>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="mt-20"
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
            className="inline-flex flex-col items-center gap-2 text-[var(--text-muted)]"
          >
            <span className="text-xs tracking-widest uppercase" style={{ fontFamily: "'Inter', sans-serif" }}>
              Scroll to explore
            </span>
            <ChevronDown size={18} />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
