-- Fix critical RLS vulnerability: Remove permissive policies that allow users to modify subscription tiers

-- Drop the overly permissive policies on subscriptions table
DROP POLICY IF EXISTS "Service role can update subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Service role can insert subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can insert their own subscription" ON public.subscriptions;

-- Drop similar permissive policies on usage_tracking table
DROP POLICY IF EXISTS "Service role can insert usage" ON public.usage_tracking;
DROP POLICY IF EXISTS "Service role can update usage" ON public.usage_tracking;

-- Note: The "Users can view their own subscription" SELECT policy remains intact
-- Note: Edge functions using SUPABASE_SERVICE_ROLE_KEY bypass RLS entirely, so they can still INSERT/UPDATE