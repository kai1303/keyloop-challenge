// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppRouter } from "./AppRouter";

vi.mock("./admin/BookingDashboard", () => ({
  BookingDashboard: () => <h1>Bookings page</h1>,
}));
vi.mock("./admin/inventory/InventoryDashboard", () => ({
  InventoryDashboard: () => <h1>Inventory page</h1>,
}));
vi.mock("./App", () => ({ default: () => <h1>Component library</h1> }));
beforeEach(() => {
  window.history.replaceState(null, "", "/admin/bookings");
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
it("switches admin content without replacing the sidebar and supports browser Back", async () => {
  const user = userEvent.setup();
  render(<AppRouter />);
  await screen.findByRole("heading", { name: "Bookings page" });
  const sidebar = screen.getByRole("complementary", {
    name: "Dealership administration",
  });
  const nav = within(
    screen.getByRole("navigation", { name: "Admin navigation" }),
  );
  const inventoryLink = nav.getByRole("link", { name: "Inventory" });
  await user.click(inventoryLink);
  await screen.findByRole("heading", { name: "Inventory page" });
  expect(window.location.pathname).toBe("/admin/inventory");
  expect(screen.getByRole("complementary")).toBe(sidebar);
  expect(nav.getByRole("link", { name: "Inventory" })).toBe(inventoryLink);
  expect(inventoryLink.getAttribute("aria-current")).toBe("page");
  window.history.back();
  await screen.findByRole("heading", { name: "Bookings page" });
  await waitFor(() => expect(window.location.pathname).toBe("/admin/bookings"));
  expect(screen.getByRole("complementary")).toBe(sidebar);
});
it("opens direct inventory routes without a component library sidebar link", async () => {
  window.history.replaceState(null, "", "/admin/inventory/");
  render(<AppRouter />);
  await screen.findByRole("heading", { name: "Inventory page" });
  expect(
    screen
      .getByRole("link", { name: "Inventory" })
      .getAttribute("aria-current"),
  ).toBe("page");
  expect(screen.queryByRole("link", { name: "Component library" })).toBeNull();
});
vi.mock("./admin/leads/LeadsDashboard", () => ({
  LeadsDashboard: () => <h1>Sales Leads page</h1>,
}));
it("opens Sales Leads and preserves the shared sidebar when navigating", async () => {
  window.history.replaceState(null, "", "/admin/leads/");
  render(<AppRouter />);
  await screen.findByRole("heading", { name: "Sales Leads page" });
  const sidebar = screen.getByRole("complementary", {
    name: "Dealership administration",
  });
  expect(
    screen
      .getByRole("link", { name: "Sales Leads" })
      .getAttribute("aria-current"),
  ).toBe("page");
  await userEvent.click(screen.getByRole("link", { name: "Inventory" }));
  await screen.findByRole("heading", { name: "Inventory page" });
  expect(screen.getByRole("complementary")).toBe(sidebar);
});

vi.mock("./admin/documents/DocumentsDashboard", () => ({
  DocumentsDashboard: () => <h1>Documents page</h1>,
}));
it("opens Documents through its persistent layout route", async () => {
  window.history.replaceState(null, "", "/admin/documents/");
  render(<AppRouter />);
  await screen.findByRole("heading", { name: "Documents page" });
  const sidebar = screen.getByRole("complementary");
  expect(
    screen
      .getByRole("link", { name: "Documents" })
      .getAttribute("aria-current"),
  ).toBe("page");
  await userEvent.click(screen.getByRole("link", { name: "Inventory" }));
  await screen.findByRole("heading", { name: "Inventory page" });
  expect(screen.getByRole("complementary")).toBe(sidebar);
});

vi.mock("./auth/StaffAuth", async () => {
  const { Outlet } = await import("react-router-dom");
  return {
    StaffAuthProvider: ({ children }: { children: import("react").ReactNode }) => <>{children}</>,
    StaffGate: () => <Outlet />,
    useStaffAuth: () => ({
      user: { id: "test-admin", name: "Admin", role: "admin" },
      loading: false,
      signOut: async () => {},
    }),
  };
});
