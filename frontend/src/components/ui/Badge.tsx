import clsx from 'clsx';
import type { SentimentLabel } from '../../types';

const styles: Record<SentimentLabel, string> = {
  positive: 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400',
  neutral: 'bg-gray-500/10 border border-gray-500/20 text-gray-400',
  negative: 'bg-red-500/10 border border-red-500/20 text-red-400',
};

export function Badge({ label }: { label: SentimentLabel }) {
  return (
    <span className={clsx('inline-block rounded-full px-2.5 py-0.5 text-xs font-medium', styles[label])}>
      {label}
    </span>
  );
}
