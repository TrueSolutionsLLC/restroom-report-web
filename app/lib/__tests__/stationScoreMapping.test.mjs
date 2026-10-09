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
