#!/usr/bin/env python3
"""
Push discovered jobs to Supabase for the WorkHuntr web app.

Usage:
    1. Run google_discovery.py to find jobs
    2. Run this script to push them to Supabase
    
    Or use the combined workflow:
    python push_to_supabase.py --discover --user-id YOUR_USER_ID

Environment variables required:
    SUPABASE_URL - Your Supabase project URL
    SUPABASE_SERVICE_KEY - Service role key (for inserting as any user)
    
    For discovery (optional):
    GOOGLE_API_KEY - Google Custom Search API key
    GOOGLE_CSE_ID - Custom Search Engine ID
"""

import os
import json
import logging
import argparse
from datetime import datetime
from typing import Optional

try:
    from supabase import create_client, Client
except ImportError:
    print("Install: pip install supabase")
    exit(1)

from google_discovery import JobDiscovery, DEFAULT_SEARCH_QUERIES

logger = logging.getLogger(__name__)


def get_supabase_client() -> Client:
    """Create Supabase client with service role key"""
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    
    if not url or not key:
        raise ValueError(
            "Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables. "
            "Get these from your Supabase project settings."
        )
    
    return create_client(url, key)


def push_jobs_to_supabase(
    jobs: list[dict],
    user_id: str,
    supabase: Client
) -> dict:
    """
    Push discovered jobs to Supabase.
    
    Args:
        jobs: List of job dicts from google_discovery
        user_id: UUID of the user to associate jobs with
        supabase: Supabase client
    
    Returns:
        Stats dict with inserted/skipped counts
    """
    stats = {"inserted": 0, "skipped": 0, "errors": 0}
    
    for job in jobs:
        classification = job.get("classification", {})
        
        record = {
            "user_id": user_id,
            "url": job.get("url", ""),
            "title": job.get("title", "Unknown"),
            "snippet": job.get("snippet", ""),
            "company_slug": classification.get("company_slug"),
            "ats_type": classification.get("type"),
            "source": job.get("source", "google_discovery"),
            "discovered_at": datetime.utcnow().isoformat(),
        }
        
        try:
            # Upsert to handle duplicates gracefully
            result = supabase.table("discovered_jobs").upsert(
                record,
                on_conflict="user_id,url"
            ).execute()
            
            if result.data:
                stats["inserted"] += 1
            else:
                stats["skipped"] += 1
                
        except Exception as e:
            logger.error(f"Error inserting job {job.get('url')}: {e}")
            stats["errors"] += 1
    
    return stats


def get_user_preferences(user_id: str, supabase: Client) -> Optional[dict]:
    """Fetch user's job preferences from Supabase"""
    try:
        result = supabase.table("profiles").select(
            "target_roles, work_type, location_zip, search_radius_miles"
        ).eq("user_id", user_id).single().execute()
        
        return result.data
    except Exception as e:
        logger.warning(f"Could not fetch preferences for user {user_id}: {e}")
        return None


def build_search_queries(preferences: Optional[dict]) -> list[str]:
    """Build search queries based on user preferences"""
    if not preferences:
        return DEFAULT_SEARCH_QUERIES[:5]  # Use subset of defaults
    
    queries = []
    target_roles = preferences.get("target_roles") or []
    work_type = preferences.get("work_type", "remote")
    
    # Build role-specific queries
    for role in target_roles[:5]:  # Limit to 5 roles
        # General job search
        queries.append(f'{work_type} "{role}" jobs hiring 2024')
        
        # ATS-specific searches (most reliable)
        queries.append(f'site:boards.greenhouse.io {work_type} {role}')
        queries.append(f'site:jobs.lever.co {work_type} {role}')
    
    # Add some generic ATS searches if we have few roles
    if len(target_roles) < 3:
        queries.extend([
            f'site:boards.greenhouse.io {work_type} manager',
            f'site:jobs.lever.co {work_type} operations',
            f'site:apply.workable.com {work_type}',
        ])
    
    return queries


def run_discovery_pipeline(
    user_id: str,
    custom_queries: list[str] = None,
    max_results: int = 30
) -> dict:
    """
    Full pipeline: discover jobs and push to Supabase.
    
    Args:
        user_id: UUID of user to run discovery for
        custom_queries: Optional custom search queries
        max_results: Max results per query
    
    Returns:
        Stats dict with discovery and insert results
    """
    supabase = get_supabase_client()
    
    # Get user preferences to customize search
    preferences = get_user_preferences(user_id, supabase)
    
    if custom_queries:
        queries = custom_queries
    else:
        queries = build_search_queries(preferences)
    
    logger.info(f"Running discovery with {len(queries)} queries for user {user_id}")
    
    # Discover jobs
    discovery = JobDiscovery()
    jobs = discovery.discover(
        queries=queries,
        max_results_per_query=max_results,
        delay_between_queries=2.0
    )
    
    logger.info(f"Discovered {len(jobs)} jobs")
    
    # Push to Supabase
    stats = push_jobs_to_supabase(jobs, user_id, supabase)
    stats["discovered"] = len(jobs)
    stats["queries_run"] = len(queries)
    
    return stats


def main():
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s'
    )
    
    parser = argparse.ArgumentParser(description="Push jobs to Supabase")
    parser.add_argument("--user-id", "-u", required=True, help="User UUID to associate jobs with")
    parser.add_argument("--discover", "-d", action="store_true", help="Run discovery first")
    parser.add_argument("--input", "-i", help="JSON file with pre-discovered jobs")
    parser.add_argument("--query", "-q", action="append", help="Custom search query (can repeat)")
    parser.add_argument("--max", type=int, default=30, help="Max results per query")
    
    args = parser.parse_args()
    
    if args.discover:
        # Run full pipeline
        stats = run_discovery_pipeline(
            user_id=args.user_id,
            custom_queries=args.query,
            max_results=args.max
        )
        print(f"\n{'='*50}")
        print(f"Discovery Pipeline Complete")
        print(f"{'='*50}")
        print(f"Queries run: {stats['queries_run']}")
        print(f"Jobs discovered: {stats['discovered']}")
        print(f"Jobs inserted: {stats['inserted']}")
        print(f"Jobs skipped (duplicates): {stats['skipped']}")
        print(f"Errors: {stats['errors']}")
        
    elif args.input:
        # Push from JSON file
        with open(args.input) as f:
            jobs = json.load(f)
        
        supabase = get_supabase_client()
        stats = push_jobs_to_supabase(jobs, args.user_id, supabase)
        
        print(f"Pushed {stats['inserted']} jobs, {stats['skipped']} skipped, {stats['errors']} errors")
        
    else:
        parser.error("Either --discover or --input is required")


if __name__ == "__main__":
    main()
