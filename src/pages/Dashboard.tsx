import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Crosshair, LogOut, Upload, Settings, BarChart3 } from "lucide-react";
import type { User } from "@supabase/supabase-js";

const Dashboard = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        setLoading(false);
        if (!session?.user) {
          navigate("/auth");
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
      if (!session?.user) {
        navigate("/auth");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-white/10 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="relative flex items-center justify-center w-10 h-10">
              <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
              <span className="absolute text-white font-black text-sm z-0">$</span>
              <Crosshair className="h-7 w-7 text-primary absolute z-10" />
            </div>
            <span className="text-xl font-bold tracking-tight">
              work<span className="text-primary">huntr</span>.io
            </span>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden sm:block">
              {user?.email}
            </span>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-2">Welcome to WorkHuntr</h1>
        <p className="text-muted-foreground mb-8">
          Your automated job hunting dashboard
        </p>

        {/* Quick actions */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <div className="glass-card border border-white/10 rounded-2xl p-6 hover:border-primary/30 transition-colors cursor-pointer">
            <Upload className="h-8 w-8 text-primary mb-4" />
            <h3 className="text-lg font-semibold mb-2">Upload Resume</h3>
            <p className="text-sm text-muted-foreground">
              Upload your resume to start matching with jobs
            </p>
          </div>

          <div className="glass-card border border-white/10 rounded-2xl p-6 hover:border-primary/30 transition-colors cursor-pointer">
            <Settings className="h-8 w-8 text-primary mb-4" />
            <h3 className="text-lg font-semibold mb-2">Set Preferences</h3>
            <p className="text-sm text-muted-foreground">
              Define your target roles, location, and work type
            </p>
          </div>

          <div className="glass-card border border-white/10 rounded-2xl p-6 hover:border-primary/30 transition-colors cursor-pointer">
            <BarChart3 className="h-8 w-8 text-primary mb-4" />
            <h3 className="text-lg font-semibold mb-2">View Applications</h3>
            <p className="text-sm text-muted-foreground">
              Track all your auto-applications in one place
            </p>
          </div>
        </div>

        {/* Status card */}
        <div className="glass-card border border-white/10 rounded-2xl p-8">
          <h2 className="text-xl font-semibold mb-4">Getting Started</h2>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                1
              </div>
              <span className="text-muted-foreground">Upload your resume</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-muted-foreground font-bold">
                2
              </div>
              <span className="text-muted-foreground">Set your job preferences</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-muted-foreground font-bold">
                3
              </div>
              <span className="text-muted-foreground">Let WorkHuntr apply for you</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
