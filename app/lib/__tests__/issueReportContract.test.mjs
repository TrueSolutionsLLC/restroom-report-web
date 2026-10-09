import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { ISSUE_REPORT_OPTIONS, buildIssueReportPayload } from "../issueReportContract.ts";

const input = overrides => ({ userId: "guest-a", stationId: "stop-a", stationName: "Traveler Stop", issueType: "restroomClosed", ...overrides });

test("issue payload matches native ownership, raw issue type and new status", () => {
  assert.deepEqual(buildIssueReportPayload(input({ comment: "  Door was locked.  " })), {
    stationId: "stop-a", stationName: "Traveler Stop", issueType: "restroomClosed",
    reporterUserId: "guest-a", userId: "guest-a", status: "new", comment: "Door was locked.",
  });
});

test("optional empty details are omitted, without inventing a comment", () => {
  assert.equal(Object.hasOwn(buildIssueReportPayload(input()), "comment"), false);
  assert.equal(Object.hasOwn(buildIssueReportPayload(input({ comment: "  " })), "comment"), false);
});

test("all native report form categories are supported without unavailable photo reports", () => {
  assert.deepEqual(ISSUE_REPORT_OPTIONS.map(option => option.value), [
    "incorrectStationInfo", "accessInfoWrong", "notPublic", "customerOnly", "membershipRequired", "keyRequired",
    "restroomClosed", "outOfOrder", "layoutInfoWrong", "stallCountWrong", "familyRestroomInfoWrong", "unsafeLocation", "fakeReview", "other",
  ]);
  for (const option of ISSUE_REPORT_OPTIONS) assert.equal(buildIssueReportPayload(input({ issueType: option.value })).issueType, option.value);
  for (const issueType of ["inappropriatePhoto", "employeesOnly", "not-a-type", "", null]) {
    assert.throws(() => buildIssueReportPayload(input({ issueType })), { code: "issue/invalid-report" });
  }
});

test("invalid ownership, stop identity or oversized details cannot produce a report", () => {
  for (const overrides of [
    { userId: "" }, { userId: "user/path" }, { stationId: "" }, { stationId: "x".repeat(128) },
    { stationName: " " }, { stationName: null }, { comment: 42 }, { comment: "x".repeat(701) },
  ]) assert.throws(() => buildIssueReportPayload(input(overrides)), { code: "issue/invalid-report" });
  assert.equal(buildIssueReportPayload(input({ comment: "x".repeat(700) })).comment.length, 700);
});

const source = readFileSync(new URL("../firestore.ts", import.meta.url), "utf8");
const wrapper = ts.transpileModule(source.slice(source.indexOf("export async function submitIssueReport("), source.indexOf("export async function submitReview("))
  .replaceAll("export ", ""), {
  compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.None },
}).outputText;

function writerFixture(uid = "guest-a", writeError) {
  const writes = [];
  const timestamp = {};
  const context = vm.createContext({
    auth: { currentUser: uid ? { uid } : null },
    db: {}, buildIssueReportPayload,
    collection: (_db, path) => path,
    serverTimestamp: () => timestamp,
    addDoc: async (path, payload) => { writes.push({ path, payload }); if (writeError) throw writeError; },
  });
  return { submit: vm.runInContext(`${wrapper}\nsubmitIssueReport`, context), writes, timestamp };
}

test("submission writes one server-timestamped issue to the shared reports collection", async () => {
  const f = writerFixture();
  await f.submit(input({ comment: "Locked at noon" }));
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].path, "reports");
  const payload = f.writes[0].payload;
  assert.equal(payload.createdAt, f.timestamp);
  assert.equal(payload.reporterUserId, payload.userId);
  assert.equal(payload.status, "new");
  assert.equal(payload.stationName, "Traveler Stop");
});

test("a changed or missing auth session cannot write the previous account's issue", async () => {
  for (const uid of [null, "member-b"]) {
    const f = writerFixture(uid);
    await assert.rejects(f.submit(input()), /Sign in to your account/);
    assert.deepEqual(f.writes, []);
  }
});

test("contract and network failures remain failures without a second write", async () => {
  const invalid = writerFixture();
  await assert.rejects(invalid.submit(input({ issueType: "inappropriatePhoto" })), { code: "issue/invalid-report" });
  assert.deepEqual(invalid.writes, []);
  const network = writerFixture("guest-a", new Error("unavailable"));
  await assert.rejects(network.submit(input()), /unavailable/);
  assert.equal(network.writes.length, 1);
});
