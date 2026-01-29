import { useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Copy, Check, FileText, Sparkles } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

interface TailorResumeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: {
    title: string;
    company_slug: string | null;
    snippet: string | null;
    url: string;
  } | null;
}

export default function TailorResumeDialog({
  open,
  onOpenChange,
  job,
}: TailorResumeDialogProps) {
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generateContent = async () => {
    if (!job) return;

    setLoading(true);
    setContent(null);

    try {
      const { data, error } = await supabase.functions.invoke("tailor-resume", {
        body: {
          jobTitle: job.title,
          companyName: job.company_slug,
          jobSnippet: job.snippet,
          jobUrl: job.url,
        },
      });

      if (error) throw error;

      if (data.error) {
        toast.error(data.error);
        return;
      }

      setContent(data.content);
      toast.success("Content generated successfully!");
    } catch (error) {
      console.error("Error generating content:", error);
      toast.error("Failed to generate tailored content");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (!content) return;

    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success("Copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setContent(null);
      setCopied(false);
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Tailor Resume & Cover Letter
          </DialogTitle>
          {job && (
            <p className="text-sm text-muted-foreground mt-1">
              For: <span className="font-medium">{job.title}</span>
              {job.company_slug && (
                <> at <span className="font-medium">{job.company_slug}</span></>
              )}
            </p>
          )}
        </DialogHeader>

        <div className="flex-1 min-h-0">
          {!content && !loading && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Generate Tailored Content</h3>
              <p className="text-sm text-muted-foreground max-w-md mb-6">
                AI will analyze this job posting and create a customized resume summary, 
                key skills, and cover letter based on your profile.
              </p>
              <Button onClick={generateContent} className="gap-2">
                <Sparkles className="h-4 w-4" />
                Generate Content
              </Button>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
              <p className="text-sm text-muted-foreground">
                Generating tailored content...
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                This may take a few seconds
              </p>
            </div>
          )}

          {content && (
            <ScrollArea className="h-[50vh] pr-4">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown>{content}</ReactMarkdown>
              </div>
            </ScrollArea>
          )}
        </div>

        {content && (
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setContent(null)}>
              Regenerate
            </Button>
            <Button onClick={copyToClipboard} className="gap-2">
              {copied ? (
                <>
                  <Check className="h-4 w-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy All
                </>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
