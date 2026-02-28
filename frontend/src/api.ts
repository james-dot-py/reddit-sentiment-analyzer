const BASE_URL = import.meta.env.VITE_API_URL || '';

// ── Snapshot endpoints (legacy, will be replaced in Phase 4) ──────────────

export interface SnapshotIndex {
  weeks: string[];
  by_subreddit: Record<string, string[]>;
}

export async function fetchSnapshotIndex(): Promise<SnapshotIndex> {
  const res = await fetch(`${BASE_URL}/api/snapshots`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchSnapshot(date: string, subreddit: string): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/api/snapshots/${date}/${subreddit}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
