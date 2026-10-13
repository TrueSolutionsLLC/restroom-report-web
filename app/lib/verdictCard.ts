export async function createVerdictCard(frame: HTMLIFrameElement, gesture: string, title: string, line: string): Promise<File> {
 const nonce=crypto.randomUUID();
 const portrait=await new Promise<string>((resolve,reject)=>{
  const finish=(error?:Error,value?:string)=>{clearTimeout(timer);window.removeEventListener("message",receive);if(error)reject(error);else resolve(value!)};
  const receive=(event:MessageEvent)=>{if(event.source!==frame.contentWindow||event.data?.kind!=="mascotPortraitResult"||event.data.nonce!==nonce)return;const value=event.data.dataUrl;if(typeof value!=="string"||!value.startsWith("data:image/png;base64,")||value.length>4_000_000){finish(new Error("Card artwork unavailable"));return}finish(undefined,value)};
  const timer=setTimeout(()=>finish(new Error("Card artwork timed out")),3000);window.addEventListener("message",receive);frame.contentWindow?.postMessage({kind:"mascotPortrait",nonce,gesture},"*");
 });
 const image=await new Promise<HTMLImageElement>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error("Card artwork unavailable"));img.src=portrait});
 const canvas=document.createElement("canvas");canvas.width=800;canvas.height=1040;const c=canvas.getContext("2d");if(!c)throw new Error("Card unavailable");
 c.fillStyle="#e9efeb";c.fillRect(0,0,800,1040);c.fillStyle="#f7f9f4";c.beginPath();c.roundRect(32,32,736,976,40);c.fill();c.textAlign="center";c.fillStyle="#245f4e";c.font="700 24px -apple-system,BlinkMacSystemFont,sans-serif";c.fillText("THE BATHROOM DEBRIEF",400,92);
 const text=(value:string,size:number,weight:number,y:number,width:number,lineHeight:number)=>{c.font=`${weight} ${size}px -apple-system,BlinkMacSystemFont,sans-serif`;const rows:string[]=[];let row="";for(const word of value.split(/\s+/)){const next=row?row+" "+word:word;if(row&&c.measureText(next).width>width){rows.push(row);row=word}else row=next}if(row)rows.push(row);for(const r of rows){c.fillText(r,400,y);y+=lineHeight}};
 c.fillStyle="#132d34";text(title,52,800,168,660,62);c.drawImage(image,200,240,400,380);text(line,36,650,694,640,46);c.fillStyle="#245f4e";c.font="800 28px -apple-system,BlinkMacSystemFont,sans-serif";c.fillText("restroom report",400,935);c.font="400 20px -apple-system,BlinkMacSystemFont,sans-serif";c.fillText("restroom-report.com",400,970);
 const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error("Card unavailable")),"image/png"));return new File([blob],"restroom-report-verdict.png",{type:"image/png"});
}
