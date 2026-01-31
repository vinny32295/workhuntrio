-- Add service role policies for subscriptions table to allow edge functions to manage subscription data
-- This addresses the MISSING_RLS_PROTECTION finding for subscriptions table

-- Policy for service role to insert subscriptions (used by handle_new_user_subscription trigger and webhook)
CREATE POLICY "Service role can insert subscriptions"
ON public.subscriptions
FOR INSERT
TO service_role
WITH CHECK (true);

-- Policy for service role to update subscriptions (used by check-subscription and admin-update-tier edge functions)
CREATE POLICY "Service role can update subscriptions"
ON public.subscriptions
FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);