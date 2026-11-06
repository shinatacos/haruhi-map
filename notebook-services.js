/* Optional network services. No credentials, paid APIs, or demo routers enabled by default. */
(() => {
'use strict';
const N=window.RouteNotebook,C=window.RouteCore,E=window.RouteEngine,$=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=x=>JSON.parse(JSON.stringify(x));
const store='route-notebook-services:v1';let config={};try{config=JSON.parse(localStorage.getItem(store)||'{}');}catch(_){}
let generation=0,timer,abort,rows=[],cache=new Map(),choices=new Map();
const box=document.createElement('div');box.className='service-settings';box.innerHTML=`<details><summary>実経路・Google同期設定</summary>
<p>外部設定なしでも編集・JSON保存は使えます。接続すると地点・日時が指定サーバーへ送信されます。</p>
<label>自己管理Valhalla URL<input id="serviceEndpoint" type="url" placeholder="https://router.example.org"></label>
<label><input id="serviceConsent" type="checkbox">管理権限または継続利用許諾のあるサーバーです</label>
<button id="serviceApply" class="btn">経路接続を保存</button><button id="serviceRetry" class="btn">再取得</button>
<label>Firebase Web設定JSON（この端末だけに保存）<textarea id="firebaseConfig" rows="4" placeholder='{"apiKey":"...","authDomain":"...","projectId":"...","appId":"..."}'></textarea></label>
<button id="googleLogin" class="btn">Googleログイン</button><button id="googleLogout" class="btn" disabled>ログアウト</button>
<button id="cloudUpload" class="btn" disabled>この端末をクラウドへ保存</button><button id="cloudDownload" class="btn" disabled>クラウドを取り込む</button>
<label><input id="autoSync" type="checkbox">ログイン中の変更を自動同期（競合時は停止）</label><p id="authStatus" role="status">未接続・端末内保存</p></details>
<p id="routingStatus" role="status"></p><div id="actualRoutes"></div>`;
$('routesPanel').insertBefore(box,$('routeList'));
$('serviceEndpoint').value=config.endpoint||'';$('serviceConsent').checked=!!config.consent;
$('firebaseConfig').value=config.firebase?JSON.stringify(config.firebase,null,2):'';
function persist(){localStorage.setItem(store,JSON.stringify(config));}
function selection(){const db=N.getSnapshot(),s=db.selection;return {db,segments:C.segments(db,db.events.filter(e=>(e.tripId||'legacy')===s.tripId&&e.plan===s.plan&&(s.day==='all'||e.day===s.day))),year:db.trips.find(t=>t.id===s.tripId).startDate.slice(0,4)};}
const keyOf=(r,year)=>JSON.stringify([config.endpoint,r.previous.id,r.event.id,r.event.tripId||'legacy',r.from.lat,r.from.lon,r.to.lat,r.to.lon,r.mode,r.previous.day,r.previous.time,r.previous.stayMinutes,r.event.day,r.event.time,year]);
window.RouteActual=Object.freeze({getRows:()=>rows.map(r=>({...r,chosen:choices.get(r.key)||0})),choose:(key,index)=>{const row=rows.find(r=>r.key===key);if(!row?.routes?.[index])return;choices.set(key,index);show();}});
function show(){
 for(const row of rows)if(row.routes&&!row.routes[choices.get(row.key)||0])choices.delete(row.key);
 N.drawRoutes(rows.filter(r=>r.routes).map(r=>r.routes[choices.get(r.key)||0]));
 $('actualRoutes').innerHTML=rows.map((r,i)=>`<article class="route-card"><h3>${esc(r.segment.event.day)} ${esc(r.segment.from.name)} → ${esc(r.segment.to.name)}</h3><p>${r.segment.previous.stayMinutes==null?'出発時刻未指定（距離・経路形状の検索）':'予定出発時刻で検索（公式ダイヤ未確認）'} · 登録手段：${esc(C.modes[r.segment.mode])}（公共交通の路線限定検索は未対応）</p>${r.routes?`<label>取得候補<select data-route-choice="${i}">${r.routes.map((v,j)=>`<option value="${j}" ${(choices.get(r.key)||0)===j?'selected':''}>候補${j+1} · ${Math.ceil(v.seconds/60)}分 · ${v.km.toFixed(2)}km · 乗換${v.transfers==null?'未確認':v.transfers+'回'} · 運賃未確認</option>`).join('')}</select></label><details><summary>案内（計画・要確認）</summary>${r.routes[choices.get(r.key)||0].steps.map(s=>`<p>${esc(s)}</p>`).join('')}</details>`:`<p>${esc(r.error||'取得待ち')}</p>`}</article>`).join('');
 window.dispatchEvent(new Event('notebook-routes'));
}
$('actualRoutes').onchange=e=>{const i=e.target.dataset.routeChoice;if(i!=null){choices.set(rows[i].key,+e.target.value);show();}};
async function calculate(){
 const gen=++generation;abort?.abort();abort=new AbortController();const signal=abort.signal,{segments,year}=selection();
 rows=segments.map(segment=>({segment,key:keyOf(segment,year)}));show();
 if(!config.endpoint||!config.consent){for(const row of rows)row.error='経路未接続';show();$('routingStatus').textContent=`実経路未取得：${rows.length}区間。自己管理Valhallaを設定してください。移動手段未指定・地点未割当も編集が必要です。`;return;}
 let url;try{url=E.endpoint(config.endpoint);}catch(e){$('routingStatus').textContent=e.message;return;}
 for(let i=0;i<rows.length;i++){
  if(gen!==generation)return;const row=rows[i];$('routingStatus').textContent=`実経路を取得中 ${i+1}/${rows.length}（1件ずつ送信）`;
  try{
   if(cache.has(row.key))row.routes=cache.get(row.key);
   else{const body=E.request(row.segment,year),timeout=AbortSignal.timeout(20000);const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.any([signal,timeout]),credentials:'omit'});
    if(!response.ok)throw Error('経路サーバー HTTP '+response.status);const data=await response.json();if(gen!==generation)return;
    row.routes=E.parse(data,row.segment.mode);cache.set(row.key,row.routes);if(cache.size>500)cache.delete(cache.keys().next().value);
   }
  }catch(e){if(gen!==generation)return;row.error='未取得：'+e.message;}
  show();
 }
 if(gen===generation)$('routingStatus').textContent=`取得 ${rows.filter(r=>r.routes).length}/${rows.length}区間。運賃・公式ダイヤは未確認。緑＝徒歩／紫＝鉄道／橙＝バス。`;
}
function refresh(){++generation;abort?.abort();N.drawRoutes([]);$('routingStatus').textContent='経路再計算待ち…';clearTimeout(timer);timer=setTimeout(calculate,400);}
window.addEventListener('notebook-change',refresh);
$('serviceApply').onclick=()=>{try{const value=$('serviceEndpoint').value.trim();if(value)E.endpoint(value);config.endpoint=value;config.consent=$('serviceConsent').checked;persist();cache.clear();refresh();}catch(e){$('routingStatus').textContent=e.message;}};
$('serviceRetry').onclick=()=>{cache.clear();refresh();};

// Conservative insertion: existing appointment times are never shifted.
const planner=document.createElement('details');planner.className='service-settings';planner.innerHTML=`<summary>空き時間への予定挿入</summary><p>選択中の1日を対象に、隣り合う予定の間を比較します。滞在分・乗換余裕分・実経路が不明な候補は提示しません。営業時間・予約条件は入力値のみを使います。</p>
<label>地点<select id="insertPoint"></select></label><label>行動<input id="insertAction" value="追加訪問"></label>
<label>希望時刻（これ以降）<input id="insertTime" type="time"></label><label>滞在分<input id="insertStay" type="number" min="0"></label>
<label>移動余裕分<input id="insertBuffer" type="number" min="0"></label><label>営業開始<input id="insertOpen" type="time"></label><label>営業終了<input id="insertClose" type="time"></label>
<label>移動手段<select id="insertMode"><option value="walking">徒歩</option><option value="transit">鉄道・バス</option></select></label>
<button id="insertCalculate" class="btn">挿入候補を計算</button><div id="insertResults" role="status"></div>`;
$('routesPanel').append(planner);
function plannerPoints(){const db=N.getSnapshot(),current=$('insertPoint').value;$('insertPoint').innerHTML=db.points.filter(p=>(p.tripId||'legacy')===db.selection.tripId).map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');if([...$('insertPoint').options].some(o=>o.value===current))$('insertPoint').value=current;}
window.addEventListener('notebook-change',plannerPoints);plannerPoints();
let insertResults=[],insertSnapshot,insertParams;
$('insertCalculate').onclick=async()=>{
 const result=$('insertResults');result.textContent='計算中…';$('insertCalculate').disabled=true;
 try{
  const {db,year}=selection(),sel=db.selection;if(sel.day==='all')throw Error('日付を1日選択してください');if(!config.endpoint||!config.consent)throw Error('自己管理Valhalla接続が必要です');
  const url=E.endpoint(config.endpoint),p=db.points.find(p=>p.id===$('insertPoint').value);if(!p)throw Error('地点を指定してください');
  const es=C.ordered(db.events.filter(e=>(e.tripId||'legacy')===sel.tripId&&e.plan===sel.plan&&e.day===sel.day));
  for(const id of ['insertStay','insertBuffer'])if($(id).value==='')throw Error('滞在分・移動余裕分を入力してください');
  const params={stay:+$('insertStay').value,buffer:+$('insertBuffer').value,preferred:$('insertTime').value,open:$('insertOpen').value,close:$('insertClose').value};
  const table=new Map(),snapshot=JSON.stringify(db),mode=$('insertMode').value;
  async function edge(a,b,at){
   const from=db.points.find(p=>p.id===a.pointId),to=b.id==='new'?p:db.points.find(p=>p.id===b.pointId);if(!from||!to)return;
   const previous={...a,...(at?{time:at}:{} )},r={from,to,previous,event:b,mode};
   try{const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(E.request(r,year)),signal:AbortSignal.timeout(20000),credentials:'omit'});if(!response.ok)return;const routes=E.parse(await response.json(),mode);table.set(a.id+'|'+b.id,routes[0]);}catch(_){}
  }
  for(let i=0;i<es.length-1;i++){
   const a=es[i],b=es[i+1];if(a.stayMinutes==null||b.bufferMinutes==null||!a.pointId||!b.pointId)continue;
   const fresh={id:'new',pointId:p.id,day:a.day,time:a.time,stayMinutes:params.stay};
   await edge(a,fresh);const inbound=table.get(a.id+'|new');if(!inbound)continue;
   const start=Math.max(TravelPlanner.minutes(a.time)+a.stayMinutes+Math.ceil(inbound.seconds/60)+params.buffer,params.preferred?TravelPlanner.minutes(params.preferred):0,params.open?TravelPlanner.minutes(params.open):0);if(start>=1440)continue;
   fresh.time=TravelPlanner.clock(start);await edge(fresh,b);
   // Compare with the selected actual direct route only, never invent baseline costs/time.
   const direct=rows.find(r=>r.segment.previous.id===a.id&&r.segment.event.id===b.id);if(direct?.routes)table.set(a.id+'|'+b.id,direct.routes[choices.get(direct.key)||0]);
  }
  if(JSON.stringify(N.getSnapshot())!==snapshot)throw Error('計算中に旅程が変更されました。再計算してください');
  insertResults=TravelPlanner.insertions(es,params,(a,b)=>table.get(a+'|'+b));insertSnapshot=snapshot;insertParams={...params,mode,pointId:p.id,action:$('insertAction').value.trim()||'追加訪問'};
  result.innerHTML=insertResults.map((r,i)=>`<p>${esc(r.time)} · 移動${r.travelMinutes}分 · 変更${r.deltaMinutes==null?'未確認':r.deltaMinutes+'分'} · 料金差未確認 <button class="btn" data-insert="${i}">この位置へ追加</button></p>`).join('')||'条件を満たす候補を取得できませんでした。滞在・移動余裕・営業時間・経路提供地域を確認してください。';
 }catch(e){result.textContent=e.message;}finally{$('insertCalculate').disabled=false;}
};
$('insertResults').onclick=e=>{const i=e.target.dataset.insert;if(i==null)return;try{const db=N.getSnapshot();if(JSON.stringify(db)!==insertSnapshot)throw Error('旅程が変更されました。再計算してください');const r=insertResults[+i],v=insertParams;delete db.selection;
 const selected=JSON.parse(insertSnapshot).selection;db.events.push({id:'event_'+crypto.randomUUID(),tripId:selected.tripId,plan:selected.plan,day:selected.day,time:r.time,action:v.action,pointId:v.pointId,stayMinutes:v.stay,bufferMinutes:v.buffer,travelMode:v.mode,openTime:v.open,closeTime:v.close,fixed:false,confidence:'計画',note:'空き時間挿入候補。営業時間・公式時刻表・運賃は要確認',order:db.events.length});N.applySnapshot(db);$('insertResults').textContent='予定を追加しました。既存予定の時刻は保持しています。';}catch(e){$('insertResults').textContent=e.message;}};

// Firebase uses official SDK modules only after explicit configuration/login.
 let auth,fs,sdk,user,revision=null,syncTimer,busy=false,unsubscribe;
const authStatus=message=>$('authStatus').textContent=message;
function payload(){const out=clone(N.getSnapshot());delete out.selection;return out;}
function docRef(){if(!user)throw Error('Googleログインが必要です');return sdk.doc(fs,'users',user.uid,'notebooks','main');}
async function connect(){
 if(auth)return;
 const cfg=JSON.parse($('firebaseConfig').value);for(const k of ['apiKey','authDomain','projectId','appId'])if(typeof cfg[k]!=='string'||!cfg[k].trim())throw Error('Firebase設定が不足：'+k);
 const [a,b,c]=await Promise.all([import('https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js'),import('https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js'),import('https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js')]);
 const app=a.initializeApp(cfg,'route-notebook');auth=b.getAuth(app);fs=c.getFirestore(app);sdk={...b,...c};config.firebase=cfg;persist();
 b.onAuthStateChanged(auth,async value=>{unsubscribe?.();clearTimeout(syncTimer);$('autoSync').checked=false;user=value;revision=null;for(const id of ['googleLogout','cloudUpload','cloudDownload'])$(id).disabled=!value;
  if(!value){$('autoSync').checked=false;authStatus('ログアウト・端末内保存');return;}
  authStatus('ログイン済み：'+(value.email||value.uid)+'。最初にクラウド取込または明示保存してください。');
  unsubscribe=c.onSnapshot(docRef(),snap=>{if(user?.uid!==value.uid)return;if(snap.exists()&&snap.data().revision!==revision)authStatus('クラウドに保存データがあります。全旅行JSONで端末を退避してから「クラウドを取り込む」で同期してください。');},e=>{if(user?.uid===value.uid)authStatus('クラウド監視エラー：'+e.message);});
 });
}
$('googleLogin').onclick=async()=>{try{authStatus('認証中…');await connect();await sdk.signInWithPopup(auth,new sdk.GoogleAuthProvider());}catch(e){authStatus('認証エラー：'+e.message+'。端末内編集は継続できます。');}};
$('googleLogout').onclick=async()=>{try{clearTimeout(syncTimer);await sdk.signOut(auth);}catch(e){authStatus('ログアウトエラー：'+e.message);}};
async function upload(manual=false){
 if(busy)return;busy=true;
 let sent=null,ownerUid=null;
 try{
  const ref=docRef(),data=payload(),json=JSON.stringify(data),uid=user.uid,expected=revision;sent=json;ownerUid=uid;
  if(new TextEncoder().encode(json).length>850000)throw Error('保存上限850KB超過。JSONでバックアップしてください');
  const newRevision=crypto.randomUUID();await sdk.runTransaction(fs,async tx=>{const snap=await tx.get(ref);if(!user||user.uid!==uid)throw Error('認証が変更されました');
   const remote=snap.exists()?snap.data():null;
   if(remote&&remote.revision!==expected)throw Error('競合：クラウドを取り込む前に全旅行JSONを書き出してください。自動上書きはしません');
   if(!manual&&revision===null)throw Error('最初の同期は明示保存または取込が必要です');
   tx.set(ref,{json,revision:newRevision,updatedAt:sdk.serverTimestamp()});
  });if(!user||user.uid!==uid)return;revision=newRevision;authStatus('クラウド保存済み '+new Date().toLocaleTimeString('ja-JP'));
 }catch(e){$('autoSync').checked=false;authStatus('同期停止：'+e.message);}finally{busy=false;if(user?.uid===ownerUid&&$('autoSync').checked&&JSON.stringify(payload())!==sent){clearTimeout(syncTimer);syncTimer=setTimeout(()=>upload(false),2000);}}
}
$('cloudUpload').onclick=()=>upload(true);
$('cloudDownload').onclick=async()=>{try{
 const before=JSON.stringify(payload()),uid=user?.uid,snap=await sdk.getDoc(docRef());if(!user||user.uid!==uid)throw Error('認証が変更されました');if(!snap.exists())throw Error('クラウド保存がありません');
 if(before!==JSON.stringify(payload()))throw Error('取得中に端末が変更されました。再度取り込んでください');
 const remote=snap.data(),data=JSON.parse(remote.json);C.validate(data);
 // Explicit import action; applySnapshot always backs up the full local document first.
 N.applySnapshot(data);revision=remote.revision;authStatus('クラウドを取り込みました。直前の端末データは置換前バックアップ・Undoで復元できます。');
 }catch(e){authStatus('取込エラー：'+e.message);}};
window.addEventListener('notebook-saved',()=>{clearTimeout(syncTimer);if(user&&$('autoSync').checked)syncTimer=setTimeout(()=>upload(false),2000);});
$('autoSync').onchange=()=>{if($('autoSync').checked&&(!user||revision===null)){$('autoSync').checked=false;authStatus('ログイン後、最初に明示保存または取込を行ってください');}};
refresh();
})();
