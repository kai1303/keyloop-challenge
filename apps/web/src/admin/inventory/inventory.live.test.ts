import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "node:process";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { dealerDate } from "../dealer-date";

describe.skipIf(env.RUN_INVENTORY_LIVE !== "1")(
  "real local Supabase inventory",
  () => {
    let server: SupabaseClient | undefined;
    let anonymous: SupabaseClient | undefined;
    let url: string, publicKey: string, origin: string;
    let headers: Record<string, string>;
    const id = randomUUID();
    const auth = {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    };
    beforeAll(async () => {
      url = env.INVENTORY_TEST_URL ?? "";
      publicKey = env.INVENTORY_TEST_ANON_KEY ?? "";
      origin = env.INVENTORY_TEST_API_ORIGIN ?? "http://127.0.0.1:3006";
      const parsed = new URL(url);
      const api = new URL(origin);
      if (
        !["127.0.0.1", "localhost"].includes(parsed.hostname) ||
        parsed.port !== "55321" ||
        !["127.0.0.1", "localhost"].includes(api.hostname) ||
        !env.INVENTORY_TEST_SERVICE_ROLE_KEY ||
        !publicKey
      )
        throw new Error("Explicit local inventory test configuration required");
      if (!env.INVENTORY_TEST_ACCESS_TOKEN)
        throw new Error("A fresh Admin JWT is required");
      headers = { Authorization: "Bearer " + env.INVENTORY_TEST_ACCESS_TOKEN };
      const profile = await fetch(origin + "/staff/me", { headers });
      if (!profile.ok || (await profile.json()).role !== "admin")
        throw new Error("A valid Admin JWT is required");
      server = createClient(url, env.INVENTORY_TEST_SERVICE_ROLE_KEY, { auth });
      anonymous = createClient(url, publicKey, { auth });
      const today = dealerDate();
      const stockedOn = new Date(
        Date.parse(today + "T00:00:00Z") - 120 * 86400000,
      )
        .toISOString()
        .slice(0, 10);
      const inserted = await server.from("vehicles").insert({
        id,
        registration: "INV-TEST-" + id.slice(0, 8),
        make: "Test",
        model: "Owned fixture",
        model_year: 2022,
        price_pence: 1000000,
        stocked_on: stockedOn,
      });
      if (inserted.error)
        throw new Error("Unable to insert the owned local test fixture");
    });
    afterAll(async () => {
      if (server) {
        const removed = await server.from("vehicles").delete().eq("id", id);
        if (removed.error)
          throw new Error("Owned inventory fixture cleanup failed: " + id);
        server.realtime.disconnect();
      }
      anonymous?.realtime.disconnect();
    });
    async function write(action: string, expectedVersion: number) {
      return fetch(origin + "/inventory/" + id + "/action", {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          note: "Owned realtime verification fixture",
          expectedVersion,
        }),
      });
    }
    it("rejects anonymous reads, table writes and action RPC", async () => {
      const read = await anonymous!
        .from("vehicles")
        .select("id")
        .eq("id", id)
        .single();
      expect(read.error).not.toBeNull();
      expect(read.data).toBeNull();
      const update = await anonymous!
        .from("vehicles")
        .update({ note: "forbidden" })
        .eq("id", id);
      expect(update.error).not.toBeNull();
      const insert = await anonymous!
        .from("vehicles")
        .insert({ id: randomUUID(), registration: "FORBIDDEN-TEST" });
      expect(insert.error).not.toBeNull();
      const remove = await anonymous!.from("vehicles").delete().eq("id", id);
      expect(remove.error).not.toBeNull();
      const rpc = await anonymous!.rpc("save_inventory_action", {
        p_id: id,
        p_action: "Monitor Stock",
        p_note: null,
        p_expected_version: 0,
      });
      expect(rpc.error).not.toBeNull();
    });
    it("persists through the API and delivers committed changes to two independent WebSocket clients", async () => {
      const clients = [
        createClient(url, publicKey, { auth }),
        createClient(url, publicKey, { auth }),
      ];
      const subscriptions = clients.map((client) => {
        let notify!: () => void;
        const changed = new Promise<void>((resolve) => {
          notify = resolve;
        });
        let channel: ReturnType<SupabaseClient["channel"]>;
        const ready = new Promise<void>((resolve, reject) => {
          channel = client
            .channel("inventory")
            .on("broadcast", { event: "inventory_changed" }, (message) => {
              expect(
                Object.keys(message.payload).filter((key) => key !== "id"),
              ).toEqual([]);
              notify();
            })
            .subscribe((status) => {
              if (status === "SUBSCRIBED") resolve();
              else if (
                status === "CHANNEL_ERROR" ||
                status === "TIMED_OUT" ||
                status === "CLOSED"
              )
                reject(new Error("Local Realtime subscription failed"));
            });
        });
        return { client, channel: channel!, ready, changed };
      });
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.all(
          subscriptions.map((subscription) => subscription.ready),
        );
        const current = await server!
          .from("vehicles")
          .select("version")
          .eq("id", id)
          .single();
        expect(current.error).toBeNull();
        const response = await write("Monitor Stock", current.data!.version);
        expect(response.status).toBe(200);
        const saved = await response.json();
        expect(saved.version).toBe(current.data!.version + 1);
        await Promise.race([
          Promise.all(
            subscriptions.map((subscription) => subscription.changed),
          ),
          new Promise((_, reject) => {
            timeout = setTimeout(
              () =>
                reject(new Error("Real WebSocket updates were not received")),
              10000,
            );
          }),
        ]);
        const read = await fetch(origin + "/inventory/" + id, { headers });
        expect(read.status).toBe(200);
        const vehicle = await read.json();
        expect(vehicle).toMatchObject({
          currentAction: "Monitor Stock",
          version: saved.version,
        });
      } finally {
        clearTimeout(timeout);
        await Promise.all(
          subscriptions.map(async (subscription) => {
            await subscription.client.removeChannel(subscription.channel);
            subscription.client.realtime.disconnect();
          }),
        );
      }
    }, 30000);
    it("allows only one of two simultaneous edits at the same version", async () => {
      const current = await server!
        .from("vehicles")
        .select("version")
        .eq("id", id)
        .single();
      expect(current.error).toBeNull();
      const responses = await Promise.all([
        write("Monitor Stock", current.data!.version),
        write("Marketing Push Planned", current.data!.version),
      ]);
      expect(responses.map((response) => response.status).sort()).toEqual([
        200, 409,
      ]);
      const final = await server!
        .from("vehicles")
        .select("version")
        .eq("id", id)
        .single();
      expect(final.data?.version).toBe(current.data!.version + 1);
    });
  },
);
