-- Add new work_types array column, migrate data, then drop old column
ALTER TABLE public.profiles 
ADD COLUMN work_types text[] DEFAULT NULL;

-- Migrate existing data to array format
UPDATE public.profiles 
SET work_types = CASE 
  WHEN work_type IS NULL THEN NULL
  ELSE ARRAY[work_type]
END;

-- Drop the old column
ALTER TABLE public.profiles 
DROP COLUMN work_type;

-- Rename new column to work_type for consistency
ALTER TABLE public.profiles 
RENAME COLUMN work_types TO work_type;