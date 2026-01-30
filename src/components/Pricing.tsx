import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Check, Loader2, Crown } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { STRIPE_TIERS, TierKey } from "@/lib/stripe";
import { toast } from "sonner";

interface Tier {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  cta: string;
  popular: boolean;
  tierKey: TierKey;
}

const tiers: Tier[] = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Perfect for testing the waters",
    features: [
      "1 job search per week",
      "5 job results per search",
      "Basic job discovery",
      "Application tracking",
    ],
    cta: "Get Started Free",
    popular: false,
    tierKey: "free",
  },
  {
    name: "Pro",
    price: "$19.99",
    period: "per month",
    description: "For active job seekers ready to land their dream role",
    features: [
      "3 job searches per week",
      "25 job results per search",
      "AI-powered match scoring",
      "10 tailored resumes/month",
      "10 tailored cover letters/month",
      "Priority support",
    ],
    cta: "Upgrade to Pro",
    popular: true,
    tierKey: "pro",
  },
  {
    name: "Premium",
    price: "$49.99",
    period: "per month",
    description: "Maximum firepower for your job hunt",
    features: [
      "Unlimited job searches",
      "50 job results per search",
      "Priority AI matching",
      "Unlimited tailored resumes",
      "Unlimited cover letters",
      "Dedicated support",
    ],
    cta: "Go Premium",
    popular: false,
    tierKey: "premium",
  },
];

const Pricing = () => {
  const navigate = useNavigate();
  const [currentTier, setCurrentTier] = useState<TierKey>("free");
  const [loading, setLoading] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [checkingSubscription, setCheckingSubscription] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
    if (user) {
      checkSubscription();
    }
  };

  const checkSubscription = async () => {
    setCheckingSubscription(true);
    try {
      const { data, error } = await supabase.functions.invoke("check-subscription");
      if (error) throw error;
      if (data?.tier) {
        setCurrentTier(data.tier as TierKey);
      }
    } catch (error) {
      console.error("Error checking subscription:", error);
    } finally {
      setCheckingSubscription(false);
    }
  };

  const handleCheckout = async (tierKey: TierKey) => {
    if (tierKey === "free") {
      if (!user) {
        navigate("/auth");
      }
      return;
    }

    if (!user) {
      toast.info("Please sign in first to upgrade your plan");
      navigate("/auth");
      return;
    }

    setLoading(tierKey);
    try {
      const priceId = STRIPE_TIERS[tierKey as keyof typeof STRIPE_TIERS].price_id;
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { priceId },
      });

      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (error) {
      console.error("Checkout error:", error);
      toast.error("Failed to start checkout. Please try again.");
    } finally {
      setLoading(null);
    }
  };

  const handleManageSubscription = async () => {
    setLoading("manage");
    try {
      const { data, error } = await supabase.functions.invoke("customer-portal");
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (error) {
      console.error("Portal error:", error);
      toast.error("Failed to open subscription management. Please try again.");
    } finally {
      setLoading(null);
    }
  };

  const getButtonContent = (tier: Tier) => {
    const isCurrentPlan = currentTier === tier.tierKey;
    const isLoading = loading === tier.tierKey;
    const isPaidTier = tier.tierKey !== "free";
    const hasPaidSubscription = currentTier !== "free";

    if (isLoading) {
      return <Loader2 className="h-4 w-4 animate-spin" />;
    }

    if (isCurrentPlan) {
      if (isPaidTier) {
        return (
          <>
            <Crown className="h-4 w-4 mr-2" />
            Manage Plan
          </>
        );
      }
      return "Current Plan";
    }

    return tier.cta;
  };

  const handleClick = (tier: Tier) => {
    const isCurrentPlan = currentTier === tier.tierKey;
    const isPaidCurrentPlan = isCurrentPlan && tier.tierKey !== "free";

    if (isPaidCurrentPlan) {
      handleManageSubscription();
    } else if (!isCurrentPlan) {
      handleCheckout(tier.tierKey);
    }
  };

  return (
    <section id="pricing" className="py-24 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-primary/5 to-background" />
      
      <div className="container mx-auto px-4 relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Simple, Transparent{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-cyan-400">
              Pricing
            </span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Choose the plan that fits your job search needs. Upgrade or downgrade anytime.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {tiers.map((tier) => {
            const isCurrentPlan = currentTier === tier.tierKey;
            
            return (
              <div
                key={tier.name}
                className={`relative rounded-2xl p-8 transition-all duration-300 hover:scale-105 ${
                  tier.popular
                    ? "bg-gradient-to-b from-primary/20 to-primary/5 border-2 border-primary shadow-lg shadow-primary/20"
                    : "glass-card border border-white/10"
                } ${isCurrentPlan ? "ring-2 ring-primary/50" : ""}`}
              >
                {tier.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="bg-primary text-primary-foreground text-sm font-semibold px-4 py-1 rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}

                {isCurrentPlan && (
                  <div className="absolute -top-4 right-4">
                    <span className="bg-emerald-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
                      Your Plan
                    </span>
                  </div>
                )}

                <div className="text-center mb-8">
                  <h3 className="text-2xl font-bold mb-2">{tier.name}</h3>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-5xl font-bold">{tier.price}</span>
                    <span className="text-muted-foreground">/{tier.period}</span>
                  </div>
                  <p className="text-muted-foreground mt-4">{tier.description}</p>
                </div>

                <ul className="space-y-4 mb-8">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                        <Check className="w-3 h-3 text-primary" />
                      </div>
                      <span className="text-foreground/80">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  className={`w-full ${tier.popular ? "variant-hero" : ""}`}
                  variant={tier.popular ? "default" : "outline"}
                  size="lg"
                  onClick={() => handleClick(tier)}
                  disabled={loading !== null || (currentTier === tier.tierKey && tier.tierKey === "free")}
                >
                  {getButtonContent(tier)}
                </Button>
              </div>
            );
          })}
        </div>

        {user && currentTier !== "free" && (
          <div className="text-center mt-8">
            <Button
              variant="link"
              onClick={handleManageSubscription}
              disabled={loading === "manage"}
            >
              {loading === "manage" ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Manage your subscription
            </Button>
          </div>
        )}
      </div>
    </section>
  );
};

export default Pricing;
