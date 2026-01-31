import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { X, Plus, Loader2, Building2, ExternalLink, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CompanyTargetsProps {
  userId: string;
  onSave?: () => void;
}

type SearchMode = "combined" | "urls_only" | "search_only";

interface CompanySettings {
  target_company_urls: string[];
  search_mode: SearchMode;
}

const CompanyTargets = ({ userId, onSave }: CompanyTargetsProps) => {
  const [settings, setSettings] = useState<CompanySettings>({
    target_company_urls: [],
    search_mode: "combined",
  });
  const [newUrl, setNewUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchSettings();
  }, [userId]);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("target_company_urls, search_mode")
        .eq("user_id", userId)
        .single();

      if (error) throw error;

      if (data) {
        setSettings({
          target_company_urls: data.target_company_urls || [],
          search_mode: (data.search_mode as SearchMode) || "combined",
        });
      }
    } catch (error) {
      console.error("Error fetching company settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const isValidUrl = (url: string): boolean => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  };

  const getUrlLabel = (url: string): string => {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.replace("www.", "");
      
      // Extract company name from common patterns
      if (hostname.includes("wd1.myworkdayjobs.com") || hostname.includes("wd5.myworkdayjobs.com")) {
        const subdomain = hostname.split(".")[0];
        return `${subdomain} (Workday)`;
      }
      if (hostname.includes("greenhouse.io")) {
        const pathParts = parsed.pathname.split("/").filter(Boolean);
        return pathParts[0] ? `${pathParts[0]} (Greenhouse)` : hostname;
      }
      if (hostname.includes("lever.co")) {
        const pathParts = parsed.pathname.split("/").filter(Boolean);
        return pathParts[0] ? `${pathParts[0]} (Lever)` : hostname;
      }
      if (hostname.includes("ashbyhq.com")) {
        const pathParts = parsed.pathname.split("/").filter(Boolean);
        return pathParts[0] ? `${pathParts[0]} (Ashby)` : hostname;
      }
      
      return hostname;
    } catch {
      return url;
    }
  };

  const handleAddUrl = () => {
    const trimmedUrl = newUrl.trim();
    setUrlError(null);
    
    if (!trimmedUrl) return;
    
    if (!isValidUrl(trimmedUrl)) {
      setUrlError("Please enter a valid URL starting with http:// or https://");
      return;
    }
    
    if (settings.target_company_urls.includes(trimmedUrl)) {
      setUrlError("This URL has already been added");
      return;
    }
    
    setSettings((prev) => ({
      ...prev,
      target_company_urls: [...prev.target_company_urls, trimmedUrl],
    }));
    setNewUrl("");
  };

  const handleRemoveUrl = (url: string) => {
    setSettings((prev) => ({
      ...prev,
      target_company_urls: prev.target_company_urls.filter((u) => u !== url),
    }));
  };

  const handleSave = async () => {
    setSaving(true);

    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          target_company_urls: settings.target_company_urls,
          search_mode: settings.search_mode,
        })
        .eq("user_id", userId);

      if (error) throw error;

      toast({
        title: "Settings saved!",
        description: "Your company targets have been updated.",
      });

      onSave?.();
    } catch (error: any) {
      console.error("Error saving settings:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to save settings.",
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
      {/* Target Company URLs */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          <Label className="text-base font-semibold">Company Career Pages</Label>
        </div>
        
        <p className="text-sm text-muted-foreground">
          Add direct links to company career pages you want to target. We'll scrape these for matching jobs.
        </p>

        {/* Added URLs */}
        {settings.target_company_urls.length > 0 && (
          <div className="space-y-2">
            {settings.target_company_urls.map((url) => (
              <div
                key={url}
                className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{getUrlLabel(url)}</p>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:text-primary truncate flex items-center gap-1"
                  >
                    <span className="truncate">{url}</span>
                    <ExternalLink className="h-3 w-3 flex-shrink-0" />
                  </a>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 flex-shrink-0 hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => handleRemoveUrl(url)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Add new URL */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              placeholder="https://company.wd1.myworkdayjobs.com/careers?q=Analyst"
              value={newUrl}
              onChange={(e) => {
                setNewUrl(e.target.value);
                setUrlError(null);
              }}
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddUrl();
                }
              }}
              className="flex-1"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={handleAddUrl}
              disabled={!newUrl.trim()}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {urlError && (
            <p className="text-sm text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {urlError}
            </p>
          )}
        </div>

        {/* Examples */}
        <div className="bg-muted/30 rounded-lg p-4 space-y-2">
          <p className="text-sm font-medium">Supported career page types:</p>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• <strong>Workday</strong>: company.wd1.myworkdayjobs.com/careers?q=Analyst</li>
            <li>• <strong>Greenhouse</strong>: boards.greenhouse.io/company</li>
            <li>• <strong>Lever</strong>: jobs.lever.co/company</li>
            <li>• <strong>Ashby</strong>: jobs.ashbyhq.com/company</li>
            <li>• <strong>Custom</strong>: company.com/careers</li>
          </ul>
        </div>
      </div>

      {/* Search Mode */}
      <div className="space-y-4">
        <Label className="text-base font-semibold">Search Mode</Label>
        
        <RadioGroup
          value={settings.search_mode}
          onValueChange={(value: SearchMode) => setSettings((prev) => ({ ...prev, search_mode: value }))}
          className="space-y-3"
        >
          <label
            className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
              settings.search_mode === "combined"
                ? "border-primary bg-primary/10"
                : "border-white/10 bg-transparent hover:bg-white/5"
            }`}
          >
            <RadioGroupItem value="combined" className="mt-0.5" />
            <div>
              <p className="font-medium">Combined Search</p>
              <p className="text-sm text-muted-foreground">
                Run both regular job search AND scrape your target company URLs
              </p>
            </div>
          </label>

          <label
            className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
              settings.search_mode === "urls_only"
                ? "border-primary bg-primary/10"
                : "border-white/10 bg-transparent hover:bg-white/5"
            }`}
          >
            <RadioGroupItem value="urls_only" className="mt-0.5" />
            <div>
              <p className="font-medium">Target URLs Only</p>
              <p className="text-sm text-muted-foreground">
                Only scrape jobs from your target company URLs, skip general search
              </p>
            </div>
          </label>

          <label
            className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
              settings.search_mode === "search_only"
                ? "border-primary bg-primary/10"
                : "border-white/10 bg-transparent hover:bg-white/5"
            }`}
          >
            <RadioGroupItem value="search_only" className="mt-0.5" />
            <div>
              <p className="font-medium">General Search Only</p>
              <p className="text-sm text-muted-foreground">
                Only run the regular job search, ignore target URLs
              </p>
            </div>
          </label>
        </RadioGroup>

        {settings.search_mode === "urls_only" && settings.target_company_urls.length === 0 && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <p className="text-sm">Add at least one company URL to use "Target URLs Only" mode</p>
          </div>
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
          "Save Company Targets"
        )}
      </Button>
    </div>
  );
};

export default CompanyTargets;
