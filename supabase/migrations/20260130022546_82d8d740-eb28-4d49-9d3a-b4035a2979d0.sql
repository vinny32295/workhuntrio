-- Create usage tracking table
CREATE TABLE public.usage_tracking (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  searches_this_week INTEGER NOT NULL DEFAULT 0,
  tailors_this_month INTEGER NOT NULL DEFAULT 0,
  resume_parses_total INTEGER NOT NULL DEFAULT 0,
  week_reset_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT date_trunc('week', now() + interval '1 week'),
  month_reset_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT date_trunc('month', now() + interval '1 month'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.usage_tracking ENABLE ROW LEVEL SECURITY;

-- Users can view their own usage
CREATE POLICY "Users can view their own usage"
ON public.usage_tracking
FOR SELECT
USING (auth.uid() = user_id);

-- Service role can manage usage (for edge functions)
CREATE POLICY "Service role can insert usage"
ON public.usage_tracking
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Service role can update usage"
ON public.usage_tracking
FOR UPDATE
USING (true)
WITH CHECK (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_usage_tracking_updated_at
BEFORE UPDATE ON public.usage_tracking
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create usage record for new users
CREATE OR REPLACE FUNCTION public.handle_new_user_usage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.usage_tracking (user_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_usage
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user_usage();