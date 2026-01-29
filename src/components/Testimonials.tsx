import { Star } from "lucide-react";

const testimonials = [
  {
    name: "Sarah Chen",
    role: "Product Manager",
    company: "Stripe",
    image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop&crop=face",
    quote: "I was spending 3 hours a day applying to jobs. WorkHuntr landed me 12 interviews in my first week — and I got an offer from Stripe within a month.",
    rating: 5,
  },
  {
    name: "Marcus Johnson",
    role: "Software Engineer",
    company: "Shopify",
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face",
    quote: "The AI-tailored resumes are a game changer. My response rate went from 2% to over 30%. Now I'm at my dream company.",
    rating: 5,
  },
  {
    name: "Emily Rodriguez",
    role: "Operations Manager",
    company: "Notion",
    image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop&crop=face",
    quote: "I was skeptical about auto-applying, but WorkHuntr only applies to jobs that actually match my skills. Quality over quantity.",
    rating: 5,
  },
];

const Testimonials = () => {
  return (
    <section id="testimonials" className="py-24 relative">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Real People.{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-cyan-400">
              Real Jobs.
            </span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Join thousands who've landed their dream roles with WorkHuntr
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {testimonials.map((testimonial) => (
            <div
              key={testimonial.name}
              className="glass-card border border-white/10 rounded-2xl p-8 transition-all duration-300 hover:scale-105 hover:border-primary/30"
            >
              {/* Stars */}
              <div className="flex gap-1 mb-6">
                {Array.from({ length: testimonial.rating }).map((_, i) => (
                  <Star
                    key={i}
                    className="h-5 w-5 fill-primary text-primary"
                  />
                ))}
              </div>

              {/* Quote */}
              <p className="text-foreground/90 leading-relaxed mb-8">
                "{testimonial.quote}"
              </p>

              {/* Author */}
              <div className="flex items-center gap-4">
                <img
                  src={testimonial.image}
                  alt={testimonial.name}
                  className="w-12 h-12 rounded-full object-cover border-2 border-primary/30"
                />
                <div>
                  <div className="font-semibold text-foreground">
                    {testimonial.name}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {testimonial.role} at {testimonial.company}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
