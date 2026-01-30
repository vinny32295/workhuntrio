import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

// Get environment variables with fallbacks for when env vars fail to load
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://ejnqypkykyuguovunrsi.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqbnF5cGt5a3l1Z3VvdnVucnNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3MDU0NDgsImV4cCI6MjA4NTI4MTQ0OH0.kHT4df0xaglpVKehnPYkFtizCtDrPLKtA9x0X7B-7pY";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});
