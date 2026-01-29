import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface JobForExtraction {
  id: string;
  url: string;
  title: string;
  snippet: string | null;
}

interface SalaryResult {
  url: string;
  salary_min: number | null;
  salary_max: number | null;
  currency: string;
}

async function extractSalariesWithAI(
  jobs: JobForExtraction[],
  apiKey: string
): Promise<SalaryResult[]> {
  if (jobs.length === 0) return [];

  const jobDescriptions = jobs
    .map(
      (job, idx) =>
        `Job ${idx + 1} (URL: ${job.url}):
Title: ${job.title}
Snippet: ${job.snippet || "No description"}`
    )
    .join("\n\n");

  const prompt = `Extract salary information from these job listings. Look for salary ranges, hourly rates, or compensation mentions in titles and snippets.

JOBS:
${jobDescriptions}

For each job, extract:
- salary_min: minimum salary in annual USD (convert hourly to annual assuming 2080 hours/year, convert other currencies to USD estimate)
- salary_max: maximum salary in annual USD
- currency: original currency mentioned (USD, EUR, GBP, etc.)

If no salary is mentioned, set min and max to null.

Return a JSON array with objects containing "url", "salary_min", "salary_max", "currency" for each job.`;

  try {
    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content:
                "You are a salary data extraction AI. Extract salary information from job listings. Always respond with valid JSON arrays. Be conservative - only extract salaries that are clearly stated.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.1,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    const jsonMatch = content.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) {
      console.log("No JSON found in response");
      return [];
    }

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error("AI extraction error:", error);
    return [];
  }
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
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;

    // Get jobs without salary info
    const { data: jobs, error: jobsError } = await supabase
      .from("discovered_jobs")
      .select("id, url, title, snippet")
      .eq("user_id", userId)
      .is("salary_min", null)
      .is("salary_max", null)
      .limit(20);

    if (jobsError) throw jobsError;

    if (!jobs || jobs.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          updated: 0,
          message: "No jobs without salary info",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Extracting salary info for ${jobs.length} jobs`);

    const salaryResults = await extractSalariesWithAI(jobs, lovableApiKey);

    // Update jobs with extracted salary info
    let updated = 0;
    for (const result of salaryResults) {
      if (result.salary_min !== null || result.salary_max !== null) {
        const job = jobs.find((j) => j.url === result.url);
        if (job) {
          const { error } = await supabase
            .from("discovered_jobs")
            .update({
              salary_min: result.salary_min
                ? Math.round(result.salary_min)
                : null,
              salary_max: result.salary_max
                ? Math.round(result.salary_max)
                : null,
              salary_currency: result.currency || "USD",
            })
            .eq("id", job.id)
            .eq("user_id", userId);

          if (!error) {
            updated++;
            console.log(
              `Updated ${job.title}: $${result.salary_min}-${result.salary_max}`
            );
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: jobs.length,
        updated,
        remaining: jobs.length - updated,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    console.error("Extract salaries error:", error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
