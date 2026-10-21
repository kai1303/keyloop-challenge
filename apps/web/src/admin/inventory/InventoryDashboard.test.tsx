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
import { LazyMotion, domAnimation, MotionConfig } from "motion/react";
import { InventoryDashboard } from "./InventoryDashboard";
import { useInventory } from "./useInventory";
import { getInventory, InventoryError, saveAction } from "./inventory-api";
import { INITIAL_INVENTORY } from "./watch-inventory";
import { snapshot } from "./inventory-fixture";

vi.mock("./useInventory", () => ({ useInventory: vi.fn() }));
vi.mock("./inventory-api", async (original) => ({
  ...(await original<typeof import("./inventory-api")>()),
  getInventory: vi.fn(),
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
  connection: "Live" as const,
  stale: false,
  loading: false,
  lastUpdated: snapshot.serverTime,
  refresh,
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useInventory).mockReturnValue(state());
  vi.mocked(saveAction).mockReset().mockResolvedValue(saved);
  vi.mocked(getInventory).mockReset().mockResolvedValue(snapshot);
  vi.stubGlobal(
    "matchMedia",
    vi
      .fn()
      .mockImplementation(() => ({
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
const page = () => (
  <LazyMotion features={domAnimation} strict>
    <MotionConfig reducedMotion="always">
      <InventoryDashboard />
    </MotionConfig>
  </LazyMotion>
);
async function choose(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  option: string,
) {
  await user.click(screen.getByRole("combobox", { name: label }));
  await user.click(screen.getByRole("option", { name: option }));
}
it("renders inventory within the existing admin navigation and filters stock", async () => {
  const user = userEvent.setup();
  render(page());
  expect(
    screen.getByRole("heading", { name: "Intelligent Inventory" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "Bookings" }).getAttribute("href"),
  ).toBe("/admin/bookings");
  expect(within(screen.getByRole("table")).getByText("KL-002")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: /Show aging stock/ }));
  expect(within(screen.getByRole("table")).queryByText("KL-002")).toBeNull();
  await choose(user, "Make", "BMW");
  expect(screen.getByText("No vehicles match your filters.")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(within(screen.getByRole("table")).getByText("KL-002")).toBeTruthy();
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
  vi.mocked(getInventory).mockResolvedValue({
    ...snapshot,
    vehicles: [saved, snapshot.vehicles[1]],
  });
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
  vi.mocked(useInventory).mockReturnValue({
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
  vi.mocked(useInventory).mockReturnValue({
    ...state(),
    data: { ...snapshot, vehicles: [] },
  });
  const rendered = render(page());
  expect(screen.getByText("No vehicles in inventory.")).toBeTruthy();
  vi.mocked(useInventory).mockReturnValue({
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
