import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { jobTitle, companyName, jobSnippet, jobUrl } = await req.json();

    if (!jobTitle) {
      return new Response(JSON.stringify({ error: "Job title is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user's profile with resume URL
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("resume_url, full_name, target_roles")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile?.resume_url) {
      return new Response(JSON.stringify({ error: "Please upload your resume first" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch and parse the resume PDF
    let resumeText = "";
    try {
      const resumeResponse = await fetch(profile.resume_url);
      if (resumeResponse.ok) {
        // For now, we'll work with what info we have from the profile
        // In production, you'd use a PDF parser
        resumeText = `
          Name: ${profile.full_name || "Candidate"}
          Target Roles: ${profile.target_roles?.join(", ") || "Not specified"}
          Resume uploaded at: ${profile.resume_url}
        `;
      }
    } catch (e) {
      console.error("Error fetching resume:", e);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are an expert career coach and resume writer. Your task is to help job seekers tailor their application materials to specific job opportunities.

Given a job posting and candidate information, create:
1. A tailored resume summary/objective (2-3 sentences highlighting relevant experience)
2. Key skills to emphasize for this specific role (5-7 bullet points)
3. A professional cover letter (3-4 paragraphs)

Focus on:
- Matching the candidate's experience to the job requirements
- Using keywords from the job posting
- Highlighting transferable skills
- Professional, confident tone
- Specific, quantifiable achievements when possible`;

    const userPrompt = `Please create tailored application materials for this opportunity:

**Job Title:** ${jobTitle}
**Company:** ${companyName || "Unknown Company"}
**Job Description:** ${jobSnippet || "No description available"}
**Job URL:** ${jobUrl || "Not provided"}

**Candidate Information:**
${resumeText}

Please provide:
1. **Tailored Resume Summary** - A compelling 2-3 sentence summary
2. **Key Skills to Highlight** - 5-7 bullet points of relevant skills
3. **Cover Letter** - A professional 3-4 paragraph cover letter

Format your response with clear markdown headers.`;

    console.log("Generating tailored content for:", jobTitle, "at", companyName);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "Failed to generate content" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;

    if (!content) {
      return new Response(JSON.stringify({ error: "No content generated" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Successfully generated tailored content");

    return new Response(JSON.stringify({ 
      success: true,
      content,
      jobTitle,
      companyName
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Error in tailor-resume function:", err);
    const message = err instanceof Error ? err.message : "Internal error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
