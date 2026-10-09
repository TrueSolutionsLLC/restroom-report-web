import { addDoc, arrayRemove, arrayUnion, collection, doc, getCountFromServer, increment, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, setDoc, where, writeBatch } from "firebase/firestore";
import { GoogleAuthProvider, OAuthProvider, browserPopupRedirectResolver, getRedirectResult, linkWithCredential, linkWithPopup, onAuthStateChanged, signInAnonymously, signInWithCredential, signInWithPopup, signOut, updateProfile, type User, type UserCredential } from "firebase/auth";
import { auth, db } from "./firebase";
import { assertSameAccountSession, latestAsyncRequest, profileIdentityPatch } from "./accountPolicy";
import { parseTravelerReputationSummary, type TravelerReputationSummary } from "./reputation";
import { buildReviewPayload, cleanScoreBadge, isValidCleanScore, reviewLockPayloads, type CleanScoreTone, type ReviewSubmissionInput } from "./reviewContract";
import { ISSUE_REPORT_OPTIONS, buildIssueReportPayload, type IssueReportSubmissionInput } from "./issueReportContract";

export type { TravelerReputationSummary } from "./reputation";
export type { CrowdLevel, ReviewProximityVerification, ReviewSubmissionInput } from "./reviewContract";
export type { IssueReportSubmissionInput } from "./issueReportContract";

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
  color: CleanScoreTone; latitude: number; longitude: number; status: string; detail: string;
  accessType: string; layoutType: string; city: string; state: string;
  source?: "firestore" | "appleMaps";
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
  stationName: string;
  reporterUserId: string;
  issueType: string;
  comment: string;
  status: string;
  createdAt: Date | null;
};

export type StationIssueSignal = {
  id: string;
  stationId: string;
  issueType: string;
  createdAt: Date;
};

export type GeoBounds = {
  south: number;
  north: number;
  west: number;
  east: number;
};

const displayType = (raw: string) => ({ gasStation: "Gas station", travelCenter: "Truck stop", truckStop: "Truck stop", restArea: "Rest area", fastFood: "Fast food" }[raw] ?? "Gas station");
const storageType = (label: string) => ({ "Gas station": "gasStation", "Truck stop": "truckStop", "Rest area": "restArea", "Fast food": "fastFood" }[label] ?? "gasStation");
// Pin/score color uses the same quality bands as the iOS CleanScore badge.
const colorFor = (score: number | null) => cleanScoreBadge(score).tone;
const readable = (raw: unknown) => String(raw ?? "unknown").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, value => value.toUpperCase());
const readableIssueType = (raw: unknown) => ISSUE_REPORT_OPTIONS.find(option => option.value === raw)?.label ?? readable(raw);

type StationDocument = {
  id: string;
  data: () => Record<string, unknown>;
};

const mapStation = (stationDoc: StationDocument): LivePlace | null => {
  const data = stationDoc.data();
  const type = displayType(String(data.stationType ?? data.locationType ?? "gasStation"));
  const reviewCount = Number(data.reviewCount ?? 0);
  if (data.latitude === null || data.latitude === undefined || data.longitude === null || data.longitude === undefined) return null;
  const latitude = Number(data.latitude);
  const longitude = Number(data.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  const score = reviewCount > 0 && isValidCleanScore(data.cleanScore) ? data.cleanScore : null;

  return {
    id: stationDoc.id,
    name: String(data.name ?? data.brand ?? "Restroom"),
    type,
    address: String(data.address ?? [data.city, data.state].filter(Boolean).join(", ") ?? ""),
    score,
    reports: reviewCount,
    color: colorFor(score),
    latitude,
    longitude,
    status: data.restroomStatus && data.restroomStatus !== "unknown" ? readable(data.restroomStatus) : "Status not confirmed",
    detail: [data.restroomLayoutType, data.restroomAccessType].filter(value => value && value !== "unknown").map(readable).join(" • ") || "Community-supplied location",
    accessType: readable(data.restroomAccessType),
    layoutType: readable(data.restroomLayoutType),
    city: String(data.city ?? ""),
    state: String(data.state ?? ""),
    source: "firestore",
  };
};

const longitudeIsInBounds = (longitude: number, bounds: GeoBounds) => {
  if (bounds.west === -180 && bounds.east === 180) return true;
  return bounds.west <= bounds.east
    ? longitude >= bounds.west && longitude <= bounds.east
    : longitude >= bounds.west || longitude <= bounds.east;
};

const placesInBounds = (places: LivePlace[], bounds: GeoBounds) => places.filter(place => (
  place.latitude >= bounds.south
  && place.latitude <= bounds.north
  && longitudeIsInBounds(place.longitude, bounds)
));

type BoundsSubscriber = {
  bounds: GeoBounds;
  onPlaces: (places: LivePlace[]) => void;
  onError: (error: Error) => void;
};

// The existing iOS-created station documents do not yet contain geohashes. Keep
// one shared live cache and filter it by the current map rectangle so panning in
// any direction is exact. The old longitude-only, limited query silently omitted
// valid stations after north/south pans. This cache can be replaced by Firebase's
// recommended geohash queries after both clients write a geohash field.
let cachedStations: LivePlace[] = [];
let stationCacheReady = false;
let stopStationCache: (() => void) | null = null;
let stationCacheIdleTimer: ReturnType<typeof setTimeout> | null = null;
let nextBoundsSubscriberId = 1;
const boundsSubscribers = new Map<number, BoundsSubscriber>();

const publishCachedStations = () => {
  boundsSubscribers.forEach(subscriber => subscriber.onPlaces(placesInBounds(cachedStations, subscriber.bounds)));
};

const ensureStationCache = () => {
  if (stationCacheIdleTimer) {
    clearTimeout(stationCacheIdleTimer);
    stationCacheIdleTimer = null;
  }
  if (stopStationCache) return;

  stopStationCache = onSnapshot(collection(db, "stations"), snapshot => {
    cachedStations = snapshot.docs.map(mapStation).filter((place): place is LivePlace => place !== null);
    stationCacheReady = true;
    publishCachedStations();
  }, error => {
    boundsSubscribers.forEach(subscriber => subscriber.onError(error));
    stopStationCache = null;
  });
};

export function subscribeToStations(onPlaces: (places: LivePlace[]) => void, onError: (error: Error) => void) {
  const stationsQuery = query(collection(db, "stations"), limit(500));
  return onSnapshot(stationsQuery, snapshot => {
    const mapped = snapshot.docs.map(mapStation).filter((place): place is LivePlace => place !== null);
    onPlaces(mapped);
  }, error => onError(error));
}

export function subscribeToStationsInBounds(bounds: GeoBounds, onPlaces: (places: LivePlace[]) => void, onError: (error: Error) => void) {
  const subscriberId = nextBoundsSubscriberId++;
  boundsSubscribers.set(subscriberId, { bounds, onPlaces, onError });
  ensureStationCache();
  if (stationCacheReady) queueMicrotask(() => {
    if (boundsSubscribers.has(subscriberId)) onPlaces(placesInBounds(cachedStations, bounds));
  });

  return () => {
    boundsSubscribers.delete(subscriberId);
    if (boundsSubscribers.size || !stopStationCache) return;
    // React replaces the bounds subscription during every viewport refresh.
    // A grace period prevents tearing down and rebuilding the Firestore stream.
    stationCacheIdleTimer = setTimeout(() => {
      if (boundsSubscribers.size) return;
      stopStationCache?.();
      stopStationCache = null;
      stationCacheIdleTimer = null;
    }, 30_000);
  };
}

export function subscribeToReviews(stationId: string, onReviews: (reviews: StationReview[]) => void, onError: (error: Error) => void) {
  const reviewsQuery = query(collection(db, "reviews"), where("stationId", "==", stationId), orderBy("createdAt", "desc"), limit(50));
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
  const reviewsQuery = query(collection(db, "reviews"), where("userId", "==", userId), orderBy("createdAt", "desc"), limit(250));
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

/** Total persisted ratings is independent of history limits and the legacy profile counter. */
export function subscribeToUserReviewCount(userId: string, onCount: (count: number) => void, onError: (error: Error) => void) {
  const allReviews = query(collection(db, "reviews"), where("userId", "==", userId));
  const request = latestAsyncRequest(async () => (await getCountFromServer(allReviews)).data().count, onCount, onError);
  // Observe the full UID query so deleting a review outside the visible history also refreshes the total.
  const unsubscribe = onSnapshot(allReviews, { includeMetadataChanges: true }, snapshot => {
    // Wait for acknowledgement of local writes before counting persisted server records.
    // Metadata events also refresh the total when a queued report reaches the server.
    if (!snapshot.metadata.hasPendingWrites) void request.refresh();
  }, error => {
    request.dispose();
    onError(error);
  });
  return () => { request.dispose(); unsubscribe(); };
}

export function subscribeToUserReputation(userId: string, onSummary: (summary: TravelerReputationSummary | null) => void, onError: (error: Error) => void) {
  return onSnapshot(doc(db, "users", userId, "reputation", "summary"), snapshot => {
    onSummary(parseTravelerReputationSummary(userId, snapshot.exists() ? snapshot.data() : undefined));
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
        stationName: String(data.stationName ?? ""),
        reporterUserId: String(data.reporterUserId ?? ""),
        issueType: readableIssueType(data.issueType),
        comment: String(data.comment ?? ""),
        status: readable(data.status),
        createdAt: data.createdAt?.toDate?.() ?? null,
      } satisfies UserIssueReport;
    }).sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
    onReports(reports);
  }, error => onError(error));
}

// Raw report details are owner-private. Public warnings use the server projection.
export function subscribeToStationIssueReports(stationId: string, onReports: (reports: StationIssueSignal[]) => void, onError: (error: Error) => void) {
  let active = true;
  let stopSignals: (() => void) | null = null;
  let signalGeneration = 0;
  const stopStation = onSnapshot(doc(db, "stations", stationId), station => {
    if (!active) return;
    if (!station.exists() || station.data().issueSignalsVersion !== 1) {
      signalGeneration += 1; stopSignals?.(); stopSignals = null;
      onError(new Error("Issue reports are unavailable right now."));
      return;
    }
    if (stopSignals) return;
    const generation = ++signalGeneration;
    const signalsQuery = query(collection(db, "stations", stationId, "issueSignals"), orderBy("createdAt", "desc"), limit(250));
    stopSignals = onSnapshot(signalsQuery, snapshot => {
      if (!active || generation !== signalGeneration) return;
      const reports = snapshot.docs.flatMap(reportDoc => {
        const data = reportDoc.data();
        const createdAt = data.createdAt?.toDate?.();
        if (data.stationId !== stationId || typeof data.issueType !== "string" || !createdAt || !Number.isFinite(createdAt.getTime())) return [];
        return [{ id: reportDoc.id, stationId, issueType: readableIssueType(data.issueType), createdAt } satisfies StationIssueSignal];
      });
      onReports(reports);
    }, error => { if (active && generation === signalGeneration) onError(error); });
  }, error => {
    if (!active) return;
    signalGeneration += 1; stopSignals?.(); stopSignals = null;
    onError(error);
  });
  return () => { active = false; signalGeneration += 1; stopStation(); stopSignals?.(); };
}

// setDoc with merge (rather than updateDoc) so this still works for a
// traveler whose "users/{uid}" profile document doesn't exist yet.
export async function setStationFavorited(userId: string, stationId: string, favorited: boolean) {
  await setDoc(doc(db, "users", userId), {
    favoriteStationIds: favorited ? arrayUnion(stationId) : arrayRemove(stationId),
    ...(favorited ? { avoidedStationIds: arrayRemove(stationId) } : {}),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function setStationAvoided(userId: string, stationId: string, avoided: boolean) {
  await setDoc(doc(db, "users", userId), {
    avoidedStationIds: avoided ? arrayUnion(stationId) : arrayRemove(stationId),
    ...(avoided ? { favoriteStationIds: arrayRemove(stationId) } : {}),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function ensureUserProfile(user: User, suppliedName?: string) {
  const profileRef = doc(db, "users", user.uid);
  await runTransaction(db, async transaction => {
    const profile = await transaction.get(profileRef);
    transaction.set(profileRef, {
      ...profileIdentityPatch(user, profile.exists() ? profile.data() : undefined, suppliedName),
      ...(!profile.exists() ? { reviewCount: 0, photoCount: 0, createdAt: serverTimestamp() } : {}),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  });
}

export function ensureAnonymousUser(onUser: (user: User | null) => void, onError: (error: Error) => void) {
  let generation = 0;
  let disposed = false;
  const unsubscribe = onAuthStateChanged(auth, user => {
    if (disposed) return;
    const currentGeneration = ++generation;
    if (!user) {
      if (!disposed) onUser(null);
      void signInAnonymously(auth).catch(error => {
        if (!disposed && currentGeneration === generation) onError(error);
      });
      return;
    }
    // Publish the identity change immediately, so pending work from the previous
    // account is invalidated before the profile metadata transaction completes.
    if (!disposed && currentGeneration === generation) onUser(user);
    void ensureUserProfile(user).catch(error => {
      if (!disposed && currentGeneration === generation) onError(error);
    });
  }, error => { if (!disposed) onError(error); });
  return () => { disposed = true; generation += 1; unsubscribe(); };
}

export type AccountSignInMode = "link" | "signIn";

export const signInWithGoogle = async (mode: AccountSignInMode = "link") => {
  const currentUser = auth.currentUser;
  const startingUid = currentUser?.uid ?? null;
  const linkingGuest = mode === "link" && currentUser?.isAnonymous;
  const provider = new GoogleAuthProvider();
  // A collision propagates to the UI; changing accounts is an explicit separate action.
  const result = linkingGuest && currentUser
    ? await linkWithPopup(currentUser, provider, browserPopupRedirectResolver)
    : await signInWithPopup(auth, provider, browserPopupRedirectResolver);
  if (linkingGuest) assertSameAccountSession(startingUid, result.user.uid);
  assertSameAccountSession(result.user.uid, auth.currentUser?.uid ?? null);
  await ensureUserProfile(result.user);
  assertSameAccountSession(result.user.uid, auth.currentUser?.uid ?? null);
  return result;
};
export const completeRedirectSignIn = async () => {
  const result = await getRedirectResult(auth, browserPopupRedirectResolver);
  if (result) {
    assertSameAccountSession(result.user.uid, auth.currentUser?.uid ?? null);
    await ensureUserProfile(result.user);
    assertSameAccountSession(result.user.uid, auth.currentUser?.uid ?? null);
  }
  return result;
};
export const preloadAppleSignIn = () => {
  if (typeof window !== "undefined") void getPreparedAppleSignIn().catch(() => {});
};
export const signInWithApple = async (mode: AccountSignInMode = "link"): Promise<UserCredential> => {
  if (typeof window === "undefined") throw new Error("Apple sign-in requires a browser.");
  const currentUser = auth.currentUser;
  const startingUid = currentUser?.uid ?? null;
  const linkingGuest = mode === "link" && currentUser?.isAnonymous;

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
  assertSameAccountSession(startingUid, auth.currentUser?.uid ?? null);
  const result = linkingGuest && currentUser
    ? await linkWithCredential(currentUser, credential)
    : await signInWithCredential(auth, credential);
  assertSameAccountSession(result.user.uid, auth.currentUser?.uid ?? null);
  const suppliedName = [response.user?.name?.firstName, response.user?.name?.lastName].filter(Boolean).join(" ").trim();
  if (suppliedName && !result.user.displayName) await updateProfile(result.user, { displayName: suppliedName });
  await ensureUserProfile(result.user, suppliedName || undefined);
  assertSameAccountSession(result.user.uid, auth.currentUser?.uid ?? null);
  return result;
};
// The auth observer owns guest creation after the signed-out identity is published.
export const signOutUser = () => signOut(auth);

export async function submitIssueReport(input: IssueReportSubmissionInput): Promise<void> {
  if (auth.currentUser?.uid !== input.userId) throw new Error("Sign in to your account before submitting an issue report.");
  const payload = buildIssueReportPayload(input);
  await addDoc(collection(db, "reports"), { ...payload, createdAt: serverTimestamp() });
}

export async function submitReview(input: ReviewSubmissionInput) {
  if (auth.currentUser?.uid !== input.userId) throw new Error("Sign in to your account before submitting a report.");
  const now = Date.now();
  const payload = buildReviewPayload(input, now);
  const locks = reviewLockPayloads(input.stationId, now);
  const reviewRef = doc(collection(db, "reviews"));
  const userRef = doc(db, "users", input.userId);
  const batch = writeBatch(db);
  batch.set(reviewRef, { ...payload, createdAt: serverTimestamp() });
  batch.set(doc(userRef, "reviewLocks", input.stationId), locks.station);
  batch.set(doc(userRef, "reviewLocks", "global"), locks.global);
  batch.set(userRef, { reviewCount: increment(1), updatedAt: serverTimestamp() }, { merge: true });
  await batch.commit();
  return reviewRef.id;
}

export async function addStation(input: {
  userId: string; name: string; brand?: string; address: string; type: string; latitude: number; longitude: number;
  city?: string; state?: string; accessType?: string; layoutType?: string; source?: "userAdded" | "mapkit";
}) {
  const stationType = storageType(input.type);
  return addDoc(collection(db, "stations"), {
    addedByUserId: input.userId, name: input.name.trim(), brand: input.brand?.trim() || input.name.trim(), address: input.address.trim(),
    city: input.city ?? "", state: input.state ?? "", latitude: input.latitude, longitude: input.longitude,
    locationType: stationType, stationType, source: input.source ?? "userAdded", notes: "",
    restroomAccessType: input.accessType ?? "unknown", restroomLayoutType: input.layoutType ?? "unknown",
    restroomStatus: "unknown", stallCountBucket: "unknown", amenities: [],
    reviewCount: 0, photoCount: 0, cleanScore: 0, safetyScore: 0,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), lastReportedAt: serverTimestamp(),
  });
}
