"use client";
import { useEffect, useRef, useState } from "react";
import TravelCompanion, { COMPANION, type CompanionMoment } from "./TravelCompanion";
import { savedReviewDebrief } from "../lib/companion";
export default function ReviewDebrief({rating, odor, answers, enabled}: {rating:number; odor:number; answers:Record<string,boolean|null>; enabled:boolean}) {
 const verdict=savedReviewDebrief(rating,odor,answers);
 const [moment,setMoment]=useState<CompanionMoment>(verdict.moment);
 const [reaction,setReaction]=useState(0);
 const [playing,setPlaying]=useState(false);
 const [shareError,setShareError]=useState("");
 const timers=useRef<ReturnType<typeof setTimeout>[]>([]);
 const stop=()=>{timers.current.forEach(clearTimeout);timers.current=[];setPlaying(false)};
 useEffect(()=>()=>{timers.current.forEach(clearTimeout)},[]);
 useEffect(()=>{if(!enabled){timers.current.forEach(clearTimeout);timers.current=[]}},[enabled]);
 const react=(next:CompanionMoment)=>{setMoment(next);setReaction(value=>value+1)};
 const play=()=>{stop();if(!enabled)return;if(matchMedia("(prefers-reduced-motion: reduce)").matches){react(verdict.moment);return}
  const beats:CompanionMoment[]=[];
  if(answers.soap===false)beats.push({gesture:"offer",lines:["A handshake? Let me check the soap situation."]},COMPANION.soapNone);else if(answers.soap===true)beats.push(COMPANION.soapYes);
  if(answers.paper===false)beats.push(COMPANION.paperNone);else if(answers.paper===true)beats.push(COMPANION.paperYes);
  beats.push(odor<=2?COMPANION.smellBad:verdict.moment);
  setPlaying(true);beats.forEach((beat,index)=>{if(!index)react(beat);else timers.current.push(setTimeout(()=>react(beat),index*2800))});timers.current.push(setTimeout(()=>{stop();react(verdict.moment)},beats.length*2800));
 };
 const share=async()=>{setShareError("");stop();const text=`${verdict.title}\n${verdict.line}\n— restroom report`;if(!navigator.share){setShareError("Sharing isn’t supported in this browser. You can copy the verdict below.");return}try{await navigator.share({text})}catch(error){if(!(error instanceof DOMException&&error.name==="AbortError"))setShareError("Sharing couldn’t open. You can copy the verdict below.")}};
 return <section className="review-debrief" aria-label="Saved review debrief">
  {enabled&&<TravelCompanion enabled moment={moment} reactionID={reaction}/>}
  <div className="review-debrief-card"><p className="eyebrow">Your report is saved</p><h2>{enabled?verdict.title:"You helped the next traveler."}</h2><p>{enabled?verdict.line:"Thanks for sharing what you found."}</p><small>restroom report</small></div>
  {enabled&&<><div className="review-debrief-actions"><button className="text-button" onClick={play}>{playing?"Replay":"Play his story"}</button>{playing&&<button className="text-button" onClick={()=>{stop();react(verdict.moment)}}>Stop</button>}<button className="text-button" onClick={share}>Share verdict</button></div><p className="muted">Sharing includes only the funny verdict. No name, location, or review details.</p>{shareError&&<div role="status"><p>{shareError}</p><p>{verdict.title} — {verdict.line} — restroom report</p></div>}</>}
 </section>;
}
