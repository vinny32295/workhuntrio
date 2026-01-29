import { 
  Radar, 
  FileText, 
  BarChart3, 
  Shield, 
  Clock, 
  Sparkles 
} from "lucide-react";

const features = [
  {
    icon: Radar,
    title: "Smart Job Matching",
    description: "AI analyzes job descriptions and your profile to find positions where you're most likely to succeed.",
  },
  {
    icon: FileText,
    title: "Custom Cover Letters",
    description: "Generates personalized cover letters tailored to each job, highlighting relevant experience.",
  },
  {
    icon: BarChart3,
    title: "Real-time Dashboard",
    description: "Track all applications, responses, and interview requests in one beautiful dashboard.",
  },
  {
    icon: Shield,
    title: "Privacy First",
    description: "Your data is encrypted and never shared. You control exactly where you apply.",
  },
  {
    icon: Clock,
    title: "24/7 Hunting",
    description: "Our bots work around the clock, ensuring you never miss a perfect opportunity.",
  },
  {
    icon: Sparkles,
    title: "Resume Optimization",
    description: "AI suggests improvements to your resume to increase match rates and callbacks.",
  },
];

const Features = () => {
  return (
    <section id="features" className="py-32 relative">
      <div className="container mx-auto px-6">
        <div className="text-center mb-20">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Everything you need to
            <br />
            <span className="text-gradient">land your next role</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Powerful features designed to maximize your job search efficiency
          </p>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {features.map((feature, index) => (
            <div 
              key={feature.title}
              className="group glass rounded-2xl p-8 transition-all duration-500 hover:bg-card/80 hover:scale-[1.02]"
            >
              <div className="mb-6 relative inline-block">
                <div className="w-14 h-14 rounded-xl bg-secondary flex items-center justify-center transition-all duration-300 group-hover:bg-gradient-primary">
                  <feature.icon className="h-7 w-7 text-primary transition-colors group-hover:text-primary-foreground" />
                </div>
              </div>
              
              <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
              <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;
