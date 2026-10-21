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
import { MemoryRouter } from "react-router-dom";
import { AdminLayout } from "../AdminLayout";
import { LeadsDashboard } from "./LeadsDashboard";
import { listLeads, getLead, addActivity, type LeadDetails } from "./leads-api";

vi.mock("./leads-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./leads-api")>()),
  listLeads: vi.fn(),
  getLead: vi.fn(),
  addActivity: vi.fn(),
}));
const alex: LeadDetails = {
  id: "10000000-0000-4000-8000-000000000001",
  customer_name: "Alex Morgan",
  email: "alex@example.com",
  phone: "0001",
  vehicle_interest: "Toyota Corolla",
  enquiry: "Can I test-drive on Saturday?\nPlease discuss part exchange.",
  source: "Dealership website",
  received_at: "2030-01-01T01:00:00Z",
  activities: [],
};
const jamie: LeadDetails = {
  ...alex,
  id: "10000000-0000-4000-8000-000000000002",
  customer_name: "Jamie Taylor",
  email: "jamie@example.com",
};
function setup() {
  render(
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="always">
        <MemoryRouter>
          <AdminLayout activePage="leads">
            <LeadsDashboard />
          </AdminLayout>
        </MemoryRouter>
      </MotionConfig>
    </LazyMotion>,
  );
  return userEvent.setup();
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
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
  vi.mocked(listLeads).mockResolvedValue([alex, jamie]);
  vi.mocked(getLead).mockImplementation(async (id) =>
    id === alex.id ? structuredClone(alex) : structuredClone(jamie),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("opens full enquiry and contact details with an empty history", async () => {
  const user = setup();
  await user.click(
    await screen.findByRole("button", { name: "View Alex Morgan" }),
  );
  const details = within(
    await screen.findByRole("complementary", { name: "Lead details" }),
  );
  expect(await details.findByText("alex@example.com")).toBeTruthy();
  expect(details.getByText(/Please discuss part exchange/)).toBeTruthy();
  expect(details.getByText("No follow-up activities yet.")).toBeTruthy();
  const nav = within(
    screen.getByRole("navigation", { name: "Admin navigation" }),
  );
  expect(
    nav.getByRole("link", { name: "Sales Leads" }).getAttribute("aria-current"),
  ).toBe("page");
});
it("shows a recoverable inbox failure and a separate empty state", async () => {
  vi.mocked(listLeads)
    .mockRejectedValueOnce(new Error("Unavailable"))
    .mockResolvedValueOnce([]);
  const user = setup();
  expect(await screen.findByRole("alert")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Retry inbox" }));
  expect(await screen.findByText("No sales leads yet.")).toBeTruthy();
});
it("ignores a late response for the previous selection", async () => {
  let resolveAlex!: (value: LeadDetails) => void;
  vi.mocked(getLead).mockImplementation((id) =>
    id === alex.id
      ? new Promise((resolve) => {
          resolveAlex = resolve;
        })
      : Promise.resolve(structuredClone(jamie)),
  );
  const user = setup();
  await user.click(
    await screen.findByRole("button", { name: "View Alex Morgan" }),
  );
  await user.click(screen.getByRole("button", { name: "View Jamie Taylor" }));
  expect(await screen.findByText("jamie@example.com")).toBeTruthy();
  resolveAlex(structuredClone(alex));
  await waitFor(() =>
    expect(screen.queryByText("alex@example.com")).toBeNull(),
  );
});
it("saves a note, renders the server result and reads saved history after remount", async () => {
  const activity = {
    id: crypto.randomUUID(),
    lead_id: alex.id,
    note: "Called customer",
    created_at: "2030-01-02T01:00:00Z",
  };
  vi.mocked(addActivity).mockResolvedValue(activity);
  const user = setup();
  await user.click(
    await screen.findByRole("button", { name: "View Alex Morgan" }),
  );
  const trigger = await screen.findByRole("button", { name: "Log activity" });
  await user.click(trigger);
  await user.type(screen.getByLabelText("Activity note"), "Called customer");
  await user.click(screen.getByRole("button", { name: "Save activity" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(document.activeElement).toBe(trigger);
  expect(screen.getByText("Called customer")).toBeTruthy();
  expect(screen.getByRole("status").textContent).toMatch(/Activity saved/);
  cleanup();
  vi.mocked(getLead).mockResolvedValue({ ...alex, activities: [activity] });
  const nextUser = setup();
  await nextUser.click(
    await screen.findByRole("button", { name: "View Alex Morgan" }),
  );
  expect(await screen.findByText("Called customer")).toBeTruthy();
});
