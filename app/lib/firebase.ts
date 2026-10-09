import { getApp, getApps, initializeApp } from "firebase/app";
import { browserLocalPersistence, browserSessionPersistence, getAuth, indexedDBLocalPersistence, initializeAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBqMT5AuA4WrAklN_-5bhz5Ynu94BDMj68",
  authDomain: "restroom-report.com",
  projectId: "cleanstop-fa6ee",
  storageBucket: "cleanstop-fa6ee.firebasestorage.app",
  messagingSenderId: "748335657785",
  appId: "1:748335657785:web:aebee726a1bba606602ee8",
  measurementId: "G-RZNKVS2DYT",
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(firebaseApp);
function initializeFirebaseAuth() {
  try {
    // Keep the same durable account persistence as getAuth, but load the OAuth
    // iframe only for an explicit popup/redirect operation. Safari otherwise
    // waits for that iframe before publishing even a guest account.
    return initializeAuth(firebaseApp, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
    });
  } catch (error) {
    // A previous module version may already own Auth during hot reload. Reuse
    // that instance only for the SDK's precise already-initialized condition.
    if (typeof error === "object" && error !== null && "code" in error && error.code === "auth/already-initialized") {
      return getAuth(firebaseApp);
    }
    throw error;
  }
}
export const auth = initializeFirebaseAuth();

type FirebaseAnalyticsModule = typeof import("firebase/analytics");
let analyticsModulePromise: Promise<FirebaseAnalyticsModule> | null = null;
let analyticsModule: FirebaseAnalyticsModule | null = null;
let analyticsInstance: import("firebase/analytics").Analytics | null = null;
let analyticsConsentAccepted = false;
let analyticsConsentGeneration = 0;

/** Declining never initializes Analytics; only the latest accepted choice may start it. */
export async function setFirebaseAnalyticsConsent(accepted: boolean): Promise<boolean> {
  if (typeof window === "undefined") return false;
  analyticsConsentAccepted = accepted;
  const generation = ++analyticsConsentGeneration;
  const measurementId = firebaseApp.options.measurementId;
  if (measurementId) {
    // The SDK's collection setter waits for its internal initialization promise.
    // Apply its documented flag immediately too, including during that wait.
    (window as unknown as Record<string, unknown>)[`ga-disable-${measurementId}`] = !accepted;
  }
  if (!accepted) {
    if (analyticsModule && analyticsInstance) analyticsModule.setAnalyticsCollectionEnabled(analyticsInstance, false);
    return false;
  }
  if (analyticsModule && analyticsInstance) {
    analyticsModule.setAnalyticsCollectionEnabled(analyticsInstance, true);
    return true;
  }
  const current = () => analyticsConsentAccepted && generation === analyticsConsentGeneration;
  analyticsModulePromise ??= import("firebase/analytics").catch(error => {
    analyticsModulePromise = null;
    throw error;
  });
  const analyticsSdk = await analyticsModulePromise;
  analyticsModule = analyticsSdk;
  if (!current() || !(await analyticsSdk.isSupported()) || !current()) return false;
  analyticsInstance = analyticsSdk.getAnalytics(firebaseApp);
  analyticsSdk.setAnalyticsCollectionEnabled(analyticsInstance, true);
  return true;
}

export const initializeFirebaseAnalytics = () => setFirebaseAnalyticsConsent(true);
