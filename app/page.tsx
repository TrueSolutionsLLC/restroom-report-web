"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { initializeFirebaseAnalytics } from "./lib/firebase";
import { geocodeAppleMaps, isAppleMapsConfigured, searchAppleMaps, searchAppleMapsPois, type AppleMapsPoiResult } from "./lib/mapkit";
import {
  addStation, completeRedirectSignIn, ensureAnonymousUser, preloadAppleSignIn, setStationAvoided, setStationFavorited, signInWithApple,
  signInWithGoogle, signOutUser, submitReview, subscribeToReviews, subscribeToStationIssueReports, subscribeToStationsInBounds,
  subscribeToUserIssueReports, subscribeToUserProfile, subscribeToUserReviews,
  type GeoBounds, type LivePlace, type StationReview, type UserIssueReport, type UserProfile, type UserReview,
} from "./lib/firestore";
import { isWideViewport } from "./components/mapTypes";

const RestroomMap = dynamic(() => import("./components/RestroomMap"), { ssr: false });
type Coordinates = { latitude: number; longitude: number };
type MapViewport = { center: Coordinates; bounds: GeoBounds; zoom: number };
type Panel = "none" | "detail" | "rate" | "toofar" | "add" | "reports" | "account" | "install" | "getapp";
type DeferredInstall = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type AppPromotionPlatform = "ios" | "android" | "other";
type AccountData = {
  userId: string; profile: UserProfile | null; reviews: UserReview[]; issueReports: UserIssueReport[];
  profileReady: boolean; reviewsReady: boolean; reportsReady: boolean; error: string;
};

const APP_STORE_URL = "https://apps.apple.com/us/app/restroom-report/id6785755048";
const APP_PROMOTION_DISMISSED_KEY = "rr-app-promotion-dismissed-at";
const APP_PROMOTION_INSTALLED_KEY = "rr-web-app-installed";
const APP_PROMOTION_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;
const isAppleMobileDevice = () => typeof navigator !== "undefined" && (
  /iPhone|iPad|iPod/i.test(navigator.userAgent)
  || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
);
// How close a traveler must be (by device GPS) to rate a restroom. Wide
// enough to cover a large truck stop parking lot plus normal GPS drift.
const GEOFENCE_RADIUS_MILES = 0.5;
const TYPES = ["All", "Gas station", "Truck stop", "Rest area", "Fast food"];
const TYPE_LABELS: Record<string, string> = { "All": "All", "Gas station": "Gas", "Truck stop": "Truck Stops", "Rest area": "Rest Areas", "Fast food": "Fast Food" };
const CHECKS = [
  { key: "paper", label: "Toilet paper" }, { key: "soap", label: "Soap" }, { key: "sink", label: "Working sink" },
  { key: "safe", label: "Felt safe" }, { key: "accessible", label: "Accessible" }, { key: "changingTable", label: "Changing table" },
];

function Icon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>, locate: <><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 2V0M12 24v-2M2 12H0M24 12h-2"/></>,
    list: <><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3" cy="6" r="1"/><circle cx="3" cy="12" r="1"/><circle cx="3" cy="18" r="1"/></>, plus: <path d="M12 5v14M5 12h14"/>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21c1-5 15-5 16 0"/></>, route: <><path d="M5 19c5 0 4-14 9-14h5"/><path d="m16 2 3 3-3 3"/><circle cx="5" cy="19" r="2"/></>,
    star: <path d="m12 2 3 6 7 .8-5 4.8 1.5 7-6.5-3.5-6.5 3.5 1.5-7-5-4.8L9 8z"/>, close: <path d="m6 6 12 12M18 6 6 18"/>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></>, chevron: <path d="m9 18 6-6-6-6"/>, share: <><path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 11v9h14v-9"/></>,
    install: <><path d="M12 3v12M8 11l4 4 4-4"/><path d="M5 19h14"/></>, check: <path d="m5 12 4 4L19 6"/>, back: <path d="m15 18-6-6 6-6"/>,
    map: <><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z"/><path d="M9 4v14M15 6v14"/></>, flag: <><path d="M5 3v18"/><path d="M5 4h13l-3 4 3 4H5"/></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/></>, bookmark: <path d="M6 3h12v18l-6-4-6 4Z"/>,
    gas: <><path d="M4 21V7a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v14"/><path d="M4 21h10"/><path d="M14 8h2a2 2 0 0 1 2 2v7a1.5 1.5 0 0 0 3 0v-5l-2-2"/></>,
    truck: <><path d="M2 8h11v9H2z"/><path d="M13 11h4l3 3v3h-7z"/><circle cx="6" cy="19" r="1.6"/><circle cx="17" cy="19" r="1.6"/></>,
    sign: <><rect x="4" y="5" width="16" height="10" rx="1"/><path d="M12 15v4"/></>,
    bag: <><path d="M6 8h12l-1 12H7z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
    message: <><path d="M4 4h16v12H8l-4 4V4Z"/><path d="M8 9h8M8 12h5"/></>,
    toilet: <><path d="M8 4h8v5H8z"/><path d="M7 9h10v3a5 5 0 0 1-5 5 5 5 0 0 1-5-5V9Z"/><path d="M10 17v3h4v-3"/></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function CleanScoreRing({ score }: { score: number | null }) {
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const pct = score === null ? 0 : Math.max(0, Math.min(100, (score / 10) * 100));
  const offset = circumference * (1 - pct / 100);
  return <div className="cleanscore-ring">
    <svg viewBox="0 0 70 70" aria-hidden="true">
      <circle cx="35" cy="35" r={radius} className="ring-track"/>
      {score !== null && <circle cx="35" cy="35" r={radius} className="ring-value" strokeDasharray={circumference} strokeDashoffset={offset} transform="rotate(-90 35 35)"/>}
    </svg>
    <div className="cleanscore-ring-label"><strong>{score ?? "?"}</strong><span>Cleanscore</span></div>
  </div>;
}

const relativeTime = (date: Date | null) => {
  if (!date) return "—";
  const days = (Date.now() - date.getTime()) / 86_400_000;
  if (days < 1) return "Today";
  if (days < 2) return "Yesterday";
  if (days < 7) return `${Math.floor(days)} day${Math.floor(days) === 1 ? "" : "s"} ago`;
  if (days < 30) return `${Math.floor(days / 7)} wk. ago`;
  if (days < 365) return `${Math.floor(days / 30)} mo. ago`;
  return `${Math.floor(days / 365)} yr. ago`;
};

const confidenceTier = (reviewCount: number) => {
  if (reviewCount <= 0) return null;
  if (reviewCount < 3) return "Low";
  if (reviewCount < 7) return "Medium";
  return "High";
};

const milesBetween = (a: Coordinates, b: Coordinates) => {
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(b.latitude - a.latitude), dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const authErrorMessage = (error: unknown) => {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  const messages: Record<string, string> = {
    "auth/unauthorized-domain": "This domain must be authorized in Firebase Authentication settings.",
    "auth/operation-not-allowed": "This sign-in provider still needs to be enabled in Firebase.",
    "auth/popup-blocked": "Your browser blocked the sign-in window. Allow pop-ups and try again.",
    "auth/popup-closed-by-user": "Sign-in was cancelled.",
    "auth/cancelled-popup-request": "Another sign-in window is already open.",
    "auth/account-exists-with-different-credential": "An account already exists with the same email using another sign-in method.",
    "auth/network-request-failed": "The sign-in request lost its internet connection. Please try again.",
    "auth/apple-invalid-state": "Apple sign-in returned an invalid security state. Please try again.",
    "auth/apple-missing-id-token": "Apple did not return the identity needed to sign in. Please try again.",
    "auth/missing-or-invalid-nonce": "Apple sign-in could not pass its security check. Refresh the page and try again.",
    "auth/invalid-credential": "Apple returned a credential that Firebase could not verify. Please try again.",
  };
  return messages[code] ?? `Sign-in could not be completed${code ? ` (${code.replace("auth/", "")})` : ""}.`;
};

const friendlyStatus = (value: string | number | null | undefined, fallback = "Traveler") => {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  if (/^\d+$/.test(text)) return `Level ${text}`;
  return text.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, character => character.toUpperCase());
};

const emptyAccountData = (userId = ""): AccountData => ({
  userId, profile: null, reviews: [], issueReports: [], profileReady: false, reviewsReady: false, reportsReady: false, error: "",
});

const viewportKey = (viewport: MapViewport) => [
  viewport.bounds.south,
  viewport.bounds.north,
  viewport.bounds.west,
  viewport.bounds.east,
].map(value => value.toFixed(5)).join(":");

const candidatePlace = (place: AppleMapsPoiResult): LivePlace => ({
  id: place.id,
  name: place.label,
  type: place.type,
  address: place.formattedAddress,
  score: null,
  reports: 0,
  // Discovered candidates are always unrated until someone submits a report.
  color: "unrated",
  latitude: place.latitude,
  longitude: place.longitude,
  status: "Status not confirmed",
  detail: "Discovered with Apple Maps",
  accessType: "Unknown",
  layoutType: "Unknown",
  city: place.city,
  state: place.state,
  source: "appleMaps",
});

const normalizedPlaceText = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

const mergeMapPlaces = (community: LivePlace[], discovered: LivePlace[]) => {
  const merged = [...community];
  discovered.forEach(candidate => {
    const candidateName = normalizedPlaceText(candidate.name);
    const duplicate = community.some(saved => {
      const nearby = milesBetween(saved, candidate) < 0.12;
      const sameName = candidateName.length > 2 && normalizedPlaceText(saved.name) === candidateName;
      const sameAddress = candidate.address.length > 5 && normalizedPlaceText(saved.address) === normalizedPlaceText(candidate.address);
      return nearby && (sameName || sameAddress);
    });
    if (!duplicate) merged.push(candidate);
  });
  return merged;
};

export default function Home() {
  const [places, setPlaces] = useState<LivePlace[]>([]);
  const [selected, setSelected] = useState<LivePlace | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [panel, setPanel] = useState<Panel>("none");
  const [user, setUser] = useState<User | null>(null);
  const [userCoords, setUserCoords] = useState<Coordinates | null>(null);
  const [mapCenter, setMapCenter] = useState<Coordinates>({ latitude: 38.4, longitude: -96.5 });
  const [mapViewport, setMapViewport] = useState<MapViewport | null>(null);
  const [viewportIsDirty, setViewportIsDirty] = useState(false);
  const [viewportRequest, setViewportRequest] = useState(0);
  const [localSearchRequest, setLocalSearchRequest] = useState(0);
  const [wideZoom, setWideZoom] = useState(false);
  const [mapStyle, setMapStyle] = useState<"standard" | "satellite">("standard");
  const [mainView, setMainView] = useState<"map" | "list">("map");
  const [mapStyleMenuOpen, setMapStyleMenuOpen] = useState(false);
  const mapStyleControlRef = useRef<HTMLDivElement>(null);
  const latestViewport = useRef<MapViewport | null>(null);
  const loadedViewportKey = useRef("");
  const placeRequestSequence = useRef(0);
  const [focus, setFocus] = useState<Coordinates | null>(null);
  const [locationState, setLocationState] = useState<"idle" | "finding" | "found" | "blocked">("idle");
  const [cloudReady, setCloudReady] = useState(false);
  const [loadingPlaces, setLoadingPlaces] = useState(true);
  const [toast, setToast] = useState("");
  const [reviews, setReviews] = useState<StationReview[]>([]);
  const [stationIssueReports, setStationIssueReports] = useState<UserIssueReport[]>([]);
  const [accountData, setAccountData] = useState<AccountData>(() => emptyAccountData());
  const [installPrompt, setInstallPrompt] = useState<DeferredInstall | null>(null);
  const [isStandalone] = useState(() => typeof window !== "undefined" && (
    window.matchMedia("(display-mode: standalone)").matches
    || ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  ));
  const [isIOS] = useState(isAppleMobileDevice);
  const [promotionPlatform, setPromotionPlatform] = useState<AppPromotionPlatform>("other");
  const [showAppPromotion, setShowAppPromotion] = useState(false);
  // Starts "unset" to match server-rendered markup exactly; the real value
  // (from localStorage, a client-only API) is synced in after mount below,
  // rather than read in the initializer, which would make the client's
  // first render disagree with the server and fail hydration.
  const [cookieConsent, setCookieConsentState] = useState<"unset" | "accepted" | "declined">("unset");
  const [busy, setBusy] = useState(false);

  const [rating, setRating] = useState(0), [odor, setOdor] = useState(0), [crowd, setCrowd] = useState("quiet"), [comment, setComment] = useState("");
  const [answers, setAnswers] = useState<Record<string, boolean | null>>(() => Object.fromEntries(CHECKS.map(item => [item.key, null])));
  const [submitted, setSubmitted] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", brand: "", address: "", type: "Gas station", accessType: "unknown", layoutType: "unknown" });

  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 3000); };
  const setCookieConsent = (value: "accepted" | "declined") => {
    window.localStorage.setItem("rr-cookie-consent", value);
    setCookieConsentState(value);
  };

  // Google Analytics (via Firebase) only loads once the visitor accepts —
  // ePrivacy/GDPR requires consent before non-essential tracking starts,
  // not just a notice that it's happening.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("cookies") === "manage") return;
    const stored = window.localStorage.getItem("rr-cookie-consent");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from localStorage (a client-only API with no change-subscription mechanism) after the SSR-matching initial render.
    if (stored === "accepted" || stored === "declined") setCookieConsentState(stored);
  }, []);

  useEffect(() => {
    if (cookieConsent === "accepted") initializeFirebaseAnalytics().catch(() => {});
  }, [cookieConsent]);

  useEffect(() => {
    const installHandler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as DeferredInstall);
    };
    const installedHandler = () => {
      try { window.localStorage.setItem(APP_PROMOTION_INSTALLED_KEY, "true"); } catch {}
      setInstallPrompt(null);
      setShowAppPromotion(false);
    };
    window.addEventListener("beforeinstallprompt", installHandler);
    window.addEventListener("appinstalled", installedHandler);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    preloadAppleSignIn();
    let stopAuth = () => {};
    let cancelled = false;
    const startAuth = async () => {
      try {
        const result = await completeRedirectSignIn();
        if (cancelled) return;
        if (result?.user) {
          setUser(result.user);
          setCloudReady(true);
          notify(`Signed in as ${result.user.displayName ?? result.user.email ?? "traveler"}`);
          setPanel("account");
        }
      } catch (error) {
        if (!cancelled) notify(authErrorMessage(error));
      }
      if (!cancelled) stopAuth = ensureAnonymousUser(current => { setUser(current); setCloudReady(true); }, () => setCloudReady(false));
    };
    startAuth();
    return () => {
      cancelled = true;
      window.removeEventListener("beforeinstallprompt", installHandler);
      window.removeEventListener("appinstalled", installedHandler);
      stopAuth();
    };
  }, []);

  useEffect(() => {
    if (cookieConsent === "unset" || isStandalone) return;
    const userAgent = navigator.userAgent;
    const platform: AppPromotionPlatform = isAppleMobileDevice()
      ? "ios"
      : /Android/i.test(userAgent)
        ? "android"
        : "other";
    if (platform === "other") return;

    let installed = false;
    let dismissedAt = 0;
    try {
      installed = window.localStorage.getItem(APP_PROMOTION_INSTALLED_KEY) === "true";
      dismissedAt = Number(window.localStorage.getItem(APP_PROMOTION_DISMISSED_KEY) ?? 0);
    } catch {}
    if (installed || (dismissedAt > 0 && Date.now() - dismissedAt < APP_PROMOTION_SNOOZE_MS)) return;

    const timer = window.setTimeout(() => {
      setPromotionPlatform(platform);
      setShowAppPromotion(true);
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [cookieConsent, isStandalone]);

  useEffect(() => {
    if (!mapViewport) return;
    const requestSequence = ++placeRequestSequence.current;
    const requestKey = viewportKey(mapViewport);
    const controller = new AbortController();
    let community: LivePlace[] = [];
    let discovered: LivePlace[] = [];
    let communityReady = false;
    let discoveryReady = !isAppleMapsConfigured();

    // Only replace the on-screen places once a source has actually reported
    // back. Publishing before either source resolves would clear the map to
    // empty on every viewport change, making pins flash or disappear.
    const publish = () => {
      if (requestSequence !== placeRequestSequence.current) return;
      const items = mergeMapPlaces(community, discovered);
      setPlaces(items);
      setSelected(current => {
        if (!current) return null;
        return items.find(item => item.id === current.id)
          ?? items.find(item => milesBetween(item, current) < 0.12 && normalizedPlaceText(item.name) === normalizedPlaceText(current.name))
          ?? null;
      });
      if (!communityReady || !discoveryReady) return;
      loadedViewportKey.current = requestKey;
      if (latestViewport.current && viewportKey(latestViewport.current) === requestKey) setViewportIsDirty(false);
      setLoadingPlaces(false);
    };

    const stopStations = subscribeToStationsInBounds(mapViewport.bounds, items => {
      community = items;
      communityReady = true;
      setCloudReady(true);
      publish();
    }, () => {
      communityReady = true;
      setCloudReady(false);
      setToast("Restroom Report ratings could not be loaded for this area");
      publish();
    });

    if (!discoveryReady) {
      searchAppleMapsPois(mapViewport, controller.signal).then(items => {
        discovered = items.map(candidatePlace);
      }).catch(error => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.warn("Apple Maps place discovery failed.", error);
        setToast("Nearby Apple Maps places could not be refreshed");
      }).finally(() => {
        discoveryReady = true;
        publish();
      });
    }

    return () => { controller.abort(); stopStations(); };
  }, [mapViewport]);

  const commitMapViewport = useCallback((viewport: MapViewport) => {
    setMapCenter(viewport.center);
    // Always create a new request object so the persistent Search this area
    // control can explicitly retry even when the visible rectangle is unchanged.
    setMapViewport({
      ...viewport,
      center: { ...viewport.center },
      bounds: { ...viewport.bounds },
    });
    setViewportIsDirty(false);
    setQuery("");
    setLoadingPlaces(true);
  }, []);

  // Moving or zooming the map only updates the live viewport reference and the
  // "Search this area" dirty state — it never re-searches on its own. An
  // automatic re-search on every pan (including the recenter triggered by
  // tapping a pin) was re-running Firestore/Apple Maps constantly, which made
  // pins flicker and could drop the just-selected place out of the results.
  // The user now explicitly asks for a new search.
  const updateMapViewport = useCallback((viewport: MapViewport) => {
    latestViewport.current = viewport;
    setMapCenter(viewport.center);
    setWideZoom(isWideViewport(viewport));
    if (!mapViewport) {
      commitMapViewport(viewport);
      return;
    }
    setViewportIsDirty(viewportKey(viewport) !== loadedViewportKey.current);
  }, [commitMapViewport, mapViewport]);

  const searchThisArea = useCallback(() => {
    const viewport = latestViewport.current ?? mapViewport;
    // At regional/nationwide zoom, an area search can never return a useful
    // Apple Maps result. Zoom to a local radius around the current center
    // instead of silently repeating an empty search.
    if (viewport && isWideViewport(viewport)) {
      setLocalSearchRequest(value => value + 1);
      return;
    }
    // Refresh the last region immediately, then ask the mounted map for its
    // exact live region. This also makes retrying unchanged bounds complete.
    if (viewport) commitMapViewport(viewport);
    setViewportRequest(value => value + 1);
  }, [commitMapViewport, mapViewport]);

  useEffect(() => {
    if (!selected) return;
    return subscribeToReviews(selected.id, setReviews, () => setReviews([]));
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    return subscribeToStationIssueReports(selected.id, setStationIssueReports, () => setStationIssueReports([]));
  }, [selected]);

  useEffect(() => {
    if (!mapStyleMenuOpen) return;
    const closeIfOutside = (event: MouseEvent) => {
      if (!mapStyleControlRef.current?.contains(event.target as Node)) setMapStyleMenuOpen(false);
    };
    document.addEventListener("mousedown", closeIfOutside);
    return () => document.removeEventListener("mousedown", closeIfOutside);
  }, [mapStyleMenuOpen]);

  const currentUserId = user?.uid ?? "";
  useEffect(() => {
    if (!currentUserId) return;
    const updateAccount = (patch: Partial<AccountData>) => setAccountData(current => ({
      ...(current.userId === currentUserId ? current : emptyAccountData(currentUserId)), ...patch, userId: currentUserId,
    }));
    const failed = () => updateAccount({
      error: "Some account history could not be loaded from Firebase.", profileReady: true, reviewsReady: true, reportsReady: true,
    });
    const stopProfile = subscribeToUserProfile(currentUserId, profile => updateAccount({ profile, profileReady: true }), failed);
    const stopReviews = subscribeToUserReviews(currentUserId, reviews => updateAccount({ reviews, reviewsReady: true }), failed);
    const stopReports = subscribeToUserIssueReports(currentUserId, issueReports => updateAccount({ issueReports, reportsReady: true }), failed);
    return () => { stopProfile(); stopReviews(); stopReports(); };
  }, [currentUserId]);

  const activeAccount = accountData.userId === currentUserId ? accountData : emptyAccountData(currentUserId);
  const userProfile = activeAccount.profile;
  const myReviews = activeAccount.reviews;
  const myIssueReports = activeAccount.issueReports;
  const accountLoading = Boolean(currentUserId) && !(activeAccount.profileReady && activeAccount.reviewsReady && activeAccount.reportsReady);
  const accountSyncError = activeAccount.error;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const result = places.filter(place => (filter === "All" || place.type === filter) && (!needle || `${place.name} ${place.address} ${place.city} ${place.state} ${place.type}`.toLowerCase().includes(needle)));
    const origin = mapCenter;
    return [...result].sort((a, b) => milesBetween(origin, a) - milesBetween(origin, b));
  }, [places, filter, query, mapCenter]);

  const stationNames = useMemo(() => new Map(places.map(place => [place.id, place.name])), [places]);
  const myContributions = useMemo(() => [
    ...myReviews.map(review => ({
      id: `review-${review.id}`, kind: "review" as const, stationId: review.stationId,
      title: stationNames.get(review.stationId) ?? "Restroom rating", detail: `${review.cleanlinessRating}/5 cleanliness`,
      status: "Submitted", createdAt: review.createdAt,
    })),
    ...myIssueReports.map(report => ({
      id: `issue-${report.id}`, kind: "issue" as const, stationId: report.stationId,
      title: stationNames.get(report.stationId) ?? "Restroom issue", detail: report.issueType,
      status: report.status || "Submitted", createdAt: report.createdAt,
    })),
  ].sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)), [myReviews, myIssueReports, stationNames]);

  const profileName = userProfile?.displayName || user?.displayName || (user?.isAnonymous ? "Guest explorer" : "Apple User");
  const profileEmail = userProfile?.email || user?.email || "Private Apple account";
  const travelerStatus = friendlyStatus(userProfile?.trustedTravelerLevel || userProfile?.level, "New traveler");
  const contributionCount = Math.max(myReviews.length, userProfile?.reviewCount ?? 0);
  const milestoneOptions = [5, 10, 25, 50, 100, 250];
  const nextMilestone = milestoneOptions.find(value => value > contributionCount) ?? 250;
  const previousMilestone = [...milestoneOptions].reverse().find(value => value <= contributionCount) ?? 0;
  const milestoneProgress = contributionCount >= 250 ? 100 : Math.min(100, Math.max(0, ((contributionCount - previousMilestone) / Math.max(1, nextMilestone - previousMilestone)) * 100));

  const selectPlace = (place: LivePlace, showDetail = false) => { setSelected(place); setFocus({ latitude: place.latitude, longitude: place.longitude }); if (showDetail) setPanel("detail"); };
  const findMe = () => {
    if (!navigator.geolocation) { notify("Location is not available in this browser"); return; }
    setLocationState("finding");
    navigator.geolocation.getCurrentPosition(position => {
      const coords = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      setUserCoords(coords); setFocus(coords); setLocationState("found"); notify("Showing restrooms closest to you");
    }, () => { setLocationState("blocked"); notify("Allow location access in your browser settings"); }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  };

  const searchLocation = async () => {
    if (!query.trim()) return;
    if (filtered.length) { selectPlace(filtered[0]); return; }
    setBusy(true);
    try {
      if (isAppleMapsConfigured()) {
        try {
          const result = await searchAppleMaps(query, mapCenter);
          setFocus({ latitude: result.latitude, longitude: result.longitude });
          notify(`Map moved to ${result.label}`);
          return;
        } catch (error) {
          console.warn("Apple Maps search was unavailable; trying the search fallback.", error);
        }
      }
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`);
      const result = (await response.json())[0];
      if (!result) throw new Error();
      setFocus({ latitude: Number(result.lat), longitude: Number(result.lon) }); notify(`Map moved to ${result.display_name.split(",")[0]}`);
    } catch { notify("No matching place or city was found"); }
    finally { setBusy(false); }
  };

  const directions = (place: LivePlace) => {
    const appleDevice = /Macintosh|Mac OS X|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const destination = `${place.latitude},${place.longitude}`;
    const url = appleDevice
      ? `https://maps.apple.com/?daddr=${encodeURIComponent(destination)}&dirflg=d`
      : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };
  const startRating = () => { setPanel("rate"); setRating(0); setOdor(0); setCrowd("quiet"); setComment(""); setAnswers(Object.fromEntries(CHECKS.map(item => [item.key, null]))); setSubmitted(false); };
  const openRating = async () => {
    if (!selected) return;
    if (navigator.geolocation) {
      try {
        const coords = await new Promise<Coordinates>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            position => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
            reject,
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
          );
        });
        if (milesBetween(coords, selected) > GEOFENCE_RADIUS_MILES) { setPanel("toofar"); return; }
      } catch {
        // Location unavailable or denied — this can't be enforced without it, so don't block.
      }
    }
    startRating();
  };
  const ratingComplete = rating > 0 && odor > 0 && Object.values(answers).every(value => value !== null);

  const restroomSummary = useMemo(() => {
    if (!reviews.length) return null;
    const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    const cleanliness = average(reviews.map(review => review.cleanlinessRating));
    const odorScore = average(reviews.map(review => review.odorRating));
    const suppliesRatio = reviews.filter(review => review.soapAvailable && review.toiletPaperAvailable).length / reviews.length;
    const tier = (value: number) => value >= 3.5 ? "Good" : value >= 2.5 ? "Fair" : "Bad";
    return {
      cleanliness: tier(cleanliness),
      odor: tier(odorScore),
      supplies: suppliesRatio >= .5 ? "Good" : "Low",
      lastReport: relativeTime(reviews[0]?.createdAt ?? null),
    };
  }, [reviews]);

  const isFavorited = Boolean(selected && userProfile?.favoriteStationIds.includes(selected.id));
  const isAvoided = Boolean(selected && userProfile?.avoidedStationIds.includes(selected.id));
  const toggleFavorite = async () => {
    if (!selected || !user) return;
    try { await setStationFavorited(user.uid, selected.id, !isFavorited); }
    catch { notify("Could not update saved stops. Please try again."); }
  };
  const toggleAvoid = async () => {
    if (!selected || !user) return;
    try { await setStationAvoided(user.uid, selected.id, !isAvoided); }
    catch { notify("Could not update avoided stops. Please try again."); }
  };

  const saveReview = async () => {
    if (!selected || !user || !ratingComplete) return;
    setBusy(true);
    try {
      let station = selected;
      if (selected.source === "appleMaps") {
        const stationDocument = await addStation({
          userId: user.uid,
          name: selected.name,
          address: selected.address,
          type: selected.type,
          latitude: selected.latitude,
          longitude: selected.longitude,
          city: selected.city,
          state: selected.state,
          source: "mapkit",
        });
        station = { ...selected, id: stationDocument.id, source: "firestore" };
        setSelected(station);
        setPlaces(current => current.map(place => place.id === selected.id ? station : place));
      }
      await submitReview({ stationId: station.id, userId: user.uid, cleanlinessRating: rating, odorRating: odor, crowdLevel: crowd, comment, answers: answers as Record<string, boolean> });
      setSubmitted(true);
    } catch { notify("Your rating could not be submitted. Please try again."); }
    finally { setBusy(false); }
  };

  const geocode = async (address: string) => {
    if (isAppleMapsConfigured()) {
      try {
        const item = await geocodeAppleMaps(address, mapCenter);
        return {
          latitude: item.latitude,
          longitude: item.longitude,
          city: item.city,
          state: item.state,
        };
      } catch (error) {
        console.warn("Apple Maps geocoding was unavailable; trying the address fallback.", error);
      }
    }
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1&q=${encodeURIComponent(address)}`);
    const item = (await response.json())[0];
    if (!item) throw new Error("Address not found");
    return { latitude: Number(item.lat), longitude: Number(item.lon), city: item.address?.city ?? item.address?.town ?? item.address?.village ?? "", state: item.address?.state ?? "" };
  };
  const saveStation = async () => {
    if (!user || !addForm.name.trim() || !addForm.address.trim()) { notify("Enter the place name and address"); return; }
    setBusy(true);
    try {
      const coords = await geocode(addForm.address);
      await addStation({ userId: user.uid, ...addForm, ...coords });
      setFocus(coords); setPanel("none"); setAddForm({ name: "", brand: "", address: "", type: "Gas station", accessType: "unknown", layoutType: "unknown" }); notify("Restroom added—thank you!");
    } catch { notify("We couldn’t locate that address. Add the city and state, then try again."); }
    finally { setBusy(false); }
  };

  const rememberPromotionDismissal = () => {
    try { window.localStorage.setItem(APP_PROMOTION_DISMISSED_KEY, String(Date.now())); } catch {}
    setShowAppPromotion(false);
  };
  const installApp = async () => {
    if (installPrompt) {
      try {
        await installPrompt.prompt();
        const choice = await installPrompt.userChoice;
        setInstallPrompt(null);
        if (choice.outcome === "accepted") {
          try { window.localStorage.setItem(APP_PROMOTION_INSTALLED_KEY, "true"); } catch {}
          setShowAppPromotion(false);
        } else {
          rememberPromotionDismissal();
        }
      } catch {
        setInstallPrompt(null);
        setShowAppPromotion(false);
        setPanel("install");
      }
      return;
    }
    setPanel("install");
  };
  const activateAppPromotion = async () => {
    if (promotionPlatform === "ios") {
      rememberPromotionDismissal();
      window.location.assign(APP_STORE_URL);
      return;
    }
    setShowAppPromotion(false);
    await installApp();
  };
  const activateBrand = async () => {
    if (isStandalone) {
      setPanel("none");
      return;
    }
    if (isIOS) {
      rememberPromotionDismissal();
      window.location.assign(APP_STORE_URL);
      return;
    }
    if (promotionPlatform === "android" || /Android/i.test(navigator.userAgent)) {
      setPromotionPlatform("android");
      setShowAppPromotion(false);
      await installApp();
      return;
    }
    setPanel("getapp");
  };
  const authenticate = async (provider: "google" | "apple") => {
    setBusy(true);
    try {
      const result = provider === "google" ? await signInWithGoogle() : await signInWithApple();
      if (!result) return;
      setUser(result.user); notify(`Signed in as ${result.user.displayName ?? result.user.email ?? "traveler"}`); setPanel("account");
    }
    catch (error) { notify(authErrorMessage(error)); }
    finally { setBusy(false); }
  };

  return <main className="app-shell">
    <header className="topbar">
      <button className={`brand ${showAppPromotion && panel === "none" ? "promoted" : ""}`} onClick={activateBrand} aria-label={isIOS ? "Get Restroom Report on the App Store" : "Install Restroom Report"}><span className="brandmark"><Image src="/app-icon-192.png" alt="" width={42} height={42} priority/></span><span>Restroom <strong>Report</strong></span></button>
      <nav><button className="active" onClick={() => setPanel("none")}>Explore</button><button onClick={() => setPanel("reports")}>Contributions <span className="report-count">{myContributions.length}</span></button><button className="avatar" onClick={() => setPanel("account")} aria-label="Account"><Icon name="user"/></button></nav>
      {showAppPromotion && panel === "none" && <aside className="app-promotion" role="dialog" aria-modal="false" aria-label={promotionPlatform === "ios" ? "Get the iPhone app" : "Install Restroom Report"}>
        <span className="app-promotion-pointer" aria-hidden="true"/>
        <button className="app-promotion-close" onClick={rememberPromotionDismissal} aria-label="Dismiss app promotion"><Icon name="close"/></button>
        <span className="app-promotion-icon"><Icon name="install"/></span>
        <div className="app-promotion-copy">
          <span className="app-promotion-kicker">{promotionPlatform === "ios" ? "Available on iPhone" : "Android web app"}</span>
          <strong>{promotionPlatform === "ios" ? "Get the iPhone app" : "Install Restroom Report"}</strong>
          <p>{promotionPlatform === "ios" ? "Tap the app icon for a faster experience." : "Add it to your Home screen for faster, full-screen access."}</p>
        </div>
        <button className="app-promotion-action" onClick={activateAppPromotion}>{promotionPlatform === "ios" ? "View in App Store" : installPrompt ? "Install" : "How to install"}</button>
      </aside>}
    </header>

    <section className={`map-area ${selected ? "has-selection" : "no-selection"} ${mainView === "list" ? "list-mode" : ""}`}>
      <RestroomMap places={filtered} selected={selected} onSelect={selectPlace} userCoords={userCoords} focus={focus} onViewportChange={updateMapViewport} viewportRequest={viewportRequest} localSearchRequest={localSearchRequest} mapStyle={mapStyle}/>
      {mainView === "map" && <div className="map-style-control" ref={mapStyleControlRef}>
        <button aria-label="Map style" onClick={() => setMapStyleMenuOpen(current => !current)}><Icon name="layers"/></button>
        {mapStyleMenuOpen && <div className="map-style-menu" role="menu">
          <button role="menuitem" className={mapStyle === "standard" ? "selected" : ""} onClick={() => { setMapStyle("standard"); setMapStyleMenuOpen(false); }}><Icon name="check"/>Standard</button>
          <button role="menuitem" className={mapStyle === "satellite" ? "selected" : ""} onClick={() => { setMapStyle("satellite"); setMapStyleMenuOpen(false); }}><Icon name="check"/>Satellite</button>
        </div>}
      </div>}
      <form className="searchbox" onSubmit={event => { event.preventDefault(); searchLocation(); }}><Icon name="search"/><input aria-label="Search restrooms, places or cities" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search restrooms, places or cities"/><button type="submit" disabled={busy}>{busy ? "…" : "Go"}</button></form>
      <div className="filters" aria-label="Restroom categories">{TYPES.map(type => <button key={type} className={filter === type ? "selected" : ""} onClick={() => setFilter(type)}>{TYPE_LABELS[type]}</button>)}</div>
      <div className="view-toggle" role="group" aria-label="Map or list view">
        <button className={mainView === "map" ? "selected" : ""} onClick={() => setMainView("map")} aria-label="Map view"><Icon name="map"/></button>
        <button className={mainView === "list" ? "selected" : ""} onClick={() => setMainView("list")} aria-label="List view"><Icon name="list"/></button>
      </div>
      {mainView === "map" && <div className="map-status-controls">
        <button className={`search-area-button ${viewportIsDirty ? "dirty" : ""} ${wideZoom ? "wide" : ""}`} onClick={searchThisArea} aria-busy={loadingPlaces}>
          <Icon name={wideZoom ? "locate" : "search"}/>
          {wideZoom ? "Zoom in & search" : loadingPlaces ? "Searching…" : filtered.length ? "Search this area" : "Try area search again"}
        </button>
      </div>}
      {mainView === "map" && <button className={`locate ${locationState}`} onClick={findMe}><Icon name="locate"/><span>{locationState === "finding" ? "Finding…" : "Near me"}</span></button>}
      {mainView === "map" && <button className="add-fab" onClick={() => setPanel("add")}><Icon name="plus"/><span>Add restroom</span></button>}

      {mainView === "map" && (selected ? <aside className="place-card">
        <span className="card-drag-handle" aria-hidden="true"/>
        <button className="card-close" onClick={() => setSelected(null)} aria-label="Close"><Icon name="close"/></button>
        <button className="card-open" onClick={() => setPanel("detail")} aria-label="Open restroom details"><Icon name="chevron"/></button>
        <div className="card-head"><span className={`type-dot ${selected.color}`}/><span>{selected.type}</span><span className={`status-chip ${selected.status === "Status not confirmed" ? "unknown" : ""}`}>{selected.status}</span></div>
        <div className="card-main"><div><h1>{selected.name}</h1><p>{userCoords ? `${milesBetween(userCoords, selected).toFixed(1)} mi · ` : ""}{selected.score === null ? "Not yet rated" : selected.address || "Address unavailable"}</p></div><div className={`score ${selected.score !== null && selected.score >= 8 ? "great" : ""}`}><strong>{selected.score ?? "?"}</strong><span>{selected.reports ? `${selected.reports} report${selected.reports === 1 ? "" : "s"}` : "CleanScore"}</span></div></div>
        <div className="actions"><button onClick={() => directions(selected)}><Icon name="route"/>Directions</button><button className="primary" onClick={openRating}><Icon name="star"/>Rate restroom</button></div>
      </aside> : <aside className="discovery-card"><span className="discovery-icon"><Icon name="locate"/></span><div><strong>Find a better stop</strong><p>{wideZoom ? "Search a city, tap Near me, or use Zoom in & search." : "Move the map, then tap Search this area."}</p></div></aside>)}

      {mainView === "list" && <section className="full-list">
        <div className="full-list-header"><h2>{loadingPlaces ? "Loading…" : `${filtered.length} stop${filtered.length === 1 ? "" : "s"} nearby`}</h2><button className="add-fab" onClick={() => setPanel("add")}><Icon name="plus"/><span>Add</span></button></div>
        <div className="place-list">{loadingPlaces ? <div className="loading-list">Loading live restroom data…</div> : filtered.length ? filtered.map(place => {
          const distance = milesBetween(userCoords ?? mapCenter, place).toFixed(1);
          const freshness = place.reports === 0 ? "Needs first report" : place.reports < 2 ? "Needs fresh report" : "Verified recently";
          return <button key={place.id} onClick={() => selectPlace(place, true)}>
            <span className={`mini-score ${place.color}`}>{place.score ?? "?"}<small>{place.score === null ? "New" : "Worth It"}</small></span>
            <span><strong>{place.name}</strong><small className="place-brand">{place.name.split(" - ")[0]}</small><small className={`place-type ${place.type.toLowerCase().replaceAll(" ", "-")}`}>{place.type} <i>·</i> {distance} mi</small><small className="place-address">{place.address || "Address unavailable"}</small><em className={place.reports === 0 ? "first" : place.reports < 2 ? "fresh" : "verified"}>{freshness}</em></span>
            <Icon name="chevron"/>
          </button>;
        }) : wideZoom ? <div className="empty-state"><div>⌕</div><h3>Choose a local area</h3><p>Search a city, tap Near me, or use Zoom in & search on the map.</p></div> : <div className="empty-state"><div>⌕</div><h3>No matches yet</h3><p>Try another search or add the missing location.</p><button className="submit" onClick={() => setPanel("add")}>Add this place</button></div>}</div>
      </section>}

      <div className="site-links"><span className={`cloud-state ${cloudReady ? "ready" : ""}`}>● {cloudReady ? "Live data" : "Connecting"}</span>{!isStandalone && <button onClick={installApp}>Install</button>}<Link href="/support">Support</Link><Link href="/privacy">Privacy</Link></div>

      {panel === "none" && <nav className="mobile-tabbar" aria-label="Primary">
        <button className="active" onClick={() => setPanel("none")}><Icon name="map"/><span>Nearby</span></button>
        <button onClick={() => setPanel("reports")}><Icon name="flag"/><span>Contributions</span></button>
        <button onClick={() => setPanel("account")}><Icon name="user"/><span>Profile</span></button>
      </nav>}
    </section>

    {panel !== "none" && <div className="scrim" onMouseDown={() => setPanel("none")}><section className={`sheet ${panel}`} onMouseDown={event => event.stopPropagation()}>
      <div className="sheet-handle"/><button className="sheet-close" aria-label="Close" onClick={() => setPanel("none")}><Icon name="close"/></button>

      {panel === "detail" && selected && <>
        <div className="detail-topbar">
          <button className="sheet-back" onClick={() => setPanel("none")}><Icon name="back"/>Map</button>
          <button className="report-link" onClick={openRating}>Report</button>
        </div>
        <div className={`detail-hero-card ${selected.color}`}>
          <div className="detail-hero-top">
            <div>
              <span className="detail-type-label">{selected.type}</span>
              <h2>{selected.name}</h2>
              <p>{selected.address || "Address unavailable"}</p>
              {userCoords && <em>{milesBetween(userCoords, selected).toFixed(1)} mi away</em>}
            </div>
            <CleanScoreRing score={selected.score}/>
          </div>
          {confidenceTier(selected.reports) && <div className="confidence-banner"><Icon name="info"/>{confidenceTier(selected.reports)} Confidence · {selected.reports} rating{selected.reports === 1 ? "" : "s"}</div>}
          <div className="detail-tags"><span className="tag">{selected.type}</span><span className="tag muted">{selected.accessType}</span></div>
          <div className="detail-stats">
            <span><b>{reviews.length}</b><small>Reviews</small></span>
            <span><b>{stationIssueReports.length}</b><small>Reports</small></span>
            <span><b>{reviews[0] ? relativeTime(reviews[0].createdAt) : "—"}</b><small>Last review</small></span>
            <span><b>{confidenceTier(selected.reports) ?? "—"}</b><small>Confidence</small></span>
          </div>
        </div>

        <div className="detail-actions"><button onClick={() => directions(selected)}><Icon name="route"/>Directions</button><button onClick={openRating}><Icon name="star"/>Rate</button><button onClick={() => navigator.share?.({ title: selected.name, text: `Check this restroom on Restroom Report`, url: location.href })}><Icon name="share"/>Share</button></div>

        {restroomSummary && <section className="restroom-summary">
          <h3>Restroom Summary</h3>
          <div className="summary-grid">
            <div className={`summary-tile ${restroomSummary.cleanliness === "Good" ? "good" : "bad"}`}><small>Cleanliness</small><strong>{restroomSummary.cleanliness}</strong></div>
            <div className={`summary-tile ${restroomSummary.odor === "Good" ? "good" : "bad"}`}><small>Odor</small><strong>{restroomSummary.odor}</strong></div>
            <div className={`summary-tile ${restroomSummary.supplies === "Good" ? "good" : "bad"}`}><small>Supplies</small><strong>{restroomSummary.supplies}</strong></div>
            <div className="summary-tile neutral"><small>Last Report</small><strong>{restroomSummary.lastReport}</strong></div>
          </div>
        </section>}

        <div className="save-avoid-actions">
          <button className={isFavorited ? "active" : ""} onClick={toggleFavorite} disabled={!user}><Icon name="bookmark"/>{isFavorited ? "Saved" : "Save Stop"}</button>
          <button className={isAvoided ? "active" : ""} onClick={toggleAvoid} disabled={!user}><Icon name="flag"/>{isAvoided ? "Avoided" : "Avoid"}</button>
        </div>

        <section className="reviews"><div className="section-title"><h3>Latest Reports</h3><button onClick={openRating}>Add yours</button></div>{reviews.length ? reviews.slice(0, 8).map(review => <article key={review.id}><div><span className="review-score">{review.cleanlinessRating}.0</span><strong>{"★".repeat(review.cleanlinessRating)}{"☆".repeat(5 - review.cleanlinessRating)}</strong><time>{review.createdAt?.toLocaleDateString() ?? "Recently"}</time></div>{review.comment && <p>“{review.comment}”</p>}<small>{[review.soapAvailable && "Soap", review.toiletPaperAvailable && "Paper", review.feltSafe && "Felt safe"].filter(Boolean).join(" • ") || "Quick community report"}</small></article>) : <div className="no-reviews"><span>★</span><h4>Be the first to describe it</h4><p>A quick report helps the next traveler.</p></div>}</section>
      </>}

      {panel === "toofar" && selected && <div className="toofar-block">
        <span className="toofar-icon"><Icon name="locate"/></span>
        <p className="eyebrow">Too far to rate</p>
        <h2>Head to {selected.name} first</h2>
        <p className="muted">You need to be near this location to rate its restroom. This keeps ratings trustworthy for the next traveler.</p>
        <button className="submit" onClick={() => directions(selected)}><Icon name="route"/>Get Directions</button>
        <button className="text-button" onClick={() => setPanel("none")}>OK</button>
      </div>}

      {panel === "rate" && selected && !submitted && <><p className="eyebrow">30-second report</p><h2>How was {selected.name}?</h2><p className="muted">Answer what you can. Your report helps everyone traveling after you.</p>
        <div className="rating-block"><label>Cleanliness <b>{rating ? `${rating}/5` : "Required"}</b></label><div className="stars">{[1,2,3,4,5].map(value => <button key={value} className={rating >= value ? "on" : ""} onClick={() => setRating(value)} aria-label={`${value} stars`}><Icon name="star"/></button>)}</div></div>
        <div className="rating-block"><label>Odor <b>{odor ? `${odor}/5` : "Required"}</b></label><div className="odor-scale">{[1,2,3,4,5].map(value => <button key={value} className={odor === value ? "on" : ""} onClick={() => setOdor(value)}><span>{["😖","🙁","😐","🙂","✨"][value-1]}</span><small>{value}</small></button>)}</div></div>
        <label className="field-label">Quick checks <b>Yes or no</b></label><div className="answer-grid">{CHECKS.map(item => <div key={item.key}><span>{item.label}</span><button className={answers[item.key] === true ? "yes active" : "yes"} onClick={() => setAnswers(current => ({ ...current, [item.key]: true }))}>Yes</button><button className={answers[item.key] === false ? "no active" : "no"} onClick={() => setAnswers(current => ({ ...current, [item.key]: false }))}>No</button></div>)}</div>
        <label className="form-label">Crowd level<select value={crowd} onChange={event => setCrowd(event.target.value)}><option value="quiet">Quiet</option><option value="moderate">Moderate</option><option value="busy">Busy</option></select></label>
        <label className="form-label">Optional comment<textarea value={comment} onChange={event => setComment(event.target.value)} maxLength={700} placeholder="Anything the next traveler should know?"/></label>
        <button disabled={!ratingComplete || busy} className="submit" onClick={saveReview}>{busy ? "Submitting…" : ratingComplete ? "Submit report" : "Complete required answers"}</button>
      </>}
      {panel === "rate" && submitted && <div className="thanks"><div className="thanks-rings"><span><Icon name="check"/></span></div><p className="eyebrow">Rating submitted</p><h2>You helped the next traveler.</h2><p>Your fresh report makes Restroom Report more useful and trustworthy.</p><button className="submit" onClick={() => setPanel("none")}>Back to the map</button><button className="text-button" onClick={() => setPanel("detail")}>View this restroom</button></div>}

      {panel === "add" && <>
        <div className="add-topbar"><button className="cancel-link" onClick={() => setPanel("none")}>Cancel</button><h2>Add Restroom Location</h2></div>
        <div className="add-intro"><span className="add-intro-icon"><Icon name="plus"/></span><div><strong>Add a missing stop</strong><p>Confirm the station details, then add it so travelers can rate the restroom.</p></div></div>

        <section className="add-card">
          <h3><Icon name="locate"/>Location Details</h3>
          <label className="form-label">Station name<input value={addForm.name} onChange={event => setAddForm(current => ({ ...current, name: event.target.value }))} placeholder="e.g. QuikTrip"/></label>
          <label className="form-label">Brand<input value={addForm.brand} onChange={event => setAddForm(current => ({ ...current, brand: event.target.value }))} placeholder="e.g. Shell, Circle K"/></label>
          <label className="form-label">Full address<input value={addForm.address} onChange={event => setAddForm(current => ({ ...current, address: event.target.value }))} placeholder="Street, city, state"/></label>

          <span className="field-label">Location Type</span>
          <div className="location-type-grid">
            {[
              { type: "Gas station", icon: "gas" },
              { type: "Truck stop", icon: "truck" },
              { type: "Rest area", icon: "sign" },
              { type: "Fast food", icon: "bag" },
            ].map(option => <button key={option.type} className={`location-type-tile ${addForm.type === option.type ? "selected" : ""}`} onClick={() => setAddForm(current => ({ ...current, type: option.type }))}>
              <Icon name={option.icon}/><span>{TYPE_LABELS[option.type]}</span>
            </button>)}
          </div>

          <div className="form-row"><label className="form-label">Access<select value={addForm.accessType} onChange={event => setAddForm(current => ({ ...current, accessType: event.target.value }))}><option value="unknown">Not sure</option><option value="public">Public</option><option value="customersOnly">Customers only</option><option value="keyRequired">Key required</option></select></label><label className="form-label">Layout<select value={addForm.layoutType} onChange={event => setAddForm(current => ({ ...current, layoutType: event.target.value }))}><option value="unknown">Not sure</option><option value="singleStall">Single stall</option><option value="multiStall">Multiple stalls</option><option value="family">Family restroom</option></select></label></div>
        </section>

        <div className="privacy-note"><Icon name="info"/><span>No restroom photos are collected. Address and basic access details only.</span></div>
        <button className="submit" disabled={busy} onClick={saveStation}><Icon name="plus"/>{busy ? "Finding address…" : "Add to Restroom Report"}</button>
      </>}

      {panel === "reports" && <div className="contributions-page">
        <p className="eyebrow">Your impact</p><h2>Your Contributions</h2>
        <section className="milestone-card">
          <span className="milestone-icon"><Icon name="star"/></span><div><small>Restrooms Rated</small><strong>{contributionCount}</strong></div>
          <label><span>Next milestone: {nextMilestone}</span><b>{contributionCount}/{nextMilestone}</b></label>
          <div className="milestone-track"><i style={{ width: `${milestoneProgress}%` }}/></div>
          <div className="milestone-pills">{milestoneOptions.map(value => <span key={value} className={contributionCount >= value ? "done" : value === nextMilestone ? "next" : ""}>{contributionCount >= value ? "✓ " : ""}{value}</span>)}</div>
          <p>{Math.max(0, nextMilestone - contributionCount)} more rating{nextMilestone - contributionCount === 1 ? "" : "s"} to hit {nextMilestone}. Keep ’em coming!</p>
        </section>
        <section className="contribution-review-card"><h3><Icon name="message"/>Reviews</h3>
          {accountLoading ? <div className="loading-list">Syncing your contribution history…</div> : myReviews.length ? <div className="review-history">{myReviews.map(review => <article key={review.id}><span className={`review-toilet ${review.cleanlinessRating >= 4 ? "great" : review.cleanlinessRating >= 3 ? "fair" : "poor"}`}><Icon name="toilet"/></span><div><strong>{"★".repeat(review.cleanlinessRating)}{"☆".repeat(5 - review.cleanlinessRating)}</strong><p><b>{(review.cleanlinessRating * 2).toFixed(1)}</b> CleanScore</p>{review.comment && <small>{review.comment}</small>}</div><time>{relativeTime(review.createdAt)}</time></article>)}</div> : <div className="empty-state compact"><div>★</div><h3>Your first report matters</h3><p>Rate a restroom to start your contribution history.</p></div>}
        </section>
        {myIssueReports.length > 0 && <section className="contribution-review-card"><h3><Icon name="flag"/>Reports</h3><div className="report-list">{myIssueReports.map(report => <button key={report.id}><span className="issue">!</span><div><strong>{report.issueType}</strong><small>{report.comment || "Issue report"}</small></div><b>{report.status || "Submitted"}</b></button>)}</div></section>}
      </div>}

      {panel === "account" && <div className="profile-page">
        <div className="profile-heading"><div><p className="eyebrow">Account</p><h2>Profile</h2></div><button aria-label="Settings"><Icon name="settings"/></button></div>
        <section className="profile-hero">
          <div className="profile-identity"><span className="profile-avatar">{user?.isAnonymous ? "G" : profileName.split(" ").map(part => part[0]).join("").slice(0,2).toUpperCase()}</span><div><strong>{profileName}</strong><small>{contributionCount} ratings · {user?.isAnonymous ? "Guest traveler" : "Member"}</small></div></div>
          <div className="profile-stats"><button onClick={() => setPanel("reports")}><span>★</span><b>{contributionCount}</b><small>Ratings</small></button><button><span>▮</span><b>{userProfile?.favoriteStationIds.length ?? 0}</b><small>Saved</small></button><button onClick={() => setPanel("reports")}><span>▰</span><b>{myReviews.length}</b><small>Reviews</small></button></div>
        </section>
        {!user?.isAnonymous && <><h3 className="profile-section-title">Trusted Travelers</h3><section className="trusted-card"><div className="trusted-heading"><span>✓</span><div><strong>Verified Contributor</strong><small>Proximity-verified reports across multiple stops.</small></div><b>ⓘ</b></div><label><span>Progress to Trusted Traveler</span><b>{Math.min(100, Math.round((Math.max(userProfile?.corroboratedContributionCount ?? 0, contributionCount) / 25) * 100))}%</b></label><div className="trusted-track"><i style={{ width: `${Math.min(100, (Math.max(userProfile?.corroboratedContributionCount ?? 0, contributionCount) / 25) * 100)}%` }}/></div><div className="trusted-stats"><span><b>{userProfile?.corroboratedContributionCount ?? 0}</b><small>Verified</small></span><span><b>{contributionCount}</b><small>Locations</small></span><span><b>{userProfile?.reputation ?? 0}</b><small>Supported</small></span></div></section></>}
        {accountLoading && <div className="account-sync loading">Syncing your iPhone account data…</div>}{accountSyncError && <div className="account-sync error"><strong>Account sync needs attention</strong><span>{accountSyncError}</span></div>}
        {user?.isAnonymous ? <div className="auth-actions"><button onClick={() => authenticate("google")} disabled={busy}><b>G</b>Continue with Google</button><button onClick={() => authenticate("apple")} disabled={busy}><b>●</b>Continue with Apple</button></div> : null}
        <h3 className="profile-section-title">Activity</h3><div className="account-links activity-links"><button onClick={() => setPanel("reports")}><span>★</span><strong>Contributions</strong><small>{myContributions.length}</small><Icon name="chevron"/></button><button onClick={installApp}><span>＋</span><strong>Install web app</strong><Icon name="chevron"/></button><Link href="/support"><span>?</span><strong>Help & support</strong><Icon name="chevron"/></Link><Link href="/privacy"><span>◉</span><strong>Privacy policy</strong><Icon name="chevron"/></Link></div>
        {!user?.isAnonymous && <button className="signout" onClick={async () => { await signOutUser(); setPanel("none"); notify("Signed out"); }}>Sign out</button>}
        <div className={`connection-card ${cloudReady && !accountSyncError ? "online" : ""}`}>● {cloudReady && !accountSyncError ? "Connected to live Restroom Report account data" : "Connecting to Firebase"}</div>
      </div>}

      {panel === "getapp" && <><p className="eyebrow">Get Restroom Report</p><h2>{isIOS ? "iPhone app or home screen?" : "Add Restroom Report"}</h2><div className="install-art"><span className="brandmark"><Image src="/app-icon-192.png" alt="Restroom Report app icon" width={78} height={78}/></span></div><p className="muted">{isIOS ? "Get the native Restroom Report app from the App Store, or add this website to your Home Screen for the same full-screen experience without an install." : "Add Restroom Report to your home screen for a full-screen, app-like experience—no app store required."}</p>{isIOS ? <><button className="submit" onClick={() => window.open(APP_STORE_URL, "_blank", "noopener,noreferrer")}>Get the iOS app</button><button className="text-button" onClick={() => setPanel("install")}>Add to Home Screen instead</button></> : <button className="submit" onClick={installApp}>Add to Home Screen</button>}</>}

      {panel === "install" && <><p className="eyebrow">One-tap access</p><h2>Install Restroom Report</h2><div className="install-art"><span className="brandmark"><Image src="/app-icon-192.png" alt="Restroom Report app icon" width={78} height={78}/></span></div><p className="muted">Add Restroom Report to your home screen. It opens full-screen and feels like an app—no app store required.</p><ol className="install-steps"><li><span>1</span>Tap your browser’s <strong>Share</strong> button.</li><li><span>2</span>Choose <strong>Add to Home Screen</strong> or <strong>Install app</strong>.</li><li><span>3</span>Tap <strong>Add</strong> or <strong>Install</strong>.</li></ol><button className="submit" onClick={() => setPanel("none")}>Got it</button></>}
      {(panel === "reports" || panel === "account") && <nav className="mobile-tabbar panel-tabbar" aria-label="Primary">
        <button onClick={() => setPanel("none")}><Icon name="map"/><span>Nearby</span></button>
        <button className={panel === "reports" ? "active" : ""} onClick={() => setPanel("reports")}><Icon name="message"/><span>Contributions</span></button>
        <button className={panel === "account" ? "active" : ""} onClick={() => setPanel("account")}><Icon name="user"/><span>Profile</span></button>
      </nav>}
    </section></div>}
    {toast && <div className="toast" role="status"><Icon name="check"/>{toast}</div>}
    {cookieConsent === "unset" && <div className="cookie-banner" role="dialog" aria-label="Cookie notice">
      <p>We use Google Analytics (via Firebase) to understand how Restroom Report is used. Analytics cookies are only set if you accept. See our <Link href="/privacy">privacy policy</Link>.</p>
      <div className="cookie-banner-actions">
        <button onClick={() => setCookieConsent("declined")}>Decline</button>
        <button className="submit" onClick={() => setCookieConsent("accepted")}>Accept</button>
      </div>
    </div>}
  </main>;
}
