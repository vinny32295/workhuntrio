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
  free: { searchesPerWeek: 1, resultsPerSearch: 10 },
  pro: { searchesPerWeek: 3, resultsPerSearch: 50 },
  premium: { searchesPerWeek: Infinity, resultsPerSearch: 100 },
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
  isFromTargetUrl?: boolean; // Jobs from user's target URLs bypass relevance filtering
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

// Known company Workday URLs (since Workday URLs are hard to discover)
const KNOWN_WORKDAY_COMPANIES: Record<string, string> = {
  "alliancebernstein": "https://abglobal.wd1.myworkdayjobs.com/alliancebernsteincareers",
  "alliance bernstein": "https://abglobal.wd1.myworkdayjobs.com/alliancebernsteincareers",
  "ab global": "https://abglobal.wd1.myworkdayjobs.com/alliancebernsteincareers",
  "hca healthcare": "https://hcahealthcare.wd1.myworkdayjobs.com/HCAHealthcare",
  "hca": "https://hcahealthcare.wd1.myworkdayjobs.com/HCAHealthcare",
  "nissan": "https://nissan.wd1.myworkdayjobs.com/Nissan_Careers",
  "bridgestone": "https://bridgestone.wd1.myworkdayjobs.com/External",
  "amazon": "https://amazon.jobs",
  "google": "https://careers.google.com",
  "microsoft": "https://careers.microsoft.com",
  "walmart": "https://careers.walmart.com",
  "target": "https://jobs.target.com",
  "ups": "https://www.jobs-ups.com",
  "fedex": "https://careers.fedex.com",
  "delta": "https://delta.wd5.myworkdayjobs.com/delta",
  "asurion": "https://asurion.wd1.myworkdayjobs.com/Asurion",
  "dollar general": "https://dollargeneral.wd1.myworkdayjobs.com/DollarGeneral",
  "lowes": "https://talent.lowes.com",
  "home depot": "https://careers.homedepot.com",
  "kroger": "https://jobs.kroger.com",
  "publix": "https://careers.publix.com",
  "caterpillar": "https://caterpillar.wd5.myworkdayjobs.com/CaterpillarCareers",
  "deloitte": "https://apply.deloitte.com",
  "kpmg": "https://kpmgus.wd5.myworkdayjobs.com/KPMG",
  "ernst young": "https://careers.ey.com",
  "ey": "https://careers.ey.com",
  "pwc": "https://pwc.wd1.myworkdayjobs.com/Global_Experienced_Careers",
};

// Hardcoded major employers by city (to guarantee discovery)
const CITY_MAJOR_EMPLOYERS: Record<string, { name: string; careersUrl: string }[]> = {
  "nashville": [
    { name: "AllianceBernstein", careersUrl: "https://abglobal.wd1.myworkdayjobs.com/alliancebernsteincareers" },
    { name: "HCA Healthcare", careersUrl: "https://hcahealthcare.wd1.myworkdayjobs.com/HCAHealthcare" },
    { name: "Nissan North America", careersUrl: "https://nissan.wd1.myworkdayjobs.com/Nissan_Careers" },
    { name: "Asurion", careersUrl: "https://asurion.wd1.myworkdayjobs.com/Asurion" },
    { name: "Bridgestone Americas", careersUrl: "https://bridgestone.wd1.myworkdayjobs.com/External" },
    { name: "Dollar General", careersUrl: "https://dollargeneral.wd1.myworkdayjobs.com/DollarGeneral" },
  ],
  "atlanta": [
    { name: "Delta Air Lines", careersUrl: "https://delta.wd5.myworkdayjobs.com/delta" },
    { name: "Home Depot", careersUrl: "https://careers.homedepot.com" },
    { name: "UPS", careersUrl: "https://www.jobs-ups.com" },
    { name: "Coca-Cola", careersUrl: "https://coke.wd1.myworkdayjobs.com/coca-cola-careers" },
  ],
  "new york": [
    { name: "JPMorgan Chase", careersUrl: "https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience" },
    { name: "Citigroup", careersUrl: "https://citi.wd5.myworkdayjobs.com/2" },
    { name: "Goldman Sachs", careersUrl: "https://www.goldmansachs.com/careers" },
  ],
  "chicago": [
    { name: "Boeing", careersUrl: "https://boeing.wd1.myworkdayjobs.com/external" },
    { name: "United Airlines", careersUrl: "https://careers.united.com" },
    { name: "Walgreens", careersUrl: "https://jobs.walgreens.com" },
  ],
};

// Get known careers URL for a company name
function getKnownCareersUrl(companyName: string): string | null {
  const normalized = companyName.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  
  // Direct match
  if (KNOWN_WORKDAY_COMPANIES[normalized]) {
    return KNOWN_WORKDAY_COMPANIES[normalized];
  }
  
  // Fuzzy match - check if company name contains or is contained by known keys
  for (const [knownName, knownUrl] of Object.entries(KNOWN_WORKDAY_COMPANIES)) {
    const normalizedKnown = knownName.toLowerCase().replace(/[^a-z0-9\s]/g, "");
    if (normalized.includes(normalizedKnown) || normalizedKnown.includes(normalized)) {
      return knownUrl;
    }
  }
  
  return null;
}

// Discover major local companies based on location using AI + web search
async function discoverLocalCompanies(
  city: string,
  serpApiKey: string,
  lovableApiKey: string
): Promise<{ name: string; careersUrl: string | null }[]> {
  console.log(`Discovering local companies in ${city}...`);
  
  const companiesWithCareers: { name: string; careersUrl: string | null }[] = [];
  const cityLower = city.toLowerCase();
  
  // First, add any hardcoded employers for this city
  for (const [cityKey, employers] of Object.entries(CITY_MAJOR_EMPLOYERS)) {
    if (cityLower.includes(cityKey) || cityKey.includes(cityLower.split(",")[0].trim())) {
      console.log(`Found ${employers.length} hardcoded employers for ${cityKey}`);
      for (const employer of employers) {
        companiesWithCareers.push({ name: employer.name, careersUrl: employer.careersUrl });
        console.log(`Added hardcoded: ${employer.name} -> ${employer.careersUrl}`);
      }
    }
  }
  
  // If we already have hardcoded companies, we can return early or continue with discovery
  if (companiesWithCareers.length >= 4) {
    console.log(`Using ${companiesWithCareers.length} hardcoded companies for ${city}`);
    return companiesWithCareers;
  }
  
  // Search for additional major employers in the area
  const searchQueries = [
    `"${city}" major employers headquarters companies`,
    `top companies to work for in ${city}`,
  ];
  
  const companyMentions: string[] = [];
  
  for (const query of searchQueries) {
    try {
      const results = await serpApiSearch(query, serpApiKey, 5);
      for (const result of results) {
        companyMentions.push(`${result.title}: ${result.snippet}`);
      }
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (err) {
      console.error(`Company search failed: ${err}`);
    }
  }
  
  if (companyMentions.length === 0) {
    console.log("No additional company mentions found via search");
    return companiesWithCareers;
  }
  
  // Use AI to extract company names from the search results
  const prompt = `Based on these search results about companies in ${city}, extract a list of major company names that likely have headquarters or large offices there.

Search results:
${companyMentions.slice(0, 15).join("\n")}

Return ONLY a JSON array of company names (strings). Focus on:
- Companies with headquarters in the area
- Major employers with offices there
- Well-known brands with significant presence

Exclude:
- Staffing/recruiting agencies
- Generic terms like "top companies"
- Government entities (unless they're known employers)

Return 5-10 company names. Example: ["AllianceBernstein", "Nissan", "HCA Healthcare"]`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "You extract company names from text. Always respond with valid JSON arrays only." },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      console.error("AI API error for company extraction:", response.status);
      return companiesWithCareers;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const jsonMatch = content.match(/\[[\s\S]*?\]/);
    
    if (!jsonMatch) {
      console.log("Could not parse company list from AI");
      return companiesWithCareers;
    }

    const companies = JSON.parse(jsonMatch[0]) as string[];
    console.log(`AI discovered ${companies.length} companies: ${companies.join(", ")}`);
    
    // Check existing company names to avoid duplicates
    const existingNames = new Set(companiesWithCareers.map(c => c.name.toLowerCase()));
    
    // Find career pages for discovered companies
    for (const company of companies.slice(0, 6)) {
      if (existingNames.has(company.toLowerCase())) continue;
      
      // First check if we have a known URL
      const knownUrl = getKnownCareersUrl(company);
      if (knownUrl) {
        companiesWithCareers.push({ name: company, careersUrl: knownUrl });
        console.log(`${company}: matched known URL -> ${knownUrl}`);
        continue;
      }
      
      // Search for career page
      try {
        const careerResults = await serpApiSearch(
          `"${company}" careers site:myworkdayjobs.com OR site:greenhouse.io OR site:lever.co OR "${company}" careers apply`,
          serpApiKey,
          5
        );
        
        let careersUrl: string | null = null;
        for (const result of careerResults) {
          const urlLower = result.url.toLowerCase();
          
          // Skip aggregators
          if (["glassdoor", "indeed", "linkedin", "ziprecruiter", "monster"].some(agg => urlLower.includes(agg))) {
            continue;
          }
          
          // Accept Workday, Greenhouse, Lever, or /careers pages
          if (
            urlLower.includes("myworkdayjobs.com") ||
            urlLower.includes("greenhouse") ||
            urlLower.includes("lever") ||
            urlLower.includes("/careers") ||
            urlLower.includes("/jobs")
          ) {
            careersUrl = result.url;
            break;
          }
        }
        
        if (careersUrl) {
          companiesWithCareers.push({ name: company, careersUrl });
          console.log(`${company}: discovered -> ${careersUrl}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (err) {
        console.error(`Career search failed for ${company}: ${err}`);
      }
    }
    
    return companiesWithCareers;
  } catch (error) {
    console.error("Company discovery error:", error);
    return companiesWithCareers;
  }
}

// Search Workday career pages using Firecrawl (Workday is heavily JS-rendered)
async function searchWorkdayCareerPage(
  companyName: string,
  careersUrl: string,
  targetRoles: string[],
  serpApiKey: string,
  lovableApiKey?: string
): Promise<ClassifiedJob[]> {
  console.log(`Searching Workday page for ${companyName}: ${careersUrl}`);
  
  const jobs: ClassifiedJob[] = [];
  const firecrawlApiKey = Deno.env.get("FIRECRAWL_API_KEY");
  const apiKey = lovableApiKey || Deno.env.get("LOVABLE_API_KEY") || "";
  
  // Extract the Workday domain
  let workdayDomain: string;
  let baseUrl: string;
  try {
    const url = new URL(careersUrl);
    workdayDomain = url.hostname;
    // Get the base path (e.g., /alliancebernsteincareers)
    baseUrl = `${url.origin}${url.pathname.split('?')[0]}`;
  } catch {
    console.error(`Invalid Workday URL: ${careersUrl}`);
    return [];
  }
  
  // Try Firecrawl first - scrape the Workday page with search query
  // Use all target roles (up to 4) to maximize job capture
  if (firecrawlApiKey && apiKey) {
    // First, try WITHOUT search query to get all available jobs
    try {
      console.log(`Firecrawl scraping Workday (all jobs): ${baseUrl}`);
      
      const allJobsResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${firecrawlApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: baseUrl,
          formats: ["html", "links"],
          onlyMainContent: false,
          waitFor: 5000, // Wait longer for Workday to fully render job list
        }),
      });
      
      if (allJobsResponse.ok) {
        const data = await allJobsResponse.json();
        if (data.success && data.data?.html) {
          console.log(`Firecrawl got Workday HTML for ${companyName} (all jobs view)`);
          
          // Extract ALL job listings from the main page
          const extractedJobs = await extractWorkdayJobsFromHtml(
            data.data.html,
            baseUrl,
            companyName,
            "", // No specific role filter
            apiKey
          );
          
          for (const job of extractedJobs) {
            if (!jobs.some(j => j.url === job.url)) {
              jobs.push(job);
            }
          }
          
          console.log(`Extracted ${extractedJobs.length} total jobs from Workday main page`);
        }
      }
    } catch (err) {
      console.error(`Firecrawl Workday error for ${companyName}:`, err);
    }
    
    // Then search for specific roles to catch any that were hidden
    for (const role of targetRoles.slice(0, 4)) {
      try {
        // Build URL with search query
        const searchUrl = `${baseUrl}?q=${encodeURIComponent(role)}`;
        console.log(`Firecrawl scraping Workday: ${searchUrl}`);
        
        const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${firecrawlApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: searchUrl,
            formats: ["html", "links"],
            onlyMainContent: false,
            waitFor: 4000, // Workday needs time to render
          }),
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data?.html) {
            console.log(`Firecrawl got Workday HTML for ${companyName} (${role})`);
            
            // Extract job listings using AI
            const extractedJobs = await extractWorkdayJobsFromHtml(
              data.data.html,
              baseUrl,
              companyName,
              role,
              apiKey
            );
            
            for (const job of extractedJobs) {
              // Avoid duplicates
              if (!jobs.some(j => j.url === job.url)) {
                jobs.push(job);
              }
            }
            
            console.log(`Extracted ${extractedJobs.length} new jobs from Workday for ${role}, total: ${jobs.length}`);
          }
        } else {
          console.error(`Firecrawl error for Workday: ${response.status}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (err) {
        console.error(`Firecrawl Workday error for ${companyName}/${role}:`, err);
      }
    }
    
    // If we got jobs from Firecrawl, return them
    if (jobs.length > 0) {
      console.log(`Found ${jobs.length} Workday jobs at ${companyName} via Firecrawl`);
      return jobs;
    }
  }
  
  // Fallback: Use SerpAPI to search within the Workday site
  console.log(`Falling back to SerpAPI for Workday: ${companyName}`);
  for (const role of targetRoles.slice(0, 2)) {
    try {
      const query = `site:${workdayDomain} "${role}"`;
      console.log(`Workday SerpAPI search: ${query}`);
      
      const results = await serpApiSearch(query, serpApiKey, 10);
      
      for (const result of results) {
        const isWorkdayJobUrl = result.url.includes(workdayDomain) && 
          (result.url.includes("/job/") || 
           result.url.includes("/jobs/") ||
           result.url.includes("/details/") ||
           result.url.includes("/requisition/") ||
           /\/[a-f0-9-]{20,}|\/\d{5,}/.test(result.url));
        
        if (!isWorkdayJobUrl) continue;
        if (jobs.some(j => j.url === result.url)) continue;
        
        jobs.push({
          url: result.url,
          title: result.title.replace(/ \| .*$/, "").replace(/ - .*Careers.*$/i, ""),
          snippet: result.snippet || "",
          atsType: "workday",
          companySlug: companyName.toLowerCase().replace(/\s+/g, "-"),
          salaryMin: null,
          salaryMax: null,
          salaryCurrency: null,
          fullDescription: null,
          requirements: null,
          isDirectPosting: true,
        });
      }
      
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (err) {
      console.error(`Workday SerpAPI error for ${companyName}/${role}:`, err);
    }
  }
  
  console.log(`Found ${jobs.length} Workday jobs at ${companyName}`);
  return jobs;
}

// Extract job listings from Workday HTML using AI
async function extractWorkdayJobsFromHtml(
  html: string,
  baseUrl: string,
  companyName: string,
  targetRole: string,
  apiKey: string
): Promise<ClassifiedJob[]> {
  const truncatedHtml = html.substring(0, 120000); // Workday pages can be large - increased limit
  
  const prompt = `This is HTML from a Workday career page for ${companyName}.
Base URL: ${baseUrl}
${targetRole ? `Target role: ${targetRole}` : "Extracting ALL available jobs"}

Extract ALL job listings visible on this page. Look for:
1. Job title elements (usually in links or headings within job cards/rows)
2. Job URLs - they typically contain "/job/" followed by the job title and ID
3. The job list section (data-automation-id="jobResults" or similar)
4. Look in <a> tags with href containing "/job/" 
5. Look for repeated list items or div structures containing job info

For Workday URLs, the pattern is usually:
${baseUrl}/job/Job-Title/JOB_REQ_ID

Return a JSON array with ALL jobs found (up to 50):
[{"url": "full_job_url", "title": "Job Title", "snippet": "location or brief info"}]

IMPORTANT:
- Extract EVERY job listing you can find, not just ones matching a specific role
- Include ALL job cards/rows in the results section
- Make sure URLs are absolute (start with https://)
- If a URL is relative like "/job/...", prepend the base URL
- Include the job location in the snippet if visible
- Don't skip any jobs - we need the complete list

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
          { role: "system", content: "You extract job listings from Workday career pages. Return valid JSON arrays only." },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      console.error("AI API error for Workday extraction:", response.status);
      return [];
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const jsonMatch = content.match(/\[[\s\S]*?\]/);
    
    if (!jsonMatch) {
      console.log("No jobs extracted from Workday HTML");
      return [];
    }

    const rawJobs = JSON.parse(jsonMatch[0]) as Array<{ url: string; title: string; snippet?: string }>;
    
    // Convert to ClassifiedJob format and ensure absolute URLs
    return rawJobs
      .filter(j => j.url && j.title)
      .map(j => {
        let url = j.url;
        // Fix relative URLs
        if (url.startsWith("/")) {
          const origin = new URL(baseUrl).origin;
          url = origin + url;
        } else if (!url.startsWith("http")) {
          url = baseUrl + "/" + url;
        }
        
        return {
          url,
          title: j.title,
          snippet: j.snippet || "",
          atsType: "workday",
          companySlug: companyName.toLowerCase().replace(/\s+/g, "-"),
          salaryMin: null,
          salaryMax: null,
          salaryCurrency: null,
          fullDescription: null,
          requirements: null,
          isDirectPosting: true,
        };
      });
  } catch (error) {
    console.error("Workday extraction error:", error);
    return [];
  }
}

// Search a company's career page for jobs matching a role
async function searchCompanyCareerPage(
  companyName: string,
  careersUrl: string,
  targetRoles: string[],
  lovableApiKey: string,
  serpApiKey: string
): Promise<ClassifiedJob[]> {
  console.log(`Searching ${companyName} careers at ${careersUrl} for roles: ${targetRoles.join(", ")}`);
  
  // Special handling for Workday URLs - use Firecrawl to scrape dynamic content
  if (careersUrl.includes("myworkdayjobs.com")) {
    return await searchWorkdayCareerPage(companyName, careersUrl, targetRoles, serpApiKey, lovableApiKey);
  }
  
  // First, try to get the careers page with Firecrawl (handles JS-rendered pages)
  const firecrawlApiKey = Deno.env.get("FIRECRAWL_API_KEY");
  let html: string | null = null;
  
  if (firecrawlApiKey) {
    try {
      const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${firecrawlApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: careersUrl,
          formats: ["html", "links"],
          onlyMainContent: false,
          waitFor: 2000,
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data?.html) {
          html = data.data.html;
          console.log(`Firecrawl successfully scraped ${careersUrl}`);
        }
      }
    } catch (err) {
      console.error(`Firecrawl error for ${careersUrl}:`, err);
    }
  }
  
  // Fallback to direct fetch
  if (!html) {
    const fetchResult = await fetchPageContent(careersUrl, 5000);
    if (fetchResult.is404) {
      console.log(`${companyName} careers page returned 404`);
      return [];
    }
    html = fetchResult.html;
  }
  
  if (!html) {
    console.log(`Could not fetch ${companyName} careers page`);
    return [];
  }
  
  // Use AI to find relevant job listings
  const truncatedHtml = html.substring(0, 60000);
  const rolesPattern = targetRoles.map(r => r.toLowerCase()).join("|");
  
  const prompt = `Analyze this career page HTML from ${companyName} and find job listings that match these roles: ${targetRoles.join(", ")}

Page URL: ${careersUrl}

Look for:
1. Direct links to job postings (URLs containing /jobs/, /careers/, /positions/, etc.)
2. Job titles that match or are similar to: ${targetRoles.join(", ")}
3. Links to ATS systems (Greenhouse, Lever, Workday, iCIMS, etc.)

For each matching job found, return:
- url: The absolute URL to the job posting
- title: The job title
- snippet: Brief description if available

Return as a JSON array: [{"url": "...", "title": "...", "snippet": "..."}]
Maximum 10 jobs. Only include jobs that seem to match the target roles.
If no matching jobs found, return [].

HTML (truncated):
${truncatedHtml}`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You extract job listings from career pages. Always respond with valid JSON arrays." },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      console.error("AI API error for career page extraction:", response.status);
      return [];
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const jsonMatch = content.match(/\[[\s\S]*?\]/);
    
    if (!jsonMatch) {
      console.log(`No jobs found on ${companyName} career page`);
      return [];
    }

    const jobs = JSON.parse(jsonMatch[0]) as Array<{ url: string; title: string; snippet: string }>;
    console.log(`Found ${jobs.length} matching jobs at ${companyName}`);
    
    // Convert to ClassifiedJob format
    return jobs
      .filter(j => j.url && j.url.startsWith("http"))
      .map(j => {
        const { type, companySlug } = classifyUrl(j.url);
        return {
          url: j.url,
          title: j.title || `Job at ${companyName}`,
          snippet: j.snippet || "",
          atsType: type || "careers_page",
          companySlug: companySlug || companyName.toLowerCase().replace(/\s+/g, "-"),
          salaryMin: null,
          salaryMax: null,
          salaryCurrency: null,
          fullDescription: null,
          requirements: null,
          isDirectPosting: true,
        };
      });
  } catch (error) {
    console.error(`Career page extraction error for ${companyName}:`, error);
    return [];
  }
}

// Build search queries from user preferences
function buildSearchQueries(preferences: {
  target_roles: string[] | null;
  work_type: string[] | null;
  location_zip: string | null;
}): string[] {
  const queries: string[] = [];
  const roles = preferences.target_roles || ["product manager", "operations manager"];
  const workTypes = preferences.work_type || ["remote"];
  const location = getLocationFromZip(preferences.location_zip);
  const cities = getCitiesFromZip(preferences.location_zip);
  const primaryCity = cities[0] || location || "";
  
  // Check if any work type requires location
  const hasInPerson = workTypes.includes("in-person");
  const hasHybrid = workTypes.includes("hybrid");
  const hasRemote = workTypes.includes("remote");
  const needsLocation = (hasInPerson || hasHybrid) && location;
  
  // For in-person or hybrid, include location in searches
  const locationTerm = needsLocation ? location : "";
  
  for (const role of roles.slice(0, 3)) {
    const isEntryLevel = isEntryLevelRole(role);
    const isTrade = isTradeRole(role);
    
    if (hasRemote) {
      // Remote searches - target specific job postings, not just boards
      queries.push(`site:boards.greenhouse.io/*/jobs remote "${role}"`);
      queries.push(`site:jobs.lever.co remote "${role}" apply`);
      queries.push(`remote "${role}" jobs hiring 2026`);
    }
    
    if (isTrade && needsLocation) {
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
    } else if (isEntryLevel && needsLocation) {
      // Entry-level/retail jobs - focus on aggregators and direct company searches
      queries.push(`"${role}" jobs "${locationTerm}" hiring now apply`);
      queries.push(`"${role}" "${locationTerm}" careers site:*.com/careers`);
      queries.push(`site:snagajob.com "${role}" ${locationTerm}`);
      queries.push(`"${role}" jobs near ${locationTerm} apply online`);
      queries.push(`"now hiring" "${role}" ${locationTerm}`);
    } else if (hasInPerson || hasHybrid) {
      // Professional in-person/hybrid - include ATS sites
      queries.push(`site:boards.greenhouse.io/*/jobs ${locationTerm} "${role}"`);
      queries.push(`site:jobs.lever.co ${locationTerm} "${role}" apply`);
      queries.push(`"${role}" jobs ${locationTerm} hiring 2026`);
      if (hasHybrid) queries.push(`hybrid "${role}" jobs ${locationTerm}`);
      if (hasInPerson) queries.push(`"in-person" "${role}" jobs ${locationTerm}`);
    }
  }
  
  // Add ATS searches for non-entry-level roles
  const hasNonEntryLevel = roles.some(r => !isEntryLevelRole(r) && !isTradeRole(r));
  if (hasNonEntryLevel) {
    if (locationTerm) {
      queries.push(`site:apply.workable.com/*/j ${locationTerm}`);
      queries.push(`site:jobs.ashbyhq.com ${locationTerm}`);
    } else {
      queries.push(`site:apply.workable.com/*/j ${hasRemote ? "remote" : locationTerm}`);
      queries.push(`site:jobs.ashbyhq.com ${hasRemote ? "remote" : locationTerm}`);
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

// Extract job listings from Amazon.jobs HTML
async function extractAmazonJobsFromHtml(
  html: string,
  pageUrl: string,
  apiKey: string
): Promise<ClassifiedJob[]> {
  const truncatedHtml = html.substring(0, 100000); // Amazon pages can be large
  
  const prompt = `This is HTML from an Amazon Jobs search results page.
Page URL: ${pageUrl}

Extract ONLY actual job listings (NOT category links). Real Amazon job URLs look like:
- https://www.amazon.jobs/en/jobs/3170854/supply-chain-program-manager-launch-expansion...
- Job IDs are 7 digits (e.g., 3170854, 3168457)

DO NOT extract category/filter links like:
- /en/jobs/2550015/legal (these are categories, not jobs)
- Links with job IDs under 3000000 are likely categories

Look for:
1. Job cards with titles like "### [Job Title](url)" in markdown
2. Links containing "/en/jobs/3XXXXXX/" (7-digit IDs starting with 3)
3. Job listings with "Posted" dates and "Job ID:" labels

Return a JSON array with jobs found (up to 30):
[{"url": "https://www.amazon.jobs/en/jobs/3170854/...", "title": "Job Title", "location": "Nashville, TN"}]

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
          { role: "system", content: "You extract job listings from Amazon Jobs pages. Return valid JSON arrays only." },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      console.error("AI API error for Amazon extraction:", response.status);
      return [];
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const jsonMatch = content.match(/\[[\s\S]*?\]/);
    
    if (!jsonMatch) {
      console.log("No jobs extracted from Amazon HTML");
      return [];
    }

    const rawJobs = JSON.parse(jsonMatch[0]) as Array<{ url: string; title: string; location?: string }>;
    console.log(`Extracted ${rawJobs.length} jobs from Amazon.jobs`);
    
    // Convert to ClassifiedJob format
    return rawJobs
      .filter(j => j.url && j.title)
      .map(j => {
        let url = j.url;
        // Fix relative URLs
        if (url.startsWith("/")) {
          url = "https://www.amazon.jobs" + url;
        } else if (!url.startsWith("http")) {
          url = "https://www.amazon.jobs/" + url;
        }
        
        return {
          url,
          title: j.title,
          snippet: j.location || "",
          atsType: "amazon",
          companySlug: "amazon",
          salaryMin: null,
          salaryMax: null,
          salaryCurrency: null,
          fullDescription: null,
          requirements: null,
          isDirectPosting: true,
          isFromTargetUrl: true, // Amazon jobs from target URL bypass relevance filtering
        };
      });
  } catch (error) {
    console.error("Amazon extraction error:", error);
    return [];
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

// Check if a job title is relevant to target roles using AI
async function isJobRelevantToRoles(
  jobTitle: string,
  targetRoles: string[],
  lovableApiKey: string
): Promise<{ isRelevant: boolean; reason: string }> {
  if (!targetRoles || targetRoles.length === 0) {
    return { isRelevant: true, reason: "No target roles specified" };
  }
  
  // Quick keyword check first (avoid AI call for obvious matches)
  const titleLower = jobTitle.toLowerCase();
  for (const role of targetRoles) {
    const roleLower = role.toLowerCase();
    const roleWords = roleLower.split(/\s+/);
    
    // Check if all significant words from the role appear in the title
    const significantWords = roleWords.filter(w => w.length > 2 && !['and', 'the', 'for', 'with'].includes(w));
    const matchCount = significantWords.filter(word => titleLower.includes(word)).length;
    
    if (matchCount >= Math.ceil(significantWords.length * 0.5)) {
      return { isRelevant: true, reason: `Matches target role: ${role}` };
    }
  }
  
  // Use AI for more nuanced matching
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: `You are a job matching expert. Determine if a job title is relevant to a user's target roles.
Consider:
- Similar job functions (e.g., "Data Analyst" matches "Business Analyst")
- Related seniority levels (e.g., "Senior Analyst" matches "Analyst")
- Industry variations of the same role

Be strict: "Jewelry Sales Specialist" does NOT match "Analyst".
Respond with JSON only: {"isRelevant": boolean, "reason": "brief explanation"}`
          },
          {
            role: "user",
            content: `Job title: "${jobTitle}"
Target roles: ${targetRoles.map(r => `"${r}"`).join(", ")}

Is this job relevant to any of the target roles?`
          }
        ],
        max_tokens: 100,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      console.error("AI relevance check failed:", response.status);
      return { isRelevant: true, reason: "AI check failed, allowing by default" };
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || "";
    
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return { isRelevant: !!parsed.isRelevant, reason: parsed.reason || "AI evaluation" };
    }
    
    return { isRelevant: true, reason: "Could not parse AI response" };
  } catch (error) {
    console.error("Relevance check error:", error);
    return { isRelevant: true, reason: "Error during check, allowing by default" };
  }
}

// Process jobs in background and save to database
async function processAndSaveJobs(
  directPostings: ClassifiedJob[],
  maxResults: number,
  lovableApiKey: string,
  userId: string,
  userPreferences: { target_roles: string[] | null; work_type: string[] | null; location_zip: string | null; search_radius_miles: number | null }
): Promise<{ inserted: number; skipped: number; withSalary: number; withDescription: number; filteredByLocation: number; filteredByRelevance: number }> {
  // IMPORTANT: Create a fresh service role client for background processing
  // The user-authenticated client won't work after the HTTP response is sent
  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  
  // Process up to maxResults (based on user tier: free=10, pro=50, premium=100)
  const jobsToProcess = directPostings.slice(0, maxResults);
  
  console.log(`Background task started: processing ${jobsToProcess.length} jobs for user ${userId}`);
  
  const workTypes = userPreferences.work_type || [];
  const hasInPersonOrHybrid = workTypes.includes("in-person") || workTypes.includes("hybrid");
  const requiresLocationValidation = hasInPersonOrHybrid && userPreferences.location_zip;
  const targetRoles = userPreferences.target_roles || [];
  const radiusMiles = userPreferences.search_radius_miles || 50;
  
  console.log(`Location validation: ${requiresLocationValidation ? `enabled (${radiusMiles} mi from ${userPreferences.location_zip})` : "disabled (remote)"}`);
  
  let inserted = 0;
  let skipped = 0;
  let withSalary = 0;
  let withDescription = 0;
  let filteredByLocation = 0;
  let filteredByRelevance = 0;
  
  try {
    // Process in parallel batches of 5 for speed (reduced from fetching all first)
    for (let i = 0; i < jobsToProcess.length; i += 5) {
      const batch = jobsToProcess.slice(i, i + 5);
      
      // Fetch, validate, and insert each job in the batch
      await Promise.all(
        batch.map(async (job) => {
          try {
            // 1. Fetch job details
            console.log(`Fetching: ${job.url}`);
            const fetchResult = await fetchPageContent(job.url, 3000);
            
            if (fetchResult.is404) {
              console.log(`Skipping 404: ${job.url}`);
              skipped++;
              return;
            }
            
            let enrichedJob = { ...job, extractedLocation: null as string | null };
            
            if (fetchResult.html) {
              const details = await extractJobDetails(fetchResult.html, job.url, lovableApiKey);
              enrichedJob = {
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
            
            // 2. Check relevance (only if we have target roles AND job is not from a target URL)
            // Jobs from target URLs bypass relevance filtering since user explicitly chose them
            if (targetRoles.length > 0 && !job.isFromTargetUrl) {
              const relevanceCheck = await isJobRelevantToRoles(enrichedJob.title || "", targetRoles, lovableApiKey);
              console.log(`Relevance: "${enrichedJob.title}" - ${relevanceCheck.isRelevant ? "YES" : "NO"}`);
              
              if (!relevanceCheck.isRelevant) {
                filteredByRelevance++;
                return;
              }
            } else if (job.isFromTargetUrl) {
              console.log(`Target URL job (bypassing relevance): "${enrichedJob.title}"`);
            }
            
            // 3. Validate location (only for in-person/hybrid)
            if (requiresLocationValidation) {
              const validation = await validateJobLocation(
                enrichedJob.extractedLocation,
                userPreferences.location_zip!,
                radiusMiles,
                lovableApiKey
              );
              
              console.log(`Location: "${enrichedJob.title}" at ${enrichedJob.extractedLocation} - ${validation.isValid ? "OK" : "TOO FAR"}`);
              
              if (!validation.isValid) {
                filteredByLocation++;
                return;
              }
            }
            
            // 4. Insert into database
            const { error } = await serviceClient.from("discovered_jobs").upsert(
              {
                user_id: userId,
                url: enrichedJob.url,
                title: enrichedJob.title || "Untitled Position",
                snippet: enrichedJob.fullDescription || enrichedJob.snippet,
                ats_type: enrichedJob.atsType,
                company_slug: enrichedJob.companySlug,
                source: "serpapi_enriched",
                discovered_at: new Date().toISOString(),
                salary_min: enrichedJob.salaryMin,
                salary_max: enrichedJob.salaryMax,
                salary_currency: enrichedJob.salaryCurrency || "USD",
              },
              { onConflict: "user_id,url" }
            );
            
            if (error) {
              console.error(`Insert error for ${enrichedJob.url}:`, error.message);
              skipped++;
            } else {
              inserted++;
              if (enrichedJob.salaryMin || enrichedJob.salaryMax) withSalary++;
              if (enrichedJob.fullDescription) withDescription++;
              console.log(`Inserted: ${enrichedJob.title}`);
            }
          } catch (err) {
            console.error(`Error processing ${job.url}:`, err);
            skipped++;
          }
        })
      );
      
      // Brief pause between batches to avoid overwhelming APIs
      if (i + 5 < jobsToProcess.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  } catch (error) {
    console.error("Background task error:", error);
  }
  
  console.log(`Background complete: ${inserted} inserted, ${skipped} skipped, ${filteredByLocation} filtered by location, ${filteredByRelevance} filtered by relevance`);
  return { inserted, skipped, withSalary, withDescription, filteredByLocation, filteredByRelevance };
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
    
    // Get user preferences including company targets
    const { data: profile } = await supabase
      .from("profiles")
      .select("target_roles, work_type, location_zip, search_radius_miles, target_company_urls, search_mode")
      .eq("user_id", userId)
      .single();
    
    const searchMode = profile?.search_mode || "combined";
    const targetCompanyUrls = profile?.target_company_urls || [];
    
    console.log(`Search mode: ${searchMode}, Target company URLs: ${targetCompanyUrls.length}`);
    
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
    
    let allResults: SearchResult[] = [];
    let classifiedJobs: ClassifiedJob[] = [];
    let aggregatorUrls: string[] = [];
    let directPostings: ClassifiedJob[] = [];
    let boardPages: ClassifiedJob[] = [];
    
    // Only run general search if not in urls_only mode
    if (searchMode !== "urls_only") {
      const queries = buildSearchQueries(profile || { target_roles: null, work_type: null, location_zip: null });
      
      console.log(`User preferences: work_type=${JSON.stringify(profile?.work_type)}, location_zip=${profile?.location_zip}`);
      console.log(`Running ${queries.length} search queries for user ${userId}`);
      
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
      
      const filtered = filterResults(uniqueResults);
      classifiedJobs = filtered.classified;
      aggregatorUrls = filtered.aggregatorUrls;
      
      console.log(`Found ${classifiedJobs.length} relevant jobs, ${aggregatorUrls.length} aggregator pages from ${uniqueResults.length} unique results`);
      
      // Separate direct postings from board pages
      directPostings = classifiedJobs.filter(j => j.isDirectPosting);
      boardPages = classifiedJobs.filter(j => !j.isDirectPosting);
      
      console.log(`Direct postings: ${directPostings.length}, Board pages: ${boardPages.length}, Aggregators: ${aggregatorUrls.length}`);
    } else {
      console.log(`Skipping general search (urls_only mode)`);
    }
    
    // Track seen URLs to avoid duplicates (shared across all processing)
    const seenUrls = new Set<string>();
    directPostings.forEach(j => seenUrls.add(j.url));
    
    // Move ALL heavy processing to background to avoid timeout
    // Return response immediately with preliminary data
    const backgroundTask = async () => {
      try {
        const targetRoles = profile?.target_roles || [];
        const workTypes = profile?.work_type || [];
        
        // FIRST: Process user's target company URLs if in combined or urls_only mode
        let targetUrlJobs: ClassifiedJob[] = [];
        if (searchMode !== "search_only" && targetCompanyUrls.length > 0) {
          console.log(`[BG] Processing ${targetCompanyUrls.length} target company URLs...`);
          
          for (const url of targetCompanyUrls) {
            try {
              // Detect URL type and scrape accordingly
              const urlLower = url.toLowerCase();
              let jobs: ClassifiedJob[] = [];
              
              if (urlLower.includes(".myworkdayjobs.com")) {
                // Workday URL - use the searchWorkdayCareerPage function
                const companyMatch = url.match(/https?:\/\/(\w+)\.wd\d+\.myworkdayjobs\.com/);
                const companyName = companyMatch ? companyMatch[1] : "Company";
                jobs = await searchCompanyCareerPage(companyName, url, targetRoles, lovableApiKey, serpApiKey);
              } else if (urlLower.includes("amazon.jobs")) {
                // Amazon.jobs is a JavaScript SPA - use dedicated extractor with Firecrawl
                console.log(`[BG] Using Firecrawl for Amazon.jobs: ${url}`);
                const html = await scrapeAggregatorWithFirecrawl(url);
                if (html) {
                  // Use the dedicated Amazon.jobs extraction function
                  jobs = await extractAmazonJobsFromHtml(html, url, lovableApiKey);
                  console.log(`[BG] Extracted ${jobs.length} jobs from Amazon.jobs`);
                } else {
                  console.log(`[BG] Firecrawl failed for Amazon.jobs, trying direct fetch...`);
                  const fetchResult = await fetchPageContent(url, 5000);
                  if (fetchResult.html && !fetchResult.is404) {
                    jobs = await extractAmazonJobsFromHtml(fetchResult.html, url, lovableApiKey);
                    console.log(`[BG] Direct fetch extracted ${jobs.length} jobs from Amazon.jobs`);
                  }
                }
              } else {
                // Generic career page - scrape for job links
                const fetchResult = await fetchPageContent(url, 5000);
                if (fetchResult.html && !fetchResult.is404) {
                  const jobLinks = await extractJobLinksFromPage(fetchResult.html, url, lovableApiKey);
                  const localSeen = new Set<string>();
                  for (const jobUrl of jobLinks) {
                    if (!localSeen.has(jobUrl)) {
                      localSeen.add(jobUrl);
                      const { type, companySlug } = classifyUrl(jobUrl);
                      jobs.push({
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
                        isFromTargetUrl: true, // Mark as from user's target URL
                      });
                    }
                  }
                }
              }
              
              // Mark all jobs as from target URL (bypass relevance filtering) and add to targetUrlJobs
              jobs.forEach(job => { job.isFromTargetUrl = true; });
              targetUrlJobs.push(...jobs);
              console.log(`[BG] Added ${jobs.length} jobs to targetUrlJobs from: ${url}`);
              
              console.log(`[BG] Found ${jobs.length} jobs from target URL: ${url}`);
            } catch (err) {
              console.error(`[BG] Error processing target URL ${url}:`, err);
            }
          }
          
          console.log(`[BG] Total jobs from target URLs: ${targetUrlJobs.length}`);
        }
        
        // Discover local companies based on zipcode and search their career pages
        const cities = getCitiesFromZip(profile?.location_zip);
        const primaryCity = cities[0];
        const hasLocalJobs = workTypes.includes("in-person") || workTypes.includes("hybrid");
        let localCompanyJobs: ClassifiedJob[] = [];
        let localCompaniesSearchedCount = 0;
        
        // Only run local company discovery if NOT in urls_only mode
        if (searchMode !== "urls_only" && primaryCity && targetRoles.length > 0 && hasLocalJobs) {
          console.log(`[BG] Discovering local companies in ${primaryCity} for roles: ${targetRoles.join(", ")}`);
          
          const localCompanies = await discoverLocalCompanies(primaryCity, serpApiKey, lovableApiKey);
          console.log(`[BG] Found ${localCompanies.length} local companies with potential career pages`);
          
          // Search each company's career page for matching jobs
          const companiesWithCareers = localCompanies.filter(c => c.careersUrl);
          localCompaniesSearchedCount = companiesWithCareers.length;
          
          // Scale company searches based on tier (more companies = more jobs)
          const maxCompaniesToSearch = tier === "premium" ? 8 : tier === "pro" ? 5 : 3;
          for (const company of companiesWithCareers.slice(0, maxCompaniesToSearch)) {
            if (!company.careersUrl) continue;
            
            try {
              const jobs = await searchCompanyCareerPage(
                company.name,
                company.careersUrl,
                targetRoles,
                lovableApiKey,
                serpApiKey
              );
              
              // Add jobs that aren't already in our list
              for (const job of jobs) {
                if (!seenUrls.has(job.url)) {
                  seenUrls.add(job.url);
                  localCompanyJobs.push(job);
                }
              }
              
              console.log(`[BG] Added ${jobs.length} jobs from ${company.name}`);
            } catch (err) {
              console.error(`[BG] Error searching ${company.name} careers:`, err);
            }
          }
          
          console.log(`[BG] Total jobs from local companies: ${localCompanyJobs.length}`);
        }
        
        // Process board pages in parallel (scale based on tier)
        const maxBoardPages = tier === "premium" ? 6 : tier === "pro" ? 4 : 2;
        const boardPagesToProcess = boardPages.slice(0, maxBoardPages);
        const extractedJobUrls: string[] = [];
        
        console.log(`[BG] Processing ${boardPagesToProcess.length} board pages...`);
        const boardResults = await Promise.all(
          boardPagesToProcess.map(async (boardPage: ClassifiedJob) => {
            console.log(`[BG] Fetching board page: ${boardPage.url}`);
            const fetchResult = await fetchPageContent(boardPage.url, 4000);
            
            if (fetchResult.html && !fetchResult.is404) {
              const jobLinks = await extractJobLinksFromPage(fetchResult.html, boardPage.url, lovableApiKey);
              console.log(`[BG] Extracted ${jobLinks.length} job links from ${boardPage.url}`);
              return jobLinks;
            }
            return [];
          })
        );
        
        boardResults.forEach((links: string[]) => extractedJobUrls.push(...links));
        
        // Process aggregator pages to extract direct company links (scale based on tier)
        const maxAggregators = tier === "premium" ? 5 : tier === "pro" ? 3 : 2;
        const aggregatorsToProcess = aggregatorUrls.slice(0, maxAggregators);
        const directLinksFromAggregators: string[] = [];
        
        if (aggregatorsToProcess.length > 0) {
          console.log(`[BG] Processing ${aggregatorsToProcess.length} aggregator pages for direct links...`);
          
          const aggregatorResults = await Promise.all(
            aggregatorsToProcess.map(async (aggUrl: string) => {
              console.log(`[BG] Extracting direct links from aggregator: ${aggUrl}`);
              
              // Try Firecrawl first (handles anti-bot), fall back to direct fetch
              let html: string | null = await scrapeAggregatorWithFirecrawl(aggUrl);
              
              if (!html) {
                console.log(`[BG] Firecrawl failed for ${aggUrl}, trying direct fetch...`);
                const fetchResult = await fetchPageContent(aggUrl, 5000);
                html = fetchResult.is404 ? null : fetchResult.html;
              }
              
              if (html) {
                const directLinks = await extractDirectLinksFromAggregator(html, aggUrl, lovableApiKey);
                console.log(`[BG] Found ${directLinks.length} direct company links from ${aggUrl}`);
                return directLinks;
              }
              
              console.log(`[BG] Could not scrape ${aggUrl}`);
              return [];
            })
          );
          
          aggregatorResults.forEach((links: string[]) => directLinksFromAggregators.push(...links));
          console.log(`[BG] Total direct links from aggregators: ${directLinksFromAggregators.length}`);
        }
        
        // Build final list of jobs to process
        const allJobs: ClassifiedJob[] = [...directPostings];
        
        // Add extracted URLs from board pages
        for (const jobUrl of extractedJobUrls) {
          if (!seenUrls.has(jobUrl) && !isAggregatorUrl(jobUrl)) {
            seenUrls.add(jobUrl);
            const { type, companySlug } = classifyUrl(jobUrl);
            allJobs.push({
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
            allJobs.push({
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
        
        // Add jobs from local company career pages
        for (const job of localCompanyJobs) {
          if (!seenUrls.has(job.url)) {
            seenUrls.add(job.url);
            allJobs.push(job);
          }
        }
        
        // Add jobs from target company URLs (prioritize these - don't filter by seenUrls)
        console.log(`[BG] Target URL jobs before merge: ${targetUrlJobs.length}`);
        
        console.log(`[BG] Total jobs after all extraction: allJobs=${allJobs.length}, targetUrlJobs=${targetUrlJobs.length}, localCompanyJobs=${localCompanyJobs.length}`);
        
        // Prioritize target URL jobs, then local company jobs by putting them first
        // Use a fresh deduplication set for the final merge
        const finalSeenUrls = new Set<string>();
        const finalPostings: ClassifiedJob[] = [];
        
        // First add target URL jobs (highest priority)
        for (const job of targetUrlJobs) {
          if (!finalSeenUrls.has(job.url)) {
            finalSeenUrls.add(job.url);
            finalPostings.push(job);
          }
        }
        console.log(`[BG] After adding targetUrlJobs: ${finalPostings.length}`);
        
        // Then add local company jobs
        for (const job of localCompanyJobs) {
          if (!finalSeenUrls.has(job.url)) {
            finalSeenUrls.add(job.url);
            finalPostings.push(job);
          }
        }
        console.log(`[BG] After adding localCompanyJobs: ${finalPostings.length}`);
        
        // Finally add other jobs from general search
        for (const job of allJobs) {
          if (!finalSeenUrls.has(job.url)) {
            finalSeenUrls.add(job.url);
            finalPostings.push(job);
          }
        }
        
        console.log(`[BG] Final postings count: ${finalPostings.length}`);
        
        // Process and save jobs
        await processAndSaveJobs(
          finalPostings,
          maxResults,
          lovableApiKey,
          userId,
          {
            target_roles: profile?.target_roles || null,
            work_type: profile?.work_type || null,
            location_zip: profile?.location_zip || null,
            search_radius_miles: profile?.search_radius_miles || 50,
          }
        );
        
        console.log(`[BG] Background task complete`);
      } catch (error) {
        console.error(`[BG] Background task error:`, error);
      }
    };
    
    // Register background task to continue after response
    EdgeRuntime.waitUntil(backgroundTask());
    
    // Return immediately with preliminary results
    return new Response(
      JSON.stringify({
        success: true,
        queriesRun: searchMode === "urls_only" ? 0 : allResults.length,
        totalResults: classifiedJobs.length,
        targetCompanyUrls: targetCompanyUrls.length,
        boardPagesScraped: boardPages.length,
        extractedJobLinks: directPostings.length,
        localCompaniesSearched: 0, // Will be processed in background
        localCompanyJobs: 0, // Will be processed in background
        enrichedJobs: directPostings.length,
        inserted: directPostings.length,
        skipped: 0,
        withSalary: 0,
        withDescription: 0,
        note: "Jobs are being discovered and enriched in the background. Refresh in 10-30 seconds for full results.",
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
