import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { cleanScoreBadge, isValidCleanScore } from "../reviewContract.ts";

// Exercise actual Firestore document mapping with in-memory documents only.
const source = readFileSync(new URL("../firestore.ts", import.meta.url), "utf8");
const mapping = ts.transpileModule(source.slice(source.indexOf("const displayType ="), source.indexOf("const longitudeIsInBounds =")), {
  compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.None },
}).outputText;
const mapStation = vm.runInNewContext(`${mapping}\nmapStation;`, { cleanScoreBadge, isValidCleanScore });
const station = (fields = {}) => ({ id: "stop-1", data: () => ({ latitude: 38, longitude: -90, reviewCount: 5, ...fields }) });

test("missing and malformed station scores stay unavailable rather than becoming zero", () => {
  for (const cleanScore of [undefined, null, NaN, Infinity, -1, 10.1, "7", ""]) {
    const place = mapStation(station({ cleanScore }));
    assert.equal(place.score, null);
    assert.equal(place.color, "unrated");
  }
});

test("valid station scores retain the original quality band without display rounding", () => {
  for (const [cleanScore, color] of [[0, "poor"], [2.8, "poor"], [4.4, "poor"], [5, "fair"], [6.95, "fair"], [7, "good"], [10, "good"]]) {
    const place = mapStation(station({ cleanScore }));
    assert.equal(place.score, cleanScore);
    assert.equal(place.color, color);
  }
});

test("a stop without any reports stays unrated even when it stores an initial zero", () => {
  const place = mapStation(station({ reviewCount: 0, cleanScore: 0 }));
  assert.equal(place.score, null);
  assert.equal(place.color, "unrated");
});

test("native location categories take precedence over the compatibility station type", () => {
  const categories = {
    gasStation: "Gas station",
    truckStop: "Truck stop",
    travelCenter: "Travel center",
    restArea: "Rest area",
    fastFood: "Fast food",
    coffeeShop: "Coffee shop",
    groceryStore: "Grocery store",
    bigBoxStore: "Big box store",
    mall: "Mall / Shopping center",
    park: "Park",
    library: "Library",
    visitorCenter: "Visitor center",
    airport: "Airport",
    transitStation: "Transit station",
    campground: "Campground",
    recreationCenter: "Recreation center",
    gym: "Gym / Fitness center",
    other: "Other",
  };
  for (const [locationType, expected] of Object.entries(categories)) {
    const place = mapStation(station({ locationType, stationType: "gasStation", cleanScore: 8.4 }));
    assert.equal(place.type, expected, locationType);
    assert.equal(place.id, "stop-1");
    assert.equal(place.reports, 5);
    assert.equal(place.score, 8.4);
  }
});

test("older or unsupported location categories retain a recognized legacy category", () => {
  for (const locationType of [undefined, null, "", "futureCategory", 7, {}, "__proto__", "toString"]) {
    const place = mapStation(station({ locationType, stationType: "travelCenter" }));
    assert.equal(place.type, "Travel center");
  }
  assert.equal(mapStation(station({ stationType: "truckStop" })).type, "Truck stop");
  assert.equal(mapStation(station({ stationType: "restArea" })).type, "Rest area");
  assert.equal(mapStation(station({ stationType: "fastFood" })).type, "Fast food");
});

test("unknown location types use a neutral category instead of implying a gas station", () => {
  for (const stationType of [undefined, null, "", "futureCategory", 7, {}, "__proto__", "constructor"]) {
    const place = mapStation(station({ locationType: "unknown", stationType }));
    assert.equal(place.type, "Other");
  }
});
