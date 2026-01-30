// Stripe tier configuration
export const STRIPE_TIERS = {
  pro: {
    name: "Pro",
    price_id: "price_1Sv7GYJuO1GOwILtpCGAXOT3",
    product_id: "prod_Tst2VQ3tymdp2g",
  },
  premium: {
    name: "Premium",
    price_id: "price_1Sv7GoJuO1GOwILtkK4ZBfWD",
    product_id: "prod_Tst2PRuKyWGL9K",
  },
} as const;

export type TierKey = keyof typeof STRIPE_TIERS | "free";
