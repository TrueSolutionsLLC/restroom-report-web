import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBqMT5AuA4WrAklN_-5bhz5Ynu94BDMj68",
  authDomain: "cleanstop-fa6ee.firebaseapp.com",
  projectId: "cleanstop-fa6ee",
  storageBucket: "cleanstop-fa6ee.firebasestorage.app",
  messagingSenderId: "748335657785",
  appId: "1:748335657785:web:aebee726a1bba606602ee8",
  measurementId: "G-RZNKVS2DYT",
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(firebaseApp);
export const auth = getAuth(firebaseApp);

export async function initializeFirebaseAnalytics() {
  if (typeof window === "undefined") return false;
  const { getAnalytics, isSupported } = await import("firebase/analytics");
  if (!(await isSupported())) return false;
  getAnalytics(firebaseApp);
  return true;
}
