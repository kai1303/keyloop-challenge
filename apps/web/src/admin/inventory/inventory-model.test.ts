import { expect, it } from "vitest";
import {
  filterVehicles,
  midnightDelay,
  parseSnapshot,
  summary,
} from "./inventory-model";
import { snapshot } from "./inventory-fixture";

it("separates 90 from 91 days and combines all filters", () => {
  expect(
    filterVehicles(snapshot.vehicles, {
      make: "all",
      model: "all",
      age: "aging",
    }).map((v) => v.registration),
  ).toEqual(["KL-001"]);
  expect(
    filterVehicles(snapshot.vehicles, {
      make: "BMW",
      model: "X1",
      age: "61-90",
    }).map((v) => v.registration),
  ).toEqual(["KL-002"]);
  expect(
    filterVehicles(snapshot.vehicles, {
      make: "BMW",
      model: "Corolla",
      age: "all",
    }),
  ).toEqual([]);
  expect(summary(snapshot.vehicles)).toEqual({
    total: 2,
    aging: 1,
    needsAction: 1,
  });
});
it("checks API shape and age consistency", () => {
  expect(parseSnapshot(snapshot)).toEqual(snapshot);
  expect(() =>
    parseSnapshot({
      ...snapshot,
      vehicles: [{ ...snapshot.vehicles[0], daysInStock: 90 }],
    }),
  ).toThrow();
  expect(() =>
    parseSnapshot({
      ...snapshot,
      vehicles: [{ ...snapshot.vehicles[0], pricePence: -1 }],
    }),
  ).toThrow();
});
it("refreshes at dealership midnight using server time", () => {
  expect(midnightDelay(snapshot)).toBe(15 * 60 * 60 * 1000 + 50);
});
