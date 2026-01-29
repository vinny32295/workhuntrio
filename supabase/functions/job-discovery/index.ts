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
    const hostname = new URL(url).hostname.replace("www.", "");
    return { type: "careers_page", companySlug: hostname.split(".")[0] };
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
      });
    }
  }
  
  return classified;
}

// Google Custom Search API
async function googleSearch(
  query: string,
  apiKey: string,
  cseId: string,
  numResults: number = 10
): Promise<SearchResult[]> {
  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("cx", cseId);
  url.searchParams.set("q", query);
  url.searchParams.set("num", String(Math.min(numResults, 10)));
  
  const response = await fetch(url.toString());
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error("Google API error:", errorText);
    throw new Error(`Google API error: ${response.status}`);
  }
  
  const data = await response.json();
  
  return (data.items || []).map((item: any) => ({
    title: item.title || "",
    url: item.link || "",
    snippet: item.snippet || "",
  }));
}

// Build search queries from user preferences
function buildSearchQueries(preferences: {
  target_roles: string[] | null;
  work_type: string | null;
}): string[] {
  const queries: string[] = [];
  const roles = preferences.target_roles || ["product manager", "operations manager"];
  const workType = preferences.work_type || "remote";
  
  for (const role of roles.slice(0, 3)) {
    // ATS-specific searches (most reliable)
    queries.push(`site:boards.greenhouse.io ${workType} ${role}`);
    queries.push(`site:jobs.lever.co ${workType} ${role}`);
    
    // General job search
    queries.push(`${workType} "${role}" jobs hiring 2025`);
  }
  
  // Add some broad ATS searches
  queries.push(`site:apply.workable.com ${workType} manager`);
  queries.push(`site:jobs.ashbyhq.com ${workType}`);
  
  return queries;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get API keys from environment
    const googleApiKey = Deno.env.get("GOOGLE_API_KEY");
    const googleCseId = Deno.env.get("GOOGLE_CSE_ID");
    
    if (!googleApiKey || !googleCseId) {
      return new Response(
        JSON.stringify({ error: "Google API credentials not configured" }),
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
      .select("target_roles, work_type")
      .eq("user_id", userId)
      .single();
    
    const queries = buildSearchQueries(profile || { target_roles: null, work_type: null });
    
    console.log(`Running ${queries.length} search queries for user ${userId}`);
    
    // Run searches with rate limiting
    const allResults: SearchResult[] = [];
    
    for (const query of queries) {
      try {
        console.log(`Searching: ${query}`);
        const results = await googleSearch(query, googleApiKey, googleCseId, 10);
        allResults.push(...results);
        
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
    
    // Insert into database
    let inserted = 0;
    let skipped = 0;
    
    for (const job of classifiedJobs) {
      const { error } = await supabase.from("discovered_jobs").upsert(
        {
          user_id: userId,
          url: job.url,
          title: job.title,
          snippet: job.snippet,
          ats_type: job.atsType,
          company_slug: job.companySlug,
          source: "google_cse",
          discovered_at: new Date().toISOString(),
        },
        { onConflict: "user_id,url" }
      );
      
      if (error) {
        console.error("Insert error:", error);
        skipped++;
      } else {
        inserted++;
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
