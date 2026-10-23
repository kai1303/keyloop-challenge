import { createClient } from "@supabase/supabase-js";

export function publicRealtimeClient() {
  const url = import.meta.env.VITE_BOOKINGS_SUPABASE_URL;
  const key = import.meta.env.VITE_BOOKINGS_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !key.startsWith("sb_publishable_")) {
    throw new Error("Configure the Supabase URL and publishable browser key");
  }
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
