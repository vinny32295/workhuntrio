#!/usr/bin/env python3
"""
Google Search Job Discovery Module

Discovers job postings using Google Custom Search API, SerpApi, or direct scraping.

Setup for Google Custom Search:
1. Go to https://console.cloud.google.com/
2. Create a project and enable "Custom Search API"
3. Create credentials (API key) 
4. Go to https://programmablesearchengine.google.com/
5. Create a search engine that searches the whole web
6. Get your Search Engine ID (cx parameter)

Set environment variables:
    export GOOGLE_API_KEY="your-api-key"
    export GOOGLE_CSE_ID="your-search-engine-id"
"""

import os
import re
import time
import logging
from urllib.parse import urlparse
from typing import Optional

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print("Install: pip install requests beautifulsoup4")
    exit(1)

try:
    from googleapiclient.discovery import build as google_build
    GOOGLE_API_AVAILABLE = True
except ImportError:
    GOOGLE_API_AVAILABLE = False

logger = logging.getLogger(__name__)


# Default search queries for remote jobs
DEFAULT_SEARCH_QUERIES = [
    # Direct job searches
    'remote "product manager" jobs hiring now 2024',
    'remote "operations manager" jobs careers',
    'remote "project manager" jobs apply',
    'remote "revenue operations" jobs',
    'remote "sales operations" jobs', 
    'remote "customer success manager" jobs',
    'remote "program manager" jobs',
    
    # Company hiring pages
    '"we are hiring" remote product manager',
    '"join our team" remote operations manager',
    
    # Target specific ATS platforms (very effective)
    'site:boards.greenhouse.io remote product manager',
    'site:boards.greenhouse.io remote operations',
    'site:jobs.lever.co remote product manager',
    'site:jobs.lever.co remote operations',
    'site:apply.workable.com remote manager',
    'site:jobs.ashbyhq.com remote',
    
    # Job board specific
    'site:wellfound.com remote product manager',
    'site:weworkremotely.com product manager',
    'site:remoteok.com operations manager',
]


class GoogleCustomSearcher:
    """
    Uses Google Custom Search API to discover job postings.
    
    Free tier: 100 queries/day
    Paid: $5 per 1000 queries
    """
    
    def __init__(self, api_key: str = None, cse_id: str = None):
        self.api_key = api_key or os.getenv("GOOGLE_API_KEY", "")
        self.cse_id = cse_id or os.getenv("GOOGLE_CSE_ID", "")
        self.service = None
        
        if GOOGLE_API_AVAILABLE and self.api_key and self.cse_id:
            try:
                self.service = google_build("customsearch", "v1", developerKey=self.api_key)
            except Exception as e:
                logger.error(f"Failed to initialize Google Search: {e}")
    
    def is_available(self) -> bool:
        return self.service is not None
    
    def search(self, query: str, num_results: int = 10, start: int = 1) -> list[dict]:
        """Execute a single search query"""
        if not self.is_available():
            return []
        
        try:
            result = self.service.cse().list(
                q=query,
                cx=self.cse_id,
                num=min(num_results, 10),
                start=start
            ).execute()
            
            return [{
                'title': item.get('title', ''),
                'url': item.get('link', ''),
                'snippet': item.get('snippet', ''),
                'source': 'google_cse'
            } for item in result.get('items', [])]
            
        except Exception as e:
            logger.error(f"Google search error: {e}")
            return []
    
    def search_paginated(self, query: str, max_results: int = 50) -> list[dict]:
        """Search with pagination (max 100 results per query)"""
        all_results = []
        
        for start in range(1, min(max_results + 1, 101), 10):
            results = self.search(query, num_results=10, start=start)
            if not results:
                break
            all_results.extend(results)
            time.sleep(0.5)
        
        return all_results


class SerpApiSearcher:
    """
    Alternative: SerpApi (more reliable, paid service)
    
    Setup:
    1. Sign up at https://serpapi.com/
    2. Get API key
    3. export SERPAPI_KEY="your-key"
    
    Pricing: 100 free searches/month, then $50/month for 5000
    """
    
    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.getenv("SERPAPI_KEY", "")
        self.base_url = "https://serpapi.com/search"
    
    def is_available(self) -> bool:
        return bool(self.api_key)
    
    def search(self, query: str, num_results: int = 20) -> list[dict]:
        if not self.is_available():
            return []
        
        try:
            params = {
                "api_key": self.api_key,
                "engine": "google",
                "q": query,
                "num": num_results,
            }
            
            response = requests.get(self.base_url, params=params, timeout=30)
            data = response.json()
            
            return [{
                'title': item.get('title', ''),
                'url': item.get('link', ''),
                'snippet': item.get('snippet', ''),
                'source': 'serpapi'
            } for item in data.get('organic_results', [])]
            
        except Exception as e:
            logger.error(f"SerpApi error: {e}")
            return []


class DirectGoogleScraper:
    """
    Fallback: Direct Google scraping (use sparingly!)
    
    WARNING: May get blocked. Use only when APIs unavailable.
    Add long delays between requests.
    """
    
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
        })
    
    def is_available(self) -> bool:
        return True
    
    def search(self, query: str, num_results: int = 20) -> list[dict]:
        results = []
        
        try:
            params = {'q': query, 'num': num_results}
            response = self.session.get(
                "https://www.google.com/search",
                params=params,
                timeout=30
            )
            
            soup = BeautifulSoup(response.text, 'lxml')
            
            for div in soup.select('div.g'):
                link = div.select_one('a[href^="http"]')
                title = div.select_one('h3')
                
                if link and title:
                    results.append({
                        'title': title.get_text(),
                        'url': link['href'],
                        'snippet': '',
                        'source': 'google_direct'
                    })
            
        except Exception as e:
            logger.error(f"Direct Google scrape error: {e}")
        
        return results


class URLClassifier:
    """Classify discovered URLs by ATS type"""
    
    ATS_PATTERNS = {
        'greenhouse': [r'boards\.greenhouse\.io/(\w+)', r'job-boards\.greenhouse\.io/(\w+)'],
        'lever': [r'jobs\.lever\.co/(\w+)'],
        'workable': [r'apply\.workable\.com/(\w+)', r'(\w+)\.workable\.com'],
        'ashby': [r'jobs\.ashbyhq\.com/(\w+)'],
        'bamboohr': [r'(\w+)\.bamboohr\.com/jobs'],
        'jobvite': [r'jobs\.jobvite\.com/(\w+)'],
        'smartrecruiters': [r'jobs\.smartrecruiters\.com/(\w+)'],
        'wellfound': [r'wellfound\.com/company/(\w+)'],
    }
    
    SKIP_DOMAINS = [
        'linkedin.com', 'facebook.com', 'twitter.com', 'instagram.com',
        'youtube.com', 'reddit.com', 'news.ycombinator.com',
        'glassdoor.com', 'indeed.com',  # Aggregators, harder to scrape
    ]
    
    @classmethod
    def classify(cls, url: str) -> dict:
        """Classify a URL and extract company slug"""
        result = {
            'type': 'unknown',
            'company_slug': None,
            'is_job_board': False,
            'url': url,
        }
        
        # Check known ATS patterns
        for ats_type, patterns in cls.ATS_PATTERNS.items():
            for pattern in patterns:
                match = re.search(pattern, url, re.IGNORECASE)
                if match:
                    result['type'] = ats_type
                    result['company_slug'] = match.group(1)
                    result['is_job_board'] = True
                    return result
        
        # Check for generic careers page
        if re.search(r'/careers?(/|$|\?)|/jobs?(/|$|\?)', url, re.IGNORECASE):
            result['type'] = 'careers_page'
            parsed = urlparse(url)
            result['company_slug'] = parsed.netloc.replace('www.', '').split('.')[0]
        
        return result
    
    @classmethod
    def filter_urls(cls, urls: list[dict]) -> list[dict]:
        """Filter out irrelevant URLs and classify the rest"""
        filtered = []
        
        for item in urls:
            url = item.get('url', '')
            
            # Skip irrelevant domains
            if any(domain in url.lower() for domain in cls.SKIP_DOMAINS):
                continue
            
            # Skip non-HTML
            if any(ext in url.lower() for ext in ['.pdf', '.doc', '.png', '.jpg']):
                continue
            
            classification = cls.classify(url)
            if classification['type'] != 'unknown':
                item['classification'] = classification
                filtered.append(item)
        
        return filtered


class JobDiscovery:
    """
    Main discovery class - coordinates search and classification.
    
    Usage:
        discovery = JobDiscovery()
        jobs = discovery.discover(queries=["remote product manager jobs"])
    """
    
    def __init__(self):
        # Try searchers in order of preference
        self.google_cse = GoogleCustomSearcher()
        self.serpapi = SerpApiSearcher()
        self.direct = DirectGoogleScraper()
        
        # Select best available
        if self.google_cse.is_available():
            self.searcher = self.google_cse
            self.searcher_name = "Google Custom Search API"
        elif self.serpapi.is_available():
            self.searcher = self.serpapi
            self.searcher_name = "SerpApi"
        else:
            self.searcher = self.direct
            self.searcher_name = "Direct Google (use sparingly!)"
        
        logger.info(f"Using searcher: {self.searcher_name}")
    
    def discover(
        self,
        queries: list[str] = None,
        max_results_per_query: int = 30,
        delay_between_queries: float = 2.0
    ) -> list[dict]:
        """
        Run discovery searches and return classified URLs.
        
        Args:
            queries: Search queries (uses defaults if None)
            max_results_per_query: Max results per query
            delay_between_queries: Seconds between queries
        
        Returns:
            List of classified job URLs
        """
        if queries is None:
            queries = DEFAULT_SEARCH_QUERIES
        
        all_results = {}  # Dedupe by URL
        
        for i, query in enumerate(queries):
            logger.info(f"[{i+1}/{len(queries)}] Searching: {query}")
            
            if hasattr(self.searcher, 'search_paginated'):
                results = self.searcher.search_paginated(query, max_results_per_query)
            else:
                results = self.searcher.search(query, max_results_per_query)
            
            for result in results:
                url = result['url']
                if url not in all_results:
                    all_results[url] = result
            
            logger.info(f"  Found {len(results)} results, {len(all_results)} total unique")
            
            if i < len(queries) - 1:
                time.sleep(delay_between_queries)
        
        # Filter and classify
        classified = URLClassifier.filter_urls(list(all_results.values()))
        
        logger.info(f"Discovery complete: {len(classified)} relevant URLs from {len(all_results)} total")
        
        return classified
    
    def discover_from_ats(self, ats_type: str = 'greenhouse', max_results: int = 50) -> list[dict]:
        """
        Discover jobs from a specific ATS platform.
        
        Args:
            ats_type: 'greenhouse', 'lever', 'workable', etc.
            max_results: Maximum results to return
        """
        ats_queries = {
            'greenhouse': ['site:boards.greenhouse.io remote', 'site:boards.greenhouse.io hiring'],
            'lever': ['site:jobs.lever.co remote', 'site:jobs.lever.co hiring'],
            'workable': ['site:apply.workable.com remote'],
            'ashby': ['site:jobs.ashbyhq.com remote'],
        }
        
        queries = ats_queries.get(ats_type, [f'site:{ats_type} remote jobs'])
        return self.discover(queries=queries, max_results_per_query=max_results)


def main():
    """CLI for testing discovery"""
    import argparse
    
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s'
    )
    
    parser = argparse.ArgumentParser(description="Job Discovery Tool")
    parser.add_argument("--query", "-q", type=str, help="Custom search query")
    parser.add_argument("--ats", type=str, help="Search specific ATS (greenhouse, lever, etc)")
    parser.add_argument("--max", type=int, default=30, help="Max results per query")
    parser.add_argument("--output", "-o", type=str, help="Output file (JSON)")
    
    args = parser.parse_args()
    
    discovery = JobDiscovery()
    
    if args.query:
        results = discovery.discover(queries=[args.query], max_results_per_query=args.max)
    elif args.ats:
        results = discovery.discover_from_ats(ats_type=args.ats, max_results=args.max)
    else:
        results = discovery.discover(max_results_per_query=args.max)
    
    print(f"\n{'='*60}")
    print(f"Found {len(results)} relevant URLs")
    print(f"{'='*60}\n")
    
    # Group by ATS type
    by_type = {}
    for r in results:
        t = r.get('classification', {}).get('type', 'unknown')
        by_type.setdefault(t, []).append(r)
    
    for ats_type, urls in sorted(by_type.items()):
        print(f"\n{ats_type.upper()} ({len(urls)} found):")
        for u in urls[:5]:
            print(f"  - {u['title'][:60]}")
            print(f"    {u['url']}")
    
    if args.output:
        import json
        with open(args.output, 'w') as f:
            json.dump(results, f, indent=2)
        print(f"\nSaved to {args.output}")


if __name__ == "__main__":
    main()
