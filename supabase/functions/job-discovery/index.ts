import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ATS patterns to classify discovered URLs
const ATS_PATTERNS: Record<string, RegExp[]> = {
  greenhouse: [/boards\.greenhouse\.io\/(\w+)/, /job-boards\.greenhouse\.io\/(\w+)/],
  lever: [/jobs\.lever\.co\/(\w+)/],
  workable: [/apply\.workable\.com\/(\w+)/, /(\w+)\.workable\.com/],
  ashby: [/jobs\.ashbyhq\.com\/(\w+)/],
  bamboohr: [/(\w+)\.bamboohr\.com\/jobs/],
  wellfound: [/wellfound\.com\/company\/(\w+)/],
};

const SKIP_DOMAINS = [
  "linkedin.com", "facebook.com", "twitter.com", "instagram.com",
  "youtube.com", "reddit.com", "glassdoor.com", "indeed.com",
];

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface ClassifiedJob {
  url: string;
  title: string;
  snippet: string;
  atsType: string | null;
  companySlug: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
}

// Classify URL by ATS type
function classifyUrl(url: string): { type: string | null; companySlug: string | null } {
  for (const [atsType, patterns] of Object.entries(ATS_PATTERNS)) {
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return { type: atsType, companySlug: match[1] || null };
      }
    }
  }
  
  // Check for generic careers page
  if (/\/careers?\/|\/jobs?\//i.test(url)) {
    try {
      const hostname = new URL(url).hostname.replace("www.", "");
      return { type: "careers_page", companySlug: hostname.split(".")[0] };
    } catch {
      return { type: null, companySlug: null };
    }
  }
  
  return { type: null, companySlug: null };
}

// Filter and classify search results
function filterResults(results: SearchResult[]): ClassifiedJob[] {
  const classified: ClassifiedJob[] = [];
  
  for (const result of results) {
    const url = result.url.toLowerCase();
    
    // Skip irrelevant domains
    if (SKIP_DOMAINS.some(domain => url.includes(domain))) continue;
    
    // Skip non-HTML files
    if (/\.(pdf|doc|png|jpg|jpeg|gif)$/i.test(url)) continue;
    
    const { type, companySlug } = classifyUrl(result.url);
    
    // Only include if we can classify it
    if (type) {
      classified.push({
        url: result.url,
        title: result.title,
        snippet: result.snippet,
        atsType: type,
        companySlug,
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: null,
      });
    }
  }
  
  return classified;
}

// SerpAPI search
async function serpApiSearch(
  query: string,
  apiKey: string,
  numResults: number = 10
): Promise<SearchResult[]> {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", query);
  url.searchParams.set("num", String(Math.min(numResults, 10)));
  
  const response = await fetch(url.toString());
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error("SerpAPI error:", errorText);
    throw new Error(`SerpAPI error: ${response.status}`);
  }
  
  const data = await response.json();
  
  // SerpAPI returns organic_results array
  return (data.organic_results || []).map((item: any) => ({
    title: item.title || "",
    url: item.link || "",
    snippet: item.snippet || "",
  }));
}

// US ZIP code to city/state mapping for common areas
const ZIP_TO_LOCATION: Record<string, string> = {
  "37": "Tennessee",
  "30": "Georgia Atlanta",
  "10": "New York NYC",
  "90": "Los Angeles California",
  "94": "San Francisco Bay Area",
  "98": "Seattle Washington",
  "60": "Chicago Illinois",
  "02": "Boston Massachusetts",
  "78": "Texas Austin",
  "75": "Dallas Texas",
  "33": "Florida Miami",
  "20": "Washington DC",
  "80": "Denver Colorado",
  "85": "Phoenix Arizona",
};

function getLocationFromZip(zip: string | null): string | null {
  if (!zip || zip.length < 2) return null;
  const prefix = zip.substring(0, 2);
  return ZIP_TO_LOCATION[prefix] || null;
}

// Build search queries from user preferences
function buildSearchQueries(preferences: {
  target_roles: string[] | null;
  work_type: string | null;
  location_zip: string | null;
}): string[] {
  const queries: string[] = [];
  const roles = preferences.target_roles || ["product manager", "operations manager"];
  const workType = preferences.work_type || "remote";
  const location = getLocationFromZip(preferences.location_zip);
  
  // For in-person or hybrid, include location in searches
  const locationTerm = (workType === "in-person" || workType === "hybrid") && location 
    ? location 
    : "";
  
  for (const role of roles.slice(0, 3)) {
    if (workType === "remote") {
      // Remote searches - no location needed
      queries.push(`site:boards.greenhouse.io remote ${role}`);
      queries.push(`site:jobs.lever.co remote ${role}`);
      queries.push(`remote "${role}" jobs hiring 2026`);
    } else {
      // In-person/hybrid - include location
      queries.push(`site:boards.greenhouse.io ${locationTerm} ${role}`);
      queries.push(`site:jobs.lever.co ${locationTerm} ${role}`);
      queries.push(`"${role}" jobs ${locationTerm} hiring 2026`);
      // Also search with work type keyword
      queries.push(`${workType} "${role}" jobs ${locationTerm}`);
    }
  }
  
  // Add some broad ATS searches with location if applicable
  if (locationTerm) {
    queries.push(`site:apply.workable.com ${locationTerm} manager`);
    queries.push(`site:jobs.ashbyhq.com ${locationTerm}`);
  } else {
    queries.push(`site:apply.workable.com ${workType} manager`);
    queries.push(`site:jobs.ashbyhq.com ${workType}`);
  }
  
  return queries;
}

// Extract salary info using AI
async function extractSalaryInfo(
  jobs: ClassifiedJob[],
  apiKey: string
): Promise<Map<string, { min: number | null; max: number | null; currency: string }>> {
  const salaryMap = new Map<string, { min: number | null; max: number | null; currency: string }>();
  
  if (jobs.length === 0) return salaryMap;
  
  const jobDescriptions = jobs.map((job, idx) => 
    `Job ${idx + 1} (URL: ${job.url}):
Title: ${job.title}
Snippet: ${job.snippet || "No description"}`
  ).join("\n\n");

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
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a salary data extraction AI. Extract salary information from job listings. Always respond with valid JSON arrays. Be conservative - only extract salaries that are clearly stated." },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      console.error("AI API error for salary extraction:", response.status);
      return salaryMap;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Parse JSON response
    const jsonMatch = content.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) {
      console.log("No JSON found in salary extraction response");
      return salaryMap;
    }

    const salaries = JSON.parse(jsonMatch[0]);
    
    for (const s of salaries) {
      if (s.url && (s.salary_min !== null || s.salary_max !== null)) {
        salaryMap.set(s.url, {
          min: s.salary_min ? Math.round(s.salary_min) : null,
          max: s.salary_max ? Math.round(s.salary_max) : null,
          currency: s.currency || "USD",
        });
      }
    }

    console.log(`Extracted salary info for ${salaryMap.size} jobs`);
    return salaryMap;
  } catch (error) {
    console.error("Salary extraction error:", error);
    return salaryMap;
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get SerpAPI key from environment
    const serpApiKey = Deno.env.get("SERPAPI_KEY");
    
    if (!serpApiKey) {
      return new Response(
        JSON.stringify({ error: "SerpAPI key not configured" }),
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
    
    // Create Supabase client
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
    
    // Get user preferences
    const { data: profile } = await supabase
      .from("profiles")
      .select("target_roles, work_type, location_zip")
      .eq("user_id", userId)
      .single();
    
    const queries = buildSearchQueries(profile || { target_roles: null, work_type: null, location_zip: null });
    
    console.log(`User preferences: work_type=${profile?.work_type}, location_zip=${profile?.location_zip}`);
    
    console.log(`Running ${queries.length} search queries for user ${userId}`);
    
    // Run searches with rate limiting
    const allResults: SearchResult[] = [];
    
    for (const query of queries) {
      try {
        console.log(`Searching: ${query}`);
        const results = await serpApiSearch(query, serpApiKey, 10);
        allResults.push(...results);
        console.log(`Found ${results.length} results for query`);
        
        // Rate limit: wait 500ms between requests
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (err) {
        console.error(`Search failed for query "${query}":`, err);
      }
    }
    
    // Dedupe by URL and classify
    const seenUrls = new Set<string>();
    const uniqueResults = allResults.filter(r => {
      if (seenUrls.has(r.url)) return false;
      seenUrls.add(r.url);
      return true;
    });
    
    const classifiedJobs = filterResults(uniqueResults);
    
    console.log(`Found ${classifiedJobs.length} relevant jobs from ${uniqueResults.length} unique results`);
    
    // Extract salary info using AI (if we have the API key)
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    let salaryMap = new Map<string, { min: number | null; max: number | null; currency: string }>();
    
    if (lovableApiKey && classifiedJobs.length > 0) {
      console.log("Extracting salary info using AI...");
      salaryMap = await extractSalaryInfo(classifiedJobs, lovableApiKey);
    }
    
    // Insert into database
    let inserted = 0;
    let skipped = 0;
    let withSalary = 0;
    
    for (const job of classifiedJobs) {
      const salaryInfo = salaryMap.get(job.url);
      
      const { error } = await supabase.from("discovered_jobs").upsert(
        {
          user_id: userId,
          url: job.url,
          title: job.title,
          snippet: job.snippet,
          ats_type: job.atsType,
          company_slug: job.companySlug,
          source: "serpapi",
          discovered_at: new Date().toISOString(),
          salary_min: salaryInfo?.min || null,
          salary_max: salaryInfo?.max || null,
          salary_currency: salaryInfo?.currency || null,
        },
        { onConflict: "user_id,url" }
      );
      
      if (error) {
        console.error("Insert error:", error);
        skipped++;
      } else {
        inserted++;
        if (salaryInfo) withSalary++;
      }
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        queriesRun: queries.length,
        totalResults: uniqueResults.length,
        relevantJobs: classifiedJobs.length,
        inserted,
        skipped,
        withSalary,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    console.error("Job discovery error:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
