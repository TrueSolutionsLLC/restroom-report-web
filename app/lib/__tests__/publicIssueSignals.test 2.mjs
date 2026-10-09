import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Exercise the real subscription wrapper without a Firebase project or private data.
const source = readFileSync(new URL("../firestore.ts", import.meta.url), "utf8");
const wrapper = ts.transpileModule(source.slice(source.indexOf("export function subscribeToStationIssueReports("), source.indexOf("// setDoc with merge"))
  .replaceAll("export ", ""), { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.None } }).outputText;

function fixture() {
  const subscriptions = [];
  const reports = [];
  const errors = [];
  const api = vm.runInNewContext(`${wrapper}\nsubscribeToStationIssueReports;`, {
    db: {}, doc: (_db, ...parts) => ({ path: parts.join("/") }),
    collection: (_db, ...parts) => ({ path: parts.join("/") }),
    query: (collection, ...constraints) => ({ ...collection, constraints }),
    orderBy: (...parts) => ({ orderBy: parts }), limit: value => ({ limit: value }),
    readableIssueType: raw => raw,
    onSnapshot: (query, next, error) => {
      const sub = { query, next, error, disposed: false }; subscriptions.push(sub);
      return () => { sub.disposed = true; };
    },
  });
  const stop = api("stop-a", result => reports.push(result), error => errors.push(error.message));
  return { subscriptions, reports, errors, stop };
}
const station = (version, exists = true) => ({ exists: () => exists, data: () => ({ issueSignalsVersion: version }) });
const signal = (id, data) => ({ id, data: () => data });
const timestamp = date => ({ toDate: () => date });

test("unmigrated or missing stations report unavailable without claiming zero issues", () => {
  const f = fixture();
  for (const value of [station(undefined), station(0), station(2), station(1, false)]) f.subscriptions[0].next(value);
  assert.equal(f.errors.length, 4);
  assert.equal(f.subscriptions.length, 1);
  assert.equal(f.reports.length, 0);
  f.stop();
});

test("ready stations read only the deidentified public projection and discard private fields", () => {
  const f = fixture(); f.subscriptions[0].next(station(1));
  const sub = f.subscriptions[1];
  assert.equal(sub.query.path, "stations/stop-a/issueSignals");
  assert.deepEqual(JSON.parse(JSON.stringify(sub.query.constraints)), [{ orderBy: ["createdAt", "desc"] }, { limit: 250 }]);
  const date = new Date("2026-10-08T12:00:00Z");
  sub.next({ docs: [signal("report-a", { stationId: "stop-a", issueType: "unsafeLocation", createdAt: timestamp(date), reporterUserId: "private-owner", comment: "private-detail", contactEmail: "private-contact" })] });
  assert.equal(f.reports[0].length, 1);
  assert.deepEqual(Object.keys(f.reports[0][0]).sort(), ["createdAt", "id", "issueType", "stationId"]);
  assert.equal(f.reports[0][0].createdAt, date);
  f.stop(); assert.ok(f.subscriptions.every(sub => sub.disposed));
});

test("missing timestamps and wrong-station signals cannot fabricate recent warnings", () => {
  const f = fixture(); f.subscriptions[0].next(station(1));
  f.subscriptions[1].next({ docs: [
    signal("wrong-stop", { stationId: "stop-b", issueType: "unsafeLocation", createdAt: timestamp(new Date()) }),
    signal("no-date", { stationId: "stop-a", issueType: "unsafeLocation" }),
    signal("bad-date", { stationId: "stop-a", issueType: "unsafeLocation", createdAt: timestamp(new Date(NaN)) }),
    signal("no-type", { stationId: "stop-a", createdAt: timestamp(new Date()) }),
  ] });
  assert.equal(f.reports[0].length, 0); f.stop();
});

test("revoked readiness disposes old signals and ignores already queued snapshots", () => {
  const f = fixture(); f.subscriptions[0].next(station(1));
  const old = f.subscriptions[1];
  f.subscriptions[0].next(station(undefined));
  assert.equal(old.disposed, true);
  old.next({ docs: [] }); old.error(new Error("obsolete error"));
  assert.equal(f.reports.length, 0); assert.equal(f.errors.length, 1);
  f.subscriptions[0].next(station(1));
  assert.equal(f.subscriptions.length, 3);
  f.subscriptions[2].next({ docs: [] }); assert.equal(f.reports.length, 1);
  f.stop();
});

test("parent errors and disposal ignore late reports and identities", () => {
  const f = fixture(); f.subscriptions[0].next(station(1));
  f.subscriptions[0].error(new Error("station unavailable"));
  assert.equal(f.subscriptions[1].disposed, true);
  f.subscriptions[1].next({ docs: [] });
  f.stop();
  f.subscriptions[0].next(station(1)); f.subscriptions[0].error(new Error("late"));
  assert.equal(f.reports.length, 0); assert.deepEqual(f.errors, ["station unavailable"]);
});
