import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Declare EdgeRuntime for background task handling
declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Tier limits configuration
const TIER_LIMITS = {
  free: { searchesPerWeek: 1, resultsPerSearch: 5 },
  pro: { searchesPerWeek: 3, resultsPerSearch: 25 },
  premium: { searchesPerWeek: Infinity, resultsPerSearch: 50 },
} as const;

type TierKey = keyof typeof TIER_LIMITS;

// ATS patterns to classify discovered URLs
const ATS_PATTERNS: Record<string, RegExp[]> = {
  greenhouse: [/boards\.greenhouse\.io\/(\w+)/, /job-boards\.greenhouse\.io\/(\w+)/],
  lever: [/jobs\.lever\.co\/(\w+)/],
  workable: [/apply\.workable\.com\/(\w+)/, /(\w+)\.workable\.com/],
  ashby: [/jobs\.ashbyhq\.com\/(\w+)/],
  bamboohr: [/(\w+)\.bamboohr\.com\/jobs/],
  wellfound: [/wellfound\.com\/company\/(\w+)/],
};

// Patterns for individual job posting URLs (not just board pages)
const JOB_POSTING_PATTERNS: RegExp[] = [
  /boards\.greenhouse\.io\/\w+\/jobs\/\d+/,
  /jobs\.lever\.co\/\w+\/[\w-]+/,
  /apply\.workable\.com\/\w+\/j\/[\w-]+/,
  /jobs\.ashbyhq\.com\/\w+\/[\w-]+/,
  /\w+\.bamboohr\.com\/careers\/\d+/,
];

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
  fullDescription: string | null;
  requirements: string[] | null;
  isDirectPosting: boolean;
}

// Check if URL is a direct job posting (not just a board page)
function isDirectJobPosting(url: string): boolean {
  return JOB_POSTING_PATTERNS.some(pattern => pattern.test(url));
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
        fullDescription: null,
        requirements: null,
        isDirectPosting: isDirectJobPosting(result.url),
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
      // Remote searches - target specific job postings, not just boards
      queries.push(`site:boards.greenhouse.io/*/jobs remote "${role}"`);
      queries.push(`site:jobs.lever.co remote "${role}" apply`);
      queries.push(`remote "${role}" jobs hiring 2026`);
    } else {
      // In-person/hybrid - include location
      queries.push(`site:boards.greenhouse.io/*/jobs ${locationTerm} "${role}"`);
      queries.push(`site:jobs.lever.co ${locationTerm} "${role}" apply`);
      queries.push(`"${role}" jobs ${locationTerm} hiring 2026`);
      queries.push(`${workType} "${role}" jobs ${locationTerm}`);
    }
  }
  
  // Add some broad ATS searches with location if applicable
  if (locationTerm) {
    queries.push(`site:apply.workable.com/*/j ${locationTerm}`);
    queries.push(`site:jobs.ashbyhq.com ${locationTerm}`);
  } else {
    queries.push(`site:apply.workable.com/*/j ${workType}`);
    queries.push(`site:jobs.ashbyhq.com ${workType}`);
  }
  
  return queries;
}

// Fetch page content with timeout
async function fetchPageContent(url: string, timeoutMs: number = 5000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.log(`Failed to fetch ${url}: ${response.status}`);
      return null;
    }
    
    const html = await response.text();
    return html;
  } catch (error) {
    console.log(`Error fetching ${url}:`, error);
    return null;
  }
}

// Extract job links from a job board page using AI
async function extractJobLinksFromPage(
  html: string,
  pageUrl: string,
  apiKey: string
): Promise<string[]> {
  // Truncate HTML to avoid token limits - focus on the main content
  const truncatedHtml = html.substring(0, 50000);
  
  const prompt = `Analyze this HTML from a job board page and extract all individual job posting URLs.
  
Page URL: ${pageUrl}

Look for:
- Links to individual job postings (not category pages or filters)
- URLs containing job IDs, position slugs, or specific role pages
- Common patterns: /jobs/123, /j/abc123, /positions/xyz

Return ONLY a JSON array of absolute URLs. If no job links found, return [].
Do not include duplicate URLs. Maximum 20 URLs.

HTML (truncated):
${truncatedHtml}`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "You extract job posting URLs from HTML. Always respond with valid JSON arrays only." },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      console.error("AI API error for link extraction:", response.status);
      return [];
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    const jsonMatch = content.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) return [];

    const urls = JSON.parse(jsonMatch[0]);
    return Array.isArray(urls) ? urls.filter((u: any) => typeof u === "string" && u.startsWith("http")) : [];
  } catch (error) {
    console.error("Link extraction error:", error);
    return [];
  }
}

// Extract job details from a job posting page using AI
async function extractJobDetails(
  html: string,
  pageUrl: string,
  apiKey: string
): Promise<{
  title: string | null;
  company: string | null;
  description: string | null;
  requirements: string[] | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  location: string | null;
}> {
  const truncatedHtml = html.substring(0, 60000);
  
  const prompt = `Extract job details from this job posting page.

Page URL: ${pageUrl}

Extract:
1. job_title: The exact job title
2. company_name: The company name
3. description: A summary of the role (2-3 sentences max)
4. requirements: Array of key requirements/qualifications (max 5 items)
5. salary_min: Minimum salary in annual USD (convert if needed)
6. salary_max: Maximum salary in annual USD
7. salary_currency: Original currency (USD, EUR, etc.)
8. location: Job location or "Remote"

Return as a JSON object. Use null for fields you can't find.

HTML (truncated):
${truncatedHtml}`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You extract structured job information from HTML. Always respond with valid JSON objects." },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      console.error("AI API error for job extraction:", response.status);
      return { title: null, company: null, description: null, requirements: null, salaryMin: null, salaryMax: null, salaryCurrency: null, location: null };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    const jsonMatch = content.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      return { title: null, company: null, description: null, requirements: null, salaryMin: null, salaryMax: null, salaryCurrency: null, location: null };
    }

    const details = JSON.parse(jsonMatch[0]);
    return {
      title: details.job_title || null,
      company: details.company_name || null,
      description: details.description || null,
      requirements: Array.isArray(details.requirements) ? details.requirements : null,
      salaryMin: details.salary_min ? Math.round(details.salary_min) : null,
      salaryMax: details.salary_max ? Math.round(details.salary_max) : null,
      salaryCurrency: details.salary_currency || null,
      location: details.location || null,
    };
  } catch (error) {
    console.error("Job extraction error:", error);
    return { title: null, company: null, description: null, requirements: null, salaryMin: null, salaryMax: null, salaryCurrency: null, location: null };
  }
}

// Process jobs in background and save to database
async function processAndSaveJobs(
  directPostings: ClassifiedJob[],
  maxResults: number,
  lovableApiKey: string,
  supabase: any,
  userId: string
): Promise<{ inserted: number; skipped: number; withSalary: number; withDescription: number }> {
  const enrichedJobs: ClassifiedJob[] = [];
  const jobsToProcess = directPostings.slice(0, Math.min(maxResults, 10)); // Reduced to 10 for speed
  
  // Process in parallel batches of 3 for speed
  for (let i = 0; i < jobsToProcess.length; i += 3) {
    const batch = jobsToProcess.slice(i, i + 3);
    const results = await Promise.all(
      batch.map(async (job) => {
        try {
          console.log(`Fetching job details: ${job.url}`);
          const html = await fetchPageContent(job.url, 4000); // Shorter timeout
          
          if (html) {
            const details = await extractJobDetails(html, job.url, lovableApiKey);
            return {
              ...job,
              title: details.title || job.title || "Untitled Position",
              snippet: details.description || job.snippet,
              fullDescription: details.description,
              requirements: details.requirements,
              salaryMin: details.salaryMin,
              salaryMax: details.salaryMax,
              salaryCurrency: details.salaryCurrency,
              companySlug: details.company || job.companySlug,
            };
          }
          return job;
        } catch (err) {
          console.error(`Error processing ${job.url}:`, err);
          return job;
        }
      })
    );
    enrichedJobs.push(...results);
  }
  
  // Insert into database
  let inserted = 0;
  let skipped = 0;
  let withSalary = 0;
  let withDescription = 0;
  
  for (const job of enrichedJobs) {
    const { error } = await supabase.from("discovered_jobs").upsert(
      {
        user_id: userId,
        url: job.url,
        title: job.title || "Untitled Position",
        snippet: job.fullDescription || job.snippet,
        ats_type: job.atsType,
        company_slug: job.companySlug,
        source: "serpapi_enriched",
        discovered_at: new Date().toISOString(),
        salary_min: job.salaryMin,
        salary_max: job.salaryMax,
        salary_currency: job.salaryCurrency || "USD",
      },
      { onConflict: "user_id,url" }
    );
    
    if (error) {
      console.error("Insert error:", error);
      skipped++;
    } else {
      inserted++;
      if (job.salaryMin || job.salaryMax) withSalary++;
      if (job.fullDescription) withDescription++;
    }
  }
  
  console.log(`Background processing complete: ${inserted} inserted, ${skipped} skipped`);
  return { inserted, skipped, withSalary, withDescription };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get SerpAPI key from environment
    const serpApiKey = Deno.env.get("SERPAPI_KEY");
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    
    if (!serpApiKey) {
      return new Response(
        JSON.stringify({ error: "SerpAPI key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    if (!lovableApiKey) {
      return new Response(
        JSON.stringify({ error: "AI API key not configured" }),
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
    
    // Use service role client for usage/subscription queries
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    
    // Get user's subscription tier
    const { data: subscription } = await serviceClient
      .from("subscriptions")
      .select("tier")
      .eq("user_id", userId)
      .single();
    
    const tier = (subscription?.tier || "free") as TierKey;
    const limits = TIER_LIMITS[tier];
    
    // Check and update usage
    const { data: usage } = await serviceClient
      .from("usage_tracking")
      .select("*")
      .eq("user_id", userId)
      .single();
    
    // Reset weekly counter if needed
    const now = new Date();
    let currentSearches = usage?.searches_this_week || 0;
    
    if (usage && new Date(usage.week_reset_at) <= now) {
      // Reset the counter
      currentSearches = 0;
      await serviceClient
        .from("usage_tracking")
        .update({ 
          searches_this_week: 0, 
          week_reset_at: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
        })
        .eq("user_id", userId);
    }
    
    // Check if user has exceeded their weekly limit
    if (limits.searchesPerWeek !== Infinity && currentSearches >= limits.searchesPerWeek) {
      return new Response(
        JSON.stringify({ 
          error: `Weekly search limit reached (${limits.searchesPerWeek} per week on ${tier} tier). Upgrade for more searches.`,
          limitReached: true,
          tier
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Increment search count
    await serviceClient
      .from("usage_tracking")
      .upsert({ 
        user_id: userId, 
        searches_this_week: currentSearches + 1,
        week_reset_at: usage?.week_reset_at || new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
      }, { onConflict: "user_id" });
    
    const maxResults = limits.resultsPerSearch;
    console.log(`User ${userId} (${tier} tier): search ${currentSearches + 1}/${limits.searchesPerWeek}, max results: ${maxResults}`);
    
    const queries = buildSearchQueries(profile || { target_roles: null, work_type: null, location_zip: null });
    
    console.log(`User preferences: work_type=${profile?.work_type}, location_zip=${profile?.location_zip}`);
    console.log(`Running ${queries.length} search queries for user ${userId}`);
    
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
    
    // Separate direct postings from board pages
    const directPostings = classifiedJobs.filter(j => j.isDirectPosting);
    const boardPages = classifiedJobs.filter(j => !j.isDirectPosting);
    
    console.log(`Direct postings: ${directPostings.length}, Board pages: ${boardPages.length}`);
    
    // Process board pages in parallel (limit to 3 for speed)
    const boardPagesToProcess = boardPages.slice(0, 3);
    const extractedJobUrls: string[] = [];
    
    const boardResults = await Promise.all(
      boardPagesToProcess.map(async (boardPage) => {
        console.log(`Fetching board page: ${boardPage.url}`);
        const html = await fetchPageContent(boardPage.url, 4000);
        
        if (html) {
          const jobLinks = await extractJobLinksFromPage(html, boardPage.url, lovableApiKey);
          console.log(`Extracted ${jobLinks.length} job links from ${boardPage.url}`);
          return jobLinks;
        }
        return [];
      })
    );
    
    boardResults.forEach(links => extractedJobUrls.push(...links));
    
    // Add extracted URLs to seenUrls set
    directPostings.forEach(p => seenUrls.add(p.url));
    
    // Add extracted URLs to direct postings
    for (const jobUrl of extractedJobUrls) {
      if (!seenUrls.has(jobUrl)) {
        seenUrls.add(jobUrl);
        const { type, companySlug } = classifyUrl(jobUrl);
        directPostings.push({
          url: jobUrl,
          title: "",
          snippet: "",
          atsType: type,
          companySlug,
          salaryMin: null,
          salaryMax: null,
          salaryCurrency: null,
          fullDescription: null,
          requirements: null,
          isDirectPosting: true,
        });
      }
    }
    
    console.log(`Total direct postings after extraction: ${directPostings.length}`);
    
    // Use background task for enrichment to avoid timeout
    const backgroundTask = processAndSaveJobs(
      directPostings,
      maxResults,
      lovableApiKey,
      supabase,
      userId
    );
    
    // Register background task to continue after response
    EdgeRuntime.waitUntil(backgroundTask);
    
    // Return immediately with preliminary results
    return new Response(
      JSON.stringify({
        success: true,
        queriesRun: queries.length,
        totalResults: uniqueResults.length,
        boardPagesScraped: boardPagesToProcess.length,
        extractedJobLinks: extractedJobUrls.length,
        enrichedJobs: Math.min(directPostings.length, maxResults, 10),
        inserted: Math.min(directPostings.length, maxResults, 10),
        skipped: 0,
        withSalary: 0,
        withDescription: 0,
        note: "Jobs are being enriched in the background. Refresh in a few seconds for full details.",
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
