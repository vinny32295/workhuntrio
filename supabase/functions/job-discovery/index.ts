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
  // Additional ATS platforms common for retail/entry-level
  icims: [/careers-(\w+)\.icims\.com/, /(\w+)\.icims\.com/],
  workday: [/(\w+)\.wd\d+\.myworkdayjobs\.com/],
  ultipro: [/recruiting\.ultipro\.com\/(\w+)/],
  applicantpro: [/(\w+)\.applicantpro\.com/],
  paylocity: [/recruiting\.paylocity\.com\/(\w+)/],
  adp: [/workforcenow\.adp\.com/],
  snagajob: [/snagajob\.com\/job-seeker\/jobs/],
};

// Patterns for individual job posting URLs (not just board pages)
const JOB_POSTING_PATTERNS: RegExp[] = [
  /boards\.greenhouse\.io\/\w+\/jobs\/\d+/,
  /jobs\.lever\.co\/\w+\/[\w-]+/,
  /apply\.workable\.com\/\w+\/j\/[\w-]+/,
  /jobs\.ashbyhq\.com\/\w+\/[\w-]+/,
  /\w+\.bamboohr\.com\/careers\/\d+/,
  // Retail/entry-level ATS patterns
  /careers-\w+\.icims\.com\/jobs\/\d+/,
  /\w+\.wd\d+\.myworkdayjobs\.com\/.*\/job\//,
  /recruiting\.ultipro\.com\/\w+\/JobBoard\/.*\/OpportunityDetail/,
  /\w+\.applicantpro\.com\/jobs\/\d+/,
];

// Domains to completely skip (no useful job data)
const SKIP_DOMAINS = [
  // Social media
  "linkedin.com", "facebook.com", "twitter.com", "instagram.com",
  "youtube.com", "reddit.com",
];

// Job aggregators - we'll scrape these for direct company links instead of skipping
const AGGREGATOR_DOMAINS = [
  "glassdoor.com", "indeed.com", "ziprecruiter.com", "monster.com",
  "careerbuilder.com", "simplyhired.com", "snagajob.com", "dice.com",
  "randstadusa.com", "randstad.com", "roberthalf.com", "kellyservices.com",
  "manpower.com", "adecco.com", "expresspros.com", "spherion.com",
  "aerotek.com", "insight.com", "staffingindustry.com",
  "jooble.org", "adzuna.com", "jobrapido.com", "neuvoo.com", "talent.com",
  "learn4good.com", "jobisland.com", "lensa.com", "getwork.com",
  "jobs2careers.com", "jobcase.com", "recruit.net",
];

// Check if URL is from an aggregator
function isAggregatorUrl(url: string): boolean {
  const urlLower = url.toLowerCase();
  return AGGREGATOR_DOMAINS.some(domain => urlLower.includes(domain));
}

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

// Filter and classify search results - now returns aggregator URLs separately
function filterResults(results: SearchResult[]): { 
  classified: ClassifiedJob[]; 
  aggregatorUrls: string[];
} {
  const classified: ClassifiedJob[] = [];
  const aggregatorUrls: string[] = [];
  
  for (const result of results) {
    const url = result.url.toLowerCase();
    
    // Skip irrelevant domains
    if (SKIP_DOMAINS.some(domain => url.includes(domain))) continue;
    
    // Skip non-HTML files
    if (/\.(pdf|doc|png|jpg|jpeg|gif)$/i.test(url)) continue;
    
    // Collect aggregator URLs for later processing
    if (isAggregatorUrl(result.url)) {
      aggregatorUrls.push(result.url);
      continue;
    }
    
    const { type, companySlug } = classifyUrl(result.url);
    
    // Check if URL looks like a job/careers page (be more inclusive for trade/local jobs)
    const looksLikeJobPage = /\/(careers?|jobs?|employment|work-with-us|join-us|hiring|positions?|openings?|apply|opportunities)/i.test(url);
    
    // Include if we can classify it OR if it looks like a job page
    if (type || looksLikeJobPage) {
      // Try to extract company from URL if not already classified
      let finalCompanySlug = companySlug;
      if (!finalCompanySlug) {
        try {
          const hostname = new URL(result.url).hostname.replace("www.", "");
          finalCompanySlug = hostname.split(".")[0];
        } catch {
          finalCompanySlug = null;
        }
      }
      
      classified.push({
        url: result.url,
        title: result.title,
        snippet: result.snippet,
        atsType: type || "careers_page",
        companySlug: finalCompanySlug,
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: null,
        fullDescription: null,
        requirements: null,
        isDirectPosting: isDirectJobPosting(result.url) || /\/jobs?\/\d+|\/position\/|\/opening\//i.test(url),
      });
    }
  }
  
  return { classified, aggregatorUrls };
}

// Scrape aggregator page using Firecrawl (handles anti-bot protection)
async function scrapeAggregatorWithFirecrawl(url: string): Promise<string | null> {
  const firecrawlApiKey = Deno.env.get("FIRECRAWL_API_KEY");
  
  if (!firecrawlApiKey) {
    console.log("Firecrawl API key not configured, falling back to direct fetch");
    return null;
  }
  
  try {
    console.log(`Scraping aggregator with Firecrawl: ${url}`);
    
    const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${firecrawlApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["html", "links"],
        onlyMainContent: false,
        waitFor: 2000, // Wait for dynamic content to load
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Firecrawl error for ${url}: ${response.status} - ${errorText}`);
      return null;
    }
    
    const data = await response.json();
    
    if (data.success && data.data?.html) {
      console.log(`Firecrawl successfully scraped ${url}`);
      return data.data.html;
    }
    
    return null;
  } catch (error) {
    console.error(`Firecrawl error for ${url}:`, error);
    return null;
  }
}

// Extract direct company job links from aggregator pages
async function extractDirectLinksFromAggregator(
  html: string,
  pageUrl: string,
  apiKey: string
): Promise<string[]> {
  const truncatedHtml = html.substring(0, 60000);
  
  const prompt = `This is HTML from a job aggregator page (like Monster, Indeed, Snagajob, etc.).
  
Page URL: ${pageUrl}

Your task: Find DIRECT LINKS to company job applications. These could be:

1. "Apply on company site" or "Apply directly" buttons
2. Links containing company names + "/careers/" or "/jobs/"
3. Links to known ATS platforms: greenhouse, lever, workable, ashby, bamboohr, icims, myworkdayjobs, ultipro
4. Any external links that go to a company's own website (not this aggregator)
5. Job posting URLs embedded in data attributes or onclick handlers

Common patterns for retail/entry-level job links:
- company.com/careers/job/12345
- jobs.company.com/position/cashier
- company.applicantpro.com/jobs/
- recruiting.ultipro.com/company
- company.wd5.myworkdayjobs.com

Also check for:
- href attributes pointing to external domains
- data-href or data-url attributes
- Links in "company" or "employer" sections

DO NOT include:
- Links that stay on ${new URL(pageUrl).hostname}
- "Easy Apply" or "Quick Apply" buttons (these are aggregator applications)
- Links to other aggregators (indeed, glassdoor, linkedin, ziprecruiter, monster)
- Social media links

Return ONLY a JSON array of absolute URLs to direct company job postings. Maximum 20 URLs.
If no direct company links found, return [].

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
          { role: "system", content: "You extract direct company job URLs from aggregator pages. Only return URLs to actual company career pages, not aggregator links. Always respond with valid JSON arrays." },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      console.error("AI API error for aggregator extraction:", response.status);
      return [];
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    const jsonMatch = content.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) return [];

    const urls = JSON.parse(jsonMatch[0]);
    
    // Filter to only include valid URLs that aren't aggregators
    return Array.isArray(urls) 
      ? urls.filter((u: any) => 
          typeof u === "string" && 
          u.startsWith("http") && 
          !isAggregatorUrl(u) &&
          !SKIP_DOMAINS.some(domain => u.toLowerCase().includes(domain))
        )
      : [];
  } catch (error) {
    console.error("Aggregator extraction error:", error);
    return [];
  }
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
const ZIP_TO_LOCATION: Record<string, { name: string; lat: number; lon: number }> = {
  "37": { name: "Tennessee", lat: 36.1627, lon: -86.7816 },
  "30": { name: "Georgia Atlanta", lat: 33.749, lon: -84.388 },
  "10": { name: "New York NYC", lat: 40.7128, lon: -74.006 },
  "90": { name: "Los Angeles California", lat: 34.0522, lon: -118.2437 },
  "94": { name: "San Francisco Bay Area", lat: 37.7749, lon: -122.4194 },
  "98": { name: "Seattle Washington", lat: 47.6062, lon: -122.3321 },
  "60": { name: "Chicago Illinois", lat: 41.8781, lon: -87.6298 },
  "02": { name: "Boston Massachusetts", lat: 42.3601, lon: -71.0589 },
  "78": { name: "Texas Austin", lat: 30.2672, lon: -97.7431 },
  "75": { name: "Dallas Texas", lat: 32.7767, lon: -96.797 },
  "33": { name: "Florida Miami", lat: 25.7617, lon: -80.1918 },
  "20": { name: "Washington DC", lat: 38.9072, lon: -77.0369 },
  "80": { name: "Denver Colorado", lat: 39.7392, lon: -104.9903 },
  "85": { name: "Phoenix Arizona", lat: 33.4484, lon: -112.074 },
};

// More specific ZIP code mappings for Tennessee
const ZIP_TO_COORDS: Record<string, { lat: number; lon: number; city: string }> = {
  "37075": { lat: 36.3884, lon: -86.4539, city: "Hendersonville, TN" },
  "37027": { lat: 35.9981, lon: -86.6847, city: "Brentwood, TN" },
  "37209": { lat: 36.1470, lon: -86.9017, city: "Nashville, TN" },
  "37203": { lat: 36.1498, lon: -86.7919, city: "Nashville, TN" },
};

function getLocationFromZip(zip: string | null): string | null {
  if (!zip || zip.length < 2) return null;
  const prefix = zip.substring(0, 2);
  return ZIP_TO_LOCATION[prefix]?.name || null;
}

function getCoordsFromZip(zip: string | null): { lat: number; lon: number } | null {
  if (!zip) return null;
  
  // Try exact match first
  if (ZIP_TO_COORDS[zip]) {
    return { lat: ZIP_TO_COORDS[zip].lat, lon: ZIP_TO_COORDS[zip].lon };
  }
  
  // Fall back to prefix-based coords
  const prefix = zip.substring(0, 2);
  if (ZIP_TO_LOCATION[prefix]) {
    return { lat: ZIP_TO_LOCATION[prefix].lat, lon: ZIP_TO_LOCATION[prefix].lon };
  }
  
  return null;
}

// Calculate distance between two coordinates using Haversine formula
function calculateDistanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Validate job location using AI
async function validateJobLocation(
  jobLocation: string | null,
  userZip: string,
  radiusMiles: number,
  apiKey: string
): Promise<{ isValid: boolean; distance: number | null; reason: string }> {
  // If no location found, allow the job through (can't verify it's outside radius)
  if (!jobLocation) {
    return { isValid: true, distance: null, reason: "No location found - allowing" };
  }
  
  // Remote jobs are always valid
  if (/remote|work from home|wfh|anywhere/i.test(jobLocation)) {
    return { isValid: true, distance: 0, reason: "Remote position" };
  }
  
  const userCoords = getCoordsFromZip(userZip);
  if (!userCoords) {
    console.log(`Could not get coordinates for ZIP ${userZip}`);
    return { isValid: true, distance: null, reason: "Could not validate - allowing" };
  }
  
  // Use AI to extract coordinates from job location
  const prompt = `Given this job location: "${jobLocation}"

Extract the approximate latitude and longitude coordinates. 
If it's a city, use the city center coordinates.
If it's a state or region, use the capital or largest city.
If it contains multiple locations, use the first one.

Return ONLY a JSON object like: {"lat": 36.1627, "lon": -86.7816, "city": "Nashville, TN"}
If the location is "Remote" or similar, return: {"remote": true}
If you cannot determine the location, return: {"unknown": true}`;

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
          { role: "system", content: "You convert location names to coordinates. Always respond with valid JSON only." },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      console.error("AI API error for location validation:", response.status);
      return { isValid: true, distance: null, reason: "API error - allowing" };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*?\}/);
    
    if (!jsonMatch) {
      return { isValid: true, distance: null, reason: "Could not parse - allowing" };
    }

    const coords = JSON.parse(jsonMatch[0]);
    
    if (coords.remote) {
      return { isValid: true, distance: 0, reason: "Remote position" };
    }
    
    if (coords.unknown || !coords.lat || !coords.lon) {
      return { isValid: true, distance: null, reason: "Unknown location - allowing" };
    }
    
    const distance = calculateDistanceMiles(userCoords.lat, userCoords.lon, coords.lat, coords.lon);
    const isValid = distance <= radiusMiles;
    
    return {
      isValid,
      distance: Math.round(distance),
      reason: isValid 
        ? `Within ${radiusMiles} miles (${Math.round(distance)} mi from ${userZip})`
        : `Too far: ${Math.round(distance)} miles from ${userZip} (max ${radiusMiles} mi)`
    };
  } catch (error) {
    console.error("Location validation error:", error);
    return { isValid: true, distance: null, reason: "Validation error - allowing" };
  }
}

// Roles that are typically entry-level / retail / hourly / trades
const ENTRY_LEVEL_ROLES = [
  "cashier", "retail", "sales associate", "store clerk", "barista", 
  "server", "waiter", "waitress", "host", "hostess", "busser", 
  "cook", "line cook", "prep cook", "dishwasher", "fast food",
  "warehouse", "stocker", "stock", "inventory", "picker", "packer",
  "customer service", "front desk", "receptionist", "call center",
  "driver", "delivery", "courier", "cleaning", "janitor", "housekeeper",
  "security", "guard", "laborer", "construction", "hvac", "technician",
  "mechanic", "plumber", "electrician", "maintenance", "apprentice",
  "journeyman", "helper", "installer", "repair"
];

// Trade/skilled labor roles that need specific search strategies
const TRADE_ROLES = [
  "electrician", "plumber", "hvac", "carpenter", "welder", "mechanic",
  "technician", "maintenance", "installer", "apprentice", "journeyman",
  "contractor", "construction", "lineman", "cable", "solar"
];

function isEntryLevelRole(role: string): boolean {
  const roleLower = role.toLowerCase();
  return ENTRY_LEVEL_ROLES.some(r => roleLower.includes(r));
}

function isTradeRole(role: string): boolean {
  const roleLower = role.toLowerCase();
  return TRADE_ROLES.some(r => roleLower.includes(r));
}

// Map ZIP prefix to specific cities for better search targeting
const ZIP_TO_CITIES: Record<string, string[]> = {
  "37": ["Nashville", "Memphis", "Knoxville", "Chattanooga", "Murfreesboro", "Clarksville"],
  "30": ["Atlanta", "Marietta", "Alpharetta", "Roswell"],
  "10": ["New York", "Manhattan", "Brooklyn"],
  "90": ["Los Angeles", "Long Beach", "Pasadena"],
  "94": ["San Francisco", "Oakland", "San Jose"],
  "98": ["Seattle", "Tacoma", "Bellevue"],
  "60": ["Chicago", "Evanston", "Oak Park"],
  "75": ["Dallas", "Fort Worth", "Plano", "Irving"],
  "78": ["Austin", "San Antonio", "Round Rock"],
  "33": ["Miami", "Fort Lauderdale", "West Palm Beach"],
  "80": ["Denver", "Aurora", "Boulder"],
};

function getCitiesFromZip(zip: string | null): string[] {
  if (!zip || zip.length < 2) return [];
  const prefix = zip.substring(0, 2);
  return ZIP_TO_CITIES[prefix] || [];
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
  const cities = getCitiesFromZip(preferences.location_zip);
  const primaryCity = cities[0] || location || "";
  
  // For in-person or hybrid, include location in searches
  const locationTerm = (workType === "in-person" || workType === "hybrid") && location 
    ? location 
    : "";
  
  for (const role of roles.slice(0, 3)) {
    const isEntryLevel = isEntryLevelRole(role);
    const isTrade = isTradeRole(role);
    
    if (workType === "remote") {
      // Remote searches - target specific job postings, not just boards
      queries.push(`site:boards.greenhouse.io/*/jobs remote "${role}"`);
      queries.push(`site:jobs.lever.co remote "${role}" apply`);
      queries.push(`remote "${role}" jobs hiring 2026`);
    } else if (isTrade) {
      // Trade/skilled labor jobs - these are on contractor sites, unions, and specialty boards
      // Use city name for more specific results
      queries.push(`"${role}" jobs "${primaryCity}" hiring now`);
      queries.push(`"${role}" "${primaryCity}" careers apply`);
      queries.push(`"${role}" contractor "${locationTerm}" employment`);
      queries.push(`"hiring ${role}" near "${primaryCity}" full time`);
      // Target company career pages directly
      queries.push(`"${role}" jobs site:*.com/careers "${locationTerm}"`);
      // Try specific employers
      queries.push(`"${role}" "${primaryCity}" -indeed -linkedin -glassdoor -ziprecruiter apply`);
    } else if (isEntryLevel) {
      // Entry-level/retail jobs - focus on aggregators and direct company searches
      queries.push(`"${role}" jobs "${locationTerm}" hiring now apply`);
      queries.push(`"${role}" "${locationTerm}" careers site:*.com/careers`);
      queries.push(`site:snagajob.com "${role}" ${locationTerm}`);
      queries.push(`"${role}" jobs near ${locationTerm} apply online`);
      queries.push(`"now hiring" "${role}" ${locationTerm}`);
    } else {
      // Professional in-person/hybrid - include ATS sites
      queries.push(`site:boards.greenhouse.io/*/jobs ${locationTerm} "${role}"`);
      queries.push(`site:jobs.lever.co ${locationTerm} "${role}" apply`);
      queries.push(`"${role}" jobs ${locationTerm} hiring 2026`);
      queries.push(`${workType} "${role}" jobs ${locationTerm}`);
    }
  }
  
  // Add ATS searches for non-entry-level roles
  const hasNonEntryLevel = roles.some(r => !isEntryLevelRole(r) && !isTradeRole(r));
  if (hasNonEntryLevel) {
    if (locationTerm) {
      queries.push(`site:apply.workable.com/*/j ${locationTerm}`);
      queries.push(`site:jobs.ashbyhq.com ${locationTerm}`);
    } else {
      queries.push(`site:apply.workable.com/*/j ${workType}`);
      queries.push(`site:jobs.ashbyhq.com ${workType}`);
    }
  }
  
  return queries;
}

// Fetch result type to distinguish between 404 and other errors
interface FetchResult {
  html: string | null;
  is404: boolean;
  status: number | null;
}

// Fetch page content with timeout
async function fetchPageContent(url: string, timeoutMs: number = 5000): Promise<FetchResult> {
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
      // Track 404s specifically so we can filter them out
      const is404 = response.status === 404 || response.status === 410; // 410 = Gone
      return { html: null, is404, status: response.status };
    }
    
    const html = await response.text();
    return { html, is404: false, status: response.status };
  } catch (error) {
    console.log(`Error fetching ${url}:`, error);
    return { html: null, is404: false, status: null };
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
  userId: string,
  userPreferences: { work_type: string | null; location_zip: string | null; search_radius_miles: number | null }
): Promise<{ inserted: number; skipped: number; withSalary: number; withDescription: number; filteredByLocation: number }> {
  const enrichedJobs: (ClassifiedJob & { extractedLocation: string | null })[] = [];
  const jobsToProcess = directPostings.slice(0, Math.min(maxResults, 10)); // Reduced to 10 for speed
  
  const requiresLocationValidation = 
    (userPreferences.work_type === "in-person" || userPreferences.work_type === "hybrid") &&
    userPreferences.location_zip;
  
  const radiusMiles = userPreferences.search_radius_miles || 50;
  
  console.log(`Location validation: ${requiresLocationValidation ? `enabled (${radiusMiles} mi from ${userPreferences.location_zip})` : "disabled (remote)"}`);
  
  // Process in parallel batches of 3 for speed
  for (let i = 0; i < jobsToProcess.length; i += 3) {
    const batch = jobsToProcess.slice(i, i + 3);
    const results = await Promise.all(
      batch.map(async (job) => {
        try {
          console.log(`Fetching job details: ${job.url}`);
          const fetchResult = await fetchPageContent(job.url, 4000); // Shorter timeout
          
          // Skip 404 pages entirely - they shouldn't appear in discovered jobs
          if (fetchResult.is404) {
            console.log(`Skipping 404 page: ${job.url}`);
            return null; // Return null to filter out later
          }
          
          if (fetchResult.html) {
            const details = await extractJobDetails(fetchResult.html, job.url, lovableApiKey);
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
              extractedLocation: details.location,
            };
          }
          return { ...job, extractedLocation: null };
        } catch (err) {
          console.error(`Error processing ${job.url}:`, err);
          return { ...job, extractedLocation: null };
        }
      })
    );
    // Filter out null results (404 pages)
    enrichedJobs.push(...results.filter((r): r is NonNullable<typeof r> => r !== null));
  }
  
  // Insert into database with location validation
  let inserted = 0;
  let skipped = 0;
  let withSalary = 0;
  let withDescription = 0;
  let filteredByLocation = 0;
  
  for (const job of enrichedJobs) {
    // Validate location for in-person/hybrid jobs
    if (requiresLocationValidation) {
      const validation = await validateJobLocation(
        job.extractedLocation,
        userPreferences.location_zip!,
        radiusMiles,
        lovableApiKey
      );
      
      console.log(`Location check for ${job.title}: ${job.extractedLocation} -> ${validation.reason}`);
      
      if (!validation.isValid) {
        console.log(`Skipping job outside radius: ${job.title} at ${job.extractedLocation}`);
        filteredByLocation++;
        continue;
      }
    }
    
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
  
  console.log(`Background processing complete: ${inserted} inserted, ${skipped} skipped, ${filteredByLocation} filtered by location`);
  return { inserted, skipped, withSalary, withDescription, filteredByLocation };
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
      .select("target_roles, work_type, location_zip, search_radius_miles")
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
    
    const { classified: classifiedJobs, aggregatorUrls } = filterResults(uniqueResults);
    
    console.log(`Found ${classifiedJobs.length} relevant jobs, ${aggregatorUrls.length} aggregator pages from ${uniqueResults.length} unique results`);
    
    // Separate direct postings from board pages
    const directPostings: ClassifiedJob[] = classifiedJobs.filter(j => j.isDirectPosting);
    const boardPages = classifiedJobs.filter(j => !j.isDirectPosting);
    
    console.log(`Direct postings: ${directPostings.length}, Board pages: ${boardPages.length}, Aggregators: ${aggregatorUrls.length}`);
    
    // Process board pages in parallel (limit to 3 for speed)
    const boardPagesToProcess = boardPages.slice(0, 3);
    const extractedJobUrls: string[] = [];
    
    const boardResults = await Promise.all(
      boardPagesToProcess.map(async (boardPage: ClassifiedJob) => {
        console.log(`Fetching board page: ${boardPage.url}`);
        const fetchResult = await fetchPageContent(boardPage.url, 4000);
        
        if (fetchResult.html && !fetchResult.is404) {
          const jobLinks = await extractJobLinksFromPage(fetchResult.html, boardPage.url, lovableApiKey);
          console.log(`Extracted ${jobLinks.length} job links from ${boardPage.url}`);
          return jobLinks;
        }
        return [];
      })
    );
    
    boardResults.forEach((links: string[]) => extractedJobUrls.push(...links));
    
    // Process aggregator pages to extract direct company links (limit to 3 for speed)
    const aggregatorsToProcess = aggregatorUrls.slice(0, 3);
    const directLinksFromAggregators: string[] = [];
    
    if (aggregatorsToProcess.length > 0) {
      console.log(`Processing ${aggregatorsToProcess.length} aggregator pages for direct links...`);
      
      const aggregatorResults = await Promise.all(
        aggregatorsToProcess.map(async (aggUrl: string) => {
          console.log(`Extracting direct links from aggregator: ${aggUrl}`);
          
          // Try Firecrawl first (handles anti-bot), fall back to direct fetch
          let html: string | null = await scrapeAggregatorWithFirecrawl(aggUrl);
          
          if (!html) {
            console.log(`Firecrawl failed for ${aggUrl}, trying direct fetch...`);
            const fetchResult = await fetchPageContent(aggUrl, 5000);
            html = fetchResult.is404 ? null : fetchResult.html;
          }
          
          if (html) {
            const directLinks = await extractDirectLinksFromAggregator(html, aggUrl, lovableApiKey);
            console.log(`Found ${directLinks.length} direct company links from ${aggUrl}`);
            return directLinks;
          }
          
          console.log(`Could not scrape ${aggUrl}`);
          return [];
        })
      );
      
      aggregatorResults.forEach((links: string[]) => directLinksFromAggregators.push(...links));
      console.log(`Total direct links from aggregators: ${directLinksFromAggregators.length}`);
    }
    
    // Add extracted URLs to seenUrls set
    directPostings.forEach((p: ClassifiedJob) => seenUrls.add(p.url));
    
    // Add extracted URLs from board pages
    for (const jobUrl of extractedJobUrls) {
      if (!seenUrls.has(jobUrl) && !isAggregatorUrl(jobUrl)) {
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
    
    // Add direct links from aggregator pages
    for (const jobUrl of directLinksFromAggregators) {
      if (!seenUrls.has(jobUrl)) {
        seenUrls.add(jobUrl);
        const { type, companySlug } = classifyUrl(jobUrl);
        directPostings.push({
          url: jobUrl,
          title: "",
          snippet: "",
          atsType: type || "careers_page",
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
    
    console.log(`Total direct postings after all extraction: ${directPostings.length}`);
    
    // Use background task for enrichment to avoid timeout
    const backgroundTask = processAndSaveJobs(
      directPostings,
      maxResults,
      lovableApiKey,
      supabase,
      userId,
      {
        work_type: profile?.work_type || null,
        location_zip: profile?.location_zip || null,
        search_radius_miles: profile?.search_radius_miles || 50,
      }
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
