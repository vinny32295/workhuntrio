import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, Check, AlertCircle, Lock } from "lucide-react";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ScoreJobsButtonProps {
  hasResume: boolean;
  onComplete: () => void;
}

interface ScoreResult {
  success?: boolean;
  scored?: number;
  total?: number;
  message?: string;
  error?: string;
  requiresUpgrade?: boolean;
  tier?: string;
}

export default function ScoreJobsButton({ hasResume, onComplete }: ScoreJobsButtonProps) {
  const [isScoring, setIsScoring] = useState(false);
  const [lastResult, setLastResult] = useState<ScoreResult | null>(null);
  const [requiresUpgrade, setRequiresUpgrade] = useState(false);

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

      if (data?.requiresUpgrade) {
        setRequiresUpgrade(true);
        toast.info("AI scoring is a Pro feature. Upgrade to get personalized match scores!");
        return;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      if (data?.success) {
        setLastResult(data);
        if (data.scored && data.scored > 0) {
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

  if (requiresUpgrade) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link to="/#pricing">
              <Button variant="secondary" className="gap-2 opacity-70">
                <Lock className="h-4 w-4" />
                Score with AI
              </Button>
            </Link>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[220px] text-center p-3">
            <p className="font-medium">Pro Feature</p>
            <p className="text-xs text-muted-foreground mb-2">
              AI job scoring helps you find the best matches
            </p>
            <span className="text-xs text-primary font-medium">
              Click to upgrade →
            </span>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

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

      {lastResult && lastResult.scored && lastResult.scored > 0 && (
        <span className="text-sm text-primary flex items-center gap-1">
          <Check className="h-4 w-4" />
          {lastResult.scored} jobs scored
        </span>
      )}
    </div>
  );
}
