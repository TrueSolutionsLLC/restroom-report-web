import assert from "node:assert/strict";
import test from "node:test";
import { WELCOME_GUIDE_STORAGE_KEY, WELCOME_GUIDE_VERSION, completeWelcomeGuide, hasCompletedWelcomeGuide } from "../onboarding.ts";

const now = Date.UTC(2026, 9, 8, 18);
const storage = initial => {
  const records = new Map(initial ? [[WELCOME_GUIDE_STORAGE_KEY, initial]] : []);
  return { records, getItem: key => records.get(key) ?? null, setItem: (key, value) => records.set(key, value) };
};

test("onboarding completion is versioned and requires an actual completion date", () => {
  const store = storage();
  assert.equal(hasCompletedWelcomeGuide(store), false);
  assert.equal(completeWelcomeGuide(store, now), true);
  assert.equal(hasCompletedWelcomeGuide(store), true);
  assert.deepEqual(JSON.parse(store.getItem(WELCOME_GUIDE_STORAGE_KEY)), { version: WELCOME_GUIDE_VERSION, completedAt: new Date(now).toISOString() });
});

test("old, future, malformed and incomplete records require the current welcome guide", () => {
  for (const record of ["not-json", "null", "true", "{}", JSON.stringify({ version: 0, completedAt: new Date(now) }), JSON.stringify({ version: WELCOME_GUIDE_VERSION + 1, completedAt: new Date(now) }), JSON.stringify({ version: WELCOME_GUIDE_VERSION, completedAt: "invalid" }), JSON.stringify({ version: WELCOME_GUIDE_VERSION, completedAt: now })]) {
    assert.equal(hasCompletedWelcomeGuide(storage(record)), false);
  }
});

test("denied storage cannot throw or falsely persist completion", () => {
  const denied = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
  assert.equal(hasCompletedWelcomeGuide(denied), false);
  assert.equal(completeWelcomeGuide(denied, now), false);
});

test("server rendering never accesses browser storage", () => {
  assert.equal(typeof window, "undefined");
  assert.equal(hasCompletedWelcomeGuide(), false);
  assert.equal(completeWelcomeGuide(undefined, now), false);
});

test("a browser that denies access to the localStorage property can still use the guide", () => {
  globalThis.window = { get localStorage() { throw new Error("storage disabled"); } };
  try {
    assert.equal(hasCompletedWelcomeGuide(), false);
    assert.equal(completeWelcomeGuide(undefined, now), false);
  } finally { delete globalThis.window; }
});

test("completion leaves other browser preferences intact and rejects invalid dates", () => {
  const store = storage();
  store.setItem("rr-cookie-consent", "declined");
  assert.equal(completeWelcomeGuide(store, NaN), false);
  assert.equal(completeWelcomeGuide(store, Infinity), false);
  assert.equal(completeWelcomeGuide(store, 1e20), false);
  assert.equal(store.getItem(WELCOME_GUIDE_STORAGE_KEY), null);
  assert.equal(completeWelcomeGuide(store, now), true);
  assert.equal(store.getItem("rr-cookie-consent"), "declined");
});
