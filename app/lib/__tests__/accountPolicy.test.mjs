import assert from "node:assert/strict";
import test from "node:test";
import { assertSameAccountSession, latestAsyncRequest, profileIdentityPatch } from "../accountPolicy.ts";

const identity = (overrides = {}) => ({
  isAnonymous: false, displayName: null, email: null, photoURL: null,
  providerData: [{ providerId: "apple.com" }], ...overrides,
});

test("a changed or signed-out session cannot receive credentials or a late auth result", () => {
  assert.doesNotThrow(() => assertSameAccountSession("guest-a", "guest-a"));
  assert.doesNotThrow(() => assertSameAccountSession(null, null));
  for (const current of ["guest-b", "member-b", null]) {
    assert.throws(() => assertSameAccountSession("guest-a", current), { code: "auth/session-changed" });
  }
});

test("returning Apple sign-in preserves a stored name when Apple provides no name again", () => {
  const patch = profileIdentityPatch(identity(), { displayName: "Pat Traveler", reviewCount: 37, photoCount: 2 });
  assert.equal(patch.displayName, "Pat Traveler");
  assert.equal(Object.hasOwn(patch, "reviewCount"), false);
  assert.equal(Object.hasOwn(patch, "photoCount"), false);
  assert.equal(Object.hasOwn(patch, "reputation"), false);
});

test("new provider name and identity fields are written without manufacturing unavailable email", () => {
  const patch = profileIdentityPatch(identity(), undefined, " Alex Rivera ");
  assert.equal(patch.displayName, "Alex Rivera");
  assert.equal(patch.authProvider, "apple");
  assert.equal(Object.hasOwn(patch, "email"), false);
});

test("guest and Google metadata identify the actual provider", () => {
  assert.equal(profileIdentityPatch(identity({ isAnonymous: true, providerData: [] }), undefined).authProvider, "guest");
  assert.equal(profileIdentityPatch(identity({ providerData: [{ providerId: "google.com" }], displayName: "Google Name", email: "example@example.com" }), undefined).displayName, "Google Name");
});

test("linking Google upgrades a generated guest name and preserves activity ownership", () => {
  const patch = profileIdentityPatch(identity({ providerData: [{ providerId: "google.com" }], displayName: "Pat Google" }), {
    displayName: "Guest Traveler", isGuest: true, authProvider: "guest", reviewCount: 37, photoCount: 2,
  });
  assert.equal(patch.displayName, "Pat Google");
  assert.equal(patch.isGuest, false);
  assert.equal(patch.authProvider, "google");
  assert.equal(Object.hasOwn(patch, "reviewCount"), false);
  assert.equal(Object.hasOwn(patch, "photoCount"), false);
});

test("a provider name cannot replace a real custom name during guest linking", () => {
  const patch = profileIdentityPatch(identity({ providerData: [{ providerId: "google.com" }], displayName: "Pat Google" }), {
    displayName: "Road Trip Pat", isGuest: true,
  });
  assert.equal(patch.displayName, "Road Trip Pat");
});

test("guest placeholder is preserved when the provider has no replacement name", () => {
  assert.equal(profileIdentityPatch(identity(), { displayName: "Guest Traveler" }).displayName, "Guest Traveler");
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test("a late older aggregate result cannot overwrite the latest total", async () => {
  const first = deferred();
  const second = deferred();
  const loads = [first, second];
  const values = [];
  const errors = [];
  const request = latestAsyncRequest(() => loads.shift().promise, value => values.push(value), error => errors.push(error));
  const firstRefresh = request.refresh();
  const secondRefresh = request.refresh();
  second.resolve(251);
  await secondRefresh;
  first.resolve(250);
  await firstRefresh;
  assert.deepEqual(values, [251]);
  assert.deepEqual(errors, []);
});

test("an aggregate failure is unavailable and does not manufacture a zero total", async () => {
  const values = [];
  const errors = [];
  const request = latestAsyncRequest(async () => { throw new Error("permission denied"); }, value => values.push(value), error => errors.push(error));
  await request.refresh();
  assert.deepEqual(values, []);
  assert.equal(errors[0].message, "permission denied");
});

test("switching accounts or disposing suppresses success and failure of pending requests", async () => {
  for (const outcome of ["resolve", "reject"]) {
    const load = deferred();
    const events = [];
    const request = latestAsyncRequest(() => load.promise, value => events.push(value), error => events.push(error));
    const refresh = request.refresh();
    request.dispose();
    load[outcome](outcome === "resolve" ? 100 : new Error("network"));
    await refresh;
    assert.deepEqual(events, []);
  }
});

test("an obsolete failed request cannot clear a newer successful total", async () => {
  const first = deferred();
  const second = deferred();
  const loads = [first, second];
  const events = [];
  const request = latestAsyncRequest(() => loads.shift().promise, value => events.push(value), error => events.push(error));
  const firstRefresh = request.refresh();
  const secondRefresh = request.refresh();
  second.resolve(0);
  await secondRefresh;
  first.reject(new Error("stale failure"));
  await firstRefresh;
  assert.deepEqual(events, [0]);
});
