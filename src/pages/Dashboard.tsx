import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type SearchMode = "search" | "targets";

interface Profile {
  resume_url: string | null;
  full_name: string | null;
  target_roles: string[] | null;
  work_type: string[] | null;
  phone_number: string | null;
  target_company_urls: string[] | null;
}

const Dashboard = () => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [discoveredJobsKey, setDiscoveredJobsKey] = useState(0);
  const [subscriptionTier, setSubscriptionTier] = useState<TierKey>("free");
  const [searchMode, setSearchMode] = useState<SearchMode>("search");
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
        .select('resume_url, full_name, target_roles, work_type, phone_number, target_company_urls')
        .eq('user_id', userId)
        .single();
      
      if (!error && data) {
        setProfile(data);
        // Set initial search mode based on what's configured
        if (data.target_company_urls && data.target_company_urls.length > 0 && 
            (!data.target_roles || data.target_roles.length === 0)) {
          setSearchMode("targets");
        }
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
          {/* Search Mode Toggle */}
          <Tabs value={searchMode} onValueChange={(v) => setSearchMode(v as SearchMode)} className="w-full">
            <div className="glass-card border border-white/10 rounded-2xl p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-xl font-semibold flex items-center gap-2">
                    <Settings className="h-5 w-5 text-primary" />
                    Job Hunt Configuration
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Choose how you want to find jobs
                  </p>
                </div>
                <TabsList className="grid w-full sm:w-auto grid-cols-2 bg-muted/50">
                  <TabsTrigger value="search" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                    <Search className="h-4 w-4" />
                    Job Search
                  </TabsTrigger>
                  <TabsTrigger value="targets" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                    <Building2 className="h-4 w-4" />
                    Target Companies
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="search" className="mt-0">
                <div className="border-t border-white/10 pt-6">
                  <p className="text-sm text-muted-foreground mb-6">
                    Set your job preferences and we'll search across job boards to find matching positions.
                  </p>
                  {user && (
                    <JobPreferencesForm 
                      userId={user.id}
                      onSave={handlePreferencesSave}
                    />
                  )}
                </div>
              </TabsContent>

              <TabsContent value="targets" className="mt-0">
                <div className="border-t border-white/10 pt-6">
                  <p className="text-sm text-muted-foreground mb-6">
                    Add direct links to company career pages and we'll scrape them for job listings.
                  </p>
                  {user && (
                    <CompanyTargets 
                      userId={user.id}
                      onSave={handlePreferencesSave}
                    />
                  )}
                </div>
              </TabsContent>
            </div>
          </Tabs>

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
              <DiscoveredJobsTable userId={user.id} refreshTrigger={discoveredJobsKey} />
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
