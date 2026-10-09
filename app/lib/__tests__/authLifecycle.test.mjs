import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { assertSameAccountSession } from "../accountPolicy.ts";

// Exercise the actual wrappers without initializing Firebase or using personal data.
const source = readFileSync(new URL("../firestore.ts", import.meta.url), "utf8");
const observerSource = source.slice(source.indexOf("export function ensureAnonymousUser("), source.indexOf("export type AccountSignInMode"));
const googleSource = source.slice(source.indexOf("export const signInWithGoogle ="), source.indexOf("export const preloadAppleSignIn ="));
const signOutSource = source.slice(source.indexOf("export const signOutUser ="), source.indexOf("export async function submitReview("));
const wrappers = ts.transpileModule(`${observerSource}\n${googleSource}\n${signOutSource}`.replaceAll("export ", ""), {
  compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.None },
}).outputText;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture(overrides = {}) {
  const state = { next: null, error: null, anonymousCalls: 0, profileCalls: [], linkCalls: [], popupResolvers: [], signInCalls: 0, unsubscribed: false };
  const auth = { currentUser: null };
  const resolver = {};
  const context = vm.createContext({
    auth,
    assertSameAccountSession,
    GoogleAuthProvider: class {},
    browserPopupRedirectResolver: resolver,
    onAuthStateChanged: (_auth, next, error) => {
      state.next = next;
      state.error = error;
      return () => { state.unsubscribed = true; };
    },
    signInAnonymously: async () => { state.anonymousCalls += 1; },
    signOut: async () => { auth.currentUser = null; state.next?.(null); },
    ensureUserProfile: async user => { state.profileCalls.push(user.uid); },
    linkWithPopup: async (user, _provider, suppliedResolver) => { state.linkCalls.push(user.uid); state.popupResolvers.push(suppliedResolver); return { user }; },
    signInWithPopup: async (_auth, _provider, suppliedResolver) => { state.signInCalls += 1; state.popupResolvers.push(suppliedResolver); return { user: auth.currentUser }; },
    getRedirectResult: async (_auth, suppliedResolver) => { state.popupResolvers.push(suppliedResolver); return null; },
    ...overrides,
  });
  const api = vm.runInContext(`${wrappers}\n({ensureAnonymousUser, signInWithGoogle, completeRedirectSignIn, signOutUser});`, context);
  return { ...api, auth, state, resolver };
}

test("disposed authentication observers ignore queued identities and native errors", () => {
  const f = fixture();
  const events = [];
  const stop = f.ensureAnonymousUser(user => events.push(user), error => events.push(error));
  stop();
  f.state.next(null);
  f.state.next({ uid: "guest-a" });
  f.state.error(new Error("late native error"));
  assert.equal(f.state.unsubscribed, true);
  assert.equal(f.state.anonymousCalls, 0);
  assert.deepEqual(f.state.profileCalls, []);
  assert.deepEqual(events, []);
});

test("an obsolete account profile error cannot replace the current account state", async () => {
  const first = deferred();
  const second = deferred();
  const errors = [];
  const f = fixture({ ensureUserProfile: user => user.uid === "guest-a" ? first.promise : second.promise });
  const users = [];
  f.ensureAnonymousUser(user => users.push(user?.uid), error => errors.push(error.message));
  f.state.next({ uid: "guest-a" });
  f.state.next({ uid: "member-b" });
  first.reject(new Error("obsolete profile failure"));
  await Promise.resolve();
  assert.deepEqual(errors, []);
  second.reject(new Error("current profile failure"));
  await Promise.resolve();
  assert.deepEqual(users, ["guest-a", "member-b"]);
  assert.deepEqual(errors, ["current profile failure"]);
});

test("sign-out gives the observer sole ownership of one pending guest creation", async () => {
  const anonymous = deferred();
  let calls = 0;
  const f = fixture({ signInAnonymously: () => { calls += 1; return anonymous.promise; } });
  const users = [];
  f.auth.currentUser = { uid: "member-a", isAnonymous: false };
  f.ensureAnonymousUser(user => users.push(user?.uid ?? null), assert.fail);
  await f.signOutUser();
  assert.equal(calls, 1);
  assert.deepEqual(users, [null]);
  const guest = { uid: "guest-a", isAnonymous: true };
  f.auth.currentUser = guest;
  f.state.next(guest);
  anonymous.resolve({ user: guest });
  await Promise.resolve();
  assert.deepEqual(users, [null, "guest-a"]);
  assert.equal(calls, 1);
});

test("Google links the initiating guest and never falls back to signing in after a collision", async () => {
  const collision = Object.assign(new Error("credential in use"), { code: "auth/credential-already-in-use" });
  const f = fixture({ linkWithPopup: async () => { throw collision; } });
  f.auth.currentUser = { uid: "guest-a", isAnonymous: true };
  await assert.rejects(f.signInWithGoogle(), { code: "auth/credential-already-in-use" });
  assert.equal(f.state.signInCalls, 0);
  assert.deepEqual(f.state.profileCalls, []);
});

test("Google popup and redirect completion explicitly request the lazy OAuth resolver", async () => {
  const f = fixture();
  f.auth.currentUser = { uid: "guest-a", isAnonymous: true };
  await f.signInWithGoogle();
  await f.signInWithGoogle("signIn");
  await f.completeRedirectSignIn();
  assert.deepEqual(f.state.linkCalls, ["guest-a"]);
  assert.equal(f.state.signInCalls, 1);
  assert.equal(f.state.popupResolvers.length, 3);
  assert.ok(f.state.popupResolvers.every(resolver => resolver === f.resolver));
});

test("a Google link result must preserve the initiating UID before metadata is written", async () => {
  const popup = deferred();
  const f = fixture({ linkWithPopup: () => popup.promise });
  f.auth.currentUser = { uid: "guest-a", isAnonymous: true };
  const signIn = f.signInWithGoogle();
  f.auth.currentUser = { uid: "member-b", isAnonymous: false };
  popup.resolve({ user: f.auth.currentUser });
  await assert.rejects(signIn, { code: "auth/session-changed" });
  assert.deepEqual(f.state.profileCalls, []);
});

test("a delayed Google popup cannot write metadata after the active account changes", async () => {
  const popup = deferred();
  const f = fixture({ linkWithPopup: () => popup.promise });
  const guest = { uid: "guest-a", isAnonymous: true };
  f.auth.currentUser = guest;
  const signIn = f.signInWithGoogle();
  f.auth.currentUser = { uid: "guest-b", isAnonymous: true };
  popup.resolve({ user: guest });
  await assert.rejects(signIn, { code: "auth/session-changed" });
  assert.deepEqual(f.state.profileCalls, []);
});
