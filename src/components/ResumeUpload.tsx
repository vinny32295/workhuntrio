import { useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Upload, FileText, X, Loader2, Eye, Download, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ResumeUploadProps {
  userId: string;
  currentResumeUrl?: string | null;
  onUploadComplete?: (url: string) => void;
}

const ResumeUpload = ({ userId, currentResumeUrl, onUploadComplete }: ResumeUploadProps) => {
  const [uploading, setUploading] = useState(false);
  const [resumeUrl, setResumeUrl] = useState<string | null>(currentResumeUrl || null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const getFileExtension = (url: string | null): string => {
    if (!url) return '';
    const match = url.match(/\.(\w+)(?:\?|$)/);
    return match ? match[1].toLowerCase() : '';
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Please upload a PDF or Word document.",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({
        title: "File too large",
        description: "Please upload a file smaller than 10MB.",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);

    try {
      // Create unique file path
      const fileExt = file.name.split('.').pop();
      const fileName = `${userId}/resume.${fileExt}`;

      // Upload file to storage
      const { error: uploadError } = await supabase.storage
        .from('resumes')
        .upload(fileName, file, { upsert: true });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('resumes')
        .getPublicUrl(fileName);

      // Update profile with resume URL
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ resume_url: publicUrl })
        .eq('user_id', userId);

      if (updateError) {
        throw updateError;
      }

      setResumeUrl(publicUrl);
      onUploadComplete?.(publicUrl);

      toast({
        title: "Resume uploaded!",
        description: "Your resume has been successfully uploaded.",
      });
    } catch (error: any) {
      console.error('Upload error:', error);
      toast({
        title: "Upload failed",
        description: error.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveResume = async () => {
    setUploading(true);

    try {
      // Delete from storage
      const { error: deleteError } = await supabase.storage
        .from('resumes')
        .remove([`${userId}/resume.pdf`, `${userId}/resume.doc`, `${userId}/resume.docx`]);

      if (deleteError) {
        console.error('Delete error:', deleteError);
      }

      // Update profile
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ resume_url: null })
        .eq('user_id', userId);

      if (updateError) {
        throw updateError;
      }

      setResumeUrl(null);
      setSignedUrl(null);

      toast({
        title: "Resume removed",
        description: "Your resume has been removed.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to remove resume.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handlePreview = async () => {
    if (!resumeUrl) return;
    
    setLoadingPreview(true);
    setPreviewOpen(true);

    try {
      // Extract the file path from the URL
      const ext = getFileExtension(resumeUrl);
      const filePath = `${userId}/resume.${ext || 'pdf'}`;

      // Create a signed URL for secure access
      const { data, error } = await supabase.storage
        .from('resumes')
        .createSignedUrl(filePath, 3600); // 1 hour expiry

      if (error) {
        throw error;
      }

      setSignedUrl(data.signedUrl);
    } catch (error: any) {
      console.error('Preview error:', error);
      toast({
        title: "Preview failed",
        description: "Could not load resume preview. Try downloading instead.",
        variant: "destructive",
      });
      setPreviewOpen(false);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleDownload = async () => {
    if (!resumeUrl) return;

    try {
      const ext = getFileExtension(resumeUrl);
      const filePath = `${userId}/resume.${ext || 'pdf'}`;

      const { data, error } = await supabase.storage
        .from('resumes')
        .createSignedUrl(filePath, 60);

      if (error) throw error;

      // Open in new tab for download
      window.open(data.signedUrl, '_blank');
    } catch (error: any) {
      toast({
        title: "Download failed",
        description: error.message || "Could not download resume.",
        variant: "destructive",
      });
    }
  };

  const isPdf = getFileExtension(resumeUrl) === 'pdf';

  return (
    <>
      <div className="space-y-4">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx"
          onChange={handleFileSelect}
          className="hidden"
          disabled={uploading}
        />

        {resumeUrl ? (
          <div className="flex items-center justify-between p-4 bg-primary/10 rounded-lg border border-primary/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">Resume uploaded</p>
                <p className="text-xs text-muted-foreground">
                  {getFileExtension(resumeUrl).toUpperCase()} file
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePreview}
                disabled={uploading}
              >
                <Eye className="h-4 w-4 mr-1" />
                View
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDownload}
                disabled={uploading}
              >
                <Download className="h-4 w-4 mr-1" />
                Download
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Replace"}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRemoveResume}
                disabled={uploading}
                className="text-destructive hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div
            onClick={() => !uploading && fileInputRef.current?.click()}
            className="border-2 border-dashed border-white/20 rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
          >
            {uploading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-10 w-10 text-primary animate-spin" />
                <p className="text-sm text-muted-foreground">Uploading...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                  <Upload className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Upload your resume</p>
                  <p className="text-sm text-muted-foreground">PDF or Word, max 10MB</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Resume Preview</span>
              {signedUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(signedUrl, '_blank')}
                  className="mr-8"
                >
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Open in New Tab
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 min-h-0 bg-muted/50 rounded-lg overflow-hidden">
            {loadingPreview ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : signedUrl ? (
              isPdf ? (
                <iframe
                  src={signedUrl}
                  className="w-full h-full border-0"
                  title="Resume Preview"
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-4">
                  <FileText className="h-16 w-16 text-muted-foreground" />
                  <p className="text-muted-foreground text-center max-w-md">
                    Word documents cannot be previewed directly in the browser.
                  </p>
                  <div className="flex gap-3">
                    <Button onClick={() => window.open(signedUrl, '_blank')}>
                      <Download className="h-4 w-4 mr-2" />
                      Download to View
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => window.open(`https://docs.google.com/viewer?url=${encodeURIComponent(signedUrl)}&embedded=true`, '_blank')}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Open in Google Docs
                    </Button>
                  </div>
                </div>
              )
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ResumeUpload;
