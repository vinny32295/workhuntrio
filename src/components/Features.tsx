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
    title: "Smart Job Discovery",
    description: "AI scans thousands of job boards to surface roles that match your skills, experience, and preferences.",
  },
  {
    icon: FileText,
    title: "Custom Resumes & Cover Letters",
    description: "For each role, we generate a tailored resume and personalized cover letter highlighting your most relevant experience.",
  },
  {
    icon: BarChart3,
    title: "Real-time Dashboard",
    description: "Track discovered jobs, download custom documents, and manage your applications in one place.",
  },
  {
    icon: Shield,
    title: "Privacy First",
    description: "Your data is encrypted and never shared. You decide which roles to pursue and when to apply.",
  },
  {
    icon: Clock,
    title: "24/7 Job Scanning",
    description: "Our AI works around the clock, ensuring you never miss a perfect opportunity the moment it's posted.",
  },
  {
    icon: Sparkles,
    title: "AI-Powered Tailoring",
    description: "Every document is optimized with keywords and phrasing from the job description to maximize your callback rate.",
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
