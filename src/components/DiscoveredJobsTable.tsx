import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExternalLink, Plus, Check, Loader2, Search, Filter, X, Sparkles, Lock } from "lucide-react";
import { toast } from "sonner";
import TailorResumeDialog from "./TailorResumeDialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface DiscoveredJob {
  id: string;
  url: string;
  title: string;
  snippet: string | null;
  company_slug: string | null;
  ats_type: string | null;
  match_score: number | null;
  is_reviewed: boolean;
  discovered_at: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
}

const formatSalary = (min: number | null, max: number | null, currency: string | null): string | null => {
  if (!min && !max) return null;
  
  const currencySymbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : (currency || '$');
  const formatNum = (n: number) => {
    if (n >= 1000) return `${Math.round(n / 1000)}k`;
    return n.toString();
  };
  
  if (min && max) {
    return `${currencySymbol}${formatNum(min)} - ${currencySymbol}${formatNum(max)}`;
  }
  if (min) return `${currencySymbol}${formatNum(min)}+`;
  if (max) return `Up to ${currencySymbol}${formatNum(max)}`;
  return null;
};

interface DiscoveredJobsTableProps {
  userId: string;
}

type DateFilter = "all" | "today" | "week";

export default function DiscoveredJobsTable({ userId }: DiscoveredJobsTableProps) {
  const [jobs, setJobs] = useState<DiscoveredJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingJob, setAddingJob] = useState<string | null>(null);
  const [titleSearch, setTitleSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [tailorDialogOpen, setTailorDialogOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<DiscoveredJob | null>(null);
  const [userTier, setUserTier] = useState<string>("free");

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(titleSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [titleSearch]);

  useEffect(() => {
    fetchDiscoveredJobs();
    fetchUserTier();
  }, [userId, debouncedSearch, dateFilter]);

  const fetchUserTier = async () => {
    try {
      const { data } = await supabase
        .from("subscriptions")
        .select("tier")
        .eq("user_id", userId)
        .single();
      
      if (data?.tier) {
        setUserTier(data.tier);
      }
    } catch (error) {
      // Default to free if no subscription found
      setUserTier("free");
    }
  };

  // Jobs are now filtered server-side, so we just use the jobs array directly
  const filteredJobs = jobs;

  const clearFilters = () => {
    setTitleSearch("");
    setDateFilter("all");
  };

  const hasActiveFilters = titleSearch || dateFilter !== "all";

  const fetchDiscoveredJobs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("discovered_jobs")
        .select("*")
        .eq("user_id", userId);

      // Apply server-side text search using ilike for title, company_slug, snippet
      if (debouncedSearch) {
        const searchPattern = `%${debouncedSearch}%`;
        query = query.or(`title.ilike.${searchPattern},company_slug.ilike.${searchPattern},snippet.ilike.${searchPattern}`);
      }

      // Apply date filter
      if (dateFilter === "today") {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        query = query.gte("discovered_at", today.toISOString());
      } else if (dateFilter === "week") {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        weekAgo.setHours(0, 0, 0, 0);
        query = query.gte("discovered_at", weekAgo.toISOString());
      }

      const { data, error } = await query
        .order("match_score", { ascending: false, nullsFirst: false })
        .order("discovered_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      setJobs(data || []);
    } catch (error) {
      console.error("Error fetching discovered jobs:", error);
      toast.error("Failed to load discovered jobs");
    } finally {
      setLoading(false);
    }
  };

  const addToApplications = async (job: DiscoveredJob) => {
    setAddingJob(job.id);
    try {
      // Add to job_applications
      const { error: insertError } = await supabase
        .from("job_applications")
        .insert({
          user_id: userId,
          job_title: job.title,
          company_name: job.company_slug || "Unknown Company",
          job_url: job.url,
          status: "applied",
          notes: `Discovered via ${job.ats_type || "Google Search"}. ${job.snippet || ""}`,
        });

      if (insertError) throw insertError;

      // Mark as reviewed
      const { error: updateError } = await supabase
        .from("discovered_jobs")
        .update({ is_reviewed: true })
        .eq("id", job.id);

      if (updateError) throw updateError;

      // Update local state
      setJobs(jobs.map(j => 
        j.id === job.id ? { ...j, is_reviewed: true } : j
      ));

      toast.success("Added to your applications!");
    } catch (error) {
      console.error("Error adding job:", error);
      toast.error("Failed to add job to applications");
    } finally {
      setAddingJob(null);
    }
  };

  const markAsReviewed = async (jobId: string) => {
    try {
      const { error } = await supabase
        .from("discovered_jobs")
        .update({ is_reviewed: true })
        .eq("id", jobId);

      if (error) throw error;

      setJobs(jobs.map(j => 
        j.id === jobId ? { ...j, is_reviewed: true } : j
      ));
    } catch (error) {
      console.error("Error marking as reviewed:", error);
    }
  };

  const getATSBadgeColor = (atsType: string | null) => {
    switch (atsType) {
      case "greenhouse": return "bg-emerald-500/20 text-emerald-400";
      case "lever": return "bg-sky-500/20 text-sky-400";
      case "workable": return "bg-violet-500/20 text-violet-400";
      case "ashby": return "bg-amber-500/20 text-amber-400";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "bg-emerald-500";
    if (score >= 60) return "bg-primary";
    if (score >= 40) return "bg-amber-500";
    return "bg-muted-foreground";
  };

  const getScoreTextColor = (score: number) => {
    if (score >= 80) return "text-emerald-400";
    if (score >= 60) return "text-primary";
    if (score >= 40) return "text-amber-400";
    return "text-muted-foreground";
  };

  const unreviewedCount = filteredJobs.filter(j => !j.is_reviewed).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="text-center py-12">
        <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">No discovered jobs yet</h3>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          Click "Start Hunt" above to find matching job opportunities.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by title, company, or keywords..."
            value={titleSearch}
            onChange={(e) => setTitleSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
          <SelectTrigger className="w-full sm:w-[140px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Date" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All time</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">This week</SelectItem>
          </SelectContent>
        </Select>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
            <X className="h-4 w-4" />
            Clear
          </Button>
        )}
      </div>

      {/* Results count */}
      <div className="mb-4 flex items-center gap-2">
        {unreviewedCount > 0 && (
          <Badge variant="secondary" className="bg-primary/20 text-primary">
            {unreviewedCount} new
          </Badge>
        )}
        <span className="text-sm text-muted-foreground">
          {filteredJobs.length === jobs.length
            ? `${jobs.length} jobs discovered`
            : `Showing ${filteredJobs.length} of ${jobs.length} jobs`}
        </span>
      </div>

      {filteredJobs.length === 0 ? (
        <div className="text-center py-12 border border-white/10 rounded-lg">
          <Filter className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No matching jobs</h3>
          <p className="text-muted-foreground text-sm">
            Try adjusting your search or filters
          </p>
          <Button variant="link" onClick={clearFilters} className="mt-2">
            Clear all filters
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border border-white/10 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-white/5">
                <TableHead>Job</TableHead>
                <TableHead>Match</TableHead>
                <TableHead>Salary</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Discovered</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredJobs.map((job) => (
              <TableRow 
                key={job.id} 
                className={`border-white/10 hover:bg-white/5 ${
                  job.is_reviewed ? "opacity-60" : ""
                }`}
              >
                <TableCell>
                  <div className="max-w-md">
                    <div className="font-medium truncate">{job.title}</div>
                    {job.company_slug && (
                      <div className="text-sm text-muted-foreground">
                        {job.company_slug}
                      </div>
                    )}
                    {job.snippet && (
                      <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {job.snippet}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {job.match_score !== null ? (
                    <div className="flex items-center gap-2">
                      <div className="w-12 h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${getScoreColor(job.match_score)}`}
                          style={{ width: `${job.match_score}%` }}
                        />
                      </div>
                      <span className={`text-xs font-medium ${getScoreTextColor(job.match_score)}`}>
                        {job.match_score}%
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {(() => {
                    const salary = formatSalary(job.salary_min, job.salary_max, job.salary_currency);
                    return salary ? (
                      <span className="text-sm font-medium text-emerald-400">{salary}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    );
                  })()}
                </TableCell>
                <TableCell>
                  <Badge className={getATSBadgeColor(job.ats_type)}>
                    {job.ats_type || "web"}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {new Date(job.discovered_at).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {userTier !== "free" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedJob(job);
                          setTailorDialogOpen(true);
                        }}
                        title="Tailor resume & cover letter"
                      >
                        <Sparkles className="h-4 w-4 text-primary" />
                      </Button>
                    ) : (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="opacity-50 cursor-not-allowed"
                              onClick={(e) => e.preventDefault()}
                            >
                              <Lock className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[220px] text-center p-3">
                            <p className="font-medium">Upgrade to Pro</p>
                            <p className="text-xs text-muted-foreground mb-2">
                              Tailor your resume & cover letter for each job with AI
                            </p>
                            <Link 
                              to="/#pricing" 
                              className="text-xs text-primary hover:underline font-medium"
                            >
                              View pricing →
                            </Link>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      asChild
                    >
                      <a href={job.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                    {job.is_reviewed ? (
                      <Button variant="ghost" size="sm" disabled>
                        <Check className="h-4 w-4 text-green-500" />
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => addToApplications(job)}
                        disabled={addingJob === job.id}
                      >
                        {addingJob === job.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Plus className="h-4 w-4 mr-1" />
                            Track
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            </TableBody>
          </Table>
        </div>
      )}

      <TailorResumeDialog
        open={tailorDialogOpen}
        onOpenChange={setTailorDialogOpen}
        job={selectedJob}
      />
    </div>
  );
}
