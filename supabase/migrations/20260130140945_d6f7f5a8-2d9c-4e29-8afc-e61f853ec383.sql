-- Fix race condition in handle_new_user_role() function
-- Use advisory lock to prevent simultaneous admin assignments

CREATE OR REPLACE FUNCTION public.handle_new_user_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  user_count integer;
  assigned_role app_role;
  lock_obtained boolean;
BEGIN
  -- Try to get an advisory lock to prevent race conditions
  -- Lock ID 12345 is arbitrary but consistent for this function
  lock_obtained := pg_try_advisory_xact_lock(12345);
  
  IF NOT lock_obtained THEN
    -- If we can't get the lock, another transaction is checking
    -- Default to 'user' role to be safe
    assigned_role := 'user';
  ELSE
    -- Count existing users (excluding current one)
    SELECT COUNT(*) INTO user_count FROM auth.users WHERE id != NEW.id;
    
    -- First user gets admin, others get user role
    IF user_count = 0 THEN
      assigned_role := 'admin';
    ELSE
      assigned_role := 'user';
    END IF;
  END IF;
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, assigned_role);
  
  RETURN NEW;
END;
$function$;