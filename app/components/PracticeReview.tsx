"use client";
import { useState } from "react";
import GuidedReviewForm from "./GuidedReviewForm";
import ReviewDebrief from "./ReviewDebrief";
import TravelCompanion, {COMPANION,type CompanionMoment} from "./TravelCompanion";
import { type CrowdLevel } from "../lib/reviewContract";
export default function PracticeReview({enabled,onClose}:{enabled:boolean;onClose:()=>void}){
 const [rating,setRating]=useState(0),[odor,setOdor]=useState(0),[comment,setComment]=useState("");const [answers,setAnswers]=useState<Record<string,boolean|null>>({paper:null,soap:null,sink:null,safe:null,accessible:null,changingTable:null});const [crowd,setCrowd]=useState<CrowdLevel>("light");const [moment,setMoment]=useState<CompanionMoment>(COMPANION.welcome);const [reaction,setReaction]=useState(0),[seed,setSeed]=useState(0),[submitted,setSubmitted]=useState(false);
 const react=(m:CompanionMoment)=>{setMoment(m);setReaction(n=>n+1)};const preset=(good:boolean)=>{setRating(good?5:1);setOdor(good?5:1);setAnswers({paper:good,soap:good,sink:true,safe:true,accessible:false,changingTable:false});setComment("");setSubmitted(false);setSeed(n=>n+1);react(good?COMPANION.cleanGood:COMPANION.nearby)};
 const complete=rating>0&&odor>0&&Object.values(answers).every(v=>typeof v==="boolean");
 return <section className="practice-review"><button className="sheet-back" onClick={onClose}>Back to your sidekick</button><p className="eyebrow">Practice only · Nothing is posted</p><p className="muted">Try the same review cards without location access or changes to your profile.</p><div className="sidekick-situations"><button onClick={()=>preset(true)}>The royal treatment</button><button onClick={()=>preset(false)}>The disaster</button></div>{submitted?<ReviewDebrief key={`${seed}-${enabled}`} rating={rating} odor={odor} answers={answers} enabled={enabled} practice/>:<><TravelCompanion moment={moment} reactionID={reaction} enabled={enabled}/><GuidedReviewForm key={seed} practice rating={rating} odor={odor} answers={answers} crowd={crowd} comment={comment} busy={false} error="" complete={complete} star="★" onRating={setRating} onOdor={setOdor} onAnswer={(k,v)=>setAnswers(a=>({...a,[k]:v}))} onCrowd={setCrowd} onComment={setComment} onReact={react} onSubmit={()=>{if(complete)setSubmitted(true)}}/></>}</section>
}
