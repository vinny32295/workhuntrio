import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

const tiers = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Perfect for testing the waters",
    features: [
      "5 auto-applications per month",
      "Basic job matching",
      "Email notifications",
      "1 job search profile",
    ],
    cta: "Get Started Free",
    popular: false,
  },
  {
    name: "Pro",
    price: "$19.99",
    period: "per month",
    description: "For active job seekers ready to land their dream role",
    features: [
      "50 auto-applications per week",
      "Advanced AI job matching",
      "Custom resume for each job",
      "Custom cover letter for each job",
      "Real-time match alerts",
      "Application dashboard",
      "3 job search profiles",
    ],
    cta: "Start 7-Day Free Trial",
    popular: true,
  },
  {
    name: "Premium",
    price: "$49.99",
    period: "per month",
    description: "Maximum firepower for your job hunt",
    features: [
      "Unlimited auto-applications",
      "Priority matching algorithm",
      "Unlimited search profiles",
      "Interview prep insights",
      "Salary negotiation tips",
      "Dedicated support",
    ],
    cta: "Go Premium",
    popular: false,
  },
];

const Pricing = () => {
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
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`relative rounded-2xl p-8 transition-all duration-300 hover:scale-105 ${
                tier.popular
                  ? "bg-gradient-to-b from-primary/20 to-primary/5 border-2 border-primary shadow-lg shadow-primary/20"
                  : "glass-card border border-white/10"
              }`}
            >
              {tier.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="bg-primary text-primary-foreground text-sm font-semibold px-4 py-1 rounded-full">
                    Most Popular
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
                className={`w-full ${
                  tier.popular ? "variant-hero" : ""
                }`}
                variant={tier.popular ? "default" : "outline"}
                size="lg"
              >
                {tier.cta}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Pricing;
