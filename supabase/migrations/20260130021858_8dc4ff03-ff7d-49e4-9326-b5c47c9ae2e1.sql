-- Allow service role to update subscriptions (for check-subscription function)
CREATE POLICY "Service role can update subscriptions"
ON public.subscriptions
FOR UPDATE
USING (true)
WITH CHECK (true);

-- Allow service role to insert subscriptions
CREATE POLICY "Service role can insert subscriptions"
ON public.subscriptions
FOR INSERT
WITH CHECK (true);