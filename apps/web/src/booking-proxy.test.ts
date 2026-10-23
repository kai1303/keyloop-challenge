import { createServer as createHttpServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import config from "../vite.config";

let vite: ViteDevServer;
let gateway: Server;
let backend: Server;
let operations: Server;
let origin: string;
let cacheDirectory: string;
const received: {
  path: string;
  key: string | undefined;
  system: string;
  authorization?: string;
}[] = [];
async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing test port");
  return `http://127.0.0.1:${address.port}`;
}
async function close(server: Server | undefined) {
  if (!server) return;
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
beforeAll(async () => {
  backend = createHttpServer((request, response) => {
    received.push({
      path: request.url!,
      key: request.headers["x-booking-admin-key"] as string | undefined,
      system: "appointments",
      ...(request.headers.authorization
        ? { authorization: request.headers.authorization }
        : {}),
    });
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ path: request.url }));
  });
  const target = await listen(backend);
  operations = createHttpServer((request, response) => {
    received.push({
      path: request.url!,
      key: request.headers["x-booking-admin-key"] as string | undefined,
      system: "operations",
      ...(request.headers.authorization
        ? { authorization: request.headers.authorization }
        : {}),
    });
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ path: request.url }));
  });
  const operationsTarget = await listen(operations);
  vi.stubEnv("BOOKINGS_API_ORIGIN", target);
  vi.stubEnv("INVENTORY_API_ORIGIN", operationsTarget);
  vi.stubEnv("BOOKING_ADMIN_KEY", "test-only-admin-key");
  const resolved =
    typeof config === "function"
      ? await config({ command: "serve", mode: "test" })
      : config;
  cacheDirectory = await mkdtemp(join(tmpdir(), "keyloop-proxy-test-"));
  vite = await createServer({
    ...resolved,
    cacheDir: cacheDirectory,
    configFile: false,
    plugins: [],
    server: {
      ...resolved.server,
      middlewareMode: true,
      hmr: false,
      ws: false,
      watch: null,
    },
  });
  gateway = createHttpServer(vite.middlewares);
  origin = await listen(gateway);
});
afterAll(async () => {
  await close(gateway);
  await vite?.close();
  await close(backend);
  await close(operations);
  if (cacheDirectory)
    await rm(cacheDirectory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

it("forwards guest reads and confirmations without the admin credential", async () => {
  for (const path of [
    "schedule",
    "service-types",
    "bookings?month=2030-01",
    "availability?serviceTypeId=oil",
    "availability/slots?date=2030-01-02",
    "bookings",
  ]) {
    const response = await fetch(`${origin}/api/${path}`, {
      method: path === "bookings" ? "POST" : "GET",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ path: "/" + path });
    expect(received.at(-1)).toEqual({
      path: "/" + path,
      key: undefined,
      system: "operations",
    });
  }
});
it("does not inject an obsolete staff credential and preserves the main API path", async () => {
  await fetch(origin + "/booking-api/admin/bookings");
  expect(received.at(-1)).toEqual({
    path: "/admin/bookings",
    key: undefined,
    system: "appointments",
  });
  await fetch(origin + "/api/inventory?limit=10");
  expect(received.at(-1)).toEqual({
    path: "/inventory?limit=10",
    key: undefined,
    system: "operations",
  });
});

it("uses one API origin when no separate booking origin is configured", async () => {
  const previous = process.env.BOOKINGS_API_ORIGIN;
  vi.stubEnv("BOOKINGS_API_ORIGIN", "");
  let unified: ViteDevServer | undefined;
  let server: Server | undefined;
  try {
    const resolved =
      typeof config === "function"
        ? await config({ command: "serve", mode: "test" })
        : config;
    unified = await createServer({
      ...resolved,
      configFile: false,
      plugins: [],
      cacheDir: join(cacheDirectory, "unified"),
      server: {
        ...resolved.server,
        middlewareMode: true,
        hmr: false,
        ws: false,
        watch: null,
      },
    });
    server = createHttpServer(unified.middlewares);
    const target = await listen(server);
    for (const [path, forwarded, key] of [
      ["/api/inventory", "/inventory", undefined],
      ["/api/service-types", "/service-types", undefined],
      ["/booking-api/admin/bookings", "/admin/bookings", undefined],
    ]) {
      const response = await fetch(target + path);
      expect(response.status).toBe(200);
      expect(received.at(-1)).toEqual({
        path: forwarded,
        key,
        system: "operations",
      });
    }
  } finally {
    await close(server);
    await unified?.close();
    vi.stubEnv("BOOKINGS_API_ORIGIN", previous);
  }
});

it("forwards the caller JWT through both staff proxies", async () => {
  for (const path of ["/booking-api/admin/bookings", "/api/staff/me"]) {
    expect(
      (
        await fetch(origin + path, {
          headers: { Authorization: "Bearer test-jwt" },
        })
      ).status,
    ).toBe(200);
    expect(received.at(-1)?.authorization).toBe("Bearer test-jwt");
    expect(received.at(-1)?.key).toBeUndefined();
  }
});
