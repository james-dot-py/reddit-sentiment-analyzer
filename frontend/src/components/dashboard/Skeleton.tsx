import clsx from 'clsx';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={clsx('skeleton-shimmer rounded-xl', className)} />
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Brand Banner skeleton */}
      <div className="paper-card overflow-hidden">
        <div className="px-5 pt-4 pb-0 flex items-center gap-3">
          <Skeleton className="h-7 w-32 rounded" />
          <div className="flex-1" />
          <Skeleton className="h-7 w-20 rounded" />
          <Skeleton className="h-7 w-28 rounded" />
        </div>
        <div className="flex items-start justify-between px-5 pt-4 pb-3">
          <div className="space-y-2">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-3 w-36" />
          </div>
          <div className="text-right space-y-2">
            <Skeleton className="h-16 w-20 ml-auto" />
            <Skeleton className="h-5 w-16 ml-auto" />
          </div>
        </div>
        <div className="px-5 pb-2">
          <Skeleton className="h-6 w-full rounded" />
          <div className="flex gap-4 mt-2">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-3 w-28" />)}
          </div>
        </div>
        <div className="flex items-center gap-2 px-5 py-3 border-t border-[var(--border-subtle)]">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-7 w-20 rounded-full" />)}
        </div>
      </div>

      {/* Narrative + Trend chart skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="paper-card p-6 space-y-3">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-4/5" />
          <div className="space-y-2 mt-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="h-5 w-14 rounded-full" />
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="paper-card p-6">
          <Skeleton className="h-3 w-24 mb-4" />
          <Skeleton className="h-52" />
        </div>
      </div>

      {/* Theme map + Community values skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="paper-card p-6 space-y-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-56" />
        </div>
        <div className="paper-card p-6 space-y-3">
          <Skeleton className="h-3 w-32" />
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-4 w-full" />)}
            </div>
            <div className="space-y-2">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-4 w-full" />)}
            </div>
          </div>
        </div>
      </div>

      {/* Evidence skeleton */}
      <div className="paper-card p-6 space-y-3">
        <Skeleton className="h-3 w-24" />
        <div className="flex gap-2 mb-2">
          <Skeleton className="h-7 w-40 rounded" />
          <div className="flex-1" />
          <Skeleton className="h-7 w-32 rounded" />
        </div>
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
