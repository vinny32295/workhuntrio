-- Add salary range columns to discovered_jobs
ALTER TABLE public.discovered_jobs
ADD COLUMN salary_min numeric NULL,
ADD COLUMN salary_max numeric NULL,
ADD COLUMN salary_currency text NULL DEFAULT 'USD';