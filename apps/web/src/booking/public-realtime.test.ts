import { afterEach, expect, it, vi } from "vitest";
import { publicRealtimeClient } from "./public-realtime";

afterEach(() => vi.unstubAllEnvs());

it("refuses missing public configuration", () => {
  vi.stubEnv("VITE_BOOKINGS_SUPABASE_URL", "");
  vi.stubEnv("VITE_BOOKINGS_SUPABASE_PUBLISHABLE_KEY", "");
  expect(() => publicRealtimeClient()).toThrow("publishable browser key");
});

it("refuses a secret key in browser configuration", () => {
  vi.stubEnv("VITE_BOOKINGS_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("VITE_BOOKINGS_SUPABASE_PUBLISHABLE_KEY", "sb_secret_example");
  expect(() => publicRealtimeClient()).toThrow("publishable browser key");
});
