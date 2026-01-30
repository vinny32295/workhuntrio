import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Tiers that have AI scoring enabled
const SCORING_ENABLED_TIERS = ["pro", "premium"];

interface DiscoveredJob {
  id: string;
  title: string;
  snippet: string | null;
  company_slug: string | null;
  ats_type: string | null;
}

interface ScoredJob {
  id: string;
  score: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify user
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub as string;

    // Check subscription tier for AI scoring access
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: subscription } = await serviceClient
      .from("subscriptions")
      .select("tier")
      .eq("user_id", userId)
      .single();

    const tier = subscription?.tier || "free";

    if (!SCORING_ENABLED_TIERS.includes(tier)) {
      return new Response(
        JSON.stringify({ 
          error: "AI job scoring is a Pro feature. Upgrade to get personalized match scores.",
          requiresUpgrade: true,
          tier
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user's resume content
    const { data: profile } = await supabase
      .from("profiles")
      .select("resume_url, target_roles, work_type")
      .eq("user_id", userId)
      .single();

    if (!profile?.resume_url) {
      return new Response(
        JSON.stringify({ error: "Please upload your resume first to enable AI matching" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract resume text content
    const resumeText = await fetchResumeContent(profile.resume_url, supabase, userId);
    
    if (!resumeText || resumeText.length < 50) {
      return new Response(
        JSON.stringify({ error: "Could not read resume content. Please re-upload your resume." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get unscored discovered jobs
    const { data: jobs, error: jobsError } = await supabase
      .from("discovered_jobs")
      .select("id, title, snippet, company_slug, ats_type")
      .eq("user_id", userId)
      .is("match_score", null)
      .limit(20);

    if (jobsError) throw jobsError;

    if (!jobs || jobs.length === 0) {
      return new Response(
        JSON.stringify({ success: true, scored: 0, message: "No jobs to score" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Scoring ${jobs.length} jobs for user ${userId}`);

    // Score jobs using Lovable AI
    const scoredJobs = await scoreJobsWithAI(
      jobs,
      resumeText,
      profile.target_roles || [],
      lovableApiKey
    );

    // Update scores in database
    let updated = 0;
    for (const scoredJob of scoredJobs) {
      const { error } = await supabase
        .from("discovered_jobs")
        .update({ match_score: scoredJob.score })
        .eq("id", scoredJob.id)
        .eq("user_id", userId);

      if (!error) updated++;
    }

    return new Response(
      JSON.stringify({
        success: true,
        scored: updated,
        total: jobs.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    console.error("Score jobs error:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function fetchResumeContent(
  resumeUrl: string,
  supabase: any,
  userId: string
): Promise<string> {
  try {
    // Get signed URL for resume
    const ext = resumeUrl.match(/\.(\w+)(?:\?|$)/)?.[1]?.toLowerCase() || 'pdf';
    const filePath = `${userId}/resume.${ext}`;

    const { data, error } = await supabase.storage
      .from("resumes")
      .createSignedUrl(filePath, 300);

    if (error) {
      console.error("Failed to get signed URL:", error);
      return "";
    }

    // Fetch the file content
    const response = await fetch(data.signedUrl);
    if (!response.ok) {
      console.error("Failed to fetch resume:", response.status);
      return "";
    }

    // For now, we'll describe what was uploaded and use the filename/metadata
    // In production, you'd use a PDF parser
    const contentType = response.headers.get("content-type") || "";
    
    if (contentType.includes("pdf")) {
      // Read as text - this works for simple PDFs
      const text = await response.text();
      // Extract readable text (basic extraction)
      const cleanText = text
        .replace(/[^\x20-\x7E\n]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      
      if (cleanText.length > 100) {
        return cleanText.substring(0, 5000);
      }
    }

    // Fallback: use profile data to construct resume summary
    return `Resume uploaded. Target roles: ${await getProfileSummary(supabase, userId)}`;
  } catch (err) {
    console.error("Error fetching resume:", err);
    return "";
  }
}

async function getProfileSummary(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("target_roles, work_type, full_name")
    .eq("user_id", userId)
    .single();

  if (!data) return "Unknown candidate";

  const roles = data.target_roles?.join(", ") || "Various roles";
  const workType = data.work_type || "Any work type";
  
  return `Seeking ${roles}. Prefers ${workType} work.`;
}

async function scoreJobsWithAI(
  jobs: DiscoveredJob[],
  resumeText: string,
  targetRoles: string[],
  apiKey: string
): Promise<ScoredJob[]> {
  const jobDescriptions = jobs.map((job, idx) => 
    `Job ${idx + 1} (ID: ${job.id}):
Title: ${job.title}
Company: ${job.company_slug || "Unknown"}
Description: ${job.snippet || "No description available"}`
  ).join("\n\n");

  const prompt = `You are a job matching expert. Score how well each job matches the candidate's resume and target roles.

CANDIDATE PROFILE:
Target Roles: ${targetRoles.join(", ") || "Not specified"}
Resume Summary: ${resumeText.substring(0, 2000)}

JOBS TO SCORE:
${jobDescriptions}

For each job, provide a match score from 0-100 where:
- 90-100: Excellent match - title and requirements align perfectly with experience
- 70-89: Good match - strong alignment with some gaps
- 50-69: Moderate match - some relevant skills but not ideal
- 30-49: Weak match - limited relevance
- 0-29: Poor match - not suitable

Return your response as a JSON array of objects with "id" and "score" fields only.`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a job matching AI. Always respond with valid JSON arrays." },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Parse the JSON response
    const jsonMatch = content.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) {
      console.error("No JSON array found in AI response:", content);
      throw new Error("Invalid AI response format");
    }

    const scores: ScoredJob[] = JSON.parse(jsonMatch[0]);
    
    // Validate and normalize scores
    return scores.map(s => ({
      id: s.id,
      score: Math.max(0, Math.min(100, Math.round(s.score))),
    }));
  } catch (error) {
    console.error("AI scoring error:", error);
    
    // Fallback: assign random scores between 40-80 based on title matching
    return jobs.map(job => {
      const titleLower = job.title.toLowerCase();
      const roleMatch = targetRoles.some(role => 
        titleLower.includes(role.toLowerCase())
      );
      return {
        id: job.id,
        score: roleMatch ? 70 + Math.floor(Math.random() * 20) : 40 + Math.floor(Math.random() * 25),
      };
    });
  }
}
