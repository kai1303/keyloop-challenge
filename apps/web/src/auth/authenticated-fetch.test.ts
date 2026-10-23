// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  authenticatedFetch,
  clearAccessToken,
  getAccessToken,
} from "./authenticated-fetch";
const mint = vi.hoisted(() => vi.fn());
vi.mock("./auth-client", () => ({ authClient: { token: mint } }));
const jwt = () =>
  "header." +
  btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 300 })) +
  ".signature";
beforeEach(() => {
  clearAccessToken();
  mint.mockReset().mockImplementation(async () => ({ data: { token: jwt() } }));
});
afterEach(() => {
  clearAccessToken();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("deduplicates token renewal and adds the JWT while preserving request headers", async () => {
  const fetcher = vi.fn(async () => new Response("{}"));
  vi.stubGlobal("fetch", fetcher);
  await Promise.all(
    [1, 2, 3].map(() =>
      authenticatedFetch("/api/inventory", {
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
  expect(mint).toHaveBeenCalledTimes(1);
  for (const [, init] of fetcher.mock.calls as unknown as [
    string,
    RequestInit,
  ][]) {
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Bearer " + jwt(),
    );
    expect(new Headers(init.headers).get("Content-Type")).toBe(
      "application/json",
    );
  }
});
it("renews near expiry without putting access tokens in web storage", async () => {
  vi.useFakeTimers();
  const stored = localStorage.length;
  await getAccessToken();
  await getAccessToken();
  expect(mint).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(280000);
  await getAccessToken();
  expect(mint).toHaveBeenCalledTimes(2);
  expect(localStorage.length).toBe(stored);
});
it("retries an unauthorized request only once, with a renewed token", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response("{}", { status: 401 }))
    .mockResolvedValue(new Response("{}", { status: 403 }));
  vi.stubGlobal("fetch", fetcher);
  expect((await authenticatedFetch("/api/inventory")).status).toBe(403);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(mint).toHaveBeenCalledTimes(2);
});
it("cannot restore an old access token after logout changes the session", async () => {
  let release!: (value: { data: { token: string } }) => void;
  mint.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const old = getAccessToken();
  clearAccessToken();
  const current = await getAccessToken();
  release({ data: { token: jwt() } });
  await expect(old).rejects.toThrow("Session changed");
  expect(await getAccessToken()).toBe(current);
  expect(mint).toHaveBeenCalledTimes(2);
});
it("shares one renewal when concurrent requests reject the same cached token", async () => {
  let sequence = 0;
  mint.mockImplementation(async () => {
    const value = jwt() + ++sequence;
    await Promise.resolve();
    return { data: { token: value } };
  });
  const stale = await getAccessToken();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (_path: string, init: RequestInit) =>
        new Response("{}", {
          status:
            new Headers(init.headers).get("Authorization") === "Bearer " + stale
              ? 401
              : 200,
        }),
    ),
  );
  const responses = await Promise.allSettled([
    authenticatedFetch("/api/inventory"),
    authenticatedFetch("/api/leads"),
  ]);
  expect(
    responses.map((result) =>
      result.status === "fulfilled"
        ? result.value.status
        : result.reason.message,
    ),
  ).toEqual([200, 200]);
  expect(mint).toHaveBeenCalledTimes(2);
});
