"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { initializeFirebaseAnalytics } from "./lib/firebase";
import {
  addStation, completeRedirectSignIn, ensureAnonymousUser, signInWithApple, signInWithGoogle, signOutUser,
  submitReview, subscribeToReviews, subscribeToStations, type LivePlace, type StationReview,
} from "./lib/firestore";

const RestroomMap = dynamic(() => import("./components/RestroomMap"), { ssr: false });
type Coordinates = { latitude: number; longitude: number };
type Panel = "none" | "list" | "detail" | "rate" | "add" | "reports" | "account" | "install";
type DeferredInstall = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const TYPES = ["All", "Gas station", "Truck stop", "Rest area", "Fast food"];
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
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

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
  };
  return messages[code] ?? `Sign-in could not be completed${code ? ` (${code.replace("auth/", "")})` : ""}.`;
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
  const [focus, setFocus] = useState<Coordinates | null>(null);
  const [locationState, setLocationState] = useState<"idle" | "finding" | "found" | "blocked">("idle");
  const [cloudReady, setCloudReady] = useState(false);
  const [loadingPlaces, setLoadingPlaces] = useState(true);
  const [toast, setToast] = useState("");
  const [reviews, setReviews] = useState<StationReview[]>([]);
  const [myReports, setMyReports] = useState<Array<{ stationId: string; place: string; rating: number; date: string }>>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem("rr-reports") ?? "[]"); } catch { return []; }
  });
  const [installPrompt, setInstallPrompt] = useState<DeferredInstall | null>(null);
  const [isStandalone] = useState(() => typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches);
  const [busy, setBusy] = useState(false);

  const [rating, setRating] = useState(0), [odor, setOdor] = useState(0), [crowd, setCrowd] = useState("quiet"), [comment, setComment] = useState("");
  const [answers, setAnswers] = useState<Record<string, boolean | null>>(() => Object.fromEntries(CHECKS.map(item => [item.key, null])));
  const [submitted, setSubmitted] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", address: "", type: "Gas station", accessType: "unknown", layoutType: "unknown" });

  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 3000); };

  useEffect(() => {
    const installHandler = (event: Event) => { event.preventDefault(); setInstallPrompt(event as DeferredInstall); };
    window.addEventListener("beforeinstallprompt", installHandler);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    initializeFirebaseAnalytics().catch(() => {});
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
    const stopStations = subscribeToStations(items => { setPlaces(items); setLoadingPlaces(false); setCloudReady(true); }, () => { setLoadingPlaces(false); setCloudReady(false); });
    return () => { cancelled = true; window.removeEventListener("beforeinstallprompt", installHandler); stopAuth(); stopStations(); };
  }, []);

  useEffect(() => {
    if (!selected) return;
    return subscribeToReviews(selected.id, setReviews, () => setReviews([]));
  }, [selected]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const result = places.filter(place => (filter === "All" || place.type === filter) && (!needle || `${place.name} ${place.address} ${place.city} ${place.state} ${place.type}`.toLowerCase().includes(needle)));
    const origin = userCoords ?? mapCenter;
    return [...result].sort((a, b) => milesBetween(origin, a) - milesBetween(origin, b));
  }, [places, filter, query, userCoords, mapCenter]);

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
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`);
      const result = (await response.json())[0];
      if (!result) throw new Error();
      setFocus({ latitude: Number(result.lat), longitude: Number(result.lon) }); notify(`Map moved to ${result.display_name.split(",")[0]}`);
    } catch { notify("No matching place or city was found"); }
    finally { setBusy(false); }
  };

  const directions = (place: LivePlace) => window.open(`https://www.google.com/maps/dir/?api=1&destination=${place.latitude},${place.longitude}`, "_blank", "noopener,noreferrer");
  const openRating = () => { setPanel("rate"); setRating(0); setOdor(0); setCrowd("quiet"); setComment(""); setAnswers(Object.fromEntries(CHECKS.map(item => [item.key, null]))); setSubmitted(false); };
  const ratingComplete = rating > 0 && odor > 0 && Object.values(answers).every(value => value !== null);

  const saveReview = async () => {
    if (!selected || !user || !ratingComplete) return;
    setBusy(true);
    try {
      await submitReview({ stationId: selected.id, userId: user.uid, cleanlinessRating: rating, odorRating: odor, crowdLevel: crowd, comment, answers: answers as Record<string, boolean> });
      const next = [{ stationId: selected.id, place: selected.name, rating, date: new Date().toISOString() }, ...myReports];
      setMyReports(next); localStorage.setItem("rr-reports", JSON.stringify(next)); setSubmitted(true);
    } catch { notify("Your rating could not be submitted. Please try again."); }
    finally { setBusy(false); }
  };

  const geocode = async (address: string) => {
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
      setFocus(coords); setPanel("none"); setAddForm({ name: "", address: "", type: "Gas station", accessType: "unknown", layoutType: "unknown" }); notify("Restroom added—thank you!");
    } catch { notify("We couldn’t locate that address. Add the city and state, then try again."); }
    finally { setBusy(false); }
  };

  const installApp = async () => {
    if (installPrompt) { await installPrompt.prompt(); const choice = await installPrompt.userChoice; if (choice.outcome === "accepted") setInstallPrompt(null); return; }
    setPanel("install");
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
      <button className="brand" onClick={() => setPanel("none")}><span className="brandmark"><Image src="/app-icon-192.png" alt="" width={42} height={42} priority/></span><span>Restroom <strong>Report</strong></span></button>
      <nav><button className="active" onClick={() => setPanel("none")}>Explore</button><button onClick={() => setPanel("reports")}>My reports <span className="report-count">{myReports.length}</span></button><button className="avatar" onClick={() => setPanel("account")} aria-label="Account"><Icon name="user"/></button></nav>
    </header>

    <section className={`map-area ${selected ? "has-selection" : "no-selection"}`}>
      <RestroomMap places={filtered} selected={selected} onSelect={selectPlace} userCoords={userCoords} focus={focus} onCenterChange={setMapCenter}/>
      <form className="searchbox" onSubmit={event => { event.preventDefault(); searchLocation(); }}><Icon name="search"/><input aria-label="Search restrooms, places or cities" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search restrooms, places or cities"/><button type="submit" disabled={busy}>{busy ? "…" : "Go"}</button></form>
      <div className="filters" aria-label="Restroom categories">{TYPES.map(type => <button key={type} className={filter === type ? "selected" : ""} onClick={() => setFilter(type)}>{type}</button>)}</div>
      <button className="nearby-pill" onClick={() => setPanel("list")}><Icon name="list"/><span>{filtered.length}</span> places</button>
      <button className={`locate ${locationState}`} onClick={findMe}><Icon name="locate"/><span>{locationState === "finding" ? "Finding…" : "Near me"}</span></button>
      <button className="add-fab" onClick={() => setPanel("add")}><Icon name="plus"/><span>Add restroom</span></button>

      {selected ? <aside className="place-card">
        <button className="card-open" onClick={() => setPanel("detail")} aria-label="Open restroom details"><Icon name="chevron"/></button>
        <div className="card-head"><span className={`type-dot ${selected.color}`}/><span>{selected.type}</span><span className={`status-chip ${selected.status === "Status not confirmed" ? "unknown" : ""}`}>{selected.status}</span></div>
        <div className="card-main"><div><h1>{selected.name}</h1><p>{selected.address || "Address unavailable"}</p></div><div className={`score ${selected.score !== null && selected.score >= 8 ? "great" : ""}`}><strong>{selected.score ?? "—"}</strong><span>{selected.reports ? `${selected.reports} report${selected.reports === 1 ? "" : "s"}` : "Unrated"}</span></div></div>
        <div className="actions"><button onClick={() => directions(selected)}><Icon name="route"/>Directions</button><button className="primary" onClick={openRating}><Icon name="star"/>Rate restroom</button></div>
      </aside> : <aside className="discovery-card"><span className="discovery-icon"><Icon name="locate"/></span><div><strong>Find a better stop</strong><p>Tap Near me or choose a marker.</p></div></aside>}

      <div className="site-links"><span className={`cloud-state ${cloudReady ? "ready" : ""}`}>● {cloudReady ? "Live data" : "Connecting"}</span>{!isStandalone && <button onClick={installApp}>Install</button>}<Link href="/support">Support</Link><Link href="/privacy">Privacy</Link></div>
    </section>

    {panel !== "none" && <div className="scrim" onMouseDown={() => setPanel("none")}><section className={`sheet ${panel}`} onMouseDown={event => event.stopPropagation()}>
      <div className="sheet-handle"/><button className="sheet-close" aria-label="Close" onClick={() => setPanel("none")}><Icon name="close"/></button>

      {panel === "list" && <><p className="eyebrow">Explore</p><h2>{query ? "Search results" : userCoords ? "Closest to you" : "Loaded restrooms"}</h2><p className="muted">{filtered.length} matching place{filtered.length === 1 ? "" : "s"}</p>
        <div className="place-list">{loadingPlaces ? <div className="loading-list">Loading live restroom data…</div> : filtered.length ? filtered.map(place => <button key={place.id} onClick={() => { selectPlace(place); setPanel("none"); }}><span className={`mini-score ${place.color}`}>{place.score ?? "?"}</span><span><strong>{place.name}</strong><small>{place.type} • {place.address || "Address unavailable"}</small>{userCoords && <em>{milesBetween(userCoords, place).toFixed(1)} miles away</em>}</span><Icon name="chevron"/></button>) : <div className="empty-state"><div>⌕</div><h3>No matches yet</h3><p>Try another search or add the missing location.</p><button className="submit" onClick={() => setPanel("add")}>Add this place</button></div>}</div>
      </>}

      {panel === "detail" && selected && <><button className="sheet-back" onClick={() => setPanel("none")}><Icon name="back"/>Map</button><div className={`detail-hero ${selected.color}`}><span>{selected.score ?? "?"}</span><div><p>{selected.type}</p><h2>{selected.name}</h2><small>{selected.address}</small></div></div>
        <div className="detail-actions"><button onClick={() => directions(selected)}><Icon name="route"/>Directions</button><button onClick={openRating}><Icon name="star"/>Rate</button><button onClick={() => navigator.share?.({ title: selected.name, text: `Check this restroom on Restroom Report`, url: location.href })}><Icon name="share"/>Share</button></div>
        <section className="facts"><h3>What travelers know</h3><div><span><b>{selected.status}</b><small>Current status</small></span><span><b>{selected.accessType}</b><small>Public access</small></span><span><b>{selected.layoutType}</b><small>Layout</small></span><span><b>{selected.reports}</b><small>Reports</small></span></div></section>
        <section className="reviews"><div className="section-title"><h3>Recent reports</h3><button onClick={openRating}>Add yours</button></div>{reviews.length ? reviews.slice(0, 8).map(review => <article key={review.id}><div><span className="review-score">{review.cleanlinessRating}.0</span><strong>{"★".repeat(review.cleanlinessRating)}{"☆".repeat(5 - review.cleanlinessRating)}</strong><time>{review.createdAt?.toLocaleDateString() ?? "Recently"}</time></div>{review.comment && <p>“{review.comment}”</p>}<small>{[review.soapAvailable && "Soap", review.toiletPaperAvailable && "Paper", review.feltSafe && "Felt safe"].filter(Boolean).join(" • ") || "Quick community report"}</small></article>) : <div className="no-reviews"><span>★</span><h4>Be the first to describe it</h4><p>A quick report helps the next traveler.</p></div>}</section>
      </>}

      {panel === "rate" && selected && !submitted && <><p className="eyebrow">30-second report</p><h2>How was {selected.name}?</h2><p className="muted">Answer what you can. Your report helps everyone traveling after you.</p>
        <div className="rating-block"><label>Cleanliness <b>{rating ? `${rating}/5` : "Required"}</b></label><div className="stars">{[1,2,3,4,5].map(value => <button key={value} className={rating >= value ? "on" : ""} onClick={() => setRating(value)} aria-label={`${value} stars`}><Icon name="star"/></button>)}</div></div>
        <div className="rating-block"><label>Odor <b>{odor ? `${odor}/5` : "Required"}</b></label><div className="odor-scale">{[1,2,3,4,5].map(value => <button key={value} className={odor === value ? "on" : ""} onClick={() => setOdor(value)}><span>{["😖","🙁","😐","🙂","✨"][value-1]}</span><small>{value}</small></button>)}</div></div>
        <label className="field-label">Quick checks <b>Yes or no</b></label><div className="answer-grid">{CHECKS.map(item => <div key={item.key}><span>{item.label}</span><button className={answers[item.key] === true ? "yes active" : "yes"} onClick={() => setAnswers(current => ({ ...current, [item.key]: true }))}>Yes</button><button className={answers[item.key] === false ? "no active" : "no"} onClick={() => setAnswers(current => ({ ...current, [item.key]: false }))}>No</button></div>)}</div>
        <label className="form-label">Crowd level<select value={crowd} onChange={event => setCrowd(event.target.value)}><option value="quiet">Quiet</option><option value="moderate">Moderate</option><option value="busy">Busy</option></select></label>
        <label className="form-label">Optional comment<textarea value={comment} onChange={event => setComment(event.target.value)} maxLength={700} placeholder="Anything the next traveler should know?"/></label>
        <button disabled={!ratingComplete || busy} className="submit" onClick={saveReview}>{busy ? "Submitting…" : ratingComplete ? "Submit report" : "Complete required answers"}</button>
      </>}
      {panel === "rate" && submitted && <div className="thanks"><div className="thanks-rings"><span><Icon name="check"/></span></div><p className="eyebrow">Rating submitted</p><h2>You helped the next traveler.</h2><p>Your fresh report makes Restroom Report more useful and trustworthy.</p><button className="submit" onClick={() => setPanel("none")}>Back to the map</button><button className="text-button" onClick={() => setPanel("detail")}>View this restroom</button></div>}

      {panel === "add" && <><p className="eyebrow">Grow the map</p><h2>Add a restroom</h2><p className="muted">Add public-access locations only. We’ll locate the pin from the address.</p><label className="form-label">Place name<input value={addForm.name} onChange={event => setAddForm(current => ({ ...current, name: event.target.value }))} placeholder="e.g. QuikTrip"/></label><label className="form-label">Full address<input value={addForm.address} onChange={event => setAddForm(current => ({ ...current, address: event.target.value }))} placeholder="Street, city, state"/></label><div className="form-row"><label className="form-label">Type<select value={addForm.type} onChange={event => setAddForm(current => ({ ...current, type: event.target.value }))}>{TYPES.slice(1).map(type => <option key={type}>{type}</option>)}</select></label><label className="form-label">Access<select value={addForm.accessType} onChange={event => setAddForm(current => ({ ...current, accessType: event.target.value }))}><option value="unknown">Not sure</option><option value="public">Public</option><option value="customersOnly">Customers only</option><option value="keyRequired">Key required</option></select></label></div><label className="form-label">Layout<select value={addForm.layoutType} onChange={event => setAddForm(current => ({ ...current, layoutType: event.target.value }))}><option value="unknown">Not sure</option><option value="singleStall">Single stall</option><option value="multiStall">Multiple stalls</option><option value="family">Family restroom</option></select></label><div className="privacy-note"><Icon name="info"/><span>No restroom photos are collected. Address and basic access details only.</span></div><button className="submit" disabled={busy} onClick={saveStation}>{busy ? "Finding address…" : "Add restroom"}</button>
      </>}

      {panel === "reports" && <><p className="eyebrow">Your impact</p><h2>My reports</h2><p className="muted">Your recent contributions from this browser.</p>{myReports.length ? <div className="report-list">{myReports.map((report, index) => <article key={`${report.date}-${index}`}><span>{report.rating}.0</span><div><strong>{report.place}</strong><small>{new Date(report.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</small></div><b>✓ Submitted</b></article>)}</div> : <div className="empty-state"><div>★</div><h3>Your first report matters</h3><p>Rate a restroom to start your contribution history.</p><button className="submit" onClick={() => setPanel("none")}>Explore the map</button></div>}</>}

      {panel === "account" && <><p className="eyebrow">Account</p><h2>{user?.isAnonymous ? "Travel as a guest" : user?.displayName ?? "Your profile"}</h2><div className="profile-card"><span className="profile-avatar">{user?.isAnonymous ? "G" : (user?.displayName?.[0] ?? user?.email?.[0] ?? "R").toUpperCase()}</span><div><strong>{user?.isAnonymous ? "Guest explorer" : user?.displayName ?? user?.email}</strong><small>{user?.isAnonymous ? "Ratings work now; sign in to keep them across devices." : user?.email}</small></div></div>{user?.isAnonymous ? <div className="auth-actions"><button onClick={() => authenticate("google")} disabled={busy}><b>G</b>Continue with Google</button><button onClick={() => authenticate("apple")} disabled={busy}><b>●</b>Continue with Apple</button></div> : <button className="signout" onClick={async () => { await signOutUser(); setPanel("none"); notify("Signed out"); }}>Sign out</button>}<div className="account-links"><button onClick={() => setPanel("reports")}><span>My reports</span><Icon name="chevron"/></button><button onClick={installApp}><span>Install web app</span><Icon name="chevron"/></button><Link href="/support"><span>Help & support</span><Icon name="chevron"/></Link><Link href="/privacy"><span>Privacy policy</span><Icon name="chevron"/></Link><Link href="/terms"><span>Terms of use</span><Icon name="chevron"/></Link></div><div className={`connection-card ${cloudReady ? "online" : ""}`}>● {cloudReady ? "Connected to live Restroom Report data" : "Connecting to Firebase"}</div></>}

      {panel === "install" && <><p className="eyebrow">One-tap access</p><h2>Install Restroom Report</h2><div className="install-art"><span className="brandmark"><Image src="/app-icon-192.png" alt="Restroom Report app icon" width={78} height={78}/></span></div><p className="muted">Add Restroom Report to your home screen. It opens full-screen and feels like an app—no app store required.</p><ol className="install-steps"><li><span>1</span>Tap your browser’s <strong>Share</strong> button.</li><li><span>2</span>Choose <strong>Add to Home Screen</strong> or <strong>Install app</strong>.</li><li><span>3</span>Tap <strong>Add</strong> or <strong>Install</strong>.</li></ol><button className="submit" onClick={() => setPanel("none")}>Got it</button></>}
    </section></div>}
    {toast && <div className="toast" role="status"><Icon name="check"/>{toast}</div>}
  </main>;
}
