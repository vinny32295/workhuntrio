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
import { Loader2, Copy, Check, FileText, Sparkles, Download, FileCheck } from "lucide-react";
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
  const [downloadingResume, setDownloadingResume] = useState(false);
  const [downloadingCoverLetter, setDownloadingCoverLetter] = useState(false);
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

  // Parse the generated content to extract summary, skills, and cover letter
  const parseContent = () => {
    if (!content) return { summary: undefined, skills: undefined, coverLetter: undefined };
    
    // Extract professional summary
    const summaryMatch = content.match(/##\s*(?:PROFESSIONAL\s*)?SUMMARY\s*\n+([\s\S]*?)(?=\n##|\n---|\n#|$)/i);
    const summary = summaryMatch 
      ? summaryMatch[1].trim().replace(/\*\*/g, '').replace(/\n/g, ' ').slice(0, 500)
      : undefined;
    
    // Extract skills section
    const skillsMatch = content.match(/##\s*SKILLS?\s*\n+([\s\S]*?)(?=\n##|\n---|\n#|$)/i);
    let skills: string[] | undefined;
    if (skillsMatch) {
      const skillsText = skillsMatch[1];
      // Parse bullet points or comma-separated skills
      skills = skillsText
        .split(/[\n•\-,]/)
        .map(s => s.replace(/\*\*/g, '').trim())
        .filter(s => s.length > 0 && s.length < 50);
    }
    
    // Extract cover letter section
    const coverLetterMatch = content.match(/# COVER LETTER\s*\n+([\s\S]*?)(?=\n---\s*$|$)/i);
    const coverLetter = coverLetterMatch 
      ? coverLetterMatch[1].trim()
        .replace(/\*\*/g, '')
        .replace(/Dear Hiring Manager,?\s*/i, '')
        .replace(/Sincerely,?\s*\n.*/is, '')
        .trim()
      : undefined;
    
    return { summary, skills, coverLetter };
  };

  const downloadResume = async () => {
    if (!content) return;
    
    setDownloadingResume(true);

    try {
      const { summary, skills } = parseContent();

      const { data, error } = await supabase.functions.invoke("generate-resume-pdf", {
        body: { 
          tailoredSummary: summary,
          tailoredSkills: skills,
          companyName: job?.company_slug || 'Company',
          jobTitle: job?.title || 'Position',
          type: "resume"
        },
      });

      if (error) throw error;

      if (data.error) {
        toast.error(data.error);
        return;
      }

      // Download the resume HTML
      const blob = new Blob([data.resumeHtml], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = data.resumeFileName || "resume.html";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Resume downloaded! Open in browser and print to PDF.", {
        description: "Use Ctrl+P / Cmd+P to save as PDF",
        duration: 5000,
      });
    } catch (error) {
      console.error("Download error:", error);
      toast.error("Failed to generate resume");
    } finally {
      setDownloadingResume(false);
    }
  };

  const downloadCoverLetter = async () => {
    if (!content) return;
    
    setDownloadingCoverLetter(true);

    try {
      const { coverLetter } = parseContent();
      
      if (!coverLetter) {
        toast.error("No cover letter content found");
        setDownloadingCoverLetter(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("generate-resume-pdf", {
        body: { 
          coverLetterContent: coverLetter,
          companyName: job?.company_slug || 'Company',
          jobTitle: job?.title || 'Position',
          type: "cover-letter"
        },
      });

      if (error) throw error;

      if (data.error) {
        toast.error(data.error);
        return;
      }

      // Download the cover letter HTML
      const blob = new Blob([data.coverLetterHtml], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = data.coverLetterFileName || "cover_letter.html";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Cover letter downloaded! Open in browser and print to PDF.", {
        description: "Use Ctrl+P / Cmd+P to save as PDF",
        duration: 5000,
      });
    } catch (error) {
      console.error("Download error:", error);
      toast.error("Failed to generate cover letter");
    } finally {
      setDownloadingCoverLetter(false);
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
          <div className="flex flex-wrap justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setContent(null)} size="sm">
              Regenerate
            </Button>
            <Button 
              variant="outline" 
              onClick={downloadResume} 
              disabled={downloadingResume}
              size="sm"
              className="gap-2"
            >
              {downloadingResume ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4" />
                  Download Resume
                </>
              )}
            </Button>
            <Button 
              variant="outline" 
              onClick={downloadCoverLetter} 
              disabled={downloadingCoverLetter}
              size="sm"
              className="gap-2"
            >
              {downloadingCoverLetter ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <FileCheck className="h-4 w-4" />
                  Download Cover Letter
                </>
              )}
            </Button>
            <Button onClick={copyToClipboard} size="sm" className="gap-2">
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
