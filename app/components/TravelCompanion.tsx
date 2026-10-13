"use client";
import { useState, useSyncExternalStore, useEffect } from "react";
const preferenceKey = "rr-mascot-enabled";
function subscribePreference(callback: () => void) {
 window.addEventListener("storage", callback); window.addEventListener("rr-mascot-preference", callback);
 return () => { window.removeEventListener("storage", callback); window.removeEventListener("rr-mascot-preference", callback); };
}
function readPreference() { try { return localStorage.getItem(preferenceKey) !== "false"; } catch { return true; } }
export function useCompanionPreference(): [boolean, (enabled: boolean) => void] {
 const enabled = useSyncExternalStore(subscribePreference, readPreference, () => true);
 const choose = (value: boolean) => { try { localStorage.setItem(preferenceKey, String(value)); } catch {} window.dispatchEvent(new Event("rr-mascot-preference")); };
 return [enabled, choose];
}
function subscribeTheme(callback: () => void) {
 const observer = new MutationObserver(callback); observer.observe(document.documentElement, {attributes:true, attributeFilter:["data-theme"]});
 const media = matchMedia("(prefers-color-scheme: dark)"); media.addEventListener("change", callback);
 return () => { observer.disconnect(); media.removeEventListener("change", callback); };
}
function readTheme() { return getComputedStyle(document.documentElement).colorScheme === "dark"; }
import { COMPANION, type CompanionMoment } from "../lib/companion";
export { COMPANION } from "../lib/companion";
export type { CompanionMoment } from "../lib/companion";
export default function TravelCompanion({moment = COMPANION.nearby, compact = false, enabled = true, reactionID = 0, onReady}: {moment?: CompanionMoment; compact?: boolean; enabled?: boolean; reactionID?: number; onReady?:(frame:HTMLIFrameElement)=>void}) {
 const [thought, setThought] = useState(0);
 const dark = useSyncExternalStore(subscribeTheme, readTheme, () => false);
 const [revealed, setRevealed] = useState("");
 const sceneKey = `${moment.gesture}-${thought}-${reactionID}-${dark}`;
 useEffect(() => {
   if (moment.gesture !== "walkout") return;
   const timer = window.setTimeout(() => setRevealed(sceneKey), 1850);
   return () => window.clearTimeout(timer);
 }, [sceneKey, moment.gesture]);
 if (!enabled) return null;
 return <button type="button" className={`travel-companion ${compact ? "compact" : ""}`} onClick={() => setThought(value => value + 1)} aria-label={`${moment.lines[thought % moment.lines.length]}. Tap for another thought.`}>
   <iframe onLoad={e=>onReady?.(e.currentTarget)} key={`${moment.gesture}-${thought}-${reactionID}`} src={`/travel-companion.html?gesture=${encodeURIComponent(moment.gesture)}&dark=${dark}`} sandbox="allow-scripts" title="Restroom sidekick" aria-hidden="true" tabIndex={-1}/>
   <span>{!compact && <small>YOUR RESTROOM SIDEKICK</small>}<strong>{moment.gesture === "walkout" && revealed !== sceneKey ? "One sniff. Immediate resignation." : moment.lines[thought % moment.lines.length]}</strong></span>
 </button>;
}
