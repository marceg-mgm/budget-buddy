import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/config/supabase";

const isConfigured =
  SUPABASE_URL.startsWith("http") &&
  !SUPABASE_ANON_KEY.startsWith("PASTE_") &&
  SUPABASE_ANON_KEY.length > 20;

export const supabaseConfigured = isConfigured;

// Lazily create the client. If the user has not yet pasted their keys we still
// want the app to render (the AuthProvider will show a setup screen).
export const supabase: SupabaseClient = createClient(
  isConfigured ? SUPABASE_URL : "https://placeholder.supabase.co",
  isConfigured ? SUPABASE_ANON_KEY : "placeholder-anon-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
