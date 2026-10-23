// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domAnimation, MotionConfig } from "motion/react";
import { DocumentsDashboard } from "./DocumentsDashboard";
import { searchDocuments } from "./documents-api";
import { VIN, result, allResult } from "./documents-fixture";
vi.mock("./documents-api", async (original) => ({
  ...(await original<typeof import("./documents-api")>()),
  searchDocuments: vi.fn(),
}));
beforeEach(() => {
  vi.mocked(searchDocuments)
    .mockReset()
    .mockImplementation(async (vin) => (vin ? result : allResult));
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
  Element.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
async function setup() {
  render(
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="always">
        <DocumentsDashboard />
      </MotionConfig>
    </LazyMotion>,
  );
  await screen.findByRole("heading", { name: "All documents" });
  return userEvent.setup();
}
async function search(user: ReturnType<typeof userEvent.setup>, vin = VIN) {
  const input = screen.getByRole("textbox", {
    name: /Vehicle identification number/,
  });
  await user.clear(input);
  await user.type(input, vin);
  await user.click(screen.getByRole("button", { name: "Search documents" }));
}
it("submits one normalized VIN and consolidates both source-labelled results", async () => {
  const user = await setup();
  expect(searchDocuments).toHaveBeenCalledWith("", expect.any(AbortSignal));
  await search(user, " " + VIN.toLowerCase() + " ");
  expect(searchDocuments).toHaveBeenCalledWith(VIN, expect.any(AbortSignal));
  const table = await screen.findByRole("table", { name: "Vehicle documents" });
  expect(within(table).getByText("Sales System")).toBeTruthy();
  expect(within(table).getByText("Service System")).toBeTruthy();
  expect(within(table).getAllByRole("row")).toHaveLength(3);
});
it("previews the document safely and restores focus after Escape", async () => {
  const user = await setup();
  const unsafeText = '<img src=x onerror="alert(1)">';
  vi.mocked(searchDocuments).mockResolvedValue({
    ...result,
    documents: [
      { ...result.documents[0], content: unsafeText },
      result.documents[1],
    ],
  });
  await search(user);
  const trigger = await screen.findByRole("button", {
    name: "Preview Service invoice from Service System",
  });
  await user.click(trigger);
  const dialog = screen.getByRole("dialog", { name: "Service invoice" });
  expect(within(dialog).getByText(unsafeText)).toBeTruthy();
  expect(dialog.querySelector("img")).toBeNull();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(document.activeElement).toBe(trigger);
});
it("identifies an unavailable source without losing available documents", async () => {
  const user = await setup();
  vi.mocked(searchDocuments).mockResolvedValue({
    ...result,
    documents: [result.documents[1]],
    sources: {
      sales: { label: "Sales System", status: "ok", count: 1 },
      service: { label: "Service System", status: "unavailable", count: 0 },
    },
  });
  await search(user);
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Service System unavailable",
  );
  expect(screen.getByRole("table")).toBeTruthy();
});
it("retains input after failure and lets the manager retry", async () => {
  const user = await setup();
  vi.mocked(searchDocuments).mockRejectedValueOnce(
    new Error("All document systems are unavailable. Please try again."),
  );
  await search(user);
  expect((await screen.findByRole("alert")).textContent).toContain(
    "All document systems",
  );
  expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe(VIN);
  await user.click(screen.getByRole("button", { name: "Retry search" }));
  expect(await screen.findByRole("table")).toBeTruthy();
});
it("ignores an older search that finishes after a newer VIN", async () => {
  const user = await setup();
  let resolveOld!: (value: typeof result) => void;
  vi.mocked(searchDocuments).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
  );
  const nextVin = "WVWZZZ1JZXW000001";
  vi.mocked(searchDocuments).mockResolvedValueOnce({
    vin: nextVin,
    documents: [],
    sources: {
      sales: { label: "Sales System", status: "ok", count: 0 },
      service: { label: "Service System", status: "ok", count: 0 },
    },
  });
  await search(user);
  await search(user, nextVin);
  expect(
    await screen.findByText("No documents found for this VIN."),
  ).toBeTruthy();
  await act(async () => {
    resolveOld(result);
  });
  expect(screen.queryByRole("table")).toBeNull();
  expect(screen.getByText(nextVin, { exact: true })).toBeTruthy();
});
it("validates VIN before a request and offers a working example", async () => {
  const user = await setup();
  vi.mocked(searchDocuments).mockClear();
  await search(user, "INVALID");
  expect(screen.getByRole("alert").textContent).toContain("17-character");
  expect(searchDocuments).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Use example VIN" }));
  expect(await screen.findByRole("table")).toBeTruthy();
});

it("lists all vehicles on load, filters by VIN, and returns to all documents", async () => {
  const user = await setup();
  expect(searchDocuments).toHaveBeenCalledTimes(1);
  expect(searchDocuments).toHaveBeenLastCalledWith("", expect.any(AbortSignal));
  expect(screen.getByRole("table").textContent).toContain("WDBRF40J93F000001");
  await search(user);
  expect(
    await screen.findByRole("heading", { name: "Vehicle documents" }),
  ).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Show all documents" }));
  expect(
    await screen.findByRole("heading", { name: "All documents" }),
  ).toBeTruthy();
  expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("");
  expect(searchDocuments).toHaveBeenLastCalledWith("", expect.any(AbortSignal));
  await user.click(screen.getByRole("button", { name: "Search documents" }));
  expect(searchDocuments).toHaveBeenLastCalledWith("", expect.any(AbortSignal));
});

it("renders and previews an additional source from response metadata", async () => {
  const user = await setup();
  vi.mocked(searchDocuments).mockResolvedValue({
    ...result,
    documents: [
      ...result.documents,
      {
        ...result.documents[0],
        id: "finance:101",
        source: "finance",
        title: "Finance agreement",
        content: "Fictional finance agreement",
      },
    ],
    sources: {
      ...result.sources,
      finance: { label: "Finance System", status: "ok", count: 1 },
    },
  });
  await search(user);
  expect(
    within(await screen.findByRole("table")).getByText("Finance System"),
  ).toBeTruthy();
  await user.click(
    screen.getByRole("button", {
      name: "Preview Finance agreement from Finance System",
    }),
  );
  const dialog = screen.getByRole("dialog", { name: "Finance agreement" });
  expect(within(dialog).getByText("Fictional finance agreement")).toBeTruthy();
  expect(dialog.textContent).toContain("Finance System");
});
