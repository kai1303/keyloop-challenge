import { filterVehicles, summary } from "./inventory-model";
import {
  DEFAULT_INVENTORY_QUERY,
  type InventoryQuery,
} from "./inventory-query";
// @vitest-environment jsdom
import { MemoryRouter } from "react-router-dom";
import { AdminLayout } from "../AdminLayout";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domAnimation, MotionConfig } from "motion/react";
import { InventoryDashboard } from "./InventoryDashboard";
import { useInventory } from "./useInventory";
import { getVehicle, InventoryError, saveAction } from "./inventory-api";
import { INITIAL_INVENTORY } from "./inventory-state";
import { snapshot } from "./inventory-fixture";

vi.mock("./useInventory", () => ({ useInventory: vi.fn() }));
vi.mock("./inventory-api", async (original) => ({
  ...(await original<typeof import("./inventory-api")>()),
  getVehicle: vi.fn(),
  saveAction: vi.fn(),
}));
const refresh = vi.fn();
const saved = {
  ...snapshot.vehicles[0],
  currentAction: "Monitor Stock" as const,
  note: "weekly",
  actionUpdatedAt: snapshot.serverTime,
  version: 1,
};
const state = () => ({
  ...INITIAL_INVENTORY,
  data: snapshot,
  metadata: {
    summary: summary(snapshot.vehicles),
    options: { Toyota: ["Corolla"], BMW: ["X1"] },
  },
  connection: "Live" as const,
  stale: false,
  loading: false,
  lastUpdated: snapshot.serverTime,
  refresh,
});
function mockInventory(base: ReturnType<typeof useInventory>) {
  vi.mocked(useInventory).mockImplementation(
    (query: InventoryQuery = DEFAULT_INVENTORY_QUERY) => ({
      ...base,
      data: base.data
        ? {
            ...base.data,
            vehicles: filterVehicles(
              base.data.vehicles,
              query,
              query.sorting[0],
            ).filter(
              (vehicle) =>
                query.action === "all" ||
                (query.action === "needsAction"
                  ? vehicle.aging && !vehicle.currentAction
                  : vehicle.currentAction === query.action),
            ),
          }
        : null,
    }),
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mockInventory(state());
  vi.mocked(saveAction).mockReset().mockResolvedValue(saved);
  vi.mocked(getVehicle).mockReset().mockResolvedValue(saved);
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
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const page = (reducedMotion: "always" | "never" = "always") => (
  <LazyMotion features={domAnimation} strict>
    <MotionConfig reducedMotion={reducedMotion}>
      <MemoryRouter>
        <AdminLayout activePage="inventory">
          <InventoryDashboard />
        </AdminLayout>
      </MemoryRouter>
    </MotionConfig>
  </LazyMotion>
);
async function choose(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  option: string,
) {
  const column =
    label === "Make" || label === "Model"
      ? "Vehicle"
      : label === "Days in stock"
        ? "Days in stock"
        : null;
  if (column)
    await user.click(
      screen.getByRole("button", { name: column + " column options" }),
    );
  await user.click(screen.getByRole("combobox", { name: label }));
  await user.click(screen.getByRole("option", { name: option }));
  if (column) await user.keyboard("{Escape}");
}
it("renders inventory within the existing admin navigation and filters stock", async () => {
  const user = userEvent.setup();
  render(page());
  expect(
    screen.getByRole("heading", { name: "Intelligent Inventory" }),
  ).toBeTruthy();
  const clearFilters = screen.getByRole("button", { name: "Clear filters" });
  expect(clearFilters.hasAttribute("disabled")).toBe(true);
  expect(
    clearFilters.compareDocumentPosition(screen.getByRole("table")) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "Bookings" }).getAttribute("href"),
  ).toBe("/admin/bookings");
  expect(within(screen.getByRole("table")).getByText("KL-002")).toBeTruthy();
  expect(
    screen.getByText("KL-001").closest("tr")!.getAttribute("data-aging"),
  ).toBe("true");
  expect(
    screen.getByText("KL-002").closest("tr")!.hasAttribute("data-aging"),
  ).toBe(false);
  await choose(user, "Days in stock", "Over 90 days");
  expect(clearFilters.hasAttribute("disabled")).toBe(false);
  expect(within(screen.getByRole("table")).queryByText("KL-002")).toBeNull();
  await choose(user, "Make", "BMW");
  expect(screen.getByText("No vehicles match your filters.")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(within(screen.getByRole("table")).getByText("KL-002")).toBeTruthy();
  expect(clearFilters.hasAttribute("disabled")).toBe(true);
});
it("saves an action and requests a persisted snapshot", async () => {
  const user = userEvent.setup();
  render(page());
  await user.click(
    screen.getByRole("button", { name: "Log action for KL-001" }),
  );
  await choose(user, "Current action", "Monitor Stock");
  await user.type(screen.getByLabelText("Note (optional)"), "weekly");
  await user.click(screen.getByRole("button", { name: "Save action" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(saveAction).toHaveBeenCalledWith(snapshot.vehicles[0].id, {
    action: "Monitor Stock",
    note: "weekly",
    expectedVersion: 0,
  });
  expect(refresh).toHaveBeenCalled();
  expect(screen.getByText("KL-001 action saved.")).toBeTruthy();
});
it("shows vehicle context in the existing popover pattern and keeps it open for action editing", async () => {
  const user = userEvent.setup();
  render(page());
  await user.click(screen.getByRole("button", { name: "View KL-001" }));
  const detailsElement = screen.getByRole("dialog", {
    name: "Vehicle details",
  });
  const details = within(detailsElement);
  expect(details.getByText("2029-10-04")).toBeTruthy();
  await user.click(details.getByRole("button", { name: "Log action" }));
  expect(
    screen.getByRole("dialog", { name: "Log vehicle action" }),
  ).toBeTruthy();
  expect(detailsElement.isConnected).toBe(true);
});
it("retains a failed draft and requires deliberate review after a conflict", async () => {
  const user = userEvent.setup();
  vi.mocked(saveAction).mockRejectedValueOnce(
    new InventoryError("Another manager changed this action", 409),
  );
  vi.mocked(getVehicle).mockResolvedValue(saved);
  render(page());
  await user.click(
    screen.getByRole("button", { name: "Log action for KL-001" }),
  );
  await choose(user, "Current action", "Monitor Stock");
  await user.type(screen.getByLabelText("Note (optional)"), "my draft");
  await user.click(screen.getByRole("button", { name: "Save action" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("Another manager"),
  );
  expect(
    (screen.getByLabelText("Note (optional)") as HTMLTextAreaElement).value,
  ).toBe("my draft");
  expect(
    (screen.getByRole("button", { name: "Save action" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  await user.click(
    screen.getByRole("button", { name: "Load latest action (replaces draft)" }),
  );
  await waitFor(() =>
    expect(
      (screen.getByLabelText("Note (optional)") as HTMLTextAreaElement).value,
    ).toBe("weekly"),
  );
  await user.click(screen.getByRole("button", { name: "Save action" }));
  await waitFor(() =>
    expect(saveAction).toHaveBeenLastCalledWith(
      snapshot.vehicles[0].id,
      expect.objectContaining({ expectedVersion: 1 }),
    ),
  );
});
it("does not replace an open draft or expected version when snapshots change", async () => {
  const user = userEvent.setup();
  const rendered = render(page());
  await user.click(
    screen.getByRole("button", { name: "Log action for KL-001" }),
  );
  await choose(user, "Current action", "Monitor Stock");
  await user.type(screen.getByLabelText("Note (optional)"), "keep this draft");
  mockInventory({
    ...state(),
    data: { ...snapshot, vehicles: [saved, snapshot.vehicles[1]] },
  });
  rendered.rerender(page());
  expect(
    (screen.getByLabelText("Note (optional)") as HTMLTextAreaElement).value,
  ).toBe("keep this draft");
  await user.click(screen.getByRole("button", { name: "Save action" }));
  await waitFor(() =>
    expect(saveAction).toHaveBeenCalledWith(
      snapshot.vehicles[0].id,
      expect.objectContaining({ expectedVersion: 0 }),
    ),
  );
});
it("supports Escape and restores the originating action control", async () => {
  const user = userEvent.setup();
  render(page());
  const trigger = screen.getByRole("button", { name: "Log action for KL-001" });
  await user.click(trigger);
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(document.activeElement).toBe(trigger);
});
it("shows a real empty dealership separately from a failed load", () => {
  mockInventory({
    ...state(),
    data: { ...snapshot, vehicles: [] },
  });
  const rendered = render(page());
  expect(screen.getByText("No vehicles in inventory.")).toBeTruthy();
  mockInventory({
    ...state(),
    data: null,
    error: "Inventory is unavailable",
    stale: true,
    connection: "Disconnected",
  });
  rendered.rerender(page());
  expect(screen.getByRole("alert").textContent).toContain(
    "Inventory is unavailable",
  );
  expect(screen.queryByText("No vehicles in inventory.")).toBeNull();
});

it("animates the page entrance once without replaying it on a live snapshot", async () => {
  const { rerender } = render(page("never"));
  const header = screen
    .getByRole("heading", { name: "Intelligent Inventory" })
    .closest("header")!;
  const metrics = screen.getByRole("region", {
    name: "Dealership inventory summary",
  });
  const firstMetric = metrics.querySelector("[data-slot=card]")!.parentElement!;
  expect(header.style.opacity).toBe("0");
  expect(firstMetric.style.opacity).toBe("0");
  await waitFor(() => {
    expect(header.style.opacity).toBe("1");
    expect(firstMetric.style.opacity).toBe("1");
  });
  mockInventory({
    ...state(),
    data: { ...snapshot, vehicles: snapshot.vehicles.slice(0, 1) },
  });
  rerender(page("never"));
  expect(
    screen
      .getByRole("heading", { name: "Intelligent Inventory" })
      .closest("header"),
  ).toBe(header);
  expect(firstMetric.style.opacity).toBe("1");
  expect(header.style.opacity).toBe("1");
});

it("animates vehicle details with the same entrance as booking details", async () => {
  render(page("never"));
  await userEvent.click(screen.getByRole("button", { name: "View KL-001" }));
  const details = screen.getByRole("dialog", { name: "Vehicle details" });
  const content = details.querySelector(".admin-details")!
    .firstElementChild as HTMLElement;
  expect(content.style.opacity).not.toBe("");
  await waitFor(() => expect(content.style.opacity).toBe("1"));
});

it("keeps filters in column menus and preserves sorting when live prices change", async () => {
  const user = userEvent.setup();
  const { rerender } = render(page());
  expect(screen.queryByRole("combobox", { name: "Make" })).toBeNull();
  await user.click(
    screen.getByRole("button", { name: "Price column options" }),
  );
  await user.click(screen.getByRole("button", { name: "Sort descending" }));
  const registrations = () =>
    within(screen.getByRole("table"))
      .getAllByRole("row")
      .slice(1)
      .map((row) => within(row).getAllByRole("cell")[1].textContent);
  expect(registrations()).toEqual(["KL-002", "KL-001"]);
  expect(
    screen
      .getByRole("button", { name: "Price column options" })
      .closest("th")!
      .getAttribute("aria-sort"),
  ).toBe("descending");
  mockInventory({
    ...state(),
    data: {
      ...snapshot,
      vehicles: snapshot.vehicles.map((v) =>
        v.registration === "KL-002" ? { ...v, pricePence: 1000 } : v,
      ),
    },
  });
  rerender(page());
  expect(registrations()).toEqual(["KL-001", "KL-002"]);
  await choose(user, "Make", "Toyota");
  await choose(user, "Model", "Corolla");
  await choose(user, "Make", "BMW");
  expect(registrations()).toEqual(["KL-002"]);
  await choose(user, "Make", "Toyota");
  await choose(user, "Days in stock", "61–90 days");
  expect(screen.getByText("No vehicles match your filters.")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Vehicle column options" }),
  ).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(registrations()).toEqual(["KL-001", "KL-002"]);
});

it("shows a structured loading layout until the first snapshot without inventing empty results", () => {
  mockInventory({ ...INITIAL_INVENTORY, refresh });
  const { rerender } = render(page("never"));
  const loading = screen.getByRole("status", { name: "Loading inventory" });
  expect(loading.getAttribute("aria-busy")).toBe("true");
  expect(loading.querySelectorAll('[data-slot="card"]')).toHaveLength(4);
  expect(loading.querySelectorAll("tbody tr")).toHaveLength(6);
  expect(screen.queryByText("No vehicles in inventory.")).toBeNull();
  expect(screen.queryByRole("button", { name: /column options/ })).toBeNull();
  expect(
    screen
      .getByRole("heading", { name: "Intelligent Inventory" })
      .closest("header")!.style.opacity,
  ).not.toBe("0");
  mockInventory(state());
  rerender(page("never"));
  expect(
    screen.queryByRole("status", { name: "Loading inventory" }),
  ).toBeNull();
  expect(within(screen.getByRole("table")).getByText("KL-001")).toBeTruthy();
});
it("keeps loaded rows and active filters visible during background refresh", async () => {
  const user = userEvent.setup();
  const { rerender } = render(page());
  await choose(user, "Days in stock", "Over 90 days");
  const table = screen.getByRole("table");
  mockInventory({
    ...state(),
    loading: true,
    stale: true,
  });
  rerender(page());
  expect(screen.getByRole("table")).toBe(table);
  expect(within(table).getByText("KL-001")).toBeTruthy();
  expect(within(table).queryByText("KL-002")).toBeNull();
  expect(
    screen.queryByRole("status", { name: "Loading inventory" }),
  ).toBeNull();
});

it("replaces the skeleton without another fade or a warning above the content", () => {
  mockInventory({ ...INITIAL_INVENTORY, refresh });
  const { rerender } = render(page("never"));
  const loadingTable = document.querySelector(".inventory-loading table")!;
  expect(loadingTable.classList.contains("inventory-table")).toBe(true);
  mockInventory({
    ...state(),
    stale: true,
    connection: "Connecting",
  });
  rerender(page("never"));
  const metrics = screen.getByRole("region", {
    name: "Dealership inventory summary",
  });
  const metric = metrics.querySelector('[data-slot="card"]')!.parentElement!;
  const board = screen
    .getByRole("heading", { name: "Vehicle inventory" })
    .closest('[data-slot="card"]')!.parentElement!;
  expect(metric.style.opacity).toBe("1");
  expect(board.style.opacity).toBe("1");
  expect(screen.getByRole("table").classList.contains("inventory-table")).toBe(
    true,
  );
  expect(document.querySelector(".inventory-warning")).toBeNull();
  expect(
    screen.getByRole("status", { name: "Inventory freshness" }).textContent,
  ).toContain("Updating inventory");
});
it("keeps reconnect warnings below the inventory instead of shifting the metrics", () => {
  const { rerender } = render(page());
  mockInventory({
    ...state(),
    stale: true,
    connection: "Reconnecting",
  });
  rerender(page());
  const metrics = screen.getByRole("region", {
    name: "Dealership inventory summary",
  });
  const status = screen.getByRole("status", { name: "Inventory freshness" });
  expect(status.textContent).toContain("Inventory may be out of date");
  expect(
    metrics.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(document.querySelector(".inventory-warning")).toBeNull();
});

it("sends secondary sorting to the server query without losing filters", async () => {
  const user = userEvent.setup();
  render(page());
  await choose(user, "Days in stock", "Over 90 days");
  await user.click(
    screen.getByRole("button", { name: "Price column options" }),
  );
  await user.click(screen.getByRole("button", { name: "Add descending sort" }));
  expect(useInventory).toHaveBeenLastCalledWith(
    expect.objectContaining({
      age: "aging",
      sorting: [
        { key: "daysInStock", direction: "desc" },
        { key: "pricePence", direction: "desc" },
      ],
      after: null,
    }),
  );
  expect(screen.getByRole("group", { name: "Active sorting" })).toBeTruthy();
});
it("uses cursor history for Next and Previous and resets it when filtering", async () => {
  vi.mocked(useInventory).mockImplementation(
    (query = DEFAULT_INVENTORY_QUERY) => ({
      ...state(),
      data: {
        ...snapshot,
        vehicles: [snapshot.vehicles[query.after ? 1 : 0]],
        nextCursor: query.after ? null : "next-page",
      },
    }),
  );
  const user = userEvent.setup();
  render(page());
  const pagination = screen.getByRole("navigation", {
    name: "Inventory pagination",
  });
  expect(pagination.getAttribute("data-slot")).toBe("pagination");
  expect(
    within(pagination)
      .getByRole("button", { name: "Go to previous page" })
      .hasAttribute("disabled"),
  ).toBe(true);
  expect(screen.getByText("Page 1").getAttribute("aria-current")).toBe("page");
  await user.click(screen.getByRole("button", { name: "Go to next page" }));
  expect(useInventory).toHaveBeenLastCalledWith(
    expect.objectContaining({ after: "next-page" }),
  );
  expect(screen.getByText("Page 2")).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: "Go to next page" })
      .hasAttribute("disabled"),
  ).toBe(true);
  await user.click(screen.getByRole("button", { name: "Go to previous page" }));
  expect(useInventory).toHaveBeenLastCalledWith(
    expect.objectContaining({ after: null }),
  );
  await user.click(screen.getByRole("button", { name: "Go to next page" }));
  await choose(user, "Make", "Toyota");
  expect(useInventory).toHaveBeenLastCalledWith(
    expect.objectContaining({ make: "Toyota", after: null }),
  );
  expect(screen.getByText("Page 1")).toBeTruthy();
});
it("disables cursor pagination and page-size changes while updating", () => {
  mockInventory({ ...state(), updating: true });
  render(page());
  const pagination = screen.getByRole("navigation", {
    name: "Inventory pagination",
  });
  expect(
    within(pagination)
      .getByRole("button", { name: "Go to previous page" })
      .hasAttribute("disabled"),
  ).toBe(true);
  expect(
    within(pagination)
      .getByRole("button", { name: "Go to next page" })
      .hasAttribute("disabled"),
  ).toBe(true);
  expect(
    screen
      .getByRole("combobox", { name: "Rows per page" })
      .hasAttribute("disabled"),
  ).toBe(true);
});
