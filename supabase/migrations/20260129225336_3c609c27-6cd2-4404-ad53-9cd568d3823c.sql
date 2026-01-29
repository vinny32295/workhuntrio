-- Add skills column to profiles table
ALTER TABLE public.profiles
ADD COLUMN skills text[] DEFAULT '{}';

COMMENT ON COLUMN public.profiles.skills IS 'Array of skills extracted from resume or added manually';