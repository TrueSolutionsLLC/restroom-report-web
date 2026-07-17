"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { initializeFirebaseAnalytics } from "./lib/firebase";
import { ensureAnonymousUser, submitReview, subscribeToStations, type LivePlace } from "./lib/firestore";
import type { User } from "firebase/auth";

type Place = { id:number|string; name:string; type:string; address:string; score:number|null; reports:number; color:string; x:number; y:number; status:string; detail:string };

const places: Place[] = [
  { id:1, name:"QuikTrip", type:"Gas station", address:"2900 Gravois Rd", score:8.7, reports:42, color:"blue", x:28, y:31, status:"Open now", detail:"Clean, stocked and recently rated" },
  { id:2, name:"Love’s Travel Stop", type:"Truck stop", address:"1199 Drury Ln", score:7.9, reports:86, color:"orange", x:68, y:25, status:"Open 24 hours", detail:"Multiple stalls • Changing table" },
  { id:3, name:"I-44 Rest Area", type:"Rest area", address:"Westbound • Mile 263", score:9.1, reports:117, color:"teal", x:62, y:63, status:"Open 24 hours", detail:"Accessible • Family restroom" },
  { id:4, name:"McDonald’s", type:"Fast food", address:"1000 Bowles Ave", score:6.4, reports:18, color:"rose", x:34, y:72, status:"Open now", detail:"Single stall • Customers welcome" },
  { id:5, name:"Phillips 66", type:"Gas station", address:"807 Main St", score:null, reports:0, color:"blue", x:48, y:45, status:"Hours unknown", detail:"Be the first to rate this restroom" },
];

const Icon = ({name}:{name:string}) => {
  const paths:Record<string,React.ReactNode> = {
    search:<><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    locate:<><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 2V0M12 24v-2M2 12H0M24 12h-2"/></>,
    list:<><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3" cy="6" r="1"/><circle cx="3" cy="12" r="1"/><circle cx="3" cy="18" r="1"/></>,
    plus:<path d="M12 5v14M5 12h14"/>,
    user:<><circle cx="12" cy="8" r="4"/><path d="M4 21c1-5 15-5 16 0"/></>,
    route:<><path d="M5 19c5 0 4-14 9-14h5"/><path d="m16 2 3 3-3 3"/><circle cx="5" cy="19" r="2"/></>,
    star:<path d="m12 2 3 6 7 .8-5 4.8 1.5 7-6.5-3.5-6.5 3.5 1.5-7-5-4.8L9 8z"/>,
    close:<><path d="m6 6 12 12M18 6 6 18"/></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
};

export default function Home() {
  const [query,setQuery]=useState("");
  const [filter,setFilter]=useState("All");
  const [selected,setSelected]=useState<Place>(places[0]);
  const [panel,setPanel]=useState<"none"|"list"|"reports"|"rate"|"add">("none");
  const [rating,setRating]=useState(0);
  const [submitted,setSubmitted]=useState(false);
  const [locationState,setLocationState]=useState<"idle"|"finding"|"found"|"blocked">("idle");
  const [reports,setReports]=useState<Array<{place:string;rating:number;date:string}>>([]);
  const [toast,setToast]=useState("");
  const [cloudReady,setCloudReady]=useState(false);
  const [livePlaces,setLivePlaces]=useState<LivePlace[]>([]);
  const [firebaseUser,setFirebaseUser]=useState<User|null>(null);
  const [checks,setChecks]=useState<Set<string>>(new Set());
  const [userCoords,setUserCoords]=useState<{latitude:number;longitude:number}|null>(null);
  const availablePlaces=useMemo(()=>{
    if(!livePlaces.length)return places;
    if(!userCoords)return livePlaces;
    const distance=(p:LivePlace)=>{const lat=(p.latitude-userCoords.latitude)*69;const lon=(p.longitude-userCoords.longitude)*69*Math.cos(userCoords.latitude*Math.PI/180);return lat*lat+lon*lon};
    return [...livePlaces].sort((a,b)=>distance(a)-distance(b));
  },[livePlaces,userCoords]);
  const filtered=useMemo(()=>availablePlaces.filter(p=>(filter==="All"||p.type===filter)&&(`${p.name} ${p.type} ${p.address}`).toLowerCase().includes(query.toLowerCase())),[query,filter,availablePlaces]);

  useEffect(()=>{
    const stored=localStorage.getItem("rr-reports");
    if(stored) try{const saved=JSON.parse(stored);queueMicrotask(()=>setReports(saved))}catch{}
    if("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(()=>{});
    initializeFirebaseAnalytics().then(()=>setCloudReady(true)).catch(()=>setCloudReady(false));
    const stopAuth=ensureAnonymousUser(user=>{setFirebaseUser(user);setCloudReady(true)},()=>setCloudReady(false));
    const stopStations=subscribeToStations(items=>{if(items.length){setLivePlaces(items);setSelected(items[0])}setCloudReady(true)},()=>setCloudReady(false));
    return ()=>{stopAuth();stopStations()};
  },[]);

  const notify=(message:string)=>{setToast(message);window.setTimeout(()=>setToast(""),2600)};
  const findMe=()=>{
    if(!navigator.geolocation){setLocationState("blocked");notify("Location is not available in this browser");return}
    setLocationState("finding");
    navigator.geolocation.getCurrentPosition(position=>{setUserCoords({latitude:position.coords.latitude,longitude:position.coords.longitude});setLocationState("found");notify("Showing the closest loaded restrooms")},()=>{setLocationState("blocked");notify("Allow location access to see nearby restrooms")},{enableHighAccuracy:true,timeout:8000});
  };
  const saveReport=async()=>{
    if(!firebaseUser){notify("Still connecting your account—please try again");return}
    try{await submitReview({stationId:String(selected.id),userId:firebaseUser.uid,cleanlinessRating:rating,checks})}catch{notify("Your report could not be submitted yet");return}
    const next=[{place:selected.name,rating,date:new Date().toISOString()},...reports];
    setReports(next);localStorage.setItem("rr-reports",JSON.stringify(next));setSubmitted(true);
  };
  const directions=()=>window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selected.name+" "+selected.address)}`,"_blank","noopener,noreferrer");

  const select=(p:Place)=>{setSelected(p);setPanel("none")};
  return <main className="app-shell">
    <header className="topbar">
      <button className="brand" onClick={()=>setPanel("none")}><span className="brandmark"><span>R</span><b>✓</b></span><span>Restroom <strong>Report</strong></span></button>
      <nav><button className="active">Explore</button><button onClick={()=>setPanel("reports")}>My reports <span className="report-count">{reports.length}</span></button><button className="avatar" aria-label="Account"><Icon name="user"/></button></nav>
    </header>

    <section className="map-area">
      <div className="map-grid"/><div className="river"/><div className="highway h1">I–44</div><div className="highway h2">MO–141</div>
      <div className="searchbox"><Icon name="search"/><input aria-label="Search places" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search restrooms, places or cities"/><kbd>⌘ K</kbd></div>
      <div className="filters">{["All","Gas station","Truck stop","Rest area","Fast food"].map(f=><button key={f} className={filter===f?"selected":""} onClick={()=>setFilter(f)}>{f}</button>)}</div>
      {filtered.map(p=><button key={p.id} aria-label={`${p.name}, score ${p.score??"unrated"}`} onClick={()=>select(p)} className={`pin ${p.color} ${selected.id===p.id?"chosen":""}`} style={{left:`${p.x}%`,top:`${p.y}%`}}><span>{p.score??"?"}</span><i/></button>)}
      <span className="you" style={{left:"52%",top:"58%"}}><i/></span>
      <button className={`locate ${locationState}`} aria-label="Find my location" onClick={findMe}><Icon name="locate"/></button>
      <button className="mobile-list" onClick={()=>setPanel("list")}><Icon name="list"/> {filtered.length} nearby</button>

      <aside className="place-card">
        <div className="card-head"><span className={`type-dot ${selected.color}`}/><span>{selected.type}</span><span className="fresh">Rated 18m ago</span></div>
        <div className="card-main"><div><h1>{selected.name}</h1><p>{selected.address}</p></div><div className={`score ${selected.score&&selected.score>=8?"great":""}`}><strong>{selected.score??"—"}</strong><span>{selected.reports?`${selected.reports} reports`:"Unrated"}</span></div></div>
        <div className="status-row"><span>● {selected.status}</span><span>{selected.detail}</span></div>
        <div className="actions"><button onClick={directions}><Icon name="route"/>Directions</button><button className="primary" onClick={()=>{setPanel("rate");setSubmitted(false);setRating(0);setChecks(new Set())}}><Icon name="star"/>Rate restroom</button></div>
      </aside>

      <button className="add-fab" onClick={()=>setPanel("add")}><Icon name="plus"/><span>Add a restroom</span></button>
      <div className="site-links"><span className={`cloud-state ${cloudReady?"ready":""}`}>● {cloudReady?"Cloud connected":"Connecting"}</span><Link href="/install">Install app</Link><Link href="/support">Support</Link><Link href="/privacy">Privacy</Link></div>
    </section>

    {panel!=="none"&&<div className="scrim" onMouseDown={()=>setPanel("none")}>
      <section className={`sheet ${panel}`} onMouseDown={e=>e.stopPropagation()}>
        <button className="sheet-close" aria-label="Close panel" onClick={()=>setPanel("none")}><Icon name="close"/></button>
        {panel==="list"&&<><p className="eyebrow">Nearby restrooms</p><h2>Places around you</h2><div className="place-list">{filtered.map(p=><button key={p.id} onClick={()=>select(p)}><span className={`mini-score ${p.color}`}>{p.score??"?"}</span><span><strong>{p.name}</strong><small>{p.type} • {p.address}</small></span><b>{p.reports} ›</b></button>)}</div></>}
        {panel==="reports"&&<><p className="eyebrow">Your contributions</p><h2>My reports</h2><p className="muted">Saved on this device until account sync is connected.</p>{reports.length===0?<div className="empty-state"><div>★</div><h3>No reports yet</h3><p>Rate your first restroom and help the next traveler know before they go.</p><button className="submit" onClick={()=>setPanel("none")}>Explore nearby</button></div>:<div className="report-list">{reports.map((r,i)=><article key={`${r.date}-${i}`}><span>{r.rating}.0</span><div><strong>{r.place}</strong><small>{new Date(r.date).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"})}</small></div><b>✓ Submitted</b></article>)}</div>}</>}
        {panel==="rate"&&!submitted&&<><p className="eyebrow">Help the next traveler</p><h2>How was {selected.name}?</h2><p className="muted">Your report takes less than 30 seconds.</p><label className="field-label">Overall cleanliness</label><div className="stars">{[1,2,3,4,5].map(n=><button key={n} aria-label={`${n} star${n===1?"":"s"}`} className={rating>=n?"on":""} onClick={()=>setRating(n)}><Icon name="star"/></button>)}</div><div className="quick-grid">{["Fresh smell","Toilet paper","Soap available","Sink working","Accessible","Felt safe"].map(x=><label key={x}><input type="checkbox" checked={checks.has(x)} onChange={()=>setChecks(current=>{const next=new Set(current);if(next.has(x))next.delete(x);else next.add(x);return next})}/><span>✓</span>{x}</label>)}</div><button disabled={!rating||!firebaseUser} className="submit" onClick={saveReport}>{firebaseUser?"Submit my report":"Connecting account…"}</button></>}
        {panel==="rate"&&submitted&&<div className="thanks"><div className="thanks-icon">✓</div><p className="eyebrow">Rating submitted</p><h2>You just helped everyone.</h2><p>Your report keeps Restroom Report useful, honest, and up to date.</p><button className="submit" onClick={()=>setPanel("none")}>Back to the map</button></div>}
        {panel==="add"&&<><p className="eyebrow">Missing a place?</p><h2>Add a restroom</h2><p className="muted">Search for a business or add the basic details. No restroom photos needed.</p><label className="form-label">Place name<input required placeholder="e.g. QuikTrip"/></label><label className="form-label">Address<input required placeholder="Street, city or landmark"/></label><label className="form-label">Place type<select><option>Gas station</option><option>Truck stop</option><option>Rest area</option><option>Fast food</option></select></label><button className="submit" onClick={()=>{setPanel("none");notify("Place saved for review")}}>Save place</button></>}
      </section>
    </div>}
    {toast&&<div className="toast" role="status">✓ {toast}</div>}
  </main>
}
