import { addDoc, collection, limit, onSnapshot, query, serverTimestamp, where } from "firebase/firestore";
import { GoogleAuthProvider, OAuthProvider, getRedirectResult, onAuthStateChanged, signInAnonymously, signInWithPopup, signInWithRedirect, signOut, type User } from "firebase/auth";
import { auth, db } from "./firebase";

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

export function ensureAnonymousUser(onUser: (user: User) => void, onError: (error: Error) => void) {
  const unsubscribe = onAuthStateChanged(auth, user => {
    if (user) onUser(user);
    else signInAnonymously(auth).catch(onError);
  }, onError);
  return unsubscribe;
}

export const signInWithGoogle = () => signInWithPopup(auth, new GoogleAuthProvider());
export const completeRedirectSignIn = () => getRedirectResult(auth);
export const signInWithApple = async () => {
  const provider = new OAuthProvider("apple.com");
  provider.addScope("name");
  provider.addScope("email");

  const prefersRedirect = typeof window !== "undefined" && (
    window.matchMedia("(pointer: coarse)").matches ||
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  );

  if (prefersRedirect) {
    await signInWithRedirect(auth, provider);
    return null;
  }

  return signInWithPopup(auth, provider);
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
