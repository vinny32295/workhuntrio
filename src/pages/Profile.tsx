import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Crosshair, ArrowLeft, User, FileText, Check } from "lucide-react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import ResumeSection from "@/components/ResumeSection";
import ProfileInfoForm from "@/components/ProfileInfoForm";

interface Profile {
  resume_url: string | null;
  full_name: string | null;
  target_roles: string[] | null;
  work_type: string[] | null;
  phone_number: string | null;
}

const Profile = () => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

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
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleResumeUpload = (url: string) => {
    setProfile(prev => prev ? { ...prev, resume_url: url } : { resume_url: url, full_name: null, target_roles: null, work_type: null, phone_number: null });
  };

  const handleProfileSave = async () => {
    if (user) {
      await new Promise(resolve => setTimeout(resolve, 100));
      await fetchProfile(user.id);
    }
  };

  const hasProfileInfo = profile?.full_name && profile?.full_name.trim() !== "";

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
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/dashboard">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Link>
            </Button>
          </div>

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
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-6 py-8">
        <h1 className="text-3xl font-bold mb-2">My Profile</h1>
        <p className="text-muted-foreground mb-8">
          Manage your personal information and resume
        </p>

        <div className="space-y-8">
          {/* Profile Info Section */}
          <div className="glass-card border border-white/10 rounded-2xl p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Contact Information
              {hasProfileInfo && (
                <span className="ml-2 text-xs font-normal text-muted-foreground bg-primary/20 px-2 py-0.5 rounded-full">
                  Configured
                </span>
              )}
            </h2>
            {user && (
              <ProfileInfoForm 
                userId={user.id}
                onSave={handleProfileSave}
              />
            )}
          </div>

          {/* Resume & Work History Section */}
          <div className="glass-card border border-white/10 rounded-2xl p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Resume & Experience
              {profile?.resume_url && (
                <span className="ml-2 text-xs font-normal text-muted-foreground bg-primary/20 px-2 py-0.5 rounded-full">
                  Uploaded
                </span>
              )}
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              Upload your resume to auto-extract your work history and education. You can edit the details after parsing.
            </p>
            {user && (
              <ResumeSection 
                userId={user.id} 
                currentResumeUrl={profile?.resume_url}
                onUploadComplete={handleResumeUpload}
              />
            )}
          </div>

          {/* Profile Checklist */}
          <div className="glass-card border border-white/10 rounded-2xl p-8">
            <h2 className="text-xl font-semibold mb-4">Profile Checklist</h2>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  hasProfileInfo ? 'bg-emerald-500/20' : 'bg-primary/20'
                }`}>
                  {hasProfileInfo ? (
                    <Check className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <span className="text-primary font-bold">1</span>
                  )}
                </div>
                <span className={hasProfileInfo ? 'text-foreground line-through' : 'text-muted-foreground'}>
                  Add your contact information
                </span>
              </div>
              <div className="flex items-center gap-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  profile?.resume_url ? 'bg-emerald-500/20' : 'bg-muted/50'
                }`}>
                  {profile?.resume_url ? (
                    <Check className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <span className="text-muted-foreground font-bold">2</span>
                  )}
                </div>
                <span className={profile?.resume_url ? 'text-foreground line-through' : 'text-muted-foreground'}>
                  Upload your resume
                </span>
              </div>
              <div className="flex items-center gap-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  hasProfileInfo && profile?.resume_url ? 'bg-emerald-500/20' : 'bg-muted/50'
                }`}>
                  {hasProfileInfo && profile?.resume_url ? (
                    <Check className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <span className="text-muted-foreground font-bold">3</span>
                  )}
                </div>
                <span className={hasProfileInfo && profile?.resume_url ? 'text-foreground line-through' : 'text-muted-foreground'}>
                  Review and edit your work history
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Profile;
