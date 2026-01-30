import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Crosshair, Loader2, Check, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface StartHuntButtonProps {
  userId: string;
  hasPreferences: boolean;
  onComplete: () => void;
}

interface HuntResult {
  success: boolean;
  queriesRun: number;
  totalResults: number;
  boardPagesScraped?: number;
  extractedJobLinks?: number;
  localCompaniesSearched?: number;
  localCompanyJobs?: number;
  enrichedJobs?: number;
  inserted: number;
  skipped: number;
  withSalary?: number;
  withDescription?: number;
  error?: string;
}

export default function StartHuntButton({ userId, hasPreferences, onComplete }: StartHuntButtonProps) {
  const [isHunting, setIsHunting] = useState(false);
  const [lastResult, setLastResult] = useState<HuntResult | null>(null);

  const startHunt = async () => {
    if (!hasPreferences) {
      toast.error("Please set your job preferences first");
      return;
    }

    setIsHunting(true);
    setLastResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error("Please sign in to start hunting");
        return;
      }

      const { data, error } = await supabase.functions.invoke<HuntResult>("job-discovery", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data?.success) {
        setLastResult(data);
        const jobCount = data.enrichedJobs || data.inserted || 0;
        toast.success(`Found ${jobCount} matching jobs! Loading results...`);
        
        // Jobs are processed in the background, so wait before refreshing
        // Background enrichment can take 20-30 seconds for all jobs
        setTimeout(() => onComplete(), 5000);
        setTimeout(() => onComplete(), 12000);
        setTimeout(() => onComplete(), 20000);
        setTimeout(() => onComplete(), 30000);
      } else {
        throw new Error(data?.error || "Hunt failed");
      }
    } catch (error) {
      console.error("Hunt error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to run job discovery");
    } finally {
      setIsHunting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Button
        size="lg"
        onClick={startHunt}
        disabled={isHunting || !hasPreferences}
        className="w-full sm:w-auto gap-2 text-lg px-8 py-6"
      >
        {isHunting ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Hunting for jobs...
          </>
        ) : (
          <>
            <Crosshair className="h-5 w-5" />
            Start Hunt
          </>
        )}
      </Button>

      {!hasPreferences && (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          Configure your job preferences first
        </p>
      )}

      {lastResult && (
        <div className="bg-muted/30 rounded-lg p-4 text-sm space-y-1">
          <p className="flex items-center gap-2 text-primary font-medium">
            <Check className="h-4 w-4" />
            Hunt completed!
          </p>
          <p className="text-muted-foreground">
            Searched {lastResult.queriesRun} queries • Scraped {lastResult.boardPagesScraped || 0} job boards • 
            Extracted {lastResult.extractedJobLinks || 0} job links
            {lastResult.localCompaniesSearched ? ` • Searched ${lastResult.localCompaniesSearched} local companies (${lastResult.localCompanyJobs || 0} jobs)` : ""}
            {" • "}{lastResult.inserted} new jobs saved
            {lastResult.withDescription ? ` • ${lastResult.withDescription} with full descriptions` : ""}
            {lastResult.withSalary ? ` • ${lastResult.withSalary} with salary info` : ""}
          </p>
        </div>
      )}
    </div>
  );
}
