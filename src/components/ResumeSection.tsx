import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Upload, FileText, X, Loader2, Eye, Download, ExternalLink, Sparkles, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import WorkHistoryEditor, { WorkExperience } from "./WorkHistoryEditor";
import EducationEditor, { Education } from "./EducationEditor";
import SkillsEditor from "./SkillsEditor";
import DownloadResumeButton from "./DownloadResumeButton";

interface ResumeSectionProps {
  userId: string;
  currentResumeUrl?: string | null;
  onUploadComplete?: (url: string) => void;
}

interface ParsedResumeData {
  workHistory: WorkExperience[];
  education: Education[];
  skills: string[];
}

export default function ResumeSection({ userId, currentResumeUrl, onUploadComplete }: ResumeSectionProps) {
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resumeUrl, setResumeUrl] = useState<string | null>(currentResumeUrl || null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [workHistory, setWorkHistory] = useState<WorkExperience[]>([]);
  const [education, setEducation] = useState<Education[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Load existing data
  useEffect(() => {
    loadResumeData();
  }, [userId]);

  const loadResumeData = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("work_history, education, skills")
        .eq("user_id", userId)
        .single();

      if (!error && data) {
        if (data.work_history && Array.isArray(data.work_history)) {
          setWorkHistory(data.work_history as unknown as WorkExperience[]);
        }
        if (data.education && Array.isArray(data.education)) {
          setEducation(data.education as unknown as Education[]);
        }
        if (data.skills && Array.isArray(data.skills)) {
          setSkills(data.skills as string[]);
        }
      }
    } catch (err) {
      console.error("Error loading resume data:", err);
    }
  };

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
        description: "Your resume has been uploaded. Parsing now...",
      });

      // Auto-parse the resume
      await parseResume(file);

    } catch (error: any) {
      console.error('Upload error:', error);
      toast({
        title: "Upload failed",
        description: error.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const parseResume = async (file: File) => {
    setParsing(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Not authenticated");
      }

      // Convert file to base64
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      console.log("Calling parse-resume function...");

      const { data, error } = await supabase.functions.invoke("parse-resume", {
        body: {
          fileBase64: base64,
          fileName: file.name,
          fileType: file.type,
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      console.log("Parse response:", data, error);

      if (error) throw error;

      const parsedWork = data?.workHistory || [];
      const parsedEdu = data?.education || [];
      const parsedSkills = data?.skills || [];

      console.log(`Parsed ${parsedWork.length} work entries, ${parsedEdu.length} education entries, ${parsedSkills.length} skills`);

      // Update state
      setWorkHistory(parsedWork);
      setEducation(parsedEdu);
      setSkills(parsedSkills);

      // Auto-save to database
      if (parsedWork.length > 0 || parsedEdu.length > 0 || parsedSkills.length > 0) {
        const { error: saveError } = await supabase
          .from("profiles")
          .update({
            work_history: parsedWork,
            education: parsedEdu,
            skills: parsedSkills,
          })
          .eq("user_id", userId);

        if (saveError) {
          console.error("Auto-save error:", saveError);
          sonnerToast.success("Resume parsed! Click Save to keep your changes.");
          setHasChanges(true);
        } else {
          sonnerToast.success("Resume parsed and saved successfully!");
          setHasChanges(false);
        }
      } else {
        sonnerToast.info("No content found. Please add details manually.");
      }

    } catch (error: any) {
      console.error("Parse error:", error);
      sonnerToast.error("Could not parse resume automatically. Please enter details manually.");
    } finally {
      setParsing(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          work_history: JSON.parse(JSON.stringify(workHistory)),
          education: JSON.parse(JSON.stringify(education)),
          skills: skills,
        })
        .eq("user_id", userId);

      if (error) throw error;

      sonnerToast.success("Resume details saved!");
      setHasChanges(false);
    } catch (error: any) {
      sonnerToast.error(error.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleWorkHistoryChange = (newHistory: WorkExperience[]) => {
    setWorkHistory(newHistory);
    setHasChanges(true);
  };

  const handleEducationChange = (newEducation: Education[]) => {
    setEducation(newEducation);
    setHasChanges(true);
  };

  const handleSkillsChange = (newSkills: string[]) => {
    setSkills(newSkills);
    setHasChanges(true);
  };

  const handleRemoveResume = async () => {
    setUploading(true);

    try {
      const { error: deleteError } = await supabase.storage
        .from('resumes')
        .remove([`${userId}/resume.pdf`, `${userId}/resume.doc`, `${userId}/resume.docx`]);

      if (deleteError) {
        console.error('Delete error:', deleteError);
      }

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
        description: "Your resume file has been removed.",
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
      const ext = getFileExtension(resumeUrl);
      const filePath = `${userId}/resume.${ext || 'pdf'}`;

      const { data, error } = await supabase.storage
        .from('resumes')
        .createSignedUrl(filePath, 3600);

      if (error) {
        throw error;
      }

      setSignedUrl(data.signedUrl);
    } catch (error: any) {
      console.error('Preview error:', error);
      toast({
        title: "Preview failed",
        description: "Could not load resume preview.",
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
      <div className="space-y-6">
        {/* File Upload Section */}
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx"
            onChange={handleFileSelect}
            className="hidden"
            disabled={uploading || parsing}
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
                  disabled={uploading || parsing}
                >
                  <Eye className="h-4 w-4 mr-1" />
                  View
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDownload}
                  disabled={uploading || parsing}
                >
                  <Download className="h-4 w-4 mr-1" />
                  Download
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || parsing}
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Replace"}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleRemoveResume}
                  disabled={uploading || parsing}
                  className="text-destructive hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <div
              onClick={() => !uploading && !parsing && fileInputRef.current?.click()}
              className="border-2 border-dashed border-white/20 rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
            >
              {uploading || parsing ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-10 w-10 text-primary animate-spin" />
                  <p className="text-sm text-muted-foreground">
                    {parsing ? "Parsing resume..." : "Uploading..."}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                    <Upload className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Upload your resume</p>
                    <p className="text-sm text-muted-foreground">PDF or Word, max 10MB</p>
                    <p className="text-xs text-primary mt-1 flex items-center justify-center gap-1">
                      <Sparkles className="h-3 w-3" />
                      AI will extract your work history & education
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Parsing indicator */}
        {parsing && (
          <div className="flex items-center gap-3 p-4 bg-primary/10 rounded-lg border border-primary/20">
            <Loader2 className="h-5 w-5 text-primary animate-spin" />
            <div>
              <p className="font-medium text-sm">Parsing your resume...</p>
              <p className="text-xs text-muted-foreground">Extracting work history, education & skills</p>
            </div>
          </div>
        )}

        {/* Work History, Education & Skills Tabs */}
        <Tabs defaultValue="work" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="work">
              Work ({workHistory.length})
            </TabsTrigger>
            <TabsTrigger value="education">
              Education ({education.length})
            </TabsTrigger>
            <TabsTrigger value="skills">
              Skills ({skills.length})
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="work" className="mt-4">
            <WorkHistoryEditor
              workHistory={workHistory}
              onChange={handleWorkHistoryChange}
            />
          </TabsContent>
          
          <TabsContent value="education" className="mt-4">
            <EducationEditor
              education={education}
              onChange={handleEducationChange}
            />
          </TabsContent>

          <TabsContent value="skills" className="mt-4">
            <SkillsEditor
              skills={skills}
              onChange={handleSkillsChange}
            />
          </TabsContent>
        </Tabs>

        {/* Action Buttons */}
        <div className="flex gap-3">
          {hasChanges && (
            <Button onClick={handleSave} disabled={saving} className="flex-1">
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          )}
          
          {(workHistory.length > 0 || education.length > 0 || skills.length > 0) && (
            <DownloadResumeButton 
              variant={hasChanges ? "outline" : "default"}
              className={hasChanges ? "" : "w-full"}
            />
          )}
        </div>
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
                  </div>
                </div>
              )
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
