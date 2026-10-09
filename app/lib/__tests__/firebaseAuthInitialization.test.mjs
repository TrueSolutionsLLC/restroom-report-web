import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Isolate the actual initializer; no Firebase project configuration or network access.
const source = readFileSync(new URL("../firebase.ts", import.meta.url), "utf8");
const initializer = ts.transpileModule(source.slice(source.indexOf("function initializeFirebaseAuth()"), source.indexOf("export const auth =")), {
  compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.None },
}).outputText;

function fixture(error) {
  const auth = {};
  const existingAuth = {};
  const providers = [{ name: "indexedDB" }, { name: "local" }, { name: "session" }];
  const calls = [];
  const context = vm.createContext({
    firebaseApp: {},
    indexedDBLocalPersistence: providers[0],
    browserLocalPersistence: providers[1],
    browserSessionPersistence: providers[2],
    initializeAuth: (_app, dependencies) => {
      calls.push({ kind: "initialize", dependencies });
      if (error) throw error;
      return auth;
    },
    getAuth: () => { calls.push({ kind: "existing" }); return existingAuth; },
  });
  const initialize = vm.runInContext(`${initializer}\ninitializeFirebaseAuth`, context);
  return { initialize, calls, auth, existingAuth, providers };
}

test("guest authentication retains durable persistence without eagerly initializing OAuth", () => {
  const f = fixture();
  assert.equal(f.initialize(), f.auth);
  const dependencies = f.calls[0].dependencies;
  assert.deepEqual(Array.from(dependencies.persistence), f.providers);
  assert.equal(Object.hasOwn(dependencies, "popupRedirectResolver"), false);
});

test("hot reload safely reuses an existing auth instance only for already-initialized", () => {
  const f = fixture(Object.assign(new Error("existing auth"), { code: "auth/already-initialized" }));
  assert.equal(f.initialize(), f.existingAuth);
  assert.equal(f.calls[1].kind, "existing");
});

test("unexpected authentication initialization errors propagate instead of falling back", () => {
  for (const error of [new Error("bad configuration"), Object.assign(new Error("network"), { code: "auth/network-request-failed" })]) {
    const f = fixture(error);
    assert.throws(f.initialize, caught => caught === error);
    assert.equal(f.calls.length, 1);
  }
});
