import clsx from 'clsx';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={clsx('animate-pulse rounded bg-[var(--surface-2)]', className)} />
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Score header skeleton */}
      <div className="paper-card p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="text-right space-y-2">
            <Skeleton className="h-12 w-20 ml-auto" />
            <Skeleton className="h-5 w-16 ml-auto" />
          </div>
        </div>
        <div className="mt-6 grid grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      </div>

      {/* Narrative + chart skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="paper-card p-6 space-y-3">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
        <div className="paper-card p-6">
          <Skeleton className="h-3 w-24 mb-4" />
          <Skeleton className="h-52" />
        </div>
      </div>

      {/* Theme + values skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="paper-card p-6 space-y-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-40" />
        </div>
        <div className="paper-card p-6 space-y-3">
          <Skeleton className="h-3 w-32" />
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-6 w-20 rounded-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
