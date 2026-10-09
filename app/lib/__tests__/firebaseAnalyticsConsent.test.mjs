import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Exercise the actual helper with a mocked SDK, without Firebase config or network.
const source = readFileSync(new URL("../firebase.ts", import.meta.url), "utf8");
const helper = ts.transpileModule(source.slice(source.indexOf("type FirebaseAnalyticsModule"))
  .replaceAll("export ", ""), {
  compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.None },
}).outputText.replace('import("firebase/analytics")', "loadAnalytics()");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture({ moduleGate, supportGate, initializationGate, supported = true, browser = true } = {}) {
  const window = {};
  const instance = {};
  const calls = { loads: 0, support: 0, creates: 0, collection: [] };
  const sdk = {
    isSupported: () => { calls.support += 1; return supportGate?.promise ?? Promise.resolve(supported); },
    getAnalytics: () => { calls.creates += 1; return instance; },
    setAnalyticsCollectionEnabled: (supplied, enabled) => {
      assert.equal(supplied, instance);
      calls.collection.push(enabled);
      // The official SDK's void setter applies only after internal initialization.
      if (initializationGate) void initializationGate.promise.then(() => { window["ga-disable-test-property"] = !enabled; });
    },
  };
  const context = vm.createContext({
    ...(browser ? { window } : {}),
    firebaseApp: { options: { measurementId: "test-property" } },
    loadAnalytics: () => { calls.loads += 1; return moduleGate?.promise ?? Promise.resolve(sdk); },
  });
  const api = vm.runInContext(`${helper}\n({setFirebaseAnalyticsConsent, initializeFirebaseAnalytics});`, context);
  return { ...api, calls, sdk, window };
}

test("declining analytics never imports, checks support, or initializes the SDK", async () => {
  const f = fixture();
  assert.equal(await f.setFirebaseAnalyticsConsent(false), false);
  assert.deepEqual(f.calls, { loads: 0, support: 0, creates: 0, collection: [] });
  assert.equal(f.window["ga-disable-test-property"], true);
});

test("a decline while the module loads cancels an obsolete acceptance", async () => {
  const gate = deferred();
  const f = fixture({ moduleGate: gate });
  const acceptance = f.setFirebaseAnalyticsConsent(true);
  await f.setFirebaseAnalyticsConsent(false);
  gate.resolve(f.sdk);
  assert.equal(await acceptance, false);
  assert.equal(f.calls.support, 0);
  assert.equal(f.calls.creates, 0);
  assert.equal(f.window["ga-disable-test-property"], true);
});

test("a decline while browser support resolves cannot start Analytics later", async () => {
  const gate = deferred();
  const f = fixture({ supportGate: gate });
  const acceptance = f.setFirebaseAnalyticsConsent(true);
  await Promise.resolve();
  await f.setFirebaseAnalyticsConsent(false);
  gate.resolve(true);
  assert.equal(await acceptance, false);
  assert.equal(f.calls.creates, 0);
  assert.deepEqual(f.calls.collection, []);
});

test("declining stops an existing instance immediately during SDK initialization", async () => {
  const gate = deferred();
  const f = fixture({ initializationGate: gate });
  assert.equal(await f.setFirebaseAnalyticsConsent(true), true);
  assert.equal(await f.setFirebaseAnalyticsConsent(false), false);
  assert.equal(f.window["ga-disable-test-property"], true);
  assert.deepEqual(f.calls.collection, [true, false]);
  gate.resolve();
  await Promise.resolve();
  assert.equal(f.window["ga-disable-test-property"], true);
});

test("accepting again reuses the existing instance and enables collection", async () => {
  const f = fixture();
  await f.initializeFirebaseAnalytics();
  await f.setFirebaseAnalyticsConsent(false);
  assert.equal(await f.setFirebaseAnalyticsConsent(true), true);
  assert.equal(f.calls.loads, 1);
  assert.equal(f.calls.creates, 1);
  assert.deepEqual(f.calls.collection, [true, false, true]);
  assert.equal(f.window["ga-disable-test-property"], false);
});

test("only the latest overlapping acceptance may create Analytics", async () => {
  const gate = deferred();
  const f = fixture({ moduleGate: gate });
  const first = f.setFirebaseAnalyticsConsent(true);
  await f.setFirebaseAnalyticsConsent(false);
  const latest = f.setFirebaseAnalyticsConsent(true);
  gate.resolve(f.sdk);
  assert.equal(await first, false);
  assert.equal(await latest, true);
  assert.equal(f.calls.loads, 1);
  assert.equal(f.calls.creates, 1);
  assert.deepEqual(f.calls.collection, [true]);
});

test("unsupported browsers and server rendering cannot initialize Analytics", async () => {
  const unsupported = fixture({ supported: false });
  assert.equal(await unsupported.setFirebaseAnalyticsConsent(true), false);
  assert.equal(unsupported.calls.creates, 0);
  const server = fixture({ browser: false });
  assert.equal(await server.setFirebaseAnalyticsConsent(true), false);
  assert.equal(server.calls.loads, 0);
});

test("a failed module load remains retryable without re-enabling declined consent", async () => {
  const gate = deferred();
  const f = fixture({ moduleGate: gate });
  const acceptance = f.setFirebaseAnalyticsConsent(true);
  gate.reject(new Error("module unavailable"));
  await assert.rejects(acceptance, /module unavailable/);
  await f.setFirebaseAnalyticsConsent(false);
  assert.equal(f.calls.creates, 0);
  assert.equal(f.window["ga-disable-test-property"], true);
  await assert.rejects(f.setFirebaseAnalyticsConsent(true), /module unavailable/);
  assert.equal(f.calls.loads, 2);
});
