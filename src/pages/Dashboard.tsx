import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Crosshair, LogOut, Settings, BarChart3, ChevronDown, Search, User, Crown, Sparkles, Building2 } from "lucide-react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import JobPreferencesForm from "@/components/JobPreferencesForm";
import JobApplicationsTable from "@/components/JobApplicationsTable";
import DiscoveredJobsTable from "@/components/DiscoveredJobsTable";
import StartHuntButton from "@/components/StartHuntButton";
import CompanyTargets from "@/components/CompanyTargets";
import Footer from "@/components/Footer";
import { TierKey } from "@/lib/stripe";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface Profile {
  resume_url: string | null;
  full_name: string | null;
  target_roles: string[] | null;
  work_type: string[] | null;
  phone_number: string | null;
}

const Dashboard = () => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [discoveredJobsKey, setDiscoveredJobsKey] = useState(0);
  const [subscriptionTier, setSubscriptionTier] = useState<TierKey>("free");
  const navigate = useNavigate();

  const checkSubscription = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("check-subscription");
      if (!error && data?.tier) {
        setSubscriptionTier(data.tier as TierKey);
      }
    } catch (err) {
      console.error("Error checking subscription:", err);
    }
  };

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('resume_url, full_name, target_roles, work_type, phone_number')
        .eq('user_id', userId)
        .single();
      
      if (!error && data) {
        setProfile(data);
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        setLoading(false);
        if (!session?.user) {
          navigate("/auth");
        } else {
          setTimeout(() => fetchProfile(session.user.id), 0);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
      if (!session?.user) {
        navigate("/auth");
      } else {
        fetchProfile(session.user.id);
        checkSubscription();
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handlePreferencesSave = async () => {
    if (user) {
      await new Promise(resolve => setTimeout(resolve, 100));
      await fetchProfile(user.id);
    }
  };

  const hasPreferences = profile?.target_roles && profile.target_roles.length > 0 && profile.work_type && profile.work_type.length > 0;

  const handleHuntComplete = () => {
    setDiscoveredJobsKey(prev => prev + 1);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const getInitials = () => {
    if (profile?.full_name) {
      return profile.full_name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    if (user?.email) {
      return user.email[0].toUpperCase();
    }
    return 'U';
  };

  const getTierBadge = () => {
    switch (subscriptionTier) {
      case "premium":
        return (
          <Link to="/#pricing">
            <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 gap-1 cursor-pointer hover:opacity-90">
              <Crown className="h-3 w-3" />
              Premium
            </Badge>
          </Link>
        );
      case "pro":
        return (
          <Link to="/#pricing">
            <Badge className="bg-gradient-to-r from-primary to-cyan-500 text-white border-0 gap-1 cursor-pointer hover:opacity-90">
              <Sparkles className="h-3 w-3" />
              Pro
            </Badge>
          </Link>
        );
      default:
        return (
          <Link to="/#pricing">
            <Badge variant="outline" className="gap-1 cursor-pointer hover:bg-primary/10">
              Free
            </Badge>
          </Link>
        );
    }
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
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="relative flex items-center justify-center w-10 h-10">
              <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
              <span className="absolute text-white font-black text-sm z-0">$</span>
              <Crosshair className="h-7 w-7 text-primary absolute z-10" />
            </div>
            <span className="text-xl font-bold tracking-tight">
              work<span className="text-primary">huntr</span>.io
            </span>
          </Link>

          <div className="flex items-center gap-3">
            {getTierBadge()}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 px-2">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary/20 text-primary text-sm">
                      {getInitials()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm text-muted-foreground hidden sm:block max-w-[150px] truncate">
                    {profile?.full_name || user?.email}
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem asChild>
                  <Link to="/profile" className="flex items-center gap-2 cursor-pointer">
                    <User className="h-4 w-4" />
                    My Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive">
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-6 py-8">
        <h1 className="text-3xl font-bold mb-2">Welcome to WorkHuntr</h1>
        <p className="text-muted-foreground mb-8">
          Your automated job hunting dashboard
        </p>

        <div className="space-y-8">
          {/* Job Preferences Section - Collapsible */}
          <Collapsible className="glass-card border border-white/10 rounded-2xl" defaultOpen={!hasPreferences}>
            <CollapsibleTrigger className="w-full p-6 flex items-center justify-between hover:bg-white/5 transition-colors rounded-2xl">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Settings className="h-5 w-5 text-primary" />
                Job Preferences
                {hasPreferences && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground bg-primary/20 px-2 py-0.5 rounded-full">
                    Configured
                  </span>
                )}
              </h2>
              <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="px-6 pb-6">
              {user && (
                <JobPreferencesForm 
                  userId={user.id}
                  onSave={handlePreferencesSave}
                />
              )}
            </CollapsibleContent>
          </Collapsible>

          {/* Company Targets Section - Collapsible */}
          <Collapsible className="glass-card border border-white/10 rounded-2xl" defaultOpen={false}>
            <CollapsibleTrigger className="w-full p-6 flex items-center justify-between hover:bg-white/5 transition-colors rounded-2xl">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                Company Targets
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  Optional
                </span>
              </h2>
              <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="px-6 pb-6">
              {user && (
                <CompanyTargets 
                  userId={user.id}
                  onSave={handlePreferencesSave}
                />
              )}
            </CollapsibleContent>
          </Collapsible>

          {/* Start Hunt Section */}
          <div className="glass-card border border-white/10 rounded-2xl p-6 bg-gradient-to-r from-primary/5 to-transparent">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Crosshair className="h-5 w-5 text-primary" />
              Job Discovery
            </h2>
            <p className="text-muted-foreground mb-6">
              Search job boards and extract individual job postings matching your preferences.
            </p>
            {user && (
              <StartHuntButton
                userId={user.id}
                hasPreferences={!!hasPreferences}
                onComplete={handleHuntComplete}
              />
            )}
          </div>

          {/* Discovered Jobs Section */}
          <div className="glass-card border border-white/10 rounded-2xl p-6">
            <h2 className="text-xl font-semibold flex items-center gap-2 mb-6">
              <Search className="h-5 w-5 text-primary" />
              Discovered Jobs
            </h2>
            {user && (
              <DiscoveredJobsTable key={discoveredJobsKey} userId={user.id} />
            )}
          </div>

          {/* Job Applications Section */}
          <div className="glass-card border border-white/10 rounded-2xl p-6">
            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Job Applications
            </h2>
            {user && (
              <JobApplicationsTable userId={user.id} />
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Dashboard;
