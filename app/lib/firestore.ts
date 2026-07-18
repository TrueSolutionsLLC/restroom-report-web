import { addDoc, collection, doc, limit, onSnapshot, query, serverTimestamp, where } from "firebase/firestore";
import { GoogleAuthProvider, OAuthProvider, getRedirectResult, onAuthStateChanged, signInAnonymously, signInWithCredential, signInWithPopup, signOut, type User, type UserCredential } from "firebase/auth";
import { auth, db } from "./firebase";

const APPLE_SERVICE_ID = "com.robbie.CleanStop.web";
const APPLE_REDIRECT_URI = "https://restroom-report.com/__/auth/handler";
const NONCE_CHARACTERS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._";

type AppleAuthorizationResponse = {
  authorization?: {
    code?: string;
    id_token?: string;
    state?: string;
  };
  user?: {
    email?: string;
    name?: { firstName?: string; lastName?: string };
  };
};

type AppleAuthApi = {
  init: (config: {
    clientId: string;
    scope: string;
    redirectURI: string;
    state: string;
    nonce: string;
    usePopup: boolean;
  }) => void;
  signIn: () => Promise<AppleAuthorizationResponse>;
};

declare global {
  interface Window {
    AppleID?: { auth: AppleAuthApi };
  }
}

type PreparedAppleSignIn = {
  authApi: AppleAuthApi;
  rawNonce: string;
  hashedNonce: string;
};

let preparedAppleSignIn: Promise<PreparedAppleSignIn> | null = null;

function createRandomString(length = 32) {
  const randomBytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(randomBytes, byte => NONCE_CHARACTERS[byte % NONCE_CHARACTERS.length]).join("");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function loadAppleAuthApi() {
  if (window.AppleID?.auth) return Promise.resolve(window.AppleID.auth);

  return new Promise<AppleAuthApi>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-restroom-report-apple-auth="true"]');
    const script = existing ?? document.createElement("script");

    const loaded = () => {
      if (window.AppleID?.auth) resolve(window.AppleID.auth);
      else reject(new Error("Apple sign-in did not finish loading."));
    };
    const failed = () => reject(new Error("Apple sign-in could not be loaded."));

    script.addEventListener("load", loaded, { once: true });
    script.addEventListener("error", failed, { once: true });

    if (!existing) {
      script.src = "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";
      script.async = true;
      script.dataset.restroomReportAppleAuth = "true";
      document.head.appendChild(script);
    }
  });
}

async function prepareAppleAttempt(): Promise<PreparedAppleSignIn> {
  const [authApi, rawNonce] = await Promise.all([
    loadAppleAuthApi(),
    Promise.resolve(createRandomString()),
  ]);
  return { authApi, rawNonce, hashedNonce: await sha256(rawNonce) };
}

function getPreparedAppleSignIn() {
  if (!preparedAppleSignIn) {
    preparedAppleSignIn = prepareAppleAttempt().catch(error => {
      preparedAppleSignIn = null;
      throw error;
    });
  }
  return preparedAppleSignIn;
}

export type LivePlace = {
  id: string; name: string; type: string; address: string; score: number | null; reports: number;
  color: string; latitude: number; longitude: number; status: string; detail: string;
  accessType: string; layoutType: string; city: string; state: string;
};

export type StationReview = {
  id: string; cleanlinessRating: number; odorRating: number; comment: string; createdAt: Date | null;
  feltSafe: boolean; soapAvailable: boolean; toiletPaperAvailable: boolean; sinkWorking: boolean;
  accessibilityAvailable: boolean; babyChangingAvailable: boolean; crowdLevel: string;
};

export type UserProfile = {
  id: string;
  displayName: string;
  email: string;
  photoURL: string;
  reviewCount: number;
  photoCount: number;
  reputation: number;
  level: string | number;
  trustedTravelerLevel: string | number;
  corroboratedContributionCount: number;
  favoriteStationIds: string[];
  avoidedStationIds: string[];
  moderationStatus: string;
};

export type UserReview = StationReview & {
  stationId: string;
  userId: string;
};

export type UserIssueReport = {
  id: string;
  stationId: string;
  reporterUserId: string;
  issueType: string;
  comment: string;
  status: string;
  createdAt: Date | null;
};

export type GeoBounds = {
  south: number;
  north: number;
  west: number;
  east: number;
};

const displayType = (raw: string) => ({ gasStation: "Gas station", travelCenter: "Truck stop", truckStop: "Truck stop", restArea: "Rest area", fastFood: "Fast food" }[raw] ?? "Gas station");
const storageType = (label: string) => ({ "Gas station": "gasStation", "Truck stop": "truckStop", "Rest area": "restArea", "Fast food": "fastFood" }[label] ?? "gasStation");
const colorFor = (type: string) => ({ "Gas station": "blue", "Truck stop": "orange", "Rest area": "teal", "Fast food": "rose" }[type] ?? "blue");
const readable = (raw: unknown) => String(raw ?? "unknown").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, value => value.toUpperCase());

export function subscribeToStations(onPlaces: (places: LivePlace[]) => void, onError: (error: Error) => void) {
  const stationsQuery = query(collection(db, "stations"), limit(500));
  return onSnapshot(stationsQuery, snapshot => {
    const mapped = snapshot.docs.map(doc => {
      const data = doc.data();
      const type = displayType(String(data.stationType ?? data.locationType ?? "gasStation"));
      const reviewCount = Number(data.reviewCount ?? 0);
      const address = String(data.address ?? [data.city, data.state].filter(Boolean).join(", ") ?? "");
      return {
        id: doc.id,
        name: String(data.name ?? data.brand ?? "Restroom"),
        type,
        address,
        score: reviewCount > 0 ? Math.round(Number(data.cleanScore ?? 0) * 10) / 10 : null,
        reports: reviewCount,
        color: colorFor(type),
        latitude: Number(data.latitude ?? 0),
        longitude: Number(data.longitude ?? 0),
        status: data.restroomStatus && data.restroomStatus !== "unknown" ? readable(data.restroomStatus) : "Status not confirmed",
        detail: [data.restroomLayoutType, data.restroomAccessType].filter(value => value && value !== "unknown").map(readable).join(" • ") || "Community-supplied location",
        accessType: readable(data.restroomAccessType),
        layoutType: readable(data.restroomLayoutType),
        city: String(data.city ?? ""),
        state: String(data.state ?? ""),
      };
    }).filter(place => Number.isFinite(place.latitude) && Number.isFinite(place.longitude) && Math.abs(place.latitude) <= 90 && Math.abs(place.longitude) <= 180);
    onPlaces(mapped);
  }, error => onError(error));
}

export function subscribeToStationsInBounds(bounds: GeoBounds, onPlaces: (places: LivePlace[]) => void, onError: (error: Error) => void) {
  const stations = collection(db, "stations");
  const fullWorld = bounds.west === -180 && bounds.east === 180;
  const stationQueries = fullWorld
    ? [query(stations, limit(750))]
    : bounds.west <= bounds.east
      ? [query(stations, where("longitude", ">=", bounds.west), where("longitude", "<=", bounds.east), limit(750))]
      : [
          query(stations, where("longitude", ">=", bounds.west), where("longitude", "<=", 180), limit(750)),
          query(stations, where("longitude", ">=", -180), where("longitude", "<=", bounds.east), limit(750)),
        ];

  const snapshots = new Map<number, LivePlace[]>();
  const emit = () => {
    if (snapshots.size !== stationQueries.length) return;
    const visible = new Map<string, LivePlace>();
    snapshots.forEach(items => items.forEach(place => {
      if (place.latitude >= bounds.south && place.latitude <= bounds.north) visible.set(place.id, place);
    }));
    onPlaces([...visible.values()]);
  };

  const unsubscribers = stationQueries.map((stationsQuery, index) => onSnapshot(stationsQuery, snapshot => {
    const mapped = snapshot.docs.map(stationDoc => {
      const data = stationDoc.data();
      const type = displayType(String(data.stationType ?? data.locationType ?? "gasStation"));
      const reviewCount = Number(data.reviewCount ?? 0);
      const address = String(data.address ?? [data.city, data.state].filter(Boolean).join(", ") ?? "");
      return {
        id: stationDoc.id,
        name: String(data.name ?? data.brand ?? "Restroom"),
        type,
        address,
        score: reviewCount > 0 ? Math.round(Number(data.cleanScore ?? 0) * 10) / 10 : null,
        reports: reviewCount,
        color: colorFor(type),
        latitude: Number(data.latitude ?? 0),
        longitude: Number(data.longitude ?? 0),
        status: data.restroomStatus && data.restroomStatus !== "unknown" ? readable(data.restroomStatus) : "Status not confirmed",
        detail: [data.restroomLayoutType, data.restroomAccessType].filter(value => value && value !== "unknown").map(readable).join(" • ") || "Community-supplied location",
        accessType: readable(data.restroomAccessType),
        layoutType: readable(data.restroomLayoutType),
        city: String(data.city ?? ""),
        state: String(data.state ?? ""),
      } satisfies LivePlace;
    }).filter(place => Number.isFinite(place.latitude) && Number.isFinite(place.longitude) && Math.abs(place.latitude) <= 90 && Math.abs(place.longitude) <= 180);
    snapshots.set(index, mapped);
    emit();
  }, error => onError(error)));

  return () => unsubscribers.forEach(unsubscribe => unsubscribe());
}

export function subscribeToReviews(stationId: string, onReviews: (reviews: StationReview[]) => void, onError: (error: Error) => void) {
  const reviewsQuery = query(collection(db, "reviews"), where("stationId", "==", stationId), limit(50));
  return onSnapshot(reviewsQuery, snapshot => {
    const reviews = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        cleanlinessRating: Number(data.cleanlinessRating ?? 0), odorRating: Number(data.odorRating ?? 0),
        comment: String(data.comment ?? ""), createdAt: data.createdAt?.toDate?.() ?? null,
        feltSafe: Boolean(data.feltSafe), soapAvailable: Boolean(data.soapAvailable),
        toiletPaperAvailable: Boolean(data.toiletPaperAvailable), sinkWorking: Boolean(data.sinkWorking),
        accessibilityAvailable: Boolean(data.accessibilityAvailable), babyChangingAvailable: Boolean(data.babyChangingAvailable),
        crowdLevel: String(data.crowdLevel ?? "unknown"),
      } satisfies StationReview;
    }).sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
    onReviews(reviews);
  }, error => onError(error));
}

export function subscribeToUserProfile(userId: string, onProfile: (profile: UserProfile | null) => void, onError: (error: Error) => void) {
  return onSnapshot(doc(db, "users", userId), snapshot => {
    if (!snapshot.exists()) {
      onProfile(null);
      return;
    }
    const data = snapshot.data();
    onProfile({
      id: snapshot.id,
      displayName: String(data.displayName ?? ""),
      email: String(data.email ?? ""),
      photoURL: String(data.photoURL ?? ""),
      reviewCount: Number(data.reviewCount ?? 0),
      photoCount: Number(data.photoCount ?? 0),
      reputation: Number(data.reputation ?? 0),
      level: data.level ?? "",
      trustedTravelerLevel: data.trustedTravelerLevel ?? "",
      corroboratedContributionCount: Number(data.corroboratedContributionCount ?? 0),
      favoriteStationIds: Array.isArray(data.favoriteStationIds) ? data.favoriteStationIds.map(String) : [],
      avoidedStationIds: Array.isArray(data.avoidedStationIds) ? data.avoidedStationIds.map(String) : [],
      moderationStatus: String(data.moderationStatus ?? ""),
    });
  }, error => onError(error));
}

export function subscribeToUserReviews(userId: string, onReviews: (reviews: UserReview[]) => void, onError: (error: Error) => void) {
  const reviewsQuery = query(collection(db, "reviews"), where("userId", "==", userId), limit(250));
  return onSnapshot(reviewsQuery, snapshot => {
    const reviews = snapshot.docs.map(reviewDoc => {
      const data = reviewDoc.data();
      return {
        id: reviewDoc.id,
        stationId: String(data.stationId ?? ""),
        userId: String(data.userId ?? ""),
        cleanlinessRating: Number(data.cleanlinessRating ?? 0),
        odorRating: Number(data.odorRating ?? 0),
        comment: String(data.comment ?? ""),
        createdAt: data.createdAt?.toDate?.() ?? null,
        feltSafe: Boolean(data.feltSafe),
        soapAvailable: Boolean(data.soapAvailable),
        toiletPaperAvailable: Boolean(data.toiletPaperAvailable),
        sinkWorking: Boolean(data.sinkWorking),
        accessibilityAvailable: Boolean(data.accessibilityAvailable),
        babyChangingAvailable: Boolean(data.babyChangingAvailable),
        crowdLevel: String(data.crowdLevel ?? "unknown"),
      } satisfies UserReview;
    }).sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
    onReviews(reviews);
  }, error => onError(error));
}

export function subscribeToUserIssueReports(userId: string, onReports: (reports: UserIssueReport[]) => void, onError: (error: Error) => void) {
  const reportsQuery = query(collection(db, "reports"), where("reporterUserId", "==", userId), limit(250));
  return onSnapshot(reportsQuery, snapshot => {
    const reports = snapshot.docs.map(reportDoc => {
      const data = reportDoc.data();
      return {
        id: reportDoc.id,
        stationId: String(data.stationId ?? ""),
        reporterUserId: String(data.reporterUserId ?? ""),
        issueType: readable(data.issueType),
        comment: String(data.comment ?? ""),
        status: readable(data.status),
        createdAt: data.createdAt?.toDate?.() ?? null,
      } satisfies UserIssueReport;
    }).sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
    onReports(reports);
  }, error => onError(error));
}

export function ensureAnonymousUser(onUser: (user: User) => void, onError: (error: Error) => void) {
  const unsubscribe = onAuthStateChanged(auth, user => {
    if (user) onUser(user);
    else signInAnonymously(auth).catch(onError);
  }, onError);
  return unsubscribe;
}

export const signInWithGoogle = () => signInWithPopup(auth, new GoogleAuthProvider());
export const completeRedirectSignIn = () => getRedirectResult(auth);
export const preloadAppleSignIn = () => {
  if (typeof window !== "undefined") void getPreparedAppleSignIn().catch(() => {});
};
export const signInWithApple = async (): Promise<UserCredential> => {
  if (typeof window === "undefined") throw new Error("Apple sign-in requires a browser.");

  const { authApi, rawNonce, hashedNonce } = await getPreparedAppleSignIn();
  preparedAppleSignIn = null;

  const state = createRandomString();
  authApi.init({
    clientId: APPLE_SERVICE_ID,
    scope: "name email",
    redirectURI: APPLE_REDIRECT_URI,
    state,
    nonce: hashedNonce,
    usePopup: true,
  });

  const response = await authApi.signIn();
  if (response.authorization?.state !== state) {
    const error = new Error("Apple returned an invalid sign-in state.");
    Object.assign(error, { code: "auth/apple-invalid-state" });
    throw error;
  }

  const idToken = response.authorization?.id_token;
  if (!idToken) {
    const error = new Error("Apple did not return an identity token.");
    Object.assign(error, { code: "auth/apple-missing-id-token" });
    throw error;
  }

  const provider = new OAuthProvider("apple.com");
  const credential = provider.credential({ idToken, rawNonce });
  return signInWithCredential(auth, credential);
};
export const signOutUser = () => signOut(auth).then(() => signInAnonymously(auth));

export async function submitReview(input: {
  stationId: string; userId: string; cleanlinessRating: number; odorRating: number; comment: string;
  crowdLevel: string; answers: Record<string, boolean>;
}) {
  await addDoc(collection(db, "reviews"), {
    stationId: input.stationId, userId: input.userId,
    cleanlinessRating: input.cleanlinessRating, odorRating: input.odorRating,
    accessibilityAvailable: input.answers.accessible ?? false,
    babyChangingAvailable: input.answers.changingTable ?? false,
    sinkWorking: input.answers.sink ?? false, soapAvailable: input.answers.soap ?? false,
    toiletPaperAvailable: input.answers.paper ?? false, feltSafe: input.answers.safe ?? false,
    crowdLevel: input.crowdLevel, comment: input.comment.trim().slice(0, 700), photoURLs: [], createdAt: serverTimestamp(),
  });
}

export async function addStation(input: {
  userId: string; name: string; address: string; type: string; latitude: number; longitude: number;
  city?: string; state?: string; accessType?: string; layoutType?: string;
}) {
  const stationType = storageType(input.type);
  return addDoc(collection(db, "stations"), {
    addedByUserId: input.userId, name: input.name.trim(), brand: input.name.trim(), address: input.address.trim(),
    city: input.city ?? "", state: input.state ?? "", latitude: input.latitude, longitude: input.longitude,
    locationType: stationType, stationType, source: "userAdded", notes: "",
    restroomAccessType: input.accessType ?? "unknown", restroomLayoutType: input.layoutType ?? "unknown",
    restroomStatus: "unknown", stallCountBucket: "unknown", amenities: [],
    reviewCount: 0, photoCount: 0, cleanScore: 0, safetyScore: 0,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), lastReportedAt: serverTimestamp(),
  });
}
