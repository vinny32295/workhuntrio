import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Verify auth token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await supabaseAdmin.auth.getClaims(token);
    
    if (claimsError || !claims?.claims?.sub) {
      console.error("Auth error:", claimsError);
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claims.claims.sub as string;
    console.log("Admin stats request from user:", userId);

    // Check if user is admin using the has_role function
    const { data: isAdmin, error: roleError } = await supabaseAdmin.rpc("has_role", {
      _user_id: userId,
      _role: "admin"
    });

    if (roleError) {
      console.error("Role check error:", roleError);
      return new Response(
        JSON.stringify({ error: "Failed to check permissions" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!isAdmin) {
      console.log("Access denied - user is not admin:", userId);
      return new Response(
        JSON.stringify({ error: "Forbidden - Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Admin verified, fetching stats...");

    // Fetch all users with profiles
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select("user_id, full_name, email, created_at, resume_url, target_roles, work_type")
      .order("created_at", { ascending: false });

    if (profilesError) {
      console.error("Error fetching profiles:", profilesError);
      throw new Error("Failed to fetch profiles");
    }

    // Fetch all subscriptions
    const { data: subscriptions, error: subsError } = await supabaseAdmin
      .from("subscriptions")
      .select("user_id, tier, status, current_period_start, current_period_end, created_at")
      .order("created_at", { ascending: false });

    if (subsError) {
      console.error("Error fetching subscriptions:", subsError);
      throw new Error("Failed to fetch subscriptions");
    }

    // Fetch usage tracking data
    const { data: usage, error: usageError } = await supabaseAdmin
      .from("usage_tracking")
      .select("user_id, searches_this_week, tailors_this_month, resume_parses_total");

    if (usageError) {
      console.error("Error fetching usage:", usageError);
      throw new Error("Failed to fetch usage data");
    }

    // Calculate summary stats
    const totalUsers = profiles?.length || 0;
    const tierCounts = subscriptions?.reduce((acc, sub) => {
      acc[sub.tier] = (acc[sub.tier] || 0) + 1;
      return acc;
    }, {} as Record<string, number>) || {};

    const activeSubscriptions = subscriptions?.filter(s => s.status === "active" && s.tier !== "free").length || 0;
    const usersWithResume = profiles?.filter(p => p.resume_url).length || 0;

    // Merge data for detailed view
    const usersData = profiles?.map(profile => {
      const sub = subscriptions?.find(s => s.user_id === profile.user_id);
      const userUsage = usage?.find(u => u.user_id === profile.user_id);
      return {
        ...profile,
        subscription: sub ? {
          tier: sub.tier,
          status: sub.status,
          current_period_end: sub.current_period_end,
        } : { tier: "free", status: "active" },
        usage: userUsage || { searches_this_week: 0, tailors_this_month: 0, resume_parses_total: 0 },
      };
    }) || [];

    console.log(`Returning stats: ${totalUsers} users, ${activeSubscriptions} paid subscriptions`);

    return new Response(
      JSON.stringify({
        summary: {
          totalUsers,
          tierCounts,
          activeSubscriptions,
          usersWithResume,
        },
        users: usersData,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Admin stats error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
