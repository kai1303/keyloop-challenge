// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";
import { AdminLayout } from "./AdminLayout";
import { LazyMotion, domAnimation } from "motion/react";
const motionPreferences = vi.hoisted(() => ({ reduced: false }));
vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  useReducedMotion: () => motionPreferences.reduced,
}));
import userEvent from "@testing-library/user-event";
const signOut = vi.hoisted(() => vi.fn(async () => {}));

function renderLayout(element: ReactElement) {
  return render(
    <LazyMotion features={domAnimation}>
      <MemoryRouter>{element}</MemoryRouter>
    </LazyMotion>,
  );
}

beforeEach(() => {
  motionPreferences.reduced = false;
  signOut.mockReset();
  signOut.mockResolvedValue(undefined);
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("keeps a single main navigation without the duplicate workspace rail", () => {
  renderLayout(
    <AdminLayout activePage="inventory">
      <h1>Inventory test</h1>
    </AdminLayout>,
  );
  expect(
    screen.queryByRole("navigation", { name: "Workspace switcher" }),
  ).toBeNull();
  const nav = within(
    screen.getByRole("navigation", { name: "Admin navigation" }),
  );
  expect(nav.getAllByRole("link")).toHaveLength(4);
  expect(nav.getByRole("link", { name: "Bookings" }).getAttribute("href")).toBe(
    "/admin/bookings",
  );
  expect(
    nav.getByRole("link", { name: "Inventory" }).getAttribute("href"),
  ).toBe("/admin/inventory");
  expect(screen.getByRole("img", { name: "Keyloop" })).toBeTruthy();
});
it("marks only Inventory active and keeps just account controls in the footer", () => {
  renderLayout(
    <AdminLayout activePage="inventory">
      <h1>Inventory test</h1>
    </AdminLayout>,
  );
  expect(
    screen
      .getByRole("link", { name: "Inventory" })
      .getAttribute("aria-current"),
  ).toBe("page");
  expect(
    screen.getByRole("link", { name: "Bookings" }).hasAttribute("aria-current"),
  ).toBe(false);
  expect(screen.queryByText("Demo workspace")).toBeNull();
  expect(screen.queryByRole("link", { name: "Component library" })).toBeNull();
  expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Resources" })).toBeNull();
  expect(screen.getByRole("main").contains(screen.getByRole("heading"))).toBe(
    true,
  );
});
it("keeps the same sidebar content when switching sections", () => {
  const { rerender } = renderLayout(
    <AdminLayout activePage="bookings">
      <h1>Bookings test</h1>
    </AdminLayout>,
  );
  const sidebar = screen.getByRole("complementary");
  const text = sidebar.textContent;
  rerender(
    <LazyMotion features={domAnimation}>
      <MemoryRouter>
        <AdminLayout activePage="inventory">
          <h1>Inventory test</h1>
        </AdminLayout>
      </MemoryRouter>
    </LazyMotion>,
  );
  expect(screen.getByRole("complementary")).toBe(sidebar);
  expect(sidebar.textContent).toBe(text);
  expect(screen.getByText("Dealership administration")).toBeTruthy();
  expect(
    within(sidebar).queryByRole("button", { name: "Resources" }),
  ).toBeNull();
  expect(
    within(sidebar).queryByRole("button", { name: "Opening hours" }),
  ).toBeNull();
});
it("marks Sales Leads active without selecting another workspace", () => {
  renderLayout(
    <AdminLayout activePage="leads">
      <h1>Leads test</h1>
    </AdminLayout>,
  );
  const nav = within(
    screen.getByRole("navigation", { name: "Admin navigation" }),
  );
  expect(
    nav.getByRole("link", { name: "Sales Leads" }).getAttribute("aria-current"),
  ).toBe("page");
  expect(
    nav.getByRole("link", { name: "Inventory" }).hasAttribute("aria-current"),
  ).toBe(false);
  expect(
    nav.getByRole("link", { name: "Bookings" }).hasAttribute("aria-current"),
  ).toBe(false);
});

it("marks Documents active while preserving the shared navigation", () => {
  renderLayout(
    <AdminLayout activePage="documents">
      <h1>Documents test</h1>
    </AdminLayout>,
  );
  const nav = within(
    screen.getByRole("navigation", { name: "Admin navigation" }),
  );
  expect(
    nav.getByRole("link", { name: "Documents" }).getAttribute("aria-current"),
  ).toBe("page");
  expect(
    nav.getByRole("link", { name: "Documents" }).getAttribute("href"),
  ).toBe("/admin/documents");
  expect(
    nav.getByRole("link", { name: "Bookings" }).hasAttribute("aria-current"),
  ).toBe(false);
});

vi.mock("../auth/StaffAuth", () => ({
  useStaffAuth: () => ({
    user: { id: "test-admin", name: "Admin", role: "admin" },
    signOut,
  }),
}));

it("keeps Sign out connected to session logout", async () => {
  renderLayout(
    <AdminLayout activePage="bookings">
      <h1>Bookings</h1>
    </AdminLayout>,
  );
  await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
  expect(signOut).toHaveBeenCalledTimes(1);
});

it("combines the responsive account controls in a keyboard-accessible popover", async () => {
  const user = userEvent.setup();
  renderLayout(
    <AdminLayout activePage="inventory">
      <h1>Inventory</h1>
    </AdminLayout>,
  );
  const trigger = screen.getByRole("button", {
    name: "Account menu for Admin",
  });
  trigger.focus();
  await user.keyboard("{Enter}");
  const account = await screen.findByRole("dialog", { name: "Staff account" });
  expect(within(account).getAllByText("Admin")).toHaveLength(2);
  await user.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Staff account" })).toBeNull(),
  );
  await waitFor(() => expect(document.activeElement).toBe(trigger));
  await user.click(trigger);
  await user.click(
    within(
      await screen.findByRole("dialog", { name: "Staff account" }),
    ).getByRole("button", { name: "Sign out" }),
  );
  expect(signOut).toHaveBeenCalledTimes(1);
});

it("keeps logout failures visible inside the responsive account popover", async () => {
  signOut.mockRejectedValueOnce(new Error("Please retry sign out"));
  const user = userEvent.setup();
  renderLayout(
    <AdminLayout activePage="inventory">
      <h1>Inventory</h1>
    </AdminLayout>,
  );
  await user.click(
    screen.getByRole("button", { name: "Account menu for Admin" }),
  );
  const account = await screen.findByRole("dialog", { name: "Staff account" });
  await user.click(within(account).getByRole("button", { name: "Sign out" }));
  expect((await within(account).findByRole("alert")).textContent).toBe(
    "Please retry sign out",
  );
});

it("finishes the exit animation before removing the account dropdown", async () => {
  const user = userEvent.setup();
  renderLayout(
    <AdminLayout activePage="inventory">
      <h1>Inventory</h1>
    </AdminLayout>,
  );
  await user.click(
    screen.getByRole("button", { name: "Account menu for Admin" }),
  );
  const account = await screen.findByRole("dialog", { name: "Staff account" });
  await user.keyboard("{Escape}");
  expect(account.isConnected).toBe(true);
  await waitFor(() => expect(account.isConnected).toBe(false));
});

it("skips dropdown movement when reduced motion is requested", async () => {
  motionPreferences.reduced = true;
  const user = userEvent.setup();
  renderLayout(
    <AdminLayout activePage="inventory">
      <h1>Inventory</h1>
    </AdminLayout>,
  );
  const trigger = screen.getByRole("button", {
    name: "Account menu for Admin",
  });
  await user.click(trigger);
  const account = await screen.findByRole("dialog", { name: "Staff account" });
  expect(account.style.transform).toMatch(/^(none)?$/);
  await user.keyboard("{Escape}");
  await waitFor(() => expect(account.isConnected).toBe(false));
  await waitFor(() => expect(document.activeElement).toBe(trigger));
});
