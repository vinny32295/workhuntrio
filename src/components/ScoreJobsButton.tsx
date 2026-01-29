import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, Check, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface ScoreJobsButtonProps {
  hasResume: boolean;
  onComplete: () => void;
}

interface ScoreResult {
  success: boolean;
  scored: number;
  total: number;
  message?: string;
  error?: string;
}

export default function ScoreJobsButton({ hasResume, onComplete }: ScoreJobsButtonProps) {
  const [isScoring, setIsScoring] = useState(false);
  const [lastResult, setLastResult] = useState<ScoreResult | null>(null);

  const scoreJobs = async () => {
    if (!hasResume) {
      toast.error("Please upload your resume first to enable AI matching");
      return;
    }

    setIsScoring(true);
    setLastResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error("Please sign in first");
        return;
      }

      const { data, error } = await supabase.functions.invoke<ScoreResult>("score-jobs", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      if (data?.success) {
        setLastResult(data);
        if (data.scored > 0) {
          toast.success(`Scored ${data.scored} jobs with AI matching!`);
          onComplete();
        } else {
          toast.info(data.message || "No new jobs to score");
        }
      }
    } catch (error) {
      console.error("Score error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to score jobs");
    } finally {
      setIsScoring(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <Button
        variant="secondary"
        onClick={scoreJobs}
        disabled={isScoring || !hasResume}
        className="gap-2"
      >
        {isScoring ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Analyzing...
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            Score with AI
          </>
        )}
      </Button>

      {!hasResume && (
        <span className="text-sm text-muted-foreground flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          Upload resume first
        </span>
      )}

      {lastResult && lastResult.scored > 0 && (
        <span className="text-sm text-primary flex items-center gap-1">
          <Check className="h-4 w-4" />
          {lastResult.scored} jobs scored
        </span>
      )}
    </div>
  );
}
