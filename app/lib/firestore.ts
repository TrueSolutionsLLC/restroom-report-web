import { addDoc, collection, limit, onSnapshot, query, serverTimestamp } from "firebase/firestore";
import { onAuthStateChanged, signInAnonymously, type User } from "firebase/auth";
import { auth, db } from "./firebase";

export type LivePlace = { id:string; name:string; type:string; address:string; score:number|null; reports:number; color:string; x:number; y:number; latitude:number; longitude:number; status:string; detail:string };

const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value));
const displayType=(raw:string)=>({gasStation:"Gas station",travelCenter:"Truck stop",truckStop:"Truck stop",restArea:"Rest area",fastFood:"Fast food"}[raw]??"Gas station");
const colorFor=(type:string)=>({"Gas station":"blue","Truck stop":"orange","Rest area":"teal","Fast food":"rose"}[type]??"blue");

export function subscribeToStations(onPlaces:(places:LivePlace[])=>void,onError:(error:Error)=>void){
  const stationsQuery=query(collection(db,"stations"),limit(250));
  return onSnapshot(stationsQuery,snapshot=>{
    const mapped=snapshot.docs.map(doc=>{
      const data=doc.data();
      const type=displayType(String(data.stationType??data.locationType??"gasStation"));
      const latitude=Number(data.latitude??37);
      const longitude=Number(data.longitude??-92);
      const reviewCount=Number(data.reviewCount??0);
      const score=reviewCount>0?Math.round(Number(data.cleanScore??0)*10)/10:null;
      return {id:doc.id,name:String(data.name??data.brand??"Restroom"),type,address:String(data.address??[data.city,data.state].filter(Boolean).join(", ")??""),score,reports:reviewCount,color:colorFor(type),x:clamp(10+((longitude+125)/59)*80,8,92),y:clamp(13+((50-latitude)/26)*72,12,85),latitude,longitude,status:String(data.restroomStatus&&data.restroomStatus!=="unknown"?data.restroomStatus:"Status not confirmed"),detail:[data.restroomLayoutType,data.restroomAccessType].filter((v)=>v&&v!=="unknown").join(" • ")||"Community-supplied location"};
    });
    onPlaces(mapped);
  },error=>onError(error));
}

export function ensureAnonymousUser(onUser:(user:User)=>void,onError:(error:Error)=>void){
  const unsubscribe=onAuthStateChanged(auth,user=>{
    if(user) onUser(user);
    else signInAnonymously(auth).catch(onError);
  },onError);
  return unsubscribe;
}

export async function submitReview(input:{stationId:string;userId:string;cleanlinessRating:number;checks:Set<string>}){
  const has=(label:string)=>input.checks.has(label);
  await addDoc(collection(db,"reviews"),{
    stationId:input.stationId,userId:input.userId,cleanlinessRating:input.cleanlinessRating,
    odorRating:has("Fresh smell")?5:3,accessibilityAvailable:has("Accessible"),babyChangingAvailable:has("Changing table"),
    sinkWorking:has("Sink working"),soapAvailable:has("Soap available"),toiletPaperAvailable:has("Toilet paper"),
    feltSafe:has("Felt safe"),crowdLevel:"unknown",comment:"",photoURLs:[],createdAt:serverTimestamp(),
  });
}
