// Tier limits configuration
export const TIER_LIMITS = {
  free: {
    searchesPerWeek: 1,
    resultsPerSearch: 5,
    tailorsPerMonth: 0,
    resumeParses: 1,
    aiScoring: false,
  },
  pro: {
    searchesPerWeek: 3,
    resultsPerSearch: 25,
    tailorsPerMonth: 10,
    resumeParses: Infinity,
    aiScoring: true,
  },
  premium: {
    searchesPerWeek: Infinity,
    resultsPerSearch: 50,
    tailorsPerMonth: Infinity,
    resumeParses: Infinity,
    aiScoring: true,
  },
} as const;

export type TierKey = keyof typeof TIER_LIMITS;

// Stripe product ID to tier mapping
export const PRODUCT_TO_TIER: Record<string, TierKey> = {
  "prod_Tst2VQ3tymdp2g": "pro",
  "prod_Tst2PRuKyWGL9K": "premium",
};

export function getTierLimits(tier: string) {
  return TIER_LIMITS[tier as TierKey] || TIER_LIMITS.free;
}
