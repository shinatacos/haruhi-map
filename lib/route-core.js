/* Route Notebook: reusable, data-independent URLs, ordering, KML and itinerary merge. */
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.RouteCore=api;})(typeof window==='undefined'?globalThis:window,()=>{
'use strict';
const modes={unspecified:'未指定',walking:'徒歩',transit:'公共交通',hankyu:'阪急',jr:'JR',hanshin:'阪神',subway:'地下鉄',bus:'バス',driving:'車',bicycling:'自転車'};
const copy=x=>JSON.parse(JSON.stringify(x));
const xml=x=>String(x??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const dayKey=d=>d.includes('-')?d:d.split('/').map(x=>x.padStart(2,'0')).join('/');
const ordered=events=>events.slice().sort((a,b)=>dayKey(a.day).localeCompare(dayKey(b.day))||a.time.localeCompare(b.time)||(Number.isFinite(a.order)&&Number.isFinite(b.order)?a.order-b.order:0)||a.id.localeCompare(b.id));
const routeOrdered=ordered;
const restricted=p=>/住宅|マンション|私有|撮影禁止|校地|学校/.test([p.name,p.rule,p.note,p.precision].join(' '));
const warning=p=>restricted(p)?'公道から参照する代表点。公道との座標照合は未検証。住宅・敷地内の撮影位置や立入許可を示しません。現地の撮影制限とプライバシーを優先してください。':p.precision!=='座標確認'?'概略・代表点。厳密な撮影地点ではありません。':'座標確認は撮影許可を意味しません。';
function mapsURL(action,params){const url=new URL('https://www.google.com/maps/'+action+'/');url.search=new URLSearchParams({api:'1',...params});if(url.href.length>2048)throw Error('Google Maps URLが長すぎます');return url.href;}
const coord=p=>`${p.lat},${p.lon}`;
const searchURL=p=>mapsURL('search',{query:restricted(p)?coord(p):[p.name,p.address].filter(Boolean).join(' ')});
function directionsURL(from,to,mode='walking'){if(!modes[mode])throw Error('未対応の移動手段');return mapsURL('dir',{origin:coord(from),destination:coord(to),...(mode==='unspecified'?{}:{travelmode:['walking','driving','bicycling'].includes(mode)?mode:'transit'})});}
function modeOf(e){if(e.travelMode)return e.travelMode;const c=e.category||'';if(/徒歩/.test(c))return 'walking';if(/バス/.test(c))return 'bus';if(/JR/.test(c))return 'jr';if(/阪急/.test(c))return 'hankyu';if(/阪神/.test(c))return 'hanshin';if(/地下鉄/.test(c))return 'subway';if(/鉄道|電車|列車/.test(c))return 'transit';return 'unspecified';}
function validate(data){
 rejectUnsafeKeys(data);
 if(!data||!Array.isArray(data.points)||!Array.isArray(data.events))throw Error('points / events 配列が必要です');
 const ids=new Set(),eids=new Set(),text=x=>typeof x==='string',unique=(id,set)=>{if(!text(id)||!id.trim()||set.has(id))throw Error('IDが空または重複しています');set.add(id);};
 for(const p of data.points){if(!p||typeof p!=='object')throw Error('不正な地点');unique(p.id,ids);if(!text(p.name)||!p.name.trim()||typeof p.lat!=='number'||!Number.isFinite(p.lat)||Math.abs(p.lat)>90||typeof p.lon!=='number'||!Number.isFinite(p.lon)||Math.abs(p.lon)>180)throw Error('地点名・座標が不正です');for(const k of ['area','works','category','days','precision','source','address','note','rule'])if(p[k]!=null&&!text(p[k]))throw Error('地点の文字列が不正です');}
 for(const e of data.events){if(!e||typeof e!=='object')throw Error('不正な予定');unique(e.id,eids);if(!text(e.plan)||!e.plan.trim()||!text(e.day)||!validDay(e.day)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(e.time)||!text(e.action)||!e.action.trim())throw Error('予定の日付・時刻・旅程・行動が不正です');if(e.pointId!=null&&e.pointId!==''&&!ids.has(e.pointId))throw Error('予定の地点IDが存在しません');if(e.order!=null&&(!Number.isFinite(e.order)||e.order<0))throw Error('順番は0以上の数値です');if(e.travelMode!=null&&!modes[e.travelMode])throw Error('移動手段が不正です');for(const k of ['category','note','source','confidence','status'])if(e[k]!=null&&!text(e[k]))throw Error('予定の文字列が不正です');if(['公式ダイヤ','実測'].includes(e.confidence)&&!e.source?.trim())throw Error('公式ダイヤ・実測には出典が必要です');}
 if(data.trips!=null){if(!Array.isArray(data.trips))throw Error('tripsは配列です');const tids=new Set();for(const t of data.trips){unique(t.id,tids);if(!text(t.title)||!t.title.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(t.startDate)||!validDay(t.startDate)||!/^\d{4}-\d{2}-\d{2}$/.test(t.endDate)||!validDay(t.endDate)||t.endDate<t.startDate||!Number.isFinite(t.budget)||t.budget<0)throw Error('旅行のタイトル・日程・予算が不正です');if(t.note!=null&&!text(t.note))throw Error('旅行メモが不正です');}for(const x of [...data.points,...data.events])if(x.tripId!=null&&!tids.has(x.tripId))throw Error('旅行IDが存在しません');}
 for(const p of data.points)if(p.photo!=null&&typeof p.photo!=='string')throw Error('写真URLが不正です');
 for(const e of data.events)for(const k of ['stayMinutes','cost'])if(e[k]!=null&&(!Number.isFinite(e[k])||e[k]<0))throw Error('滞在時間・費用は0以上の数値です');
 for(const p of data.points)if(p.photoPosition!=null&&typeof p.photoPosition!=='string')throw Error('撮影位置メモが不正です');
 for(const e of data.events){
  if(e.costKind!=null&&!['other','admission','lodging','transport'].includes(e.costKind))throw Error('費用区分が不正です');
  if(e.fixed!=null&&typeof e.fixed!=='boolean')throw Error('固定予定の指定が不正です');
  if(e.bufferMinutes!=null&&(!Number.isFinite(e.bufferMinutes)||e.bufferMinutes<0))throw Error('移動余裕は0以上の分数です');
  for(const key of ['openTime','closeTime'])if(e[key]!=null&&e[key]!==''&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(e[key]))throw Error('営業時間はHH:MMです');
  if(e.openTime&&e.closeTime&&e.openTime>e.closeTime)throw Error('日をまたぐ営業時間は別予定に分けてください');
 }
 if(data.travelPasses!=null){
  if(!Array.isArray(data.travelPasses))throw Error('パス台帳は配列です');const seen=new Set();
  for(const p of data.travelPasses){unique(p.id,seen);for(const k of ['name','coverage','source','tripId'])if(typeof p[k]!=='string'||!p[k].trim())throw Error('パスの名称・区間・出典・旅行IDが必要です');
   if(!/^\d{4}-\d{2}-\d{2}$/.test(p.start)||!validDay(p.start)||!/^\d{4}-\d{2}-\d{2}$/.test(p.end)||!validDay(p.end)||p.start>p.end)throw Error('パスの有効日が不正です');
   if(p.price!=null&&(!Number.isSafeInteger(p.price)||p.price<0))throw Error('パス購入額が不正です');
   if(data.trips&&!data.trips.some(t=>t.id===p.tripId))throw Error('パスの旅行IDが存在しません');
  }
 }
 if(data.routeFares!=null){if(typeof data.routeFares!=='object'||Array.isArray(data.routeFares))throw Error('区間運賃の形式が不正です');
  for(const f of Object.values(data.routeFares)){if(!f||typeof f!=='object'||(f.base!=null&&(!Number.isSafeInteger(f.base)||f.base<0))||typeof f.source!=='string'||typeof f.passId!=='string'||typeof f.covered!=='boolean')throw Error('運賃・適用条件・出典が不正です');}
 }
 if(data.trips && !data.trips.length)throw Error('旅行を1件以上登録してください');
 for(const x of [...data.points,...data.events]){
  if(x.tripId!=null && typeof x.tripId!=='string')throw Error('旅行IDは文字列です');
  if(data.trips && !data.trips.some(t=>t.id===(x.tripId||'legacy')))throw Error('所属旅行が存在しません');
 }
 for(const e of data.events){
  const p=data.points.find(p=>p.id===e.pointId);
  if(p && (p.tripId||'legacy')!==(e.tripId||'legacy'))throw Error('別旅行の地点は参照できません');
 }
 return true;
}
function validDay(day){if(typeof day!=='string')return false;const m=/^(?:(\d{4})-(\d{2})-(\d{2})|(\d{1,2})\/(\d{1,2}))$/.exec(day);if(!m)return false;const y=+(m[1]||2000),month=+(m[2]||m[4]),d=+(m[3]||m[5]),date=new Date(Date.UTC(y,month-1,d));return date.getUTCFullYear()===y&&date.getUTCMonth()===month-1&&date.getUTCDate()===d;}
function mergeItinerary(db,patch){
 if(patch?.kind!=='route-notebook-itinerary'||patch.version!==1||!Array.isArray(patch.points)||!Array.isArray(patch.events))throw Error('旅程JSONは kind: route-notebook-itinerary / version: 1 / points / events が必要です');
 rejectUnsafeKeys(patch);
 const out=copy(db);
 if(patch.trips!=null){if(!Array.isArray(patch.trips))throw Error('tripsは配列です');const seen=new Set();out.trips=out.trips||[];for(const t of patch.trips){if(!t||typeof t.id!=='string'||seen.has(t.id))throw Error('旅行IDが不正・重複しています');seen.add(t.id);const index=out.trips.findIndex(x=>x.id===t.id);if(index<0)out.trips.push(copy(t));else out.trips[index]={...out.trips[index],...copy(t)};}}
 for(const [key,defaults] of [['points',{area:'',works:'',category:'地点',days:'',precision:'手動追加（未検証）',source:'',address:'',note:'',rule:'現地ルールを確認',visited:false}],['events',{pointId:null,confidence:'計画',note:'',category:'予定',status:'未訪問',travelMode:'unspecified',order:out.events.length}]]){
  const seen=new Set();for(const row of patch[key]){if(!row||typeof row.id!=='string'||seen.has(row.id))throw Error('差分のIDが不正・重複しています');seen.add(row.id);const index=out[key].findIndex(x=>x.id===row.id);if(index<0)out[key].push({...defaults,...copy(row)});else {const merged={...out[key][index],...copy(row)};if(key==='points'&&(merged.lat!==out[key][index].lat||merged.lon!==out[key][index].lon))merged.precision='手動調整（未検証）';if(key==='events'&&(merged.time!==out[key][index].time||merged.day!==out[key][index].day)&&!Object.hasOwn(row,'confidence'))merged.confidence='要確認';out[key][index]=merged;}}
 }
 validate(out);return out;
}
function rejectUnsafeKeys(value){
 if(!value||typeof value!=='object')return;
 for(const key of Object.keys(value)){if(['__proto__','constructor','prototype'].includes(key))throw Error('予約されたキーは使用できません');rejectUnsafeKeys(value[key]);}
}
function changes(before,after){
 const out=[];
 for(const key of ['trips','points','events']){
  const old=new Map((before[key]||[]).map(x=>[x.id,x])),next=new Map((after[key]||[]).map(x=>[x.id,x]));
  for(const id of new Set([...old.keys(),...next.keys()])){
   const a=old.get(id),b=next.get(id);
   if(JSON.stringify(a)!==JSON.stringify(b))out.push({key,id,before:a,after:b,type:!a?'追加':!b?'削除':'競合・更新'});
  }
 }
 return out;
}
function segments(db,events){const points=new Map(db.points.map(p=>[p.id,p]));const last=new Map(),out=[];for(const e of routeOrdered(events)){const p=points.get(e.pointId);if(!p)continue;const key=(e.tripId||'legacy')+'\n'+e.plan+'\n'+e.day;const prev=last.get(key);if(prev&&prev.point.id!==p.id)out.push({from:prev.point,to:p,event:e,previous:prev.event,mode:modeOf(e)});last.set(key,{point:p,event:e});}return out;}
function groups(db,by,plan){if(by==='work')return [...new Set(db.points.map(p=>p.works||'未分類'))].sort();return [...new Set(db.events.filter(e=>!plan||e.plan===plan).map(e=>e.day))].sort((a,b)=>dayKey(a).localeCompare(dayKey(b)));}
function kml(db,{by='day',plan=null,group='all'}={}){
 validate(db);if(!['day','work'].includes(by))throw Error('KML分類が不正です');
 const events=db.events.filter(e=>!plan||e.plan===plan),routes=segments(db,events),keys=group==='all'?groups(db,by,plan):[group];
 const data=obj=>'<ExtendedData>'+Object.entries(obj).map(([k,v])=>`<Data name="${xml(k)}"><value>${xml(v)}</value></Data>`).join('')+'</ExtendedData>';
 const pointPlacemark=(p,label)=>`<Placemark><name>${xml(label+' | '+p.name)}</name><description>${xml([p.works,p.precision,warning(p),p.rule,p.note,p.source].filter(Boolean).join(' / '))}</description>${data({pointId:p.id,group:label,work:p.works||'',precision:p.precision||''})}<Point><coordinates>${p.lon},${p.lat},0</coordinates></Point></Placemark>`;
 const folders=keys.map(key=>{const ev=events.filter(e=>e.day===key),ids=new Set(ev.map(e=>e.pointId));const pts=db.points.filter(p=>by==='work'?(p.works||'未分類')===key:ids.has(p.id)||(!events.some(e=>e.pointId===p.id)&&(p.days||'').split(',').includes(key)));
 const selected=new Set(pts.map(p=>p.id));const lines=routes.filter(r=>(by==='work'?true:r.event.day===key)&&selected.has(r.from.id)&&selected.has(r.to.id));
 return `<Folder><name>${xml(key)}</name>${pts.map(p=>pointPlacemark(p,key)).join('')}</Folder>`;
 }).join('');
 const unassigned=by==='day'&&group==='all'?db.points.filter(p=>!events.some(e=>e.pointId===p.id)&&!(p.days||'').split(',').some(d=>keys.includes(d))):[];
 const result=`<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Route Notebook</name><Style id="straight"><LineStyle><color>aaaf5470</color><width>3</width></LineStyle></Style>${folders}${unassigned.length?'<Folder><name>日付未割当</name>'+unassigned.map(p=>pointPlacemark(p,'日付未割当')).join('')+'</Folder>':''}</Document></kml>`;
 if(new TextEncoder().encode(result).length>5*1024*1024)throw Error('KMLが5MBを超えます。分類を分けてください');return result;
}
return {modes,modeOf,ordered,restricted,warning,searchURL,directionsURL,validate,mergeItinerary,segments,groups,kml,validDay,changes};
});
