-- Add columns to profiles for parsed resume data
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS work_history jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS education jsonb DEFAULT '[]'::jsonb;

-- Add comment for clarity
COMMENT ON COLUMN public.profiles.work_history IS 'Array of work experience objects: [{company, title, start_date, end_date, description}]';
COMMENT ON COLUMN public.profiles.education IS 'Array of education objects: [{institution, degree, field, start_date, end_date}]';