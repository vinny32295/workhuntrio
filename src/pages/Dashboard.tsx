import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Crosshair, LogOut, Upload, Settings, BarChart3, Check, ChevronDown, Search, User } from "lucide-react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import ResumeUpload from "@/components/ResumeUpload";
import JobPreferencesForm from "@/components/JobPreferencesForm";
import ProfileInfoForm from "@/components/ProfileInfoForm";
import JobApplicationsTable from "@/components/JobApplicationsTable";
import DiscoveredJobsTable from "@/components/DiscoveredJobsTable";
import StartHuntButton from "@/components/StartHuntButton";
import ScoreJobsButton from "@/components/ScoreJobsButton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface Profile {
  resume_url: string | null;
  full_name: string | null;
  target_roles: string[] | null;
  work_type: string | null;
  phone_number: string | null;
}

const Dashboard = () => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [discoveredJobsKey, setDiscoveredJobsKey] = useState(0);
  const navigate = useNavigate();

  // Fetch profile data
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
          // Defer profile fetch to avoid deadlock
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
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleResumeUpload = (url: string) => {
    setProfile(prev => prev ? { ...prev, resume_url: url } : { resume_url: url, full_name: null, target_roles: null, work_type: null, phone_number: null });
  };

  const hasProfileInfo = profile?.full_name && profile?.full_name.trim() !== "";

  const handlePreferencesSave = async () => {
    if (user) {
      // Small delay to ensure DB has committed the changes
      await new Promise(resolve => setTimeout(resolve, 100));
      await fetchProfile(user.id);
    }
  };

  const hasPreferences = profile?.target_roles && profile.target_roles.length > 0 && profile.work_type;

  const handleHuntComplete = () => {
    // Refresh discovered jobs table
    setDiscoveredJobsKey(prev => prev + 1);
  };

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

        {/* Resume Upload Section */}
        <div className="glass-card border border-white/10 rounded-2xl p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            Your Resume
          </h2>
          {user && (
            <ResumeUpload 
              userId={user.id} 
              currentResumeUrl={profile?.resume_url}
              onUploadComplete={handleResumeUpload}
            />
          )}
        </div>

        {/* Profile Info Section - Collapsible */}
        <Collapsible className="glass-card border border-white/10 rounded-2xl mb-8">
          <CollapsibleTrigger className="w-full p-6 flex items-center justify-between hover:bg-white/5 transition-colors rounded-2xl">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Profile Information
              {hasProfileInfo && (
                <span className="ml-2 text-xs font-normal text-muted-foreground bg-primary/20 px-2 py-0.5 rounded-full">
                  Configured
                </span>
              )}
            </h2>
            <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="px-6 pb-6">
            {user && (
              <ProfileInfoForm 
                userId={user.id}
                onSave={handlePreferencesSave}
              />
            )}
          </CollapsibleContent>
        </Collapsible>

        {/* Job Preferences Section - Collapsible */}
        <Collapsible className="glass-card border border-white/10 rounded-2xl mb-8">
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

        {/* Start Hunt Section */}
        <div className="glass-card border border-white/10 rounded-2xl p-6 mb-8 bg-gradient-to-r from-primary/5 to-transparent">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Crosshair className="h-5 w-5 text-primary" />
            Job Discovery
          </h2>
          <p className="text-muted-foreground mb-6">
            Search the web for jobs matching your preferences using Google Custom Search.
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
        <div className="glass-card border border-white/10 rounded-2xl p-6 mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Search className="h-5 w-5 text-primary" />
              Discovered Jobs
            </h2>
            {user && (
              <ScoreJobsButton 
                hasResume={!!profile?.resume_url}
                onComplete={handleHuntComplete}
              />
            )}
          </div>
          {user && (
            <DiscoveredJobsTable key={discoveredJobsKey} userId={user.id} />
          )}
        </div>

        {/* Job Applications Section */}
        <div className="glass-card border border-white/10 rounded-2xl p-6 mb-8">
          <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Job Applications
          </h2>
          {user && (
            <JobApplicationsTable userId={user.id} />
          )}
        </div>

        {/* Status card */}
        <div className="glass-card border border-white/10 rounded-2xl p-8">
          <h2 className="text-xl font-semibold mb-4">Getting Started</h2>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                profile?.resume_url ? 'bg-emerald-500/20' : 'bg-primary/20'
              }`}>
                {profile?.resume_url ? (
                  <Check className="h-4 w-4 text-emerald-500" />
                ) : (
                  <span className="text-primary font-bold">1</span>
                )}
              </div>
              <span className={profile?.resume_url ? 'text-foreground line-through' : 'text-muted-foreground'}>
                Upload your resume
              </span>
            </div>
            <div className="flex items-center gap-4">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                hasPreferences ? 'bg-emerald-500/20' : 'bg-muted/50'
              }`}>
                {hasPreferences ? (
                  <Check className="h-4 w-4 text-emerald-500" />
                ) : (
                  <span className="text-muted-foreground font-bold">2</span>
                )}
              </div>
              <span className={hasPreferences ? 'text-foreground line-through' : 'text-muted-foreground'}>
                Set your job preferences
              </span>
            </div>
            <div className="flex items-center gap-4">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                profile?.resume_url && hasPreferences ? 'bg-primary/20' : 'bg-muted/50'
              }`}>
                <span className={`font-bold ${profile?.resume_url && hasPreferences ? 'text-primary' : 'text-muted-foreground'}`}>3</span>
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
