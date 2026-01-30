-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can delete their own discovered jobs" ON public.discovered_jobs;
DROP POLICY IF EXISTS "Users can insert their own discovered jobs" ON public.discovered_jobs;
DROP POLICY IF EXISTS "Users can update their own discovered jobs" ON public.discovered_jobs;
DROP POLICY IF EXISTS "Users can view their own discovered jobs" ON public.discovered_jobs;

-- Recreate as PERMISSIVE policies (the default)
CREATE POLICY "Users can view their own discovered jobs"
ON public.discovered_jobs
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own discovered jobs"
ON public.discovered_jobs
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own discovered jobs"
ON public.discovered_jobs
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own discovered jobs"
ON public.discovered_jobs
FOR DELETE
USING (auth.uid() = user_id);

-- Also add a service role bypass policy so edge functions can insert
CREATE POLICY "Service role can manage all jobs"
ON public.discovered_jobs
FOR ALL
USING (auth.jwt() ->> 'role' = 'service_role')
WITH CHECK (auth.jwt() ->> 'role' = 'service_role');