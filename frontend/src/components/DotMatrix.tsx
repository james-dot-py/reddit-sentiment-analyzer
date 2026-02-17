/**
 * Subtle dot-matrix background using the tribal/value palette.
 *
 * Renders an SVG grid of small coloured circles at low opacity.
 * Pattern is deterministic (seeded) so it never flickers between renders.
 */

const COLORS = [
  '#2E5E4E', // --tribal-sacred  (green)
  '#8A1C1C', // --tribal-blasphemous (red)
  '#D4A017', // --tribal-controversial (gold)
  '#B0B0B0', // --tribal-neutral (gray)
];

/** Simple seedable pseudo-random (mulberry32). */
function seededRandom(seed: number) {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

interface Props {
  className?: string;
}

export function DotMatrix({ className = '' }: Props) {
  const cols = 28;
  const rows = 10;
  const spacing = 32;
  const baseRadius = 3;
  const seed = 42;

  const dots: { cx: number; cy: number; r: number; fill: string; opacity: number }[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const idx = row * cols + col;
      const rand = seededRandom(seed + idx);
      const rand2 = seededRandom(seed + idx + 1000);
      const rand3 = seededRandom(seed + idx + 2000);

      // ~60% of cells get a dot (sparse feel)
      if (rand > 0.6) continue;

      const colorIdx = Math.floor(rand2 * COLORS.length);
      const radiusJitter = baseRadius + (rand3 - 0.5) * 2;

      dots.push({
        cx: col * spacing + spacing / 2 + (rand3 - 0.5) * 6,
        cy: row * spacing + spacing / 2 + (rand - 0.5) * 6,
        r: Math.max(1.5, radiusJitter),
        fill: COLORS[colorIdx],
        opacity: 0.12 + rand2 * 0.1,
      });
    }
  }

  const width = cols * spacing;
  const height = rows * spacing;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {dots.map((d, i) => (
        <circle key={i} cx={d.cx} cy={d.cy} r={d.r} fill={d.fill} opacity={d.opacity} />
      ))}
    </svg>
  );
}
