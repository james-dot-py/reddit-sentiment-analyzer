/**
 * Browser-side Reddit fetcher using public JSON API.
 * Residential IPs can hit reddit.com/.json endpoints without OAuth.
 */

import type { RedditPost, RedditComment, SortMethod, TimeFilter } from '../types';

const BASE_URL = 'https://www.reddit.com';
const RATE_LIMIT_DELAY = 2000; // 2s between requests
const BACKOFF_DELAY = 6500;    // 6.5s on 429
const MAX_RETRIES = 3;

export interface FetchProgress {
  message: string;
  /** 0–1 within the fetching phase */
  progress: number;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
  });
}

async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const resp = await fetch(url, { signal });
    if (resp.status === 429) {
      lastError = new Error('Rate limited by Reddit');
      await sleep(BACKOFF_DELAY, signal);
      continue;
    }
    if (!resp.ok) {
      throw new Error(`Reddit returned HTTP ${resp.status} for ${url}`);
    }
    return resp.json();
  }
  throw lastError ?? new Error('Max retries exceeded');
}

export async function fetchSubredditPosts(
  subreddit: string,
  sort: SortMethod,
  timeFilter: TimeFilter,
  limit: number,
  signal?: AbortSignal,
  onProgress?: (fetched: number, total: number) => void,
): Promise<RedditPost[]> {
  const posts: RedditPost[] = [];
  let after: string | null = null;

  while (posts.length < limit) {
    const batchSize = Math.min(100, limit - posts.length);
    const params = new URLSearchParams({
      limit: String(batchSize),
      raw_json: '1',
    });
    if (sort === 'top') params.set('t', timeFilter);
    if (after) params.set('after', after);

    const url = `${BASE_URL}/r/${subreddit}/${sort}.json?${params}`;
    const data = await fetchJson(url, signal) as { data?: { children?: Array<{ data: Record<string, unknown> }>; after?: string } };

    const listing = data?.data;
    const children = listing?.children ?? [];
    if (children.length === 0) break;

    for (const child of children) {
      const d = child.data;
      posts.push({
        id: (d.id as string) ?? '',
        subreddit,
        title: (d.title as string) ?? '',
        selftext: (d.selftext as string) ?? '',
        author: (d.author as string) ?? '[deleted]',
        score: (d.score as number) ?? 0,
        num_comments: (d.num_comments as number) ?? 0,
        created_utc: (d.created_utc as number) ?? 0,
        permalink: (d.permalink as string) ?? '',
        url: (d.url as string) ?? '',
      });
    }

    onProgress?.(posts.length, limit);
    after = listing?.after ?? null;

    if (!after || children.length < batchSize) break;
    await sleep(RATE_LIMIT_DELAY, signal);
  }

  return posts.slice(0, limit);
}

interface CommentChild {
  kind: string;
  data: {
    id?: string;
    body?: string;
    author?: string;
    score?: number;
    created_utc?: number;
    replies?: { data?: { children?: CommentChild[] } } | string;
  };
}

function extractComments(
  children: CommentChild[],
  postId: string,
  subreddit: string,
  maxDepth: number,
  currentDepth: number = 0,
): RedditComment[] {
  if (currentDepth >= maxDepth) return [];
  const comments: RedditComment[] = [];

  for (const child of children) {
    if (child.kind !== 't1') continue;
    const d = child.data;
    const body = d.body ?? '';
    if (body && body !== '[deleted]' && body !== '[removed]') {
      comments.push({
        id: d.id ?? '',
        post_id: postId,
        subreddit,
        body,
        author: d.author ?? '[deleted]',
        score: d.score ?? 0,
        created_utc: d.created_utc ?? 0,
      });
    }
    const replies = d.replies;
    if (replies && typeof replies === 'object') {
      const replyChildren = replies.data?.children ?? [];
      comments.push(...extractComments(replyChildren, postId, subreddit, maxDepth, currentDepth + 1));
    }
  }
  return comments;
}

export async function fetchPostComments(
  subreddit: string,
  postId: string,
  depth: number,
  signal?: AbortSignal,
): Promise<RedditComment[]> {
  const params = new URLSearchParams({ limit: '100', depth: String(depth), raw_json: '1' });
  const url = `${BASE_URL}/r/${subreddit}/comments/${postId}.json?${params}`;

  try {
    const data = await fetchJson(url, signal) as Array<{ data?: { children?: CommentChild[] } }>;
    if (!Array.isArray(data) || data.length < 2) return [];
    const commentChildren = data[1]?.data?.children ?? [];
    return extractComments(commentChildren, postId, subreddit, depth);
  } catch {
    return [];
  }
}

export interface FetchAllResult {
  posts: RedditPost[];
  comments: RedditComment[];
}

export async function fetchAllRedditData(
  subreddits: string[],
  sort: SortMethod,
  timeFilter: TimeFilter,
  postLimit: number,
  includeComments: boolean,
  commentDepth: number,
  signal?: AbortSignal,
  onProgress?: (progress: FetchProgress) => void,
): Promise<FetchAllResult> {
  const allPosts: RedditPost[] = [];
  const allComments: RedditComment[] = [];

  // Estimate total requests for progress
  const fetchReqsPerSub = Math.ceil(postLimit / 100);
  const commentReqsPerSub = includeComments ? Math.min(postLimit, 50) : 0;
  const totalReqs = (fetchReqsPerSub + commentReqsPerSub) * subreddits.length;
  let completedReqs = 0;

  const report = (msg: string) => {
    onProgress?.({ message: msg, progress: Math.min(completedReqs / totalReqs, 1) });
  };

  for (const subreddit of subreddits) {
    report(`Fetching posts from r/${subreddit}...`);

    const posts = await fetchSubredditPosts(
      subreddit, sort, timeFilter, postLimit, signal,
      (fetched, total) => {
        const pagesDone = Math.ceil(fetched / 100);
        completedReqs = completedReqs - (pagesDone > 1 ? pagesDone - 1 : 0) + pagesDone;
        report(`Fetching r/${subreddit}: ${fetched}/${total} posts...`);
      },
    );
    // After post fetching, count the pages completed
    const pagesDone = Math.ceil(posts.length / 100) || 1;
    completedReqs = Math.floor(completedReqs / 1) ; // keep as-is, re-calc below
    allPosts.push(...posts);

    if (includeComments && posts.length > 0) {
      const postsToFetch = posts.slice(0, Math.min(postLimit, 50));
      for (let i = 0; i < postsToFetch.length; i++) {
        report(`Fetching comments from r/${subreddit} (${i + 1}/${postsToFetch.length})...`);
        const comments = await fetchPostComments(subreddit, postsToFetch[i].id, commentDepth, signal);
        allComments.push(...comments);
        completedReqs++;
        report(`Fetched comments for post ${i + 1}/${postsToFetch.length} in r/${subreddit}`);
        if (i < postsToFetch.length - 1) {
          await sleep(RATE_LIMIT_DELAY, signal);
        }
      }
    }

    // Rate limit between subreddits
    if (subreddits.indexOf(subreddit) < subreddits.length - 1) {
      await sleep(RATE_LIMIT_DELAY, signal);
    }
  }

  onProgress?.({
    message: `Fetched ${allPosts.length} posts and ${allComments.length} comments`,
    progress: 1,
  });

  return { posts: allPosts, comments: allComments };
}
