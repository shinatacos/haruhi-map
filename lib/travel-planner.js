(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.TravelPlanner=api;})(globalThis,()=>{
'use strict';
const minutes=time=>{if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time||''))throw Error('時刻はHH:MM');return +time.slice(0,2)*60+(+time.slice(3));};
const clock=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
function fare(base,pass,leg,date){
 if(base==null||!Number.isFinite(base)||base<0)return null;
 if(!pass||!pass.confirmed||!pass.source||!pass.legIds?.includes(leg)||date<pass.start||date>pass.end)return base;
 return 0;
}
// Candidates never move existing events. Unknown durations are excluded, never zero-filled.
function insertions(events,{stay,preferred,open,close,buffer},lookup){
 if(!Number.isFinite(stay)||stay<0||!Number.isFinite(buffer)||buffer<0)throw Error('滞在分・移動余裕分を入力してください');
 const out=[];
 for(let i=0;i<events.length-1;i++){
  const a=events[i],b=events[i+1];if(a.day!==b.day||a.stayMinutes==null||b.bufferMinutes==null)continue;
  const inbound=lookup(a.id,'new'),outbound=lookup('new',b.id),old=lookup(a.id,b.id);
  if(!inbound||!outbound)continue;
  const start=Math.max(minutes(a.time)+a.stayMinutes+Math.ceil(inbound.seconds/60)+buffer,preferred?minutes(preferred):0,open?minutes(open):0);
  const finish=start+stay,deadline=Math.min(minutes(b.time)-Math.ceil(outbound.seconds/60)-b.bufferMinutes,close?minutes(close):1440);
  if(finish>deadline||start>=1440)continue;
  out.push({after:a.id,before:b.id,time:clock(start),travelMinutes:Math.ceil((inbound.seconds+outbound.seconds)/60),deltaMinutes:old?Math.ceil((inbound.seconds+outbound.seconds-old.seconds)/60):null,
   fareDelta:old?.fare!=null&&inbound.fare!=null&&outbound.fare!=null?inbound.fare+outbound.fare-old.fare:null});
 }
 return out.sort((a,b)=>(a.deltaMinutes??Infinity)-(b.deltaMinutes??Infinity)||a.time.localeCompare(b.time));
}
return {minutes,clock,fare,insertions};
});
