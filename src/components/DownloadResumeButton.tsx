import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Download, Loader2, FileText } from "lucide-react";
import { toast } from "sonner";

interface DownloadResumeButtonProps {
  tailoredSummary?: string;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

export default function DownloadResumeButton({
  tailoredSummary,
  variant = "default",
  size = "default",
  className = "",
}: DownloadResumeButtonProps) {
  const [loading, setLoading] = useState(false);

  const downloadResume = async () => {
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please log in to download your resume");
        return;
      }

      const { data, error } = await supabase.functions.invoke("generate-resume-pdf", {
        body: { tailoredSummary },
      });

      if (error) throw error;

      if (data.error) {
        toast.error(data.error);
        return;
      }

      // Create a Blob from the HTML content
      const blob = new Blob([data.html], { type: "text/html" });
      const url = URL.createObjectURL(blob);

      // Create download link
      const link = document.createElement("a");
      link.href = url;
      link.download = data.fileName || "resume.html";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up
      URL.revokeObjectURL(url);

      toast.success("Resume downloaded! Open in browser and print to PDF.", {
        description: "Use Ctrl+P / Cmd+P to save as PDF",
        duration: 5000,
      });
    } catch (error) {
      console.error("Download error:", error);
      toast.error("Failed to generate resume");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={downloadResume}
      disabled={loading}
      className={className}
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Generating...
        </>
      ) : (
        <>
          <FileText className="h-4 w-4 mr-2" />
          Download Resume
        </>
      )}
    </Button>
  );
}
