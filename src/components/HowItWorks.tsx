import { Upload, Brain, Send, CheckCircle } from "lucide-react";

const steps = [
  {
    icon: Upload,
    number: "01",
    title: "Upload Your Resume",
    description: "Drop in your resume and set your job preferences. Tell us what roles you want and where.",
  },
  {
    icon: Brain,
    number: "02",
    title: "AI Matches Jobs",
    description: "Our AI scans thousands of jobs daily, finding perfect matches based on your skills and goals.",
  },
  {
    icon: Send,
    number: "03",
    title: "Auto-Apply & Track",
    description: "We apply to matched positions with personalized cover letters. Track everything in real-time.",
  },
];

const HowItWorks = () => {
  return (
    <section id="how-it-works" className="py-32 relative">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-secondary/20 to-background" />
      
      <div className="container mx-auto px-6 relative z-10">
        <div className="text-center mb-20">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            How <span className="text-gradient">workhuntr</span> works
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Three simple steps to automate your job search
          </p>
        </div>
        
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {steps.map((step, index) => (
            <div 
              key={step.number}
              className="relative group"
              style={{ animationDelay: `${index * 0.2}s` }}
            >
              {/* Connector line */}
              {index < steps.length - 1 && (
                <div className="hidden md:block absolute top-16 left-[60%] w-[80%] h-px bg-gradient-to-r from-primary/50 to-transparent" />
              )}
              
              <div className="glass-strong rounded-2xl p-8 h-full transition-all duration-500 hover:scale-105 hover:glow-primary">
                {/* Step number */}
                <div className="text-6xl font-bold text-primary/10 absolute top-4 right-6">
                  {step.number}
                </div>
                
                {/* Icon */}
                <div className="relative mb-6">
                  <div className="w-16 h-16 rounded-xl bg-gradient-primary flex items-center justify-center">
                    <step.icon className="h-8 w-8 text-primary-foreground" />
                  </div>
                  <div className="absolute inset-0 bg-primary/30 blur-xl rounded-xl" />
                </div>
                
                {/* Content */}
                <h3 className="text-xl font-semibold mb-3">{step.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
        
        {/* Success indicator */}
        <div className="flex items-center justify-center gap-3 mt-16">
          <CheckCircle className="h-6 w-6 text-primary" />
          <span className="text-muted-foreground">Average time to first interview: 7 days</span>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
