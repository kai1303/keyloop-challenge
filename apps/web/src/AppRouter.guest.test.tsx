// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { domAnimation, LazyMotion } from "motion/react";
import { AppRouter } from "./AppRouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const useSession = vi.hoisted(() => vi.fn(() => ({ isPending: false, data: null })));
vi.mock("./auth/auth-client", () => ({ authClient: { useSession } }));

vi.mock("./App", () => ({ default: () => <h1>Component library</h1> }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  useSession.mockClear();
});

it.each(["/appointments", "/appointments/", "/appointments/availability"])(
  "opens %s in the unified app without the staff layout",
  async (path) => {
    window.history.replaceState(null, "", path);
    vi.stubEnv("VITE_BOOKINGS_SUPABASE_URL", "");
    vi.stubEnv("VITE_BOOKINGS_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (url: string) =>
          new Response(
            JSON.stringify(
              url.endsWith("/schedule")
                ? {
                    timeZone: "UTC",
                    hours: Array(7).fill({ open: "09:00", close: "17:00" }),
                  }
                : url.endsWith("/service-types")
                  ? [{ id: "oil", name: "Oil change", durationMinutes: 60 }]
                  : [],
            ),
          ),
      ),
    );
    render(
      <LazyMotion features={domAnimation} strict>
        <AppRouter />
      </LazyMotion>,
    );
    expect(
      await screen.findByRole("heading", { name: "Book your next service" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Keyloop/ }).getAttribute("href"),
    ).toBe("/appointments");
    expect(
      screen.queryByRole("navigation", { name: "Admin navigation" }),
    ).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "Component library" }),
    ).toBeNull();
    expect(useSession).not.toHaveBeenCalled();
  },
);

it("keeps the guest availability monitor outside the staff layout", async () => {
  window.history.replaceState(null, "", "/appointments/monitor");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify([]))),
  );
  render(
    <LazyMotion features={domAnimation} strict>
      <AppRouter />
    </LazyMotion>,
  );
  expect(
    await screen.findByRole("heading", { name: "Appointment availability" }),
  ).toBeTruthy();
  expect(
    screen.queryByRole("navigation", { name: "Admin navigation" }),
  ).toBeNull();
  expect(useSession).not.toHaveBeenCalled();
});

it("checks the staff session on login while guest routes remain public", async () => {
  window.history.replaceState(null, "", "/login");
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AppRouter />
    </QueryClientProvider>,
  );
  await screen.findByRole("heading", { name: "Staff sign in" });
  expect(useSession).toHaveBeenCalled();
});
