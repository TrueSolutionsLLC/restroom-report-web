import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as contract from "../reviewContract.ts";

const source = readFileSync(new URL("../locationMarkers.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.CommonJS } }).outputText;
const exports = {};
vm.runInNewContext(compiled, { exports, require: name => {
  assert.equal(name, "./reviewContract");
  return contract;
} });
const { placeReportState, placeReportLabel, placeReportAction, placeMarkerLabel, placeMarkerClass, placeMarkerMarkup, placeCategoryPath } = exports;
const place = (fields = {}) => ({ id: "stop-1", name: "A stop", type: "Gas station", source: "firestore", reports: 0, score: null, color: "unrated", ...fields });

test("discovered, added without reports, and scored places remain distinct", () => {
  const discovered = place({ source: "appleMaps" });
  const unrated = place();
  const rated = place({ reports: 2, score: 8.1 });
  assert.equal(placeReportState(discovered), "discovered");
  assert.equal(placeReportLabel(discovered), "Not added yet");
  assert.equal(placeReportAction(discovered), "Add this stop");
  assert.equal(placeReportState(unrated), "unrated");
  assert.equal(placeReportLabel(unrated), "No ratings yet");
  assert.equal(placeReportAction(unrated), "Be the first to rate");
  assert.equal(placeReportState(rated), "rated");
  assert.match(placeMarkerMarkup(rated), />8\.1<\/text>/);
  assert.doesNotMatch(placeMarkerMarkup(discovered), /<text/);
  assert.doesNotMatch(placeMarkerMarkup(unrated), /<text/);
});

test("zero is a real rated score; display rounding does not change score bands", () => {
  assert.match(placeMarkerMarkup(place({ reports: 1, score: 0 })), />0\.0<\/text>/);
  assert.match(placeMarkerClass(place({ reports: 1, score: 6.95 }), true), /marker-tone-fair active$/);
  assert.match(placeMarkerClass(place({ reports: 1, score: 7 }), false), /marker-tone-good$/);
});

test("absent scores with existing reports never claim no ratings or invent a score", () => {
  for (const score of [null, undefined, NaN, Infinity, -1, 11, "7"]) {
    const missing = place({ reports: 3, score });
    assert.equal(placeReportState(missing), "unavailable");
    assert.equal(placeReportLabel(missing), "CleanScore unavailable");
    assert.doesNotMatch(placeMarkerMarkup(missing), /<text/);
  }
});

test("stale scores cannot turn external or unreviewed places into rated pins", () => {
  assert.doesNotMatch(placeMarkerMarkup(place({ score: 9 })), /<text/);
  assert.doesNotMatch(placeMarkerMarkup(place({ source: "appleMaps", reports: 4, score: 9 })), /<text/);
});

test("selection changes the halo class and accessible state without changing status", () => {
  for (const subject of [place(), place({ source: "appleMaps" }), place({ reports: 1, score: 8 })]) {
    assert.equal(placeMarkerClass(subject, true), `${placeMarkerClass(subject, false)} active`);
    assert.equal(placeMarkerLabel(subject, true), `${placeMarkerLabel(subject, false)}, selected`);
    assert.match(placeMarkerLabel(subject, false), /A stop, Gas station,/);
  }
});

test("untrusted names and categories cannot inject HTML into either map provider", () => {
  const unsafe = '<img src=x onerror=alert(1)>';
  for (const type of [unsafe, "__proto__", "toString", ""]) {
    const markup = placeMarkerMarkup(place({ name: unsafe, type }));
    assert.doesNotMatch(markup, /img|onerror|alert/);
    assert.equal(placeCategoryPath(type), placeCategoryPath("Other"));
  }
  assert.notEqual(placeCategoryPath("Gas station"), placeCategoryPath("Truck stop"));
  assert.notEqual(placeCategoryPath("Travel center"), placeCategoryPath("Gas station"));
});
