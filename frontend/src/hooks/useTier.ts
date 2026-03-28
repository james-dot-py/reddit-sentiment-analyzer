import { useState, useEffect } from 'react';
import { fetchMe } from '../api';
import { hasClerk } from '../App';

export type Tier = 'free' | 'pro' | 'enterprise';

export interface TierLimits {
  max_brands: number;
  max_subreddits: number;
  max_competitors: number;
  view_modes: string[];
  history_weeks: number;
  export_enabled: boolean;
  competitive_context: boolean;
  email_alerts: boolean;
  api_access: boolean;
}

const FREE_LIMITS: TierLimits = {
  max_brands: 1,
  max_subreddits: 2,
  max_competitors: 0,
  view_modes: ['briefing'],
  history_weeks: 1,
  export_enabled: false,
  competitive_context: false,
  email_alerts: false,
  api_access: false,
};

const PRO_LIMITS: TierLimits = {
  max_brands: 3,
  max_subreddits: 5,
  max_competitors: 2,
  view_modes: ['briefing', 'deep-dive'],
  history_weeks: 52,
  export_enabled: true,
  competitive_context: true,
  email_alerts: true,
  api_access: false,
};

/** Returns current user's tier and limits. Falls back to 'pro' in local dev (no Clerk). */
export function useTier() {
  const [tier, setTier] = useState<Tier>(hasClerk ? 'free' : 'pro');
  const [limits, setLimits] = useState<TierLimits>(hasClerk ? FREE_LIMITS : PRO_LIMITS);
  const [loaded, setLoaded] = useState(!hasClerk);

  useEffect(() => {
    if (!hasClerk) return; // Local dev — skip, already set to pro

    fetchMe()
      .then(data => {
        const t = data.user.tier as Tier;
        setTier(t);
        setLimits(data.tier_limits ?? (t === 'free' ? FREE_LIMITS : PRO_LIMITS));
        setLoaded(true);
      })
      .catch(() => {
        // If not authenticated, default to free
        setTier('free');
        setLimits(FREE_LIMITS);
        setLoaded(true);
      });
  }, []);

  const canUse = (feature: keyof TierLimits): boolean => {
    const val = limits[feature];
    if (typeof val === 'boolean') return val;
    if (typeof val === 'number') return val !== 0;
    if (Array.isArray(val)) return val.length > 0;
    return true;
  };

  const canUseViewMode = (mode: string): boolean => {
    return limits.view_modes.includes(mode);
  };

  const isAtLimit = (resource: 'brands' | 'subreddits' | 'competitors', current: number): boolean => {
    const key = `max_${resource}` as keyof TierLimits;
    const max = limits[key] as number;
    return max !== -1 && current >= max;
  };

  return {
    tier,
    limits,
    loaded,
    canUse,
    canUseViewMode,
    isAtLimit,
    isPro: tier === 'pro' || tier === 'enterprise',
    isFree: tier === 'free',
  };
}
