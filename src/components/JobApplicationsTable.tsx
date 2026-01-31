import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Plus, ExternalLink, Loader2, Trash2, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface JobApplication {
  id: string;
  company_name: string;
  job_title: string;
  job_url: string | null;
  status: string;
  applied_at: string;
  notes: string | null;
}

interface JobApplicationsTableProps {
  userId: string;
}

const STATUS_OPTIONS = [
  { value: "applied", label: "Applied", color: "bg-blue-500/20 text-blue-400" },
  { value: "interviewing", label: "Interviewing", color: "bg-yellow-500/20 text-yellow-400" },
  { value: "offered", label: "Offered", color: "bg-emerald-500/20 text-emerald-400" },
  { value: "rejected", label: "Rejected", color: "bg-red-500/20 text-red-400" },
  { value: "withdrawn", label: "Withdrawn", color: "bg-muted text-muted-foreground" },
];

const JobApplicationsTable = ({ userId }: JobApplicationsTableProps) => {
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<JobApplication | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    company_name: "",
    job_title: "",
    job_url: "",
    status: "applied",
    notes: "",
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchApplications();
  }, [userId]);

  const fetchApplications = async () => {
    try {
      const { data, error } = await supabase
        .from('job_applications')
        .select('*')
        .eq('user_id', userId)
        .order('applied_at', { ascending: false });

      if (error) throw error;
      setApplications(data || []);
    } catch (error) {
      console.error('Error fetching applications:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      company_name: "",
      job_title: "",
      job_url: "",
      status: "applied",
      notes: "",
    });
    setEditingApp(null);
  };

  const handleOpenDialog = (app?: JobApplication) => {
    if (app) {
      setEditingApp(app);
      setFormData({
        company_name: app.company_name,
        job_title: app.job_title,
        job_url: app.job_url || "",
        status: app.status,
        notes: app.notes || "",
      });
    } else {
      resetForm();
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.company_name.trim() || !formData.job_title.trim()) {
      toast({
        title: "Missing fields",
        description: "Company name and job title are required.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    try {
      if (editingApp) {
        const { error } = await supabase
          .from('job_applications')
          .update({
            company_name: formData.company_name.trim(),
            job_title: formData.job_title.trim(),
            job_url: formData.job_url.trim() || null,
            status: formData.status,
            notes: formData.notes.trim() || null,
          })
          .eq('id', editingApp.id);

        if (error) throw error;

        toast({ title: "Application updated!" });
      } else {
        const { error } = await supabase
          .from('job_applications')
          .insert({
            user_id: userId,
            company_name: formData.company_name.trim(),
            job_title: formData.job_title.trim(),
            job_url: formData.job_url.trim() || null,
            status: formData.status,
            notes: formData.notes.trim() || null,
          });

        if (error) throw error;

        toast({ title: "Application added!" });
      }

      setDialogOpen(false);
      resetForm();
      fetchApplications();
    } catch (error: any) {
      console.error('Error saving application:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to save application.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('job_applications')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({ title: "Application deleted" });
      fetchApplications();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete application.",
        variant: "destructive",
      });
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('job_applications')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;

      setApplications(prev =>
        prev.map(app => app.id === id ? { ...app, status: newStatus } : app)
      );
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update status.",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const option = STATUS_OPTIONS.find(s => s.value === status);
    return (
      <Badge variant="secondary" className={`${option?.color} border-0`}>
        {option?.label || status}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with Add button */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {applications.length} application{applications.length !== 1 ? 's' : ''} tracked
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" onClick={() => handleOpenDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              Add Application
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingApp ? "Edit Application" : "Add New Application"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="company">Company Name *</Label>
                <Input
                  id="company"
                  placeholder="e.g., Google"
                  value={formData.company_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, company_name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="title">Job Title *</Label>
                <Input
                  id="title"
                  placeholder="e.g., Software Engineer"
                  value={formData.job_title}
                  onChange={(e) => setFormData(prev => ({ ...prev, job_title: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="url">Job URL</Label>
                <Input
                  id="url"
                  placeholder="https://..."
                  value={formData.job_url}
                  onChange={(e) => setFormData(prev => ({ ...prev, job_url: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, status: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Any additional notes..."
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                />
              </div>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="w-full"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Saving...
                  </>
                ) : editingApp ? "Update Application" : "Add Application"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Applications Table */}
      {applications.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-white/20 rounded-xl">
          <p className="text-muted-foreground mb-4">No applications tracked yet</p>
          <Button variant="outline" size="sm" onClick={() => handleOpenDialog()}>
            <Plus className="h-4 w-4 mr-2" />
            Add Your First Application
          </Button>
        </div>
      ) : (
        <div className="border border-white/10 rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-white/10">
                <TableHead>Company</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Applied</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {applications.map((app) => (
                <TableRow key={app.id} className="border-white/10">
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {app.company_name}
                      {app.job_url && (
                        <a
                          href={app.job_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-primary"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{app.job_title}</TableCell>
                  <TableCell>
                    <Select
                      value={app.status}
                      onValueChange={(value) => handleStatusChange(app.id, value)}
                    >
                      <SelectTrigger className="w-[130px] h-8 border-0 bg-transparent p-0">
                        <SelectValue>{getStatusBadge(app.status)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map(option => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(app.applied_at), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleOpenDialog(app)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(app.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};

export default JobApplicationsTable;
