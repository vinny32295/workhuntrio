import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[ADMIN-UPDATE-TIER] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Function started");

    // Verify admin authorization
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header provided");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData.user) {
      throw new Error("Authentication failed");
    }

    const userId = userData.user.id;
    logStep("User authenticated", { userId });

    // Check if user is admin
    const { data: isAdmin, error: roleError } = await supabaseAdmin.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });

    if (roleError || !isAdmin) {
      logStep("Access denied - not admin", { userId });
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    logStep("Admin access verified");

    // Parse request body
    const { targetUserId, newTier } = await req.json();
    
    if (!targetUserId || !newTier) {
      throw new Error("Missing targetUserId or newTier");
    }

    const validTiers = ["free", "pro", "premium"];
    if (!validTiers.includes(newTier)) {
      throw new Error(`Invalid tier: ${newTier}. Must be one of: ${validTiers.join(", ")}`);
    }

    logStep("Updating tier", { targetUserId, newTier });

    // Update the subscription
    const { error: updateError } = await supabaseAdmin
      .from("subscriptions")
      .update({ 
        tier: newTier,
        status: newTier === "free" ? "active" : "active",
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", targetUserId);

    if (updateError) {
      throw new Error(`Failed to update subscription: ${updateError.message}`);
    }

    logStep("Tier updated successfully", { targetUserId, newTier });

    return new Response(JSON.stringify({ success: true, tier: newTier }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
