// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AppRouter } from "./AppRouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { StaffUser } from "./auth/StaffAuth";
const auth = vi.hoisted(() => ({ user: null as StaffUser | null }));
vi.mock("./auth/auth-client", () => ({
  authClient: {
    useSession: () => ({
      isPending: false,
      data: auth.user ? { user: auth.user, session: { id: "test-session" } } : null,
    }),
  },
}));
vi.mock("./auth/authenticated-fetch", () => ({
  clearAccessToken: vi.fn(),
  authenticatedFetch: async () => new Response(JSON.stringify(auth.user)),
}));
vi.mock("./admin/BookingDashboard", () => ({
  BookingDashboard: () => <h1>Private bookings</h1>,
}));
beforeEach(() => {
  auth.user = null;
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("redirects a direct staff route to sign-in before rendering private content", async () => {
  window.history.replaceState(null, "", "/admin/bookings");
  render(<QueryClientProvider client={new QueryClient()}><AppRouter /></QueryClientProvider>);
  expect(
    await screen.findByRole("heading", { name: "Staff sign in" }),
  ).toBeTruthy();
  expect(screen.queryByText("Private bookings")).toBeNull();
});

it("shows only booking navigation for Technician and redirects other modules", async () => {
  window.history.replaceState(null, "", "/admin/inventory");
  auth.user = { id: "tech",name: "Technician",email: "tech@example.test",role: "technician" };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AppRouter />
    </QueryClientProvider>,
  );
  await screen.findByRole("heading", { name: "Private bookings" });
  expect(screen.getByRole("link", { name: "Bookings" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Inventory" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Sales Leads" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Documents" })).toBeNull();
  expect(window.location.pathname).toBe("/admin/bookings");
});
