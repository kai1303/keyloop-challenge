// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AppRouter } from "./AppRouter";
const pending = new Promise(() => {});
vi.mock("./admin/inventory/InventoryDashboard", () => ({
  InventoryDashboard: () => {
    throw pending;
  },
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("uses the Inventory layout while the route is suspended", async () => {
  window.history.replaceState(null, "", "/admin/inventory");
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  render(<AppRouter />);
  expect(
    await screen.findByRole("status", { name: "Loading inventory" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("heading", { name: "Intelligent Inventory" }),
  ).toBeTruthy();
  expect(screen.getByRole("link", { name: "Bookings" })).toBeTruthy();
  expect(screen.queryByText("Loading…")).toBeNull();
});

vi.mock('./auth/StaffAuth', async () => {
  const { Outlet } = await import('react-router-dom');
  return { StaffAuthProvider: ({ children }: { children: import("react").ReactNode }) => <>{children}</>, StaffGate: () => <Outlet />, useStaffAuth: () => ({ user: { id: 'test-admin', name: 'Admin', role: 'admin' }, loading: false, signOut: async () => {} }) };
});
