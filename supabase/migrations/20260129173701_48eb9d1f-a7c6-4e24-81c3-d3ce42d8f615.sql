-- Create table for discovered jobs from google_discovery.py
CREATE TABLE public.discovered_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  snippet TEXT,
  company_slug TEXT,
  ats_type TEXT,
  source TEXT DEFAULT 'google_discovery',
  match_score REAL,
  is_reviewed BOOLEAN DEFAULT false,
  discovered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, url)
);

-- Enable RLS
ALTER TABLE public.discovered_jobs ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own discovered jobs"
ON public.discovered_jobs FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own discovered jobs"
ON public.discovered_jobs FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own discovered jobs"
ON public.discovered_jobs FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own discovered jobs"
ON public.discovered_jobs FOR DELETE
USING (auth.uid() = user_id);

-- Index for faster queries
CREATE INDEX idx_discovered_jobs_user_reviewed ON public.discovered_jobs(user_id, is_reviewed);
CREATE INDEX idx_discovered_jobs_discovered_at ON public.discovered_jobs(discovered_at DESC);