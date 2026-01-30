import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Crosshair, Users, Crown, FileText, RefreshCw, ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import type { User as SupabaseUser } from "@supabase/supabase-js";

interface UserData {
  user_id: string;
  full_name: string | null;
  email: string | null;
  created_at: string;
  resume_url: string | null;
  target_roles: string[] | null;
  work_type: string | null;
  subscription: {
    tier: string;
    status: string;
    current_period_end: string | null;
  };
  usage: {
    searches_this_week: number;
    tailors_this_month: number;
    resume_parses_total: number;
  };
}

interface AdminStats {
  summary: {
    totalUsers: number;
    tierCounts: Record<string, number>;
    activeSubscriptions: number;
    usersWithResume: number;
  };
  users: UserData[];
}

const Admin = () => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingTier, setUpdatingTier] = useState<string | null>(null);
  const navigate = useNavigate();

  const fetchAdminStats = async () => {
    setRefreshing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }

      const { data, error } = await supabase.functions.invoke<AdminStats>("admin-stats", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        if (error.message.includes("403") || error.message.includes("Forbidden")) {
          setIsAdmin(false);
          toast.error("Access denied - Admin privileges required");
        } else {
          throw error;
        }
        return;
      }

      setIsAdmin(true);
      setStats(data);
    } catch (error) {
      console.error("Error fetching admin stats:", error);
      toast.error("Failed to load admin data");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        setLoading(false);
        if (!session?.user) {
          navigate("/auth");
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
      if (!session?.user) {
        navigate("/auth");
      } else {
        fetchAdminStats();
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleTierChange = async (targetUserId: string, newTier: string) => {
    setUpdatingTier(targetUserId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Session expired");
        return;
      }

      const { data, error } = await supabase.functions.invoke("admin-update-tier", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: { targetUserId, newTier },
      });

      if (error) throw error;

      toast.success(`Tier updated to ${newTier}`);
      
      // Update local state
      if (stats) {
        setStats({
          ...stats,
          users: stats.users.map((u) =>
            u.user_id === targetUserId
              ? { ...u, subscription: { ...u.subscription, tier: newTier } }
              : u
          ),
          summary: {
            ...stats.summary,
            tierCounts: Object.fromEntries(
              Object.entries(stats.summary.tierCounts).map(([tier, count]) => {
                const oldTier = stats.users.find((u) => u.user_id === targetUserId)?.subscription.tier;
                if (tier === oldTier) return [tier, count - 1];
                if (tier === newTier) return [tier, count + 1];
                return [tier, count];
              })
            ),
          },
        });
      }
    } catch (error) {
      console.error("Error updating tier:", error);
      toast.error("Failed to update tier");
    } finally {
      setUpdatingTier(null);
    }
  };

  const getTierBadge = (tier: string) => {
    switch (tier) {
      case "premium":
        return <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0">Premium</Badge>;
      case "pro":
        return <Badge className="bg-gradient-to-r from-primary to-cyan-500 text-white border-0">Pro</Badge>;
      default:
        return <Badge variant="outline">Free</Badge>;
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAdmin && !refreshing) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader className="text-center">
            <ShieldCheck className="h-12 w-12 text-destructive mx-auto mb-4" />
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              You don't have admin privileges to view this page.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button asChild>
              <Link to="/dashboard">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-white/10 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="relative flex items-center justify-center w-10 h-10">
              <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
              <span className="absolute text-white font-black text-sm z-0">$</span>
              <Crosshair className="h-7 w-7 text-primary absolute z-10" />
            </div>
            <span className="text-xl font-bold tracking-tight">
              work<span className="text-primary">huntr</span>.io
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <Badge className="bg-destructive/20 text-destructive border-destructive/30 gap-1">
              <ShieldCheck className="h-3 w-3" />
              Admin
            </Badge>
            <Button variant="outline" asChild>
              <Link to="/dashboard">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Dashboard
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Admin Backoffice</h1>
            <p className="text-muted-foreground">
              View user registrations and subscription data
            </p>
          </div>
          <Button onClick={fetchAdminStats} disabled={refreshing}>
            {refreshing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Refresh
          </Button>
        </div>

        {/* Summary Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Users</CardDescription>
                <CardTitle className="text-3xl flex items-center gap-2">
                  <Users className="h-6 w-6 text-primary" />
                  {stats.summary.totalUsers}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Paid Subscriptions</CardDescription>
                <CardTitle className="text-3xl flex items-center gap-2">
                  <Crown className="h-6 w-6 text-amber-500" />
                  {stats.summary.activeSubscriptions}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Users with Resume</CardDescription>
                <CardTitle className="text-3xl flex items-center gap-2">
                  <FileText className="h-6 w-6 text-green-500" />
                  {stats.summary.usersWithResume}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Tier Breakdown</CardDescription>
                <div className="flex flex-wrap gap-2 mt-2">
                  {Object.entries(stats.summary.tierCounts).map(([tier, count]) => (
                    <div key={tier} className="flex items-center gap-1">
                      {getTierBadge(tier)}
                      <span className="text-sm font-medium">{count}</span>
                    </div>
                  ))}
                </div>
              </CardHeader>
            </Card>
          </div>
        )}

        {/* Users Table */}
        {stats && (
          <Card>
            <CardHeader>
              <CardTitle>Registered Users</CardTitle>
              <CardDescription>
                All users with their subscription and usage data
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Registered</TableHead>
                      <TableHead>Tier</TableHead>
                      <TableHead>Resume</TableHead>
                      <TableHead>Target Roles</TableHead>
                      <TableHead className="text-right">Searches</TableHead>
                      <TableHead className="text-right">Tailors</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.users.map((userData) => (
                      <TableRow key={userData.user_id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{userData.full_name || "—"}</p>
                            <p className="text-sm text-muted-foreground">{userData.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>{formatDate(userData.created_at)}</TableCell>
                        <TableCell>
                          <Select
                            value={userData.subscription.tier}
                            onValueChange={(value) => handleTierChange(userData.user_id, value)}
                            disabled={updatingTier === userData.user_id}
                          >
                            <SelectTrigger className="w-[120px]">
                              {updatingTier === userData.user_id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <SelectValue />
                              )}
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="free">
                                <Badge variant="outline">Free</Badge>
                              </SelectItem>
                              <SelectItem value="pro">
                                <Badge className="bg-gradient-to-r from-primary to-cyan-500 text-white border-0">Pro</Badge>
                              </SelectItem>
                              <SelectItem value="premium">
                                <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0">Premium</Badge>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {userData.resume_url ? (
                            <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
                              Uploaded
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          <p className="truncate text-sm">
                            {userData.target_roles?.join(", ") || "—"}
                          </p>
                        </TableCell>
                        <TableCell className="text-right">{userData.usage.searches_this_week}</TableCell>
                        <TableCell className="text-right">{userData.usage.tailors_this_month}</TableCell>
                      </TableRow>
                    ))}
                    {stats.users.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No users registered yet
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default Admin;
