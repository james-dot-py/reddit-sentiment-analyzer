import { useCallback, useEffect, useRef } from 'react';

/**
 * An animated canvas visualization for the homepage hero.
 *
 * Renders a field of data points flowing across a subtle coordinate grid,
 * simulating a live sentiment scatter plot. Points drift, fade, and respawn
 * to create a sense of continuous analysis in motion.
 */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  opacity: number;
  fadeDirection: number;
  color: string;
  /** Vertical "sentiment" anchor — particles oscillate around this */
  anchorY: number;
}

const COLORS = {
  sacred: 'rgba(46, 94, 78,',       // --tribal-sacred
  blasphemous: 'rgba(138, 28, 28,',  // --tribal-blasphemous
  controversial: 'rgba(212, 160, 23,', // --tribal-controversial
  neutral: 'rgba(117, 117, 117,',    // --text-muted
};

function randomColor(): string {
  // Weight distribution: 30% sacred, 25% blasphemous, 15% controversial, 30% neutral
  const r = Math.random();
  if (r < 0.30) return COLORS.sacred;
  if (r < 0.55) return COLORS.blasphemous;
  if (r < 0.70) return COLORS.controversial;
  return COLORS.neutral;
}

function createParticle(width: number, height: number, startOffscreen = false): Particle {
  const sentimentBias = Math.random();
  // Create a bimodal-ish distribution for visual interest
  let anchorY: number;
  if (sentimentBias < 0.35) {
    anchorY = 0.2 + Math.random() * 0.2; // positive cluster (top)
  } else if (sentimentBias < 0.65) {
    anchorY = 0.4 + Math.random() * 0.2; // neutral band (middle)
  } else {
    anchorY = 0.6 + Math.random() * 0.2; // negative cluster (bottom)
  }

  return {
    x: startOffscreen ? -10 - Math.random() * 60 : Math.random() * width,
    y: anchorY * height + (Math.random() - 0.5) * height * 0.15,
    vx: 0.15 + Math.random() * 0.35,
    vy: (Math.random() - 0.5) * 0.2,
    radius: 1.5 + Math.random() * 2.5,
    opacity: startOffscreen ? 0 : 0.15 + Math.random() * 0.45,
    fadeDirection: 1,
    color: randomColor(),
    anchorY: anchorY * height,
  };
}

export function HeroVisualization() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animRef = useRef<number>(0);
  const dimRef = useRef({ w: 0, h: 0 });

  const PARTICLE_COUNT = 120;

  const initParticles = useCallback((w: number, h: number) => {
    particlesRef.current = Array.from({ length: PARTICLE_COUNT }, () =>
      createParticle(w, h, false)
    );
  }, []);

  const drawGrid = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.strokeStyle = 'rgba(34, 34, 34, 0.04)';
    ctx.lineWidth = 0.5;

    // Vertical grid lines
    const vSpacing = w / 12;
    for (let x = vSpacing; x < w; x += vSpacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // Horizontal grid lines
    const hSpacing = h / 6;
    for (let y = hSpacing; y < h; y += hSpacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Center axis — slightly stronger
    ctx.strokeStyle = 'rgba(34, 34, 34, 0.08)';
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.5);
    ctx.lineTo(w, h * 0.5);
    ctx.stroke();

    // Y-axis labels
    ctx.font = '9px "Roboto Mono", monospace';
    ctx.fillStyle = 'rgba(117, 117, 117, 0.35)';
    ctx.textAlign = 'left';
    ctx.fillText('+1.0', 6, h * 0.15 + 3);
    ctx.fillText(' 0.0', 6, h * 0.5 + 3);
    ctx.fillText('−1.0', 6, h * 0.85 + 3);

    // X-axis label
    ctx.textAlign = 'right';
    ctx.fillText('t →', w - 8, h - 8);
  }, []);

  const drawConnections = useCallback((ctx: CanvasRenderingContext2D, particles: Particle[]) => {
    const threshold = 60;
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < threshold) {
          const alpha = (1 - dist / threshold) * 0.06 * Math.min(particles[i].opacity, particles[j].opacity);
          ctx.strokeStyle = `rgba(34, 34, 34, ${alpha})`;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }
  }, []);

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { w, h } = dimRef.current;
    ctx.clearRect(0, 0, w, h);

    // Grid backdrop
    drawGrid(ctx, w, h);

    const particles = particlesRef.current;

    // Draw proximity connections
    drawConnections(ctx, particles);

    // Update and draw particles
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      // Drift rightward
      p.x += p.vx;

      // Gentle vertical oscillation toward anchor
      const pullStrength = 0.003;
      p.vy += (p.anchorY - p.y) * pullStrength;
      p.vy *= 0.98; // damping
      p.y += p.vy;

      // Pulse opacity
      p.opacity += p.fadeDirection * (0.002 + Math.random() * 0.004);
      if (p.opacity >= 0.6) {
        p.opacity = 0.6;
        p.fadeDirection = -1;
      } else if (p.opacity <= 0.1) {
        p.opacity = 0.1;
        p.fadeDirection = 1;
      }

      // Recycle off-screen particles
      if (p.x > w + 20) {
        particles[i] = createParticle(w, h, true);
      }

      // Draw the point
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = `${p.color} ${p.opacity})`;
      ctx.fill();

      // Subtle outer glow for larger points
      if (p.radius > 2.5) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius + 2, 0, Math.PI * 2);
        ctx.fillStyle = `${p.color} ${p.opacity * 0.15})`;
        ctx.fill();
      }
    }

    animRef.current = requestAnimationFrame(animate);
  }, [drawGrid, drawConnections]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) return;
      const dpr = window.devicePixelRatio || 1;
      const w = rect.width;
      const h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(dpr, dpr);
      dimRef.current = { w, h };
      initParticles(w, h);
    };

    resize();
    window.addEventListener('resize', resize);
    animRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animRef.current);
    };
  }, [animate, initParticles]);

  return (
    <div className="hero-viz-container">
      <canvas ref={canvasRef} className="hero-viz-canvas" />
    </div>
  );
}
