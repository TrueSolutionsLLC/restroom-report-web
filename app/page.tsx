"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { setFirebaseAnalyticsConsent } from "./lib/firebase";
import AppDialog from "./components/AppDialog";
import WelcomeGuide from "./components/WelcomeGuide";
import { hasCompletedWelcomeGuide, completeWelcomeGuide } from "./lib/onboarding";
import { ISSUE_REPORT_OPTIONS, type IssueReportType } from "./lib/issueReportContract";
import { geocodeAppleMaps, isAppleMapsConfigured, searchAppleMaps, searchAppleMapsPois, type AppleMapsPoiResult } from "./lib/mapkit";
import {
  addStation, completeRedirectSignIn, ensureAnonymousUser, preloadAppleSignIn, setStationAvoided, setStationFavorited, signInWithApple,
  signInWithGoogle, signOutUser, submitReview, submitIssueReport, subscribeToReviews, subscribeToStationIssueReports, subscribeToStationsInBounds,
  subscribeToUserIssueReports, subscribeToUserProfile, subscribeToUserReviews, subscribeToUserReviewCount, subscribeToUserReputation,
  type GeoBounds, type LivePlace, type StationReview, type StationIssueSignal, type UserIssueReport, type UserProfile, type UserReview, type TravelerReputationSummary,
} from "./lib/firestore";
import { CROWD_OPTIONS, RESTROOM_ACCESS_OPTIONS, RESTROOM_LAYOUT_OPTIONS, calculateCleanScore, cleanScoreBadge, evaluateReviewProximity, type CrowdLevel, type ReviewProximityVerification } from "./lib/reviewContract";
import { TRAVELER_LEVEL_LABELS } from "./lib/reputation";
import { isWideViewport } from "./components/mapTypes";

const RestroomMap = dynamic(() => import("./components/RestroomMap"), { ssr: false });
type Coordinates = { latitude: number; longitude: number };
type MapViewport = { center: Coordinates; bounds: GeoBounds; zoom: number };
type Panel = "none" | "detail" | "rate" | "toofar" | "add" | "reports" | "account" | "install" | "getapp" | "saved" | "settings" | "issue";
type DeferredInstall = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type AppPromotionPlatform = "ios" | "android" | "other";
type AccountData = {
  userId: string; profile: UserProfile | null; reviews: UserReview[]; issueReports: UserIssueReport[];
  reviewCount: number | null; reputation: TravelerReputationSummary | null;
  profileReady: boolean; reviewsReady: boolean; reportsReady: boolean; countReady: boolean; reputationReady: boolean;
  errors: Partial<Record<"profile" | "reviews" | "reports" | "count" | "reputation", string>>;
};

const PANEL_LABELS: Record<Panel, string> = { none: "Nearby", detail: "Restroom details", rate: "Rate this restroom", toofar: "Location check", add: "Add a restroom", reports: "Your contributions", account: "Profile", install: "Install Restroom Report", getapp: "Get Restroom Report", saved: "Saved stops", settings: "Settings", issue: "Report an issue" };

const APP_STORE_URL = "https://apps.apple.com/us/app/restroom-report/id6785755048";
const APP_PROMOTION_DISMISSED_KEY = "rr-app-promotion-dismissed-at";
const APP_PROMOTION_INSTALLED_KEY = "rr-web-app-installed";
const APP_PROMOTION_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;
const isAppleMobileDevice = () => typeof navigator !== "undefined" && (
  /iPhone|iPad|iPod/i.test(navigator.userAgent)
  || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
);
const TYPES = ["All", "Gas station", "Truck stop", "Rest area", "Fast food"];
const TYPE_LABELS: Record<string, string> = { "All": "All", "Gas station": "Gas", "Truck stop": "Truck Stops", "Rest area": "Rest Areas", "Fast food": "Fast Food" };
const CHECKS = [
  { key: "paper", label: "Toilet paper" }, { key: "soap", label: "Soap" }, { key: "sink", label: "Working sink" },
  { key: "safe", label: "Felt safe" }, { key: "accessible", label: "Accessible" }, { key: "changingTable", label: "Changing table" },
];
const EMPTY_REVIEWS: StationReview[] = [];
const EMPTY_REPORTS: StationIssueSignal[] = [];

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

function CleanScoreSignal({ score }: { score: number | null }) {
  return <div className={`score-signal ${cleanScoreBadge(score).tone}`}>
    <strong>{score?.toFixed(1) ?? "—"}</strong><span>{score === null ? "Unrated" : "CleanScore / 10"}</span>
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

const milesBetween = (a: Coordinates, b: Coordinates) => {
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(b.latitude - a.latitude), dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const authErrorMessage = (error: unknown) => {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  const messages: Record<string, string> = {
    "auth/unauthorized-domain": "Sign-in is unavailable on this address. Open Restroom Report’s website or contact support.",
    "auth/operation-not-allowed": "This sign-in option is unavailable. Try another option or contact support.",
    "auth/popup-blocked": "Your browser blocked the sign-in window. Allow pop-ups and try again.",
    "auth/popup-closed-by-user": "Sign-in was cancelled.",
    "auth/cancelled-popup-request": "Another sign-in window is already open.",
    "auth/account-exists-with-different-credential": "An account already exists with the same email using another sign-in method.",
    "auth/network-request-failed": "The sign-in request lost its internet connection. Please try again.",
    "auth/too-many-requests": "Sign-in is temporarily limited. Wait a moment, then try again.",
    "auth/apple-invalid-state": "Apple sign-in returned an invalid security state. Please try again.",
    "auth/apple-missing-id-token": "Apple did not return the identity needed to sign in. Please try again.",
    "auth/missing-or-invalid-nonce": "Apple sign-in could not pass its security check. Refresh the page and try again.",
    "auth/invalid-credential": "Apple returned a credential that Firebase could not verify. Please try again.",
    "auth/session-changed": "Your account changed while signing in. Start again with your current session.",
  };
  return messages[code] ?? `Sign-in could not be completed${code ? ` (${code.replace("auth/", "")})` : ""}.`;
};

const emptyAccountData = (userId = ""): AccountData => ({
  userId, profile: null, reviews: [], issueReports: [], reviewCount: null, reputation: null,
  profileReady: false, reviewsReady: false, reportsReady: false, countReady: false, reputationReady: false, errors: {},
});

const freshPosition = () => new Promise<GeolocationPosition>((resolve, reject) => {
  if (!navigator.geolocation) { reject(new Error("Location is not available in this browser.")); return; }
  navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
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
  const [allPlaces, setAllPlaces] = useState<LivePlace[]>([]);
  const [allPlacesReady, setAllPlacesReady] = useState(false);
  const [allPlacesError, setAllPlacesError] = useState(false);
  const [stationRefresh, setStationRefresh] = useState(0);
  const [savedTab, setSavedTab] = useState<"favorites" | "avoided">("favorites");
  const [appearance, setAppearance] = useState<"system" | "light" | "dark">("system");
  const [welcomeReady, setWelcomeReady] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [issueType, setIssueType] = useState<IssueReportType>("incorrectStationInfo");
  const [issueComment, setIssueComment] = useState("");
  const [issueError, setIssueError] = useState("");
  const [issueSubmitted, setIssueSubmitted] = useState(false);
  const [sharedStop, setSharedStop] = useState<{ id: string; url: string } | null>(null);
  const [issueBusy, setIssueBusy] = useState(false);
  const issueRequest = useRef(0);
  const deepLinkApplied = useRef(false);
  const deepLinkNoticeShown = useRef(false);
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
  const locationRequest = useRef(0);
  const locationRequestPending = useRef(false);
  const [locationState, setLocationState] = useState<"idle" | "finding" | "found" | "blocked">("idle");
  const [cloudReady, setCloudReady] = useState(false);
  const [loadingPlaces, setLoadingPlaces] = useState(true);
  const [toast, setToast] = useState("");
  const [stationData, setStationData] = useState<{ id: string; reviews: StationReview[]; reports: StationIssueSignal[]; reviewsReady: boolean; reportsReady: boolean; reviewsError: boolean; reportsError: boolean }>({ id: "", reviews: [], reports: [], reviewsReady: false, reportsReady: false, reviewsError: false, reportsError: false });
  const [accountData, setAccountData] = useState<AccountData>(() => emptyAccountData());
  const [accountRefresh, setAccountRefresh] = useState(0);
  const [authRefresh, setAuthRefresh] = useState(0);
  const [accountAuthError, setAccountAuthError] = useState("");
  const [existingAccountProvider, setExistingAccountProvider] = useState<"google" | "apple" | null>(null);
  const [proximityMessage, setProximityMessage] = useState("");
  const [reviewError, setReviewError] = useState("");
  const ratingRequestSequence = useRef(0);
  const ratingOperation = useRef<{ request: number; stationId: string } | null>(null);
  const lastAuthUserId = useRef("");
  const [pendingRatingRequest, setPendingRatingRequest] = useState<number | null>(null);
  const reviewBusy = pendingRatingRequest !== null;
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

  const [rating, setRating] = useState(0), [odor, setOdor] = useState(0), [crowd, setCrowd] = useState<CrowdLevel>("light"), [comment, setComment] = useState("");
  const [answers, setAnswers] = useState<Record<string, boolean | null>>(() => Object.fromEntries(CHECKS.map(item => [item.key, null])));
  const [submitted, setSubmitted] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", brand: "", address: "", type: "Gas station", accessType: "unknown", layoutType: "unknown" });

  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 3000); };
  const navigatePanel = (nextPanel: Panel) => { deepLinkApplied.current = true; issueRequest.current += 1; setIssueBusy(false); ratingRequestSequence.current += 1; ratingOperation.current = null; setPendingRatingRequest(null); setPanel(nextPanel); };
  const dismissPanel = () => navigatePanel("none");
  const applyUser = useCallback((current: User | null) => {
    if (lastAuthUserId.current !== (current?.uid ?? "")) {
      lastAuthUserId.current = current?.uid ?? "";
      issueRequest.current += 1; setIssueBusy(false); setIssueComment(""); setIssueError(""); setIssueSubmitted(false);
      ratingRequestSequence.current += 1;
      ratingOperation.current = null;
      setPendingRatingRequest(null);
      setRating(0); setOdor(0); setComment(""); setSubmitted(false); setReviewError("");
      setCrowd("light"); setAnswers(Object.fromEntries(CHECKS.map(item => [item.key, null])));
      setExistingAccountProvider(null);
      setPanel(currentPanel => currentPanel === "rate" || currentPanel === "toofar" || currentPanel === "issue" ? "account" : currentPanel);
    }
    if (current) setAccountAuthError("");
    setUser(current);
  }, []);
  const setCookieConsent = (value: "accepted" | "declined") => {
    try { window.localStorage.setItem("rr-cookie-consent", value); } catch {}
    setCookieConsentState(value);
  };

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setWelcomeOpen(!hasCompletedWelcomeGuide());
      setWelcomeReady(true);
      try {
        const stored = window.localStorage.getItem("rr-appearance");
        if (stored === "light" || stored === "dark") setAppearance(stored);
        const storedMapStyle = window.localStorage.getItem("rr-map-style");
        if (storedMapStyle === "standard" || storedMapStyle === "satellite") setMapStyle(storedMapStyle);
      } catch {}
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (appearance === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = appearance;
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach(meta => {
      const dark = appearance === "dark" || (appearance === "system" && meta.media.includes("dark"));
      meta.content = dark ? "#12232b" : "#f7f9f4";
    });
  }, [appearance]);

  useEffect(() => {
    let active = true;
    const stop = subscribeToStationsInBounds({ south: -90, north: 90, west: -180, east: 180 }, items => {
      if (!active) return;
      setAllPlaces(items); setAllPlacesReady(true); setAllPlacesError(false);
      setSelected(current => current?.source === "firestore" ? items.find(item => item.id === current.id) ?? current : current);
      if (!deepLinkApplied.current) {
        const stationId = new URLSearchParams(window.location.search).get("station");
        if (stationId) {
          const place = items.find(item => item.id === stationId);
          if (place) {
            deepLinkApplied.current = true;
            setToast(current => current === "The shared stop hasn’t loaded yet. You can browse the map while it reconnects." ? "" : current);
            setSelected(place); setFocus({ latitude: place.latitude, longitude: place.longitude }); setPanel("detail");
          } else if (items.length > 0 && !deepLinkNoticeShown.current) {
            deepLinkNoticeShown.current = true;
            setToast("The shared stop hasn’t loaded yet. You can browse the map while it reconnects.");
          }
        } else deepLinkApplied.current = true;
      }
    }, () => { if (active) { setAllPlacesReady(true); setAllPlacesError(true); } });
    return () => { active = false; stop(); };
  }, [stationRefresh]);


  const cancelLocationLookup = () => { locationRequestPending.current = false; locationRequest.current += 1; setLocationState(current => current === "finding" ? "idle" : current); };
  const finishWelcome = () => { cancelLocationLookup(); completeWelcomeGuide(); setWelcomeOpen(false); };
  const replayWelcome = () => { dismissPanel(); setWelcomeOpen(true); };
  const chooseAppearance = (value: "system" | "light" | "dark") => {
    setAppearance(value);
    try { window.localStorage.setItem("rr-appearance", value); } catch {}
  };

  const chooseMapStyle = (value: "standard" | "satellite") => {
    setMapStyle(value);
    try { window.localStorage.setItem("rr-map-style", value); } catch {}
  };

  // Optional analytics follow the visitor's current consent choice.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("cookies") === "manage") return;
    try {
      const stored = window.localStorage.getItem("rr-cookie-consent");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate a client-only preference after the SSR-matching initial render.
      if (stored === "accepted" || stored === "declined") setCookieConsentState(stored);
    } catch {}
  }, []);

  useEffect(() => {
    void setFirebaseAnalyticsConsent(cookieConsent === "accepted").catch(() => {});
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
    let identityReceived = false;
    const initializationTimeout = window.setTimeout(() => {
      if (!cancelled && !identityReceived) setAccountAuthError("Your account connection is taking too long. Try connecting again.");
    }, 15000);
    stopAuth = ensureAnonymousUser(current => {
      if (cancelled) return;
      if (current) { identityReceived = true; window.clearTimeout(initializationTimeout); }
      applyUser(current); setCloudReady(Boolean(current));
    }, error => {
      if (cancelled) return;
      window.clearTimeout(initializationTimeout);
      setAccountAuthError(authErrorMessage(error));
      setCloudReady(false);
    });
    const startAuth = async () => {
      try {
        const result = await completeRedirectSignIn();
        if (cancelled) return;
        if (result?.user) {
          applyUser(result.user);
          setCloudReady(true);
          notify(`Signed in as ${result.user.displayName ?? result.user.email ?? "traveler"}`);
          setPanel("account");
        }
      } catch (error) {
        if (!cancelled) { setAccountAuthError(authErrorMessage(error)); notify(authErrorMessage(error)); }
      }
    };
    startAuth();
    return () => {
      cancelled = true;
      window.clearTimeout(initializationTimeout);
      window.removeEventListener("beforeinstallprompt", installHandler);
      window.removeEventListener("appinstalled", installedHandler);
      stopAuth();
    };
  }, [applyUser, authRefresh]);

  useEffect(() => {
    if (cookieConsent === "unset" || isStandalone || !welcomeReady || welcomeOpen) return;
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
  }, [cookieConsent, isStandalone, welcomeReady, welcomeOpen]);

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
        // A newly registered Maps candidate can arrive through the live map
        // before its review batch finishes. Keep that report's target stable.
        if (ratingOperation.current?.stationId === current.id) return current;
        return items.find(item => item.id === current.id)
          ?? items.find(item => milesBetween(item, current) < 0.12 && normalizedPlaceText(item.name) === normalizedPlaceText(current.name))
          ?? current;
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
    if (locationRequestPending.current && latestViewport.current && viewportKey(viewport) !== viewportKey(latestViewport.current)) {
      locationRequestPending.current = false; locationRequest.current += 1; setLocationState("idle");
    }
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

  const selectedStationId = selected?.id ?? "";
  useEffect(() => {
    if (!selectedStationId) return;
    let active = true;
    const update = (patch: Partial<typeof stationData>) => setStationData(previous => {
      if (!active) return previous;
      const base = previous.id === selectedStationId ? previous : { id: selectedStationId, reviews: [], reports: [], reviewsReady: false, reportsReady: false, reviewsError: false, reportsError: false };
      return { ...base, ...patch };
    });
    const stopReviews = subscribeToReviews(selectedStationId,
      reviews => update({ reviews, reviewsReady: true, reviewsError: false }),
      () => update({ reviewsReady: true, reviewsError: true }));
    const stopReports = subscribeToStationIssueReports(selectedStationId,
      reports => update({ reports, reportsReady: true, reportsError: false }),
      () => update({ reportsReady: true, reportsError: true }));
    return () => { active = false; stopReviews(); stopReports(); };
  }, [selectedStationId]);
  const activeStation = stationData.id === selectedStationId ? stationData : null;
  const reviews = activeStation?.reviews ?? EMPTY_REVIEWS;
  const stationIssueReports = activeStation?.reports ?? EMPTY_REPORTS;

  useEffect(() => {
    if (!mapStyleMenuOpen) return;
    const closeIfOutside = (event: MouseEvent) => {
      if (!mapStyleControlRef.current?.contains(event.target as Node)) setMapStyleMenuOpen(false);
    };
    document.addEventListener("mousedown", closeIfOutside);
    return () => document.removeEventListener("mousedown", closeIfOutside);
  }, [mapStyleMenuOpen]);

  const currentUserId = user?.uid ?? "";
  useEffect(() => () => { ratingRequestSequence.current += 1; issueRequest.current += 1; }, [selected?.id, currentUserId]);
  useEffect(() => () => { locationRequest.current += 1; }, []);
  useEffect(() => {
    if (!currentUserId) return;
    let active = true;
    const updateAccount = (patch: Partial<AccountData>, stream: keyof AccountData["errors"], error = "") => setAccountData(current => {
      if (!active) return current;
      const previous = current.userId === currentUserId ? current : emptyAccountData(currentUserId);
      const errors = { ...previous.errors };
      if (error) errors[stream] = error; else delete errors[stream];
      return { ...previous, ...patch, errors, userId: currentUserId };
    });
    const stopProfile = subscribeToUserProfile(currentUserId,
      profile => updateAccount({ profile, profileReady: true }, "profile"),
      () => updateAccount({ profileReady: true }, "profile", "Profile details could not be loaded."));
    const stopReviews = subscribeToUserReviews(currentUserId,
      reviews => updateAccount({ reviews, reviewsReady: true }, "reviews"),
      () => updateAccount({ reviewsReady: true }, "reviews", "Rating history could not be loaded."));
    const stopReports = subscribeToUserIssueReports(currentUserId,
      issueReports => updateAccount({ issueReports, reportsReady: true }, "reports"),
      () => updateAccount({ reportsReady: true }, "reports", "Issue report history could not be loaded."));
    const stopCount = subscribeToUserReviewCount(currentUserId,
      reviewCount => updateAccount({ reviewCount, countReady: true }, "count"),
      () => updateAccount({ reviewCount: null, countReady: true }, "count", "Your rating total is unavailable. Try again when connected."));
    const stopReputation = subscribeToUserReputation(currentUserId,
      reputation => updateAccount({ reputation, reputationReady: true }, "reputation"),
      () => updateAccount({ reputation: null, reputationReady: true }, "reputation", "Contributor status could not be loaded."));
    return () => { active = false; stopProfile(); stopReviews(); stopReports(); stopCount(); stopReputation(); };
  }, [currentUserId, accountRefresh]);

  const activeAccount = accountData.userId === currentUserId ? accountData : emptyAccountData(currentUserId);
  const userProfile = activeAccount.profile;
  const myReviews = activeAccount.reviews;
  const myIssueReports = activeAccount.issueReports;
  const accountLoading = !currentUserId || !(activeAccount.profileReady && activeAccount.reviewsReady && activeAccount.reportsReady && activeAccount.countReady && activeAccount.reputationReady);
  const accountSyncError = [accountAuthError, ...Object.values(activeAccount.errors)].filter(Boolean).join(" ");
  const retryAccount = () => { setAccountData(emptyAccountData(currentUserId)); setAccountRefresh(value => value + 1); if (!user || accountAuthError) { setAccountAuthError(""); setAuthRefresh(value => value + 1); } };

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const result = places.filter(place => (filter === "All" || place.type === filter) && (!needle || `${place.name} ${place.address} ${place.city} ${place.state} ${place.type}`.toLowerCase().includes(needle)));
    const origin = mapCenter;
    return [...result].sort((a, b) => milesBetween(origin, a) - milesBetween(origin, b));
  }, [places, filter, query, mapCenter]);

  const profileName = userProfile?.displayName || user?.displayName || (!user ? "Connecting account" : user.isAnonymous ? "Guest explorer" : "Traveler");
  const contributionCount = activeAccount.reviewCount;
  const ratingsLabel = contributionCount === null ? (activeAccount.errors.count || (!user && accountAuthError) ? "Unavailable" : "…") : String(contributionCount);
  const accountUnavailable = !user && Boolean(accountAuthError);
  const savedLabel = activeAccount.errors.profile || accountUnavailable ? "Unavailable" : !activeAccount.profileReady ? "…" : String(userProfile?.favoriteStationIds.length ?? 0);
  const reputation = activeAccount.reputation;
  const milestoneOptions = [5, 10, 25, 50, 100, 250];
  const nextMilestone = milestoneOptions.find(value => value > (contributionCount ?? 0)) ?? 250;
  const previousMilestone = [...milestoneOptions].reverse().find(value => value <= (contributionCount ?? 0)) ?? 0;
  const milestoneProgress = contributionCount === null ? null : contributionCount >= 250 ? 100 : Math.min(100, Math.max(0, ((contributionCount - previousMilestone) / Math.max(1, nextMilestone - previousMilestone)) * 100));

  const selectPlace = (place: LivePlace, showDetail = false) => { cancelLocationLookup(); deepLinkApplied.current = true; ratingRequestSequence.current += 1; ratingOperation.current = null; setPendingRatingRequest(null); setSelected(place); setFocus({ latitude: place.latitude, longitude: place.longitude }); if (showDetail) setPanel("detail"); };
  const findMe = (): Promise<boolean> => new Promise(resolve => {
    const request = ++locationRequest.current;
    locationRequestPending.current = true;
    if (!navigator.geolocation) { locationRequestPending.current = false; notify("Location is not available in this browser"); resolve(false); return; }
    setLocationState("finding");
    navigator.geolocation.getCurrentPosition(position => {
      if (request !== locationRequest.current) { resolve(false); return; }
      locationRequestPending.current = false;
      const coords = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      setUserCoords(coords); setFocus(coords); setLocationState("found"); resolve(true);
    }, () => { if (request === locationRequest.current) { locationRequestPending.current = false; setLocationState("blocked"); } resolve(false); }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  });

  const searchLocation = async () => {
    if (!query.trim()) return;
    cancelLocationLookup();
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
  const openHistoryStop = (stationId: string) => {
    const place = allPlaces.find(item => item.id === stationId);
    if (place) selectPlace(place, true);
    else notify("This stop is no longer available.");
  };
  const shareStop = async () => {
    if (!selected || selected.source !== "firestore") return;
    const url = new URL(window.location.href);
    url.search = ""; url.hash = ""; url.searchParams.set("station", selected.id);
    setSharedStop({ id: selected.id, url: url.toString() });
    try {
      if (navigator.share) await navigator.share({ title: selected.name, text: "Find this stop on Restroom Report.", url: url.toString() });
      else if (navigator.clipboard) { await navigator.clipboard.writeText(url.toString()); notify("Link copied. It opens this stop."); }
      else notify("Copy the link below to share this stop.");
    } catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) notify("Copy the link below to share this stop."); }
  };
  const openIssue = () => {
    if (!selected || selected.source !== "firestore") return;
    setIssueType("incorrectStationInfo"); setIssueComment(""); setIssueError(""); setIssueSubmitted(false); navigatePanel("issue");
  };
  const saveIssue = async () => {
    if (!selected || !user || issueBusy) return;
    const request = ++issueRequest.current;
    setIssueBusy(true); setIssueError("");
    try {
      await submitIssueReport({ userId: user.uid, stationId: selected.id, stationName: selected.name, issueType, comment: issueComment });
      if (request === issueRequest.current) setIssueSubmitted(true);
    } catch {
      if (request === issueRequest.current) setIssueError("Your issue report could not be submitted. Check your connection and try again.");
    } finally { if (request === issueRequest.current) setIssueBusy(false); }
  };
  const startRating = () => { setPanel("rate"); setRating(0); setOdor(0); setCrowd("light"); setComment(""); setReviewError(""); setAnswers(Object.fromEntries(CHECKS.map(item => [item.key, null]))); setSubmitted(false); };
  const verifyNearby = async (place: LivePlace): Promise<ReviewProximityVerification> => {
    let position: GeolocationPosition;
    try { position = await freshPosition(); }
    catch { throw new Error("Allow precise location in your browser settings, then try again near this restroom."); }
    const evaluation = evaluateReviewProximity(place, position);
    if (evaluation.status === "blocked") throw new Error(evaluation.message);
    return evaluation.verification;
  };
  const openRating = async () => {
    if (!selected || busy || reviewBusy) return;
    const request = ++ratingRequestSequence.current;
    ratingOperation.current = { request, stationId: selected.id };
    setPendingRatingRequest(request);
    try {
      await verifyNearby(selected);
      if (request === ratingRequestSequence.current) startRating();
    } catch (error) {
      if (request === ratingRequestSequence.current) {
        setProximityMessage(error instanceof Error ? error.message : "Your location could not be verified.");
        setPanel("toofar");
      }
    } finally {
      if (ratingOperation.current?.request === request) ratingOperation.current = null;
      setPendingRatingRequest(current => current === request ? null : current);
    }
  };
  const ratingComplete = rating > 0 && odor > 0 && Object.values(answers).every(value => value !== null);

  const restroomSummary = useMemo(() => {
    if (!reviews.length || activeStation?.reviewsError) return null;
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
  }, [reviews, activeStation?.reviewsError]);

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
    if (!selected || !user || !ratingComplete || busy || reviewBusy) return;
    setReviewError("");
    const request = ++ratingRequestSequence.current;
    ratingOperation.current = { request, stationId: selected.id };
    setPendingRatingRequest(request);
    try {
      // Recheck location at submission, even if the form was opened nearby.
      const proximityVerification = await verifyNearby(selected);
      if (request !== ratingRequestSequence.current) return;
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
      }
      if (request !== ratingRequestSequence.current) return;
      await submitReview({ stationId: station.id, userId: user.uid, cleanlinessRating: rating, odorRating: odor, crowdLevel: crowd, comment, answers: answers as Record<string, boolean>, proximityVerification });
      if (request !== ratingRequestSequence.current) return;
      if (station.id !== selected.id) {
        setSelected(station);
        setPlaces(current => current.map(place => place.id === selected.id ? station : place));
      }
      setSubmitted(true);
    } catch (error) {
      if (request !== ratingRequestSequence.current) return;
      const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
      setReviewError(code === "permission-denied"
        ? "This report could not be accepted. Wait 30 seconds between reports and 15 minutes before rating the same stop again, then retry."
        : error instanceof Error && !code ? error.message
        : code.startsWith("review/") && error instanceof Error ? error.message
        : "Your report could not be submitted. Check your connection and try again.");
    }
    finally {
      if (ratingOperation.current?.request === request) ratingOperation.current = null;
      setPendingRatingRequest(current => current === request ? null : current);
    }
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
    // eslint-disable-next-line react-hooks/purity -- capture dismissal time only from click/install callbacks, never during render.
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
        navigatePanel("install");
      }
      return;
    }
    navigatePanel("install");
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
      navigatePanel("none");
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
    navigatePanel("getapp");
  };
  const authenticate = async (provider: "google" | "apple", useExistingAccount = false) => {
    setBusy(true);
    try {
      const mode = useExistingAccount ? "signIn" : "link";
      const result = provider === "google" ? await signInWithGoogle(mode) : await signInWithApple(mode);
      if (!result) return false;
      setExistingAccountProvider(null);
      applyUser(result.user); notify("You’re signed in. Your contributions stay with your account."); if (!welcomeOpen) setPanel("account");
      return true;
    }
    catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
      if (code === "auth/credential-already-in-use" || code === "auth/email-already-in-use") {
        setExistingAccountProvider(provider);
        if (welcomeOpen) finishWelcome();
        navigatePanel("account");
      } else notify(authErrorMessage(error));
      return false;
    }
    finally { setBusy(false); }
  };

  return <main className="app-shell">
    <header className="topbar">
      <button className="brand" onClick={dismissPanel} aria-label="Restroom Report — Nearby"><span className="brandmark"><Image src="/restroom-brand-mark.svg" alt="" width={42} height={42} priority/></span><span className="brand-wordmark">Restroom Report<small className="brand-kicker">Know before you go.</small></span></button>
      <nav aria-label="Main navigation">
        <button className={!["account", "reports", "settings", "saved"].includes(panel) ? "active" : ""} aria-current={!["account", "reports", "settings", "saved"].includes(panel) ? "page" : undefined} onClick={dismissPanel}><Icon name="map"/>Nearby</button>
        <button className={panel === "saved" ? "active" : ""} aria-current={panel === "saved" ? "page" : undefined} onClick={() => navigatePanel("saved")}><Icon name="bookmark"/>Saved</button>
        <button className={["account", "reports", "settings"].includes(panel) ? "active" : ""} aria-current={["account", "reports", "settings"].includes(panel) ? "page" : undefined} onClick={() => navigatePanel("account")}><Icon name="user"/>Profile</button>
      </nav>
      <button className="header-install" onClick={activateBrand}><Icon name="install"/><span>Get the app</span></button>
      {showAppPromotion && panel === "none" && !welcomeOpen && <aside className="app-promotion" role="dialog" aria-modal="false" aria-label={promotionPlatform === "ios" ? "Get the iPhone app" : "Install Restroom Report"}>
        <span className="app-promotion-pointer" aria-hidden="true"/>
        <button className="app-promotion-close" onClick={rememberPromotionDismissal} aria-label="Dismiss app promotion"><Icon name="close"/></button>
        <span className="app-promotion-icon"><Icon name="install"/></span>
        <div className="app-promotion-copy">
          <span className="app-promotion-kicker">{promotionPlatform === "ios" ? "Available on iPhone" : "Android web app"}</span>
          <strong>{promotionPlatform === "ios" ? "Get the iPhone app" : "Install Restroom Report"}</strong>
          <p>{promotionPlatform === "ios" ? "Open Get the app to view iPhone and Home Screen options." : "Add it to your Home screen for faster, full-screen access."}</p>
        </div>
        <button className="app-promotion-action" onClick={activateAppPromotion}>{promotionPlatform === "ios" ? "View in App Store" : installPrompt ? "Install" : "How to install"}</button>
      </aside>}
    </header>

    <section className={`map-area ${selected ? "has-selection" : "no-selection"} ${mainView === "list" ? "list-mode" : ""}`}>
      <RestroomMap places={filtered} selected={selected} onSelect={selectPlace} userCoords={userCoords} focus={focus} onViewportChange={updateMapViewport} viewportRequest={viewportRequest} localSearchRequest={localSearchRequest} mapStyle={mapStyle}/>
      {mainView === "map" && <div className="map-style-control" ref={mapStyleControlRef}>
        <button aria-label="Map style" aria-haspopup="menu" aria-expanded={mapStyleMenuOpen} onClick={() => setMapStyleMenuOpen(current => !current)}><Icon name="layers"/></button>
        {mapStyleMenuOpen && <div className="map-style-menu" role="menu">
          <button role="menuitem" className={mapStyle === "standard" ? "selected" : ""} onClick={() => { chooseMapStyle("standard"); setMapStyleMenuOpen(false); }}><Icon name="check"/>Standard</button>
          <button role="menuitem" className={mapStyle === "satellite" ? "selected" : ""} onClick={() => { chooseMapStyle("satellite"); setMapStyleMenuOpen(false); }}><Icon name="check"/>Satellite</button>
        </div>}
      </div>}
      <div className="map-toolbar">
      <div className="discovery-heading"><p className="eyebrow">Restroom Report</p><h1>Find a better stop.</h1><p>Traveler reports. A clearer choice.</p></div>
      <form className="searchbox" onSubmit={event => { event.preventDefault(); searchLocation(); }}><Icon name="search"/><input aria-label="Search restrooms, places or cities" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search restrooms, places or cities"/><button type="submit" disabled={busy}>{busy ? "…" : "Go"}</button></form>
      <div className="filters" aria-label="Restroom categories">{TYPES.map(type => <button key={type} className={filter === type ? "selected" : ""} aria-pressed={filter === type} onClick={() => setFilter(type)}>{TYPE_LABELS[type]}</button>)}</div>
      <div className="view-toggle" role="group" aria-label="Map or list view">
        <button className={mainView === "map" ? "selected" : ""} onClick={() => setMainView("map")} aria-label="Map view" aria-pressed={mainView === "map"}><Icon name="map"/></button>
        <button className={mainView === "list" ? "selected" : ""} onClick={() => setMainView("list")} aria-label="List view" aria-pressed={mainView === "list"}><Icon name="list"/></button>
      </div>
      {mainView === "map" && <div className="map-status-controls">
        <button className={`search-area-button ${viewportIsDirty ? "dirty" : ""} ${wideZoom ? "wide" : ""}`} onClick={searchThisArea} aria-busy={loadingPlaces}>
          <Icon name={wideZoom ? "locate" : "search"}/>
          {wideZoom ? "Zoom in & search" : loadingPlaces ? "Searching…" : filtered.length ? "Search this area" : "Try area search again"}
        </button>
      </div>}
      </div>
      {mainView === "map" && <button className={`locate ${locationState}`} onClick={() => { const pending = findMe(); const request = locationRequest.current; void pending.then(found => { if (!found && request === locationRequest.current) notify("Location unavailable. Search a city, or allow location in browser settings."); }); }}><Icon name="locate"/><span>{locationState === "finding" ? "Finding…" : "Near me"}</span></button>}
      {mainView === "map" && <button className="add-fab" onClick={() => navigatePanel("add")}><Icon name="plus"/><span>Add restroom</span></button>}

      {mainView === "map" && (selected ? <aside className="place-card">
        <span className="card-drag-handle" aria-hidden="true"/>
        <button className="card-close" onClick={() => setSelected(null)} aria-label="Close"><Icon name="close"/></button>
        <button className="card-open" onClick={() => navigatePanel("detail")} aria-label="Open restroom details"><Icon name="chevron"/></button>
        <div className="card-head"><span className={`type-dot ${selected.color}`}/><span>{selected.type}</span><span className={`status-chip ${selected.status === "Status not confirmed" ? "unknown" : ""}`}>{selected.status}</span></div>
        <div className="card-main"><div><h2>{selected.name}</h2><p>{userCoords ? `${milesBetween(userCoords, selected).toFixed(1)} mi · ` : ""}{selected.address || "Address unavailable"}</p></div><div className={`score ${selected.color}`}><strong>{selected.score?.toFixed(1) ?? "—"}</strong><span>{selected.score === null ? "Unrated" : selected.reports ? `${selected.reports} rating${selected.reports === 1 ? "" : "s"}` : "CleanScore"}</span></div></div>
        <div className="actions"><button onClick={() => directions(selected)}><Icon name="route"/>Directions</button><button className="primary" onClick={openRating}><Icon name="star"/>Rate restroom</button></div>
      </aside> : <aside className="discovery-card"><span className="discovery-icon"><Icon name="locate"/></span><div><strong>Find a better stop</strong><p>{wideZoom ? "Search a city, tap Near me, or use Zoom in & search." : "Move the map, then tap Search this area."}</p></div></aside>)}

      {mainView === "list" && <section className="full-list">
        <div className="full-list-header"><h2>{loadingPlaces ? "Loading…" : `${filtered.length} stop${filtered.length === 1 ? "" : "s"} in this area`}</h2><button className="add-fab" onClick={() => navigatePanel("add")}><Icon name="plus"/><span>Add</span></button></div>
        <div className="place-list">{loadingPlaces ? <div className="loading-list">Loading live restroom data…</div> : filtered.length ? filtered.map(place => {
          const distance = userCoords ? `${milesBetween(userCoords, place).toFixed(1)} mi away` : "";
          const freshness = place.reports === 0 ? "Needs first report" : `${place.reports} traveler report${place.reports === 1 ? "" : "s"}`;
          return <button key={place.id} onClick={() => selectPlace(place, true)}>
            <span className={`mini-score ${place.color}`}>{place.score?.toFixed(1) ?? "?"}<small>{cleanScoreBadge(place.score).label}</small></span>
            <span><strong>{place.name}</strong><small className="place-brand">{place.name.split(" - ")[0]}</small><small className={`place-type ${place.type.toLowerCase().replaceAll(" ", "-")}`}>{place.type}{distance && <> <i>·</i> {distance}</>}</small><small className="place-address">{place.address || "Address unavailable"}</small><em className={place.reports === 0 ? "first" : place.reports < 2 ? "fresh" : "reported"}>{freshness}</em></span>
            <Icon name="chevron"/>
          </button>;
        }) : wideZoom ? <div className="empty-state"><div>⌕</div><h3>Choose a local area</h3><p>Search a city, tap Near me, or use Zoom in & search on the map.</p></div> : <div className="empty-state"><div>⌕</div><h3>No matches yet</h3><p>Try another search or add the missing location.</p><button className="submit" onClick={() => navigatePanel("add")}>Add this place</button></div>}</div>
      </section>}

      <div className="site-links"><span className={`cloud-state ${cloudReady ? "ready" : ""}`}>● {cloudReady ? "Live data" : "Connecting"}</span>{!isStandalone && <button onClick={installApp}>Install</button>}<Link href="/support">Support</Link><Link href="/privacy">Privacy</Link></div>

      {panel === "none" && <nav className="mobile-tabbar" aria-label="Primary">
        <button className="active" onClick={dismissPanel}><Icon name="map"/><span>Nearby</span></button>
        <button onClick={() => navigatePanel("saved")}><Icon name="bookmark"/><span>Saved</span></button>
        <button onClick={() => navigatePanel("account")}><Icon name="user"/><span>Profile</span></button>
      </nav>}
    </section>

    {panel !== "none" && !welcomeOpen && <AppDialog open label={panel === "issue" && issueSubmitted ? "Issue submitted" : panel === "rate" && submitted ? "Rating submitted" : panel === "detail" && selected ? selected.name : PANEL_LABELS[panel]} onClose={dismissPanel}><section className={`sheet ${panel} ${["account", "saved", "reports", "settings"].includes(panel) ? "page-sheet" : ""}`}>
      <div className="sheet-handle"/><button className="sheet-close" aria-label="Close" onClick={dismissPanel}><Icon name="close"/></button>

      {panel === "detail" && selected && <>
        <div className="detail-topbar">
          <button className="sheet-back" onClick={dismissPanel}><Icon name="back"/>Map</button>
          {selected.source === "firestore" && <button className="report-link" onClick={openIssue}>Report an issue</button>}
        </div>
        <div className={`detail-hero-card ${selected.color}`}>
          <div className="detail-hero-top">
            <div>
              <span className="detail-type-label">{selected.type}</span>
              <h2>{selected.name}</h2>
              <p>{selected.address || "Address unavailable"}</p>
              {userCoords && <em>{milesBetween(userCoords, selected).toFixed(1)} mi away</em>}
            </div>
            <CleanScoreSignal score={selected.score}/>
          </div>
          <div className="confidence-banner"><Icon name="info"/>{cleanScoreBadge(selected.score).label} · {selected.reports} rating{selected.reports === 1 ? "" : "s"}</div>
          <div className="detail-tags"><span className="tag">{selected.type}</span><span className="tag muted">{selected.accessType}</span></div>
          <div className="detail-stats">
            <span><b>{activeStation?.reviewsError ? "Unavailable" : activeStation?.reviewsReady ? reviews.length : "…"}</b><small>Latest ratings</small></span>
            <span><b>{activeStation?.reportsError ? "Unavailable" : activeStation?.reportsReady ? stationIssueReports.length : "…"}</b><small>Recent issues</small></span>
            <span><b>{reviews[0] ? relativeTime(reviews[0].createdAt) : "—"}</b><small>Last review</small></span>
          </div>
        </div>

        <div className="detail-actions"><button onClick={() => directions(selected)}><Icon name="route"/>Directions</button><button onClick={openRating}><Icon name="star"/>Rate</button>{selected.source === "firestore" && <button onClick={shareStop}><Icon name="share"/>Share</button>}</div>

        {sharedStop?.id === selected.id && <label className="form-label share-link">Link to this stop<input readOnly value={sharedStop.url} onFocus={event => event.target.select()}/></label>}

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

        <section className="reviews"><div className="section-title"><h3>Latest ratings</h3><button disabled={reviewBusy} onClick={openRating}>Add yours</button></div>{!activeStation?.reviewsReady ? <p role="status">Loading reports…</p> : activeStation.reviewsError ? <p role="alert">Reports are unavailable. Check your connection and reopen this stop to retry.</p> : reviews.length ? reviews.slice(0, 8).map(review => <article key={review.id}><div><span className="review-score">{review.cleanlinessRating}.0</span><strong>{"★".repeat(Math.max(0, Math.min(5, review.cleanlinessRating)))}{"☆".repeat(Math.max(0, 5 - review.cleanlinessRating))}</strong><time>{review.createdAt?.toLocaleDateString() ?? "Date unavailable"}</time></div>{review.comment && <p>“{review.comment}”</p>}<small>{[review.soapAvailable && "Soap", review.toiletPaperAvailable && "Paper", review.feltSafe && "Felt safe"].filter(Boolean).join(" • ") || "Quick community report"}</small></article>) : <div className="no-reviews"><span>★</span><h4>No report details available</h4><p>Add a fresh report when you visit.</p></div>}</section>
      </>}

      {panel === "toofar" && selected && <div className="toofar-block">
        <span className="toofar-icon"><Icon name="locate"/></span>
        <p className="eyebrow">Location check</p>
        <h2>Verify this stop</h2>
        <p className="muted" role="status">{proximityMessage}</p>
        <button className="submit" disabled={busy || reviewBusy} onClick={openRating}><Icon name="locate"/>{reviewBusy ? "Checking location…" : "Try location again"}</button>
        <button className="text-button" onClick={() => directions(selected)}>Directions to {selected.name}</button>
      </div>}

      {panel === "rate" && selected && !submitted && <><p className="eyebrow">Your visit</p><h2>How was {selected.name}?</h2><p className="muted">Complete the required checks. Comments are optional.</p>
        <div className="rating-block"><label id="cleanliness-label">Cleanliness <b>{rating ? `${rating}/5` : "Required"}</b></label><div className="stars" role="group" aria-labelledby="cleanliness-label">{[1,2,3,4,5].map(value => <button key={value} className={rating >= value ? "on" : ""} onClick={() => setRating(value)} aria-label={`Cleanliness: ${value} of 5`} aria-pressed={rating === value}><Icon name="star"/></button>)}</div></div>
        <div className="rating-block"><label id="odor-label">Odor <b>{odor ? `${odor}/5` : "Required"}</b></label><div className="odor-scale" role="group" aria-labelledby="odor-label">{[1,2,3,4,5].map(value => <button key={value} className={odor === value ? "on" : ""} onClick={() => setOdor(value)} aria-pressed={odor === value} aria-label={`Odor: ${["Very unpleasant", "Unpleasant", "Neutral", "Fresh", "Very fresh"][value-1]}`}><span>{value}</span><small>{["Very poor", "Poor", "Neutral", "Fresh", "Very fresh"][value-1]}</small></button>)}</div></div>
        <label className="field-label">Quick checks <b>Yes or no</b></label><div className="answer-grid">{CHECKS.map(item => <div key={item.key}><span>{item.label}</span><button className={answers[item.key] === true ? "yes active" : "yes"} aria-label={`${item.label}: Yes`} aria-pressed={answers[item.key] === true} onClick={() => setAnswers(current => ({ ...current, [item.key]: true }))}>Yes</button><button className={answers[item.key] === false ? "no active" : "no"} aria-label={`${item.label}: No`} aria-pressed={answers[item.key] === false} onClick={() => setAnswers(current => ({ ...current, [item.key]: false }))}>No</button></div>)}</div>
        <label className="form-label">Crowd level<select value={crowd} onChange={event => setCrowd(event.target.value as CrowdLevel)}>{CROWD_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label className="form-label">Optional comment<textarea value={comment} onChange={event => setComment(event.target.value)} maxLength={700} placeholder="Anything the next traveler should know?"/></label>
        {reviewError && <div className="account-sync error" role="alert">{reviewError}</div>}
        <button disabled={!ratingComplete || busy || reviewBusy} className="submit" onClick={saveReview}>{reviewBusy ? "Checking & submitting…" : ratingComplete ? "Submit report" : "Complete required answers"}</button>
      </>}
      {panel === "rate" && submitted && <div className="thanks"><div className="thanks-rings"><span><Icon name="check"/></span></div><p className="eyebrow">Rating submitted</p><h2>You helped the next traveler.</h2><p>Your fresh report makes Restroom Report more useful and trustworthy.</p><button className="submit" onClick={dismissPanel}>Back to the map</button><button className="text-button" onClick={() => navigatePanel("detail")}>View this restroom</button></div>}

      {panel === "add" && <>
        <div className="add-topbar"><button className="cancel-link" onClick={dismissPanel}>Cancel</button><h2>Add Restroom Location</h2></div>
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
            ].map(option => <button key={option.type} className={`location-type-tile ${addForm.type === option.type ? "selected" : ""}`} aria-pressed={addForm.type === option.type} onClick={() => setAddForm(current => ({ ...current, type: option.type }))}>
              <Icon name={option.icon}/><span>{TYPE_LABELS[option.type]}</span>
            </button>)}
          </div>

          <div className="form-row"><label className="form-label">Access<select value={addForm.accessType} onChange={event => setAddForm(current => ({ ...current, accessType: event.target.value }))}>{RESTROOM_ACCESS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className="form-label">Layout<select value={addForm.layoutType} onChange={event => setAddForm(current => ({ ...current, layoutType: event.target.value }))}>{RESTROOM_LAYOUT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div>
        </section>

        <div className="privacy-note"><Icon name="info"/><span>No restroom photos are collected. Address and basic access details only.</span></div>
        <button className="submit" disabled={busy} onClick={saveStation}><Icon name="plus"/>{busy ? "Finding address…" : "Add to Restroom Report"}</button>
      </>}

      {panel === "saved" && <div className="saved-page">
        <div className="page-header"><p className="eyebrow">Your places</p><h2>Stops worth<br/>remembering.</h2><p className="muted">Keep good options close. Your Avoid list stays private.</p></div>
        <div className="saved-tabs" role="group" aria-label="Saved stop lists">
          <button className={savedTab === "favorites" ? "selected" : ""} aria-pressed={savedTab === "favorites"} onClick={() => setSavedTab("favorites")}>Saved <span>{userProfile?.favoriteStationIds.length ?? (activeAccount.profileReady ? 0 : "…")}</span></button>
          <button className={savedTab === "avoided" ? "selected" : ""} aria-pressed={savedTab === "avoided"} onClick={() => setSavedTab("avoided")}>Avoid <span>{userProfile?.avoidedStationIds.length ?? (activeAccount.profileReady ? 0 : "…")}</span></button>
        </div>
        {activeAccount.errors.profile || accountUnavailable ? <div className="account-sync error" role="alert">Your saved lists are unavailable.<button className="text-button" onClick={retryAccount}>Retry account sync</button></div> : !activeAccount.profileReady || !allPlacesReady ? <div className="loading-list" role="status">Loading your saved stops…</div> : <>
          {allPlacesError && <div className="account-sync error" role="alert">Stop details could not be refreshed.<button className="text-button" onClick={() => setStationRefresh(value => value + 1)}>Retry stop details</button></div>}
          <div className="saved-list place-list">{(savedTab === "favorites" ? userProfile?.favoriteStationIds ?? [] : userProfile?.avoidedStationIds ?? []).map(id => {
            const place = allPlaces.find(item => item.id === id);
            return <article className="saved-stop" key={id}>{place ? <button className="saved-stop-open" onClick={() => selectPlace(place, true)}><span className={`mini-score ${place.color}`}>{place.score?.toFixed(1) ?? "—"}</span><span><strong>{place.name}</strong><small>{place.address || "Address unavailable"}</small><em>{cleanScoreBadge(place.score).label}</em></span><Icon name="chevron"/></button> : <div className="saved-stop-missing"><strong>Location unavailable</strong><p>This stop may have been removed, or its details could not load.</p></div>}<button className="text-button" onClick={async () => { if (!user) return; try { if (savedTab === "favorites") await setStationFavorited(user.uid, id, false); else await setStationAvoided(user.uid, id, false); } catch { notify("The list couldn’t be updated. Please try again."); } }} aria-label={place ? `Remove ${place.name} from ${savedTab === "favorites" ? "Saved" : "Avoid"}` : "Remove unavailable stop"}>Remove</button></article>;
          })}</div>
          {!(savedTab === "favorites" ? userProfile?.favoriteStationIds.length : userProfile?.avoidedStationIds.length) && <div className="empty-state"><div><Icon name={savedTab === "favorites" ? "bookmark" : "flag"}/></div><h3>{savedTab === "favorites" ? "A good stop is worth saving." : "Remember where to skip."}</h3><p>{savedTab === "favorites" ? "Open a stop and tap Save. It’ll be here for your next trip." : "Mark a stop Avoid in its details. This list is just for you."}</p><button className="submit" onClick={dismissPanel}>Explore the map</button></div>}
        </>}
      </div>}

      {panel === "settings" && <div className="settings-page">
        <button className="sheet-back" onClick={() => navigatePanel("account")}><Icon name="back"/>Profile</button>
        <div className="page-header"><p className="eyebrow">Settings</p><h2>Make it<br/>your own.</h2><p className="muted">Your preferences, privacy, and account.</p></div>
        <section className="settings-group"><h3>Appearance</h3><div className="appearance-options" role="group" aria-label="Appearance">{(["system", "light", "dark"] as const).map(option => <button key={option} aria-pressed={appearance === option} className={appearance === option ? "selected" : ""} onClick={() => chooseAppearance(option)}>{option[0].toUpperCase()+option.slice(1)}</button>)}</div></section>
        <section className="settings-group"><h3>Map</h3><label className="settings-row">Default map style<select value={mapStyle} onChange={event => chooseMapStyle(event.target.value as "standard" | "satellite")}><option value="standard">Standard</option><option value="satellite">Satellite</option></select></label></section>
        <section className="settings-group"><h3>Privacy</h3><label className="settings-row"><span>Usage analytics<small>Help improve the app with optional usage data.</small></span><input type="checkbox" checked={cookieConsent === "accepted"} onChange={event => setCookieConsent(event.target.checked ? "accepted" : "declined")}/></label><Link className="settings-row" href="/privacy">Privacy policy<Icon name="chevron"/></Link></section>
        <section className="settings-group"><h3>Getting started</h3><button className="settings-row" onClick={replayWelcome}>Replay welcome guide<Icon name="chevron"/></button><button className="settings-row" onClick={activateBrand}>Get the app<Icon name="chevron"/></button><Link className="settings-row" href="/support">Help & support<Icon name="chevron"/></Link><Link className="settings-row" href="/terms">Terms of use<Icon name="chevron"/></Link></section>
        <section className="settings-group"><h3>Account</h3><div className="settings-row"><span>{profileName}<small>{!user ? "Connecting" : user.isAnonymous ? "Guest account" : "Signed-in account"}</small></span></div>{user?.isAnonymous && <button className="settings-row" onClick={() => navigatePanel("account")}>Protect your contributions with sign-in<Icon name="chevron"/></button>}</section>
      </div>}

      {panel === "issue" && selected && <div className="issue-page">{issueSubmitted ? <div className="thanks"><div className="thanks-rings"><span><Icon name="check"/></span></div><p className="eyebrow">Issue submitted</p><h2>Thanks for the heads-up.</h2><p>Your report is saved with this location and visible in your contribution history.</p><button className="submit" onClick={() => navigatePanel("detail")}>Back to this stop</button></div> : <>
        <button className="sheet-back" onClick={() => navigatePanel("detail")}><Icon name="back"/>Stop details</button><p className="eyebrow">Issue report</p><h2>Something<br/>not right?</h2><p className="muted">Tell us what needs attention at {selected.name}.</p>
        <label className="form-label">What needs attention?<select value={issueType} onChange={event => setIssueType(event.target.value as IssueReportType)}>{ISSUE_REPORT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label className="form-label">Details (optional)<textarea value={issueComment} onChange={event => setIssueComment(event.target.value)} maxLength={700} placeholder={ISSUE_REPORT_OPTIONS.find(option => option.value === issueType)?.prompt}/></label>
        <p className="muted">For emergencies, contact local authorities.</p>{issueError && <div className="account-sync error" role="alert">{issueError}</div>}
        <button className="submit" disabled={!user || issueBusy} onClick={saveIssue}>{issueBusy ? "Submitting…" : "Submit issue report"}</button>
      </>}</div>}

      {panel === "reports" && <div className="contributions-page">
        <p className="eyebrow">Your impact</p><h2>Your contributions.</h2>
        {accountSyncError && <div className="account-sync error" role="alert">{accountSyncError}<button className="text-button" onClick={retryAccount}>Retry account sync</button></div>}
        <section className="milestone-card">
          <span className="milestone-icon"><Icon name="star"/></span><div><small>Ratings</small><strong className={contributionCount === null ? "stat-pending" : ""}>{ratingsLabel}</strong></div>
          {contributionCount !== null && <>
            <label><span>{contributionCount >= 250 ? "Milestone reached" : `Next milestone: ${nextMilestone}`}</span><b>{contributionCount}/{nextMilestone}</b></label>
            <div className="milestone-track"><i style={{ width: `${milestoneProgress}%` }}/></div>
            <div className="milestone-pills">{milestoneOptions.map(value => <span key={value} className={contributionCount >= value ? "done" : value === nextMilestone ? "next" : ""}>{contributionCount >= value ? "✓ " : ""}{value}</span>)}</div>
            <p>{contributionCount >= 250 ? "You’ve reached every rating milestone. Thank you for helping travelers." : `${nextMilestone - contributionCount} more rating${nextMilestone - contributionCount === 1 ? "" : "s"} to reach ${nextMilestone}.`}</p>
          </>}
          {activeAccount.errors.count && <p role="alert">{activeAccount.errors.count} <button className="text-button" onClick={retryAccount}>Retry</button></p>}
        </section>
        <section className="contribution-review-card"><h3><Icon name="message"/>Reviews</h3>
          {!activeAccount.reviewsReady ? <div className="loading-list">Loading your rating history…</div> : activeAccount.errors.reviews ? <div className="account-sync error" role="alert">{activeAccount.errors.reviews}<button className="text-button" onClick={retryAccount}>Retry</button></div> : myReviews.length ? <>
            {contributionCount !== null && contributionCount > myReviews.length && <p className="muted">Showing your latest {myReviews.length} of {contributionCount} ratings.</p>}
            <div className="review-history">{myReviews.map(review => <article key={review.id}><span className={`review-toilet ${review.cleanlinessRating >= 4 ? "great" : review.cleanlinessRating >= 3 ? "fair" : "poor"}`}><Icon name="toilet"/></span><div><button className="history-place" onClick={() => openHistoryStop(review.stationId)} disabled={!allPlaces.some(place => place.id === review.stationId)}>{allPlaces.find(place => place.id === review.stationId)?.name ?? "Location unavailable"}</button><strong>{"★".repeat(Math.max(0, Math.min(5, review.cleanlinessRating)))}{"☆".repeat(Math.max(0, 5 - review.cleanlinessRating))}</strong><p><b>{calculateCleanScore(review)?.toFixed(1) ?? "Unavailable"}</b> CleanScore</p>{review.comment && <small>{review.comment}</small>}</div><time>{relativeTime(review.createdAt)}</time></article>)}</div>
          </> : <div className="empty-state compact"><div>★</div><h3>Your first report matters</h3><p>Rate a restroom to start your contribution history.</p></div>}
        </section>
        {myIssueReports.length > 0 && <section className="contribution-review-card"><h3><Icon name="flag"/>Issue reports</h3><div className="report-list">{myIssueReports.map(report => <article key={report.id}><span className="issue">!</span><div><strong>{report.issueType}</strong><small>{allPlaces.find(place => place.id === report.stationId)?.name || report.stationName || "Location unavailable"}</small><small>{report.comment || "No extra details"}</small></div><b>{report.status || "Submitted"}</b></article>)}</div></section>}
        {activeAccount.errors.reports && <div className="account-sync error" role="alert">{activeAccount.errors.reports}<button className="text-button" onClick={retryAccount}>Retry</button></div>}
      </div>}

      {panel === "account" && <div className="profile-page">
        <div className="profile-heading"><div><p className="eyebrow">Account</p><h2>Profile</h2></div><button aria-label="Settings" onClick={() => navigatePanel("settings")}><Icon name="settings"/></button></div>
        <section className="profile-hero">
          <div className="profile-identity"><span className="profile-avatar">{user?.isAnonymous ? "G" : profileName.split(" ").map(part => part[0]).join("").slice(0,2).toUpperCase()}</span><div><strong>{profileName}</strong><small>{contributionCount === null ? activeAccount.errors.count || accountUnavailable ? "Rating total unavailable" : "Loading rating total…" : `${contributionCount} rating${contributionCount === 1 ? "" : "s"}`} · {!user ? "Connecting" : user.isAnonymous ? "Guest traveler" : "Member"}</small></div></div>
          <div className="profile-stats"><button onClick={() => navigatePanel("reports")}><span>★</span><b className={contributionCount === null ? "stat-pending" : ""}>{ratingsLabel}</b><small>Ratings</small></button><button onClick={() => navigatePanel("saved")}><span>▮</span><b className={activeAccount.errors.profile || accountUnavailable ? "stat-pending" : ""}>{savedLabel}</b><small>Saved</small></button><button onClick={() => navigatePanel("reports")}><span>▰</span><b className={activeAccount.errors.reviews || accountUnavailable ? "stat-pending" : ""}>{activeAccount.errors.reviews || accountUnavailable ? "Unavailable" : activeAccount.reviewsReady ? myReviews.length : "…"}</b><small>Recent ratings</small></button></div>
        </section>
        <h3 className="profile-section-title">Contributor status</h3><section className="trusted-card">
          {accountUnavailable ? <p>Connect your account to load contributor status.</p> : !activeAccount.reputationReady ? <p role="status">Loading contributor status…</p> : !reputation ? <p>{activeAccount.errors.reputation || "Contributor status hasn’t been evaluated yet. Your rating total is shown separately."}</p> : <>
            <div className="trusted-heading"><span>{reputation.level === "none" ? "·" : "✓"}</span><div><strong>{TRAVELER_LEVEL_LABELS[reputation.level]}</strong><small>Based on eligible reports across different stops.</small></div></div>
            {reputation.nextLevel && <><label><span>Progress to {TRAVELER_LEVEL_LABELS[reputation.nextLevel]}</span><b>{Math.round(reputation.nextLevelProgress * 100)}%</b></label><div className="trusted-track"><i style={{ width: `${reputation.nextLevelProgress * 100}%` }}/></div></>}
            <div className="trusted-stats"><span><b>{reputation.proximityVerifiedContributionCount}</b><small>Verified reports</small></span><span><b>{reputation.uniqueLocationCount}</b><small>Locations</small></span><span><b>{reputation.corroboratedContributionCount}</b><small>Supported</small></span></div>
            <p className="muted">{reputation.contributionCount} credited report{reputation.contributionCount === 1 ? "" : "s"}. Repeated ratings at one stop may not earn additional credit.</p>
          </>}
        </section>
        {accountLoading && !accountSyncError && <div className="account-sync loading" role="status">Loading your account data…</div>}{accountSyncError && <div className="account-sync error" role="alert"><strong>Some account data is unavailable</strong><span>{accountSyncError}</span><button className="text-button" onClick={retryAccount}>Retry account sync</button></div>}
        {!user || user.isAnonymous ? <div className="auth-actions"><button onClick={() => authenticate("google")} disabled={busy}><b>G</b>Continue with Google</button><button onClick={() => authenticate("apple")} disabled={busy}><b>●</b>Continue with Apple</button></div> : null}
        {existingAccountProvider && <div className="account-sync error" role="alert"><strong>This sign-in already belongs to an account</strong><span>You can open that account. Ratings from this guest session will remain with the guest account and will not be merged.</span><button className="text-button" disabled={busy} onClick={() => authenticate(existingAccountProvider, true)}>Sign in to existing account</button><button className="text-button" disabled={busy} onClick={() => setExistingAccountProvider(null)}>Keep guest session</button></div>}
        <h3 className="profile-section-title">Activity</h3><div className="account-links activity-links"><button onClick={() => navigatePanel("reports")}><span>★</span><strong>Contribution history</strong><Icon name="chevron"/></button><button onClick={installApp}><span>＋</span><strong>Install web app</strong><Icon name="chevron"/></button><Link href="/support"><span>?</span><strong>Help & support</strong><Icon name="chevron"/></Link><Link href="/privacy"><span>◉</span><strong>Privacy policy</strong><Icon name="chevron"/></Link></div>
        {user && !user.isAnonymous && <button className="signout" disabled={busy || reviewBusy} onClick={async () => { try { await signOutUser(); dismissPanel(); notify("Signed out"); } catch { notify("Sign-out could not be completed. Please try again."); } }}>Sign out</button>}
        <div className={`connection-card ${cloudReady && !accountSyncError && !accountLoading ? "online" : ""}`}>● {accountSyncError ? "Some account data is unavailable" : accountLoading ? "Loading account data" : "Account data connected"}</div>
      </div>}

      {panel === "getapp" && <><p className="eyebrow">Get Restroom Report</p><h2>{isIOS ? "iPhone app or home screen?" : "Add Restroom Report"}</h2><div className="install-art"><span className="brandmark"><Image src="/app-icon-192.png" alt="Restroom Report app icon" width={78} height={78}/></span></div><p className="muted">{isIOS ? "Get the native Restroom Report app from the App Store, or add the website to your Home Screen for browser access." : "Add Restroom Report to your home screen for a full-screen, app-like experience—no app store required."}</p>{isIOS ? <><button className="submit" onClick={() => window.open(APP_STORE_URL, "_blank", "noopener,noreferrer")}>Get the iOS app</button><button className="text-button" onClick={() => navigatePanel("install")}>Add to Home Screen instead</button></> : <button className="submit" onClick={installApp}>Add to Home Screen</button>}</>}

      {panel === "install" && <><p className="eyebrow">One-tap access</p><h2>Install Restroom Report</h2><div className="install-art"><span className="brandmark"><Image src="/app-icon-192.png" alt="Restroom Report app icon" width={78} height={78}/></span></div><p className="muted">Add Restroom Report to your home screen. Open it directly from your Home Screen in a focused browser window.</p><ol className="install-steps"><li><span>1</span>Open your browser’s <strong>menu</strong> (or Share in Safari).</li><li><span>2</span>Choose <strong>Add to Home Screen</strong> or <strong>Install app</strong>.</li><li><span>3</span>Tap <strong>Add</strong> or <strong>Install</strong>.</li></ol><button className="submit" onClick={dismissPanel}>Got it</button></>}
      {["reports", "account", "saved", "settings"].includes(panel) && <nav className="mobile-tabbar panel-tabbar" aria-label="Primary">
        <button onClick={dismissPanel}><Icon name="map"/><span>Nearby</span></button>
        <button className={panel === "saved" ? "active" : ""} onClick={() => navigatePanel("saved")}><Icon name="bookmark"/><span>Saved</span></button>
        <button className={["account", "reports", "settings"].includes(panel) ? "active" : ""} onClick={() => navigatePanel("account")}><Icon name="user"/><span>Profile</span></button>
      </nav>}
    </section></AppDialog>}
    {welcomeReady && cookieConsent !== "unset" && <WelcomeGuide open={welcomeOpen} onFinish={finishWelcome} onLocate={findMe} onAuthenticate={authenticate} member={Boolean(user && !user.isAnonymous)} accountConnecting={!user && !accountAuthError}/>}
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
