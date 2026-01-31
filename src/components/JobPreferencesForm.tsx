import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

import { Slider } from "@/components/ui/slider";
import { X, Plus, Loader2, MapPin, Briefcase, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface JobPreferencesFormProps {
  userId: string;
  onSave?: () => void;
}

interface Preferences {
  target_roles: string[];
  work_type: string[];
  location_zip: string | null;
  search_radius_miles: number;
}

const SUGGESTED_ROLES = [
  "Software Engineer",
  "Product Manager",
  "Data Scientist",
  "UX Designer",
  "Marketing Manager",
  "Sales Representative",
  "Project Manager",
  "Business Analyst",
];

const JobPreferencesForm = ({ userId, onSave }: JobPreferencesFormProps) => {
  const [preferences, setPreferences] = useState<Preferences>({
    target_roles: [],
    work_type: [],
    location_zip: null,
    search_radius_miles: 50,
  });
  const [newRole, setNewRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchPreferences();
  }, [userId]);

  const fetchPreferences = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('target_roles, work_type, location_zip, search_radius_miles')
        .eq('user_id', userId)
        .single();

      if (error) throw error;

      if (data) {
        setPreferences({
          target_roles: data.target_roles || [],
          work_type: data.work_type || [],
          location_zip: data.location_zip,
          search_radius_miles: data.search_radius_miles || 50,
        });
      }
    } catch (error) {
      console.error('Error fetching preferences:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddRole = (role: string) => {
    const trimmedRole = role.trim();
    if (trimmedRole && !preferences.target_roles.includes(trimmedRole)) {
      setPreferences(prev => ({
        ...prev,
        target_roles: [...prev.target_roles, trimmedRole],
      }));
      setNewRole("");
    }
  };

  const handleRemoveRole = (role: string) => {
    setPreferences(prev => ({
      ...prev,
      target_roles: prev.target_roles.filter(r => r !== role),
    }));
  };

  const handleSave = async () => {
    setSaving(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          target_roles: preferences.target_roles,
          work_type: preferences.work_type,
          location_zip: preferences.location_zip,
          search_radius_miles: preferences.search_radius_miles,
        })
        .eq('user_id', userId);

      if (error) throw error;

      toast({
        title: "Preferences saved!",
        description: "Your job preferences have been updated.",
      });

      onSave?.();
    } catch (error: any) {
      console.error('Error saving preferences:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to save preferences.",
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
    <div className="space-y-8">
      {/* Target Roles */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-primary" />
          <Label className="text-base font-semibold">Target Roles</Label>
        </div>
        
        {/* Selected roles */}
        <div className="flex flex-wrap gap-2">
          {preferences.target_roles.map(role => (
            <Badge 
              key={role} 
              variant="secondary" 
              className="px-3 py-1 text-sm bg-primary/20 hover:bg-primary/30 border-0"
            >
              {role}
              <button
                onClick={() => handleRemoveRole(role)}
                className="ml-2 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>

        {/* Add new role */}
        <div className="flex gap-2">
          <Input
            placeholder="Add a role (e.g., Software Engineer)"
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddRole(newRole);
              }
            }}
            className="flex-1"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => handleAddRole(newRole)}
            disabled={!newRole.trim()}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Suggested roles */}
        {preferences.target_roles.length < 3 && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Suggested roles:</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_ROLES
                .filter(role => !preferences.target_roles.includes(role))
                .slice(0, 4)
                .map(role => (
                  <button
                    key={role}
                    onClick={() => handleAddRole(role)}
                    className="text-sm px-3 py-1 rounded-full border border-white/20 hover:border-primary/50 hover:bg-primary/10 transition-colors"
                  >
                    + {role}
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Work Type - Multi-select */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          <Label className="text-base font-semibold">Work Type</Label>
          <span className="text-xs text-muted-foreground">(select all that apply)</span>
        </div>
        
        <div className="grid grid-cols-3 gap-4">
          {[
            { value: 'remote', label: 'Remote', desc: 'Work from anywhere' },
            { value: 'hybrid', label: 'Hybrid', desc: 'Mix of office & home' },
            { value: 'in-person', label: 'In-Person', desc: 'Office-based' },
          ].map(option => {
            const isSelected = preferences.work_type.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setPreferences(prev => ({
                    ...prev,
                    work_type: isSelected
                      ? prev.work_type.filter(t => t !== option.value)
                      : [...prev.work_type, option.value],
                  }));
                }}
                className={`flex flex-col items-center justify-center rounded-xl border-2 p-4 transition-all ${
                  isSelected
                    ? 'border-primary bg-primary/10'
                    : 'border-white/10 bg-transparent hover:bg-white/5 hover:border-white/20'
                }`}
              >
                <span className="font-medium">{option.label}</span>
                <span className="text-xs text-muted-foreground mt-1">{option.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Location */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          <Label className="text-base font-semibold">Location</Label>
        </div>
        
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="zip" className="text-sm text-muted-foreground">ZIP Code</Label>
            <Input
              id="zip"
              placeholder="Enter your ZIP code"
              value={preferences.location_zip || ""}
              onChange={(e) => setPreferences(prev => ({ ...prev, location_zip: e.target.value }))}
              maxLength={10}
            />
          </div>
          
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">
              Search Radius: {preferences.search_radius_miles} miles
            </Label>
            <Slider
              value={[preferences.search_radius_miles]}
              onValueChange={([value]) => setPreferences(prev => ({ ...prev, search_radius_miles: value }))}
              min={5}
              max={100}
              step={5}
              className="py-4"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>5 mi</span>
              <span>100 mi</span>
            </div>
          </div>
        </div>
        
        {preferences.work_type.length === 1 && preferences.work_type.includes('remote') && (
          <p className="text-sm text-muted-foreground italic">
            💡 Location preferences help us find remote jobs that prefer candidates in your area.
          </p>
        )}
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
          "Save Preferences"
        )}
      </Button>
    </div>
  );
};

export default JobPreferencesForm;
