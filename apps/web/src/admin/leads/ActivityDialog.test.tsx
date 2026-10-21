// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domAnimation, MotionConfig } from "motion/react";
import { ActivityDialog } from "./ActivityDialog";
import { addActivity, type Activity, type LeadDetails } from "./leads-api";

vi.mock("./leads-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./leads-api")>()),
  addActivity: vi.fn(),
}));
const lead: LeadDetails = {
  id: "10000000-0000-4000-8000-000000000001",
  customer_name: "Alex Morgan",
  email: "alex@example.com",
  phone: "0001",
  vehicle_interest: "Toyota Corolla",
  enquiry: "Saturday test drive",
  source: "Dealership website",
  received_at: "2030-01-01T00:00:00Z",
  activities: [],
};
const saved: Activity = {
  id: "20000000-0000-4000-8000-000000000001",
  lead_id: lead.id,
  note: "Called customer",
  created_at: "2030-01-02T00:00:00Z",
};
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
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function setup() {
  const onSaved = vi.fn();
  const onClose = vi.fn();
  render(
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="always">
        <ActivityDialog lead={lead} onSaved={onSaved} onClose={onClose} />
      </MotionConfig>
    </LazyMotion>,
  );
  return { user: userEvent.setup(), onSaved, onClose };
}
it("rejects a whitespace-only note before sending", async () => {
  const { user } = setup();
  await user.type(screen.getByLabelText("Activity note"), "   ");
  await user.click(screen.getByRole("button", { name: "Save activity" }));
  expect(screen.getByRole("alert").textContent).toMatch(/1–2,000/);
  expect(addActivity).not.toHaveBeenCalled();
});
it("retains the note and submission ID after a failed request", async () => {
  vi.mocked(addActivity)
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValueOnce(saved);
  const { user, onSaved } = setup();
  await user.type(screen.getByLabelText("Activity note"), " Called customer ");
  await user.click(screen.getByRole("button", { name: "Save activity" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "Offline",
  );
  expect(
    (screen.getByLabelText("Activity note") as HTMLTextAreaElement).value,
  ).toBe(" Called customer ");
  const firstPayload = vi.mocked(addActivity).mock.calls[0][1];
  await user.click(screen.getByRole("button", { name: "Save activity" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
  expect(vi.mocked(addActivity).mock.calls[1][1]).toEqual(firstPayload);
  expect(firstPayload.note).toBe("Called customer");
});
it("uses a new ID when a failed draft is changed", async () => {
  vi.mocked(addActivity).mockRejectedValue(new Error("Offline"));
  const { user } = setup();
  await user.type(screen.getByLabelText("Activity note"), "First note");
  await user.click(screen.getByRole("button", { name: "Save activity" }));
  await screen.findByRole("alert");
  const firstId = vi.mocked(addActivity).mock.calls[0][1].id;
  await user.clear(screen.getByLabelText("Activity note"));
  await user.type(screen.getByLabelText("Activity note"), "Changed note");
  await user.click(screen.getByRole("button", { name: "Save activity" }));
  await waitFor(() => expect(addActivity).toHaveBeenCalledTimes(2));
  expect(vi.mocked(addActivity).mock.calls[1][1].id).not.toBe(firstId);
});
it("prevents duplicate submissions and dismissal while saving", async () => {
  let resolve!: (activity: Activity) => void;
  vi.mocked(addActivity).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const { user, onClose, onSaved } = setup();
  await user.type(screen.getByLabelText("Activity note"), "Called customer");
  await user.click(screen.getByRole("button", { name: "Save activity" }));
  await user.click(screen.getByRole("button", { name: "Saving…" }));
  await user.keyboard("{Escape}");
  expect(addActivity).toHaveBeenCalledTimes(1);
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toBeTruthy();
  resolve(saved);
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
  expect(onClose).toHaveBeenCalledTimes(1);
});
it("allows cancellation before saving", async () => {
  const { user, onClose } = setup();
  await user.type(screen.getByLabelText("Activity note"), "Discard this");
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onClose).toHaveBeenCalledOnce();
  expect(addActivity).not.toHaveBeenCalled();
});

it("allows Escape before a request starts", async () => {
  const { user, onClose } = setup();
  await user.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalledOnce();
  expect(addActivity).not.toHaveBeenCalled();
});
