import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, User, Mail, Phone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ProfileInfoFormProps {
  userId: string;
  onSave?: () => void;
}

interface ProfileInfo {
  full_name: string;
  email: string;
  phone_number: string;
}

const ProfileInfoForm = ({ userId, onSave }: ProfileInfoFormProps) => {
  const [profile, setProfile] = useState<ProfileInfo>({
    full_name: "",
    email: "",
    phone_number: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchProfile();
  }, [userId]);

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, email, phone_number')
        .eq('user_id', userId)
        .single();

      if (error) throw error;

      if (data) {
        setProfile({
          full_name: data.full_name || "",
          email: data.email || "",
          phone_number: data.phone_number || "",
        });
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: profile.full_name || null,
          email: profile.email || null,
          phone_number: profile.phone_number || null,
        })
        .eq('user_id', userId);

      if (error) throw error;

      toast({
        title: "Profile saved!",
        description: "Your contact information has been updated.",
      });

      onSave?.();
    } catch (error: any) {
      console.error('Error saving profile:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to save profile.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        This information will be used when generating tailored resumes and cover letters.
      </p>

      {/* Full Name */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-primary" />
          <Label htmlFor="full_name">Full Name</Label>
        </div>
        <Input
          id="full_name"
          placeholder="John Doe"
          value={profile.full_name}
          onChange={(e) => setProfile(prev => ({ ...prev, full_name: e.target.value }))}
        />
      </div>

      {/* Email */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-primary" />
          <Label htmlFor="email">Email Address</Label>
        </div>
        <Input
          id="email"
          type="email"
          placeholder="john@example.com"
          value={profile.email}
          onChange={(e) => setProfile(prev => ({ ...prev, email: e.target.value }))}
        />
      </div>

      {/* Phone Number */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-primary" />
          <Label htmlFor="phone">Phone Number</Label>
        </div>
        <Input
          id="phone"
          type="tel"
          placeholder="(555) 123-4567"
          value={profile.phone_number}
          onChange={(e) => setProfile(prev => ({ ...prev, phone_number: e.target.value }))}
        />
      </div>

      {/* Save Button */}
      <Button
        variant="hero"
        size="lg"
        onClick={handleSave}
        disabled={saving}
        className="w-full"
      >
        {saving ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Saving...
          </>
        ) : (
          "Save Profile"
        )}
      </Button>
    </div>
  );
};

export default ProfileInfoForm;
