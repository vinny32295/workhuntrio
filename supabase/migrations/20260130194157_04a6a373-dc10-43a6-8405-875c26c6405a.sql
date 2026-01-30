-- Add target company URLs and search mode to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS target_company_urls text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS search_mode text DEFAULT 'combined' CHECK (search_mode IN ('combined', 'urls_only', 'search_only'));