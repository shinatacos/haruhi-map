/* 巡礼マップエディター / framework-free, no backend required.
 * Codex: edit data/points.json and data/schedule.json, then run tools/build_seed.py.
 */
(() => {
'use strict';
const KEY = 'haruhi-pilgrimage-map:v1';
const seed = window.HARUHI_SEED;
if (!seed || !Array.isArray(seed.points) || !Array.isArray(seed.events)) {
  alert('初期データが読み込めません。data/seed.js を確認してください。'); return;
}
const clone = obj => JSON.parse(JSON.stringify(obj));
const $ = id => document.getElementById(id);
const h = input => String(input ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const days = ['11/18','11/19','11/20','11/21','11/22'];
const plans = ['SOS展改訂','旧旅程'];
const dayLabels = {'11/18':'11/18（水）','11/19':'11/19（木）','11/20':'11/20（金）','11/21':'11/21（土）','11/22':'11/22（日）'};
let db;
try { const s=JSON.parse(localStorage.getItem(KEY)); db=valid(s)?s:clone(seed); } catch(e){db=clone(seed)}
let chosenPlan='SOS展改訂',chosenDay='11/19',tab='schedule',chosenArea='all',search='',showAll=false,showRoute=true;
let map=null,pointLayer=null,routeLayer=null,markers=new Map(),addMode=false,editItem=null,dragPointId=null,selectedPoint=null;
let currentFocusBounds=null;
const leafletAvailable = typeof window.L !== 'undefined';
function valid(data){
 if(!data || !Array.isArray(data.points) || !Array.isArray(data.events))return false;
 const ids=new Set(),eids=new Set(),str=x=>typeof x==='string',uid=(x,set)=>str(x)&&x.trim()&&!set.has(x)&&!!set.add(x);
 return data.points.every(p=>p&&uid(p.id,ids)&&str(p.name)&&p.name.trim()&&typeof p.lat==='number'&&Number.isFinite(p.lat)&&Math.abs(p.lat)<=90&&typeof p.lon==='number'&&Number.isFinite(p.lon)&&Math.abs(p.lon)<=180&&['works','area','category','days','precision','source','address','note','rule'].every(k=>p[k]==null||str(p[k])))&&data.events.every(e=>e&&uid(e.id,eids)&&plans.includes(e.plan)&&days.includes(e.day)&&/^([01]\d|2[0-3]):[0-5]\d$/.test(e.time)&&str(e.action)&&e.action.trim()&&['category','note','confidence','status','source'].every(k=>e[k]==null||str(e[k]))&&(e.pointId==null||e.pointId===''||ids.has(e.pointId)));
}
function backup(){try {const prior=localStorage.getItem(KEY);if(prior)localStorage.setItem(KEY+':backup',prior);return true;}catch(e){alert('バックアップを保存できません。編集用JSONを先に書き出してください。');return false;}}
function save(){try {localStorage.setItem(KEY,JSON.stringify(db));$('saveStatus').textContent='● 自動保存済み';}catch(e){$('saveStatus').textContent='⚠ 保存できません';} }
function pointById(id){return db.points.find(x=>x.id===id)}
function restricted(p){return /住宅|マンション|私有|撮影禁止|校地|北高/.test([p.name,p.rule,p.note].join(' '))}
function isApprox(p){return restricted(p)||p.precision!=='座標確認'}
function locationWarning(p){return restricted(p)?'公道上からの参照用代表点。公道との照合は未検証。敷地・住宅内の撮影位置を示しません。現地の立入・撮影制限と住民のプライバシーを優先してください。':'概略・代表位置。厳密な撮影地点ではありません。'}
function pointColor(p){ if(p.category==='交通'||p.category==='宿泊')return '#4287bd'; if(p.category==='展示'||(p.works||'').includes('SOS展'))return '#14a58b';if((p.works||'').includes('ゆず')||/E×E|サノバ|のーぶる|ライムライト|美少女/.test(p.works||''))return '#d65c91'; if((p.works||'').includes('ハルヒ')||(p.works||'').includes('消失'))return '#6857cb';return '#b26fa9';}
function eventList(){return db.events.filter(e=>(chosenDay==='all'||e.day===chosenDay)&&e.plan===chosenPlan).sort((a,b)=>days.indexOf(a.day)-days.indexOf(b.day)||String(a.time).localeCompare(String(b.time))||(a.order||0)-(b.order||0));}
function visiblePointIds(){const ids=new Set(eventList().map(e=>e.pointId).filter(Boolean));return ids;}
function visiblePoints(){const ids=visiblePointIds();return db.points.filter(p=>(showAll||chosenDay==='all'||ids.has(p.id))&&(chosenArea==='all'||p.area===chosenArea)&&(!search||[p.name,p.works,p.area,p.address,p.category].join(' ').toLowerCase().includes(search.toLowerCase())));}
function populateAreas(){let current=$('areaSelect').value;const areas=[...new Set(db.points.map(p=>p.area).filter(Boolean))].sort();$('areaSelect').innerHTML='<option value="all">すべての地域</option>'+areas.map(a=>`<option value="${h(a)}">${h(a)}</option>`).join('');$('areaSelect').value=areas.includes(current)?current:'all';chosenArea=$('areaSelect').value;}
function switchTab(name){tab=name;document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));[['schedule','schedulePanel'],['points','pointsPanel'],['guide','guidePanel']].forEach(([n,id])=>$(id).classList.toggle('active',n===tab));}
function redraw(){const events=eventList(), points=visiblePoints();$('eventCount').textContent=events.length;$('pointCount').textContent=points.length;$('visitCount').textContent=points.filter(p=>p.visited).length;$('eventShowing').textContent=`${events.length}件`;$('pointShowing').textContent=`${points.length}地点`;
$('mapHeading').textContent=`${chosenDay==='all'?'全日程':dayLabels[chosenDay]} · ${chosenPlan==='旧旅程'?'旧旅程':'SOS展入り'}`;
$('mapSubHeading').textContent=`地点 ${points.length}か所 / 予定 ${events.length}件`;
renderSchedule(events);renderPoints(points);renderMap(points,events);}
function renderSchedule(events){const container=$('scheduleList');if(!events.length){container.innerHTML='<div class="empty">この条件の予定はありません。<br>＋ 行程から追加できます。</div>';return}
let last='';container.innerHTML=events.map(e=>{let head=e.day!==last?`<div class="event-daylabel">${h(dayLabels[e.day]||e.day)}</div>`:'';last=e.day;const p=pointById(e.pointId);return head+`<div class="schedule-item" data-event="${h(e.id)}" tabindex="0" role="button"><span class="time">${h(e.time)}</span><div><div class="event-head">${h(e.action)}</div><div class="subline">${h(e.category)} · ${h(e.confidence||'計画')}（時刻の根拠は編集で確認）${p?' · 📍'+h(p.name):''}${e.note?' · '+h(e.note).slice(0,36):''}</div></div><span class="status ${e.status==='訪問済'?'done':''}" title="${h(e.status)}">${e.status==='訪問済'?'✓':'✎'}</span></div>`}).join('');}
function renderPoints(points){const container=$('pointList');if(!points.length){container.innerHTML='<div class="empty">該当する地点はありません。</div>';return}
container.innerHTML=points.slice().sort((a,b)=>Number(b.visited)-Number(a.visited)||a.name.localeCompare(b.name,'ja')).map(p=>`<div class="point-item" data-point="${h(p.id)}" tabindex="0" role="button"><span class="point-kind" style="background:${pointColor(p)}"></span><div class="point-label"><div class="point-name">${h(p.name)}</div><div class="point-note">${h(p.works||p.category)} · ${h(p.area)} · ${h(p.precision)}</div></div><div class="point-state">${p.visited?'✓ 済み':'編集 ›'}</div></div>`).join('');}
function toMarkerIcon(p){return L.divIcon({className:'',html:`<div class="pin ${isApprox(p)?'approx':''}" style="background:${pointColor(p)}"></div>`,iconSize:[18,18],iconAnchor:[9,9]});}
function initMap(){if(!leafletAvailable){$('mapFallback').hidden=false;return;} map=L.map('map',{zoomControl:false,preferCanvas:true}).setView([34.7498,135.334],12);
L.control.zoom({position:'bottomright'}).addTo(map);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'}).addTo(map);
pointLayer=L.layerGroup().addTo(map);routeLayer=L.layerGroup().addTo(map);
map.on('click',e=>{if(addMode){addMode=false;$('addPointBtn').textContent='＋ 地点を追加';$('map').classList.remove('map-add-cursor');openPointEditor(null,e.latlng);} });
}
function renderMap(points,events){if(!map)return;pointLayer.clearLayers();routeLayer.clearLayers();markers.clear();let bounds=[];
points.forEach(p=>{const mark=L.marker([Number(p.lat),Number(p.lon)],{icon:toMarkerIcon(p),draggable:dragPointId===p.id});mark.bindPopup(()=>popupHtml(p));mark.on('click',()=>{selectedPoint=p.id});mark.on('dragend',ev=>{const pos=ev.target.getLatLng();const item=pointById(p.id);if(item){item.lat=+pos.lat.toFixed(7);item.lon=+pos.lng.toFixed(7);item.precision='手動調整（未検証）';save();dragPointId=null;redraw();selectPoint(item.id);}});mark.addTo(pointLayer);markers.set(p.id,mark);bounds.push([p.lat,p.lon]);});
if(showRoute){const grouped={};for(const e of events){if(!e.pointId)continue;const pt=pointById(e.pointId);if(!pt)continue;(grouped[e.day] ||= []).push([pt.lat,pt.lon]);}
for(const [day, coords] of Object.entries(grouped)){const cleaned=coords.filter((pt,i)=>i===0||pt[0]!==coords[i-1][0]||pt[1]!==coords[i-1][1]);if(cleaned.length>1)L.polyline(cleaned,{color:day==='11/19'?'#6857cb':day==='11/20'?'#dc6b8e':day==='11/21'?'#2b9e8c':'#7b8597',weight:3,opacity:.6,dashArray:'8 9',interactive:false}).addTo(routeLayer);}}
currentFocusBounds=bounds;
}
function popupHtml(p){const warn=isApprox(p)?'<div class="popup-warning">⚠ ${h(locationWarning(p))}</div>':'';const source=/^https?:\/\//i.test(p.source||'')?`<a href="${h(p.source)}" target="_blank" rel="noopener noreferrer">出典 ↗</a>`:'';return `<div class="popup-title">${h(p.name)}</div><div class="popup-sub">${h(p.works||p.category)} / ${h(p.area)}<br>${h(p.precision)}</div>${warn}<div class="popup-sub">${h(p.rule||'')}<br>${h(p.note||'').slice(0,140)}</div><div class="popup-action"><button data-popup-edit="${h(p.id)}">編集する</button><button data-popup-event="${h(p.id)}">予定に追加</button><button data-popup-done="${h(p.id)}">${p.visited?'✓ 訪問済':'○ 訪問済にする'}</button><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name+' '+(p.address||''))}" target="_blank" rel="noopener noreferrer">Googleマップ ↗</a>${source}</div>`;}
function selectPoint(id){const p=pointById(id);if(!p)return;selectedPoint=id;if(map){map.setView([p.lat,p.lon],Math.max(map.getZoom(),15));setTimeout(()=>{if(markers.has(id))markers.get(id).openPopup()},90)}switchTab('points');}
function fitToVisible(){if(!map||!currentFocusBounds||!currentFocusBounds.length)return;if(currentFocusBounds.length===1)map.setView(currentFocusBounds[0],15);else map.fitBounds(currentFocusBounds,{padding:[45,45],maxZoom:15});}
function field(name,value,type='text',full=false,helper=''){return `<div class="field ${full?'full':''}"><label for="f_${name}">${h(name)}</label><input id="f_${name}" name="${h(name)}" type="${type}" value="${h(value)}" ${type==='number'?'step="any"':''}>${helper?`<div class="field-helper">${h(helper)}</div>`:''}</div>`}
function selectField(name,value,options,full=false){return `<div class="field ${full?'full':''}"><label for="f_${name}">${h(name)}</label><select id="f_${name}" name="${h(name)}">${options.map(([key,label])=>`<option value="${h(key)}" ${String(value)===String(key)?'selected':''}>${h(label)}</option>`).join('')}</select></div>`}
function textField(name,value,full=true){return `<div class="field ${full?'full':''}"><label for="f_${name}">${h(name)}</label><textarea id="f_${name}" name="${h(name)}">${h(value)}</textarea></div>`}
function showDialog(){const dialog=$('editDialog');if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','open');}
function openPointEditor(p=null,latlng=null){editItem={type:'point',id:p?.id??null};$('dialogEyebrow').textContent='EDIT LOCATION';$('dialogTitle').textContent=p?'地点の編集':'新しい地点を追加';$('deleteBtn').hidden=!p;const q=p||{name:'新しい地点',lat:latlng?.lat||34.75,lon:latlng?.lng||135.33,area:'西宮',category:'巡礼',works:'',days:chosenDay==='all'?'11/19':chosenDay,precision:'手動追加（未検証）',source:'',address:'',note:'',rule:'一般公開場所',visited:false};
const categories=[...new Set(['巡礼','交通','宿泊','展示','喫茶','神社','鉄道',...db.points.map(x=>x.category)])];
$('editFields').innerHTML=`<div class="fields">${field('地点名',q.name,'text',true)}${selectField('区分',q.category,categories.map(x=>[x,x]))}${field('作品',q.works)}${field('緯度',q.lat,'number',false,'座標を変更するとピン位置も変わります')}${field('経度',q.lon,'number')}${field('地域',q.area)}${field('訪問日',q.days)}${field('座標精度',q.precision,'text',true)}${field('住所・検索名',q.address,'text',true)}${textField('メモ',q.note)}${textField('撮影ルール',q.rule)}${field('出典',q.source,'text',true)}${selectField('訪問状況',q.visited?'済':'未', [['未','未訪問'],['済','訪問済']])}</div><div class="dialog-actions" style="border-top:0;padding-top:0"><button type="button" class="btn btn-outline" id="dragBtn">📍 地図上で位置をドラッグして修正</button><button type="button" class="btn btn-ghost" id="makeEventBtn">＋ この場所で行程追加</button></div>`;
$('dragBtn').disabled=!p;$('dragBtn').addEventListener('click',()=>{if(!p)return;dragPointId=p.id;$('editDialog').close();redraw();selectPoint(p.id);const mk=markers.get(p.id);if(mk){mk.dragging.enable();mk.openPopup();}toast('ピンをドラッグして位置を直してください（移動後、自動保存）');});
$('makeEventBtn').disabled=!p;$('makeEventBtn').addEventListener('click',()=>openEventEditor(null,p.id));showDialog();}
function openEventEditor(e=null,pointId=null){editItem={type:'event',id:e?.id??null};$('dialogEyebrow').textContent='EDIT ITINERARY';$('dialogTitle').textContent=e?'行程・時刻を編集':'新しい行程を追加';$('deleteBtn').hidden=!e;
const q=e||{plan:chosenPlan,day:chosenDay==='all'?'11/19':chosenDay,time:'12:00',category:'撮影',action:'新しい予定',pointId:pointId||'',note:'',confidence:'計画',status:'未訪問'};
$('editFields').innerHTML=`<div class="fields">${selectField('旅程',q.plan,plans.map(x=>[x,x]))}${selectField('日付',q.day,days.map(d=>[d,dayLabels[d]]))}${field('時刻',q.time,'time')}${field('分類',q.category)}${field('行動',q.action,'text',true)}${selectField('地点ID',q.pointId||'',[['','（地点に紐づけない）'],...db.points.slice().sort((a,b)=>a.name.localeCompare(b.name,'ja')).map(p=>[p.id,p.name])],true)}${textField('メモ',q.note)}${field('時刻の出典',q.source||'','text',true,'公式ダイヤ・実測は出典URLまたは測定日・方法が必須。計画時刻と区別します。')}${selectField('確認状態',q.confidence,[['計画','計画（未確定）'],['要確認','要確認'],['公式ダイヤ','公式ダイヤと照合'],['実測','現地実測']])}${selectField('訪問状況',q.status,[['未訪問','未訪問'],['訪問済','訪問済'],['見送り','見送り']])}</div>`;
showDialog();}
function readForm(){const form=$('editForm');const data=new FormData(form);return Object.fromEntries(data.entries())}
function commitForm(){if(!editItem)return;const f=readForm();if(editItem.type==='point'){
 const lat=Number(f['緯度']),lon=Number(f['経度']);if(!f['地点名'].trim()||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180){alert('地点名と有効な緯度・経度を入力してください');return}
 let p=editItem.id?pointById(editItem.id):null;
 if(!p){p={id:'custom_'+Date.now().toString(36)+'_'+Math.floor(Math.random()*10000).toString(36)};db.points.push(p)}
 Object.assign(p,{name:f['地点名'].trim(),lat,lon,category:f['区分'],works:f['作品'],area:f['地域'],days:f['訪問日'],precision:f['座標精度'],address:f['住所・検索名'],note:f['メモ'],rule:f['撮影ルール'],source:f['出典'],visited:f['訪問状況']==='済'});
 if(!$('showAllPoints').checked && !visiblePointIds().has(p.id)){$('showAllPoints').checked=true;showAll=true;}
 selectedPoint=p.id;
}else{
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(f['時刻'])||!f['行動'].trim()){alert('時刻（例：09:05）と行動を入力してください');return}
 if(['公式ダイヤ','実測'].includes(f['確認状態'])&&!f['時刻の出典'].trim()){alert('公式ダイヤ・実測には時刻の出典を入力してください');return}
 let e=editItem.id?db.events.find(x=>x.id===editItem.id):null;if(!e){e={id:'custom_ev_'+Date.now().toString(36),order:db.events.length};db.events.push(e)}
 Object.assign(e,{plan:f['旅程'],day:f['日付'],time:f['時刻'],category:f['分類'],action:f['行動'].trim(),pointId:f['地点ID']||null,note:f['メモ'],source:f['時刻の出典'].trim(),confidence:f['確認状態'],status:f['訪問状況']});
 chosenPlan=e.plan;chosenDay=e.day;$('planSelect').value=chosenPlan;$('daySelect').value=chosenDay;
}
$('editDialog').close();save();populateAreas();redraw();}
function deleteCurrent(){if(!editItem)return;const {type,id}=editItem;if(!id)return;const yes=confirm(type==='point'?'この地点を削除しますか？ 紐づく行程は地点未割当になります。':'この予定を削除しますか？');if(!yes)return;
if(type==='point'){db.points=db.points.filter(p=>p.id!==id);db.events.forEach(e=>{if(e.pointId===id)e.pointId=null;});} else db.events=db.events.filter(e=>e.id!==id);
$('editDialog').close();save();populateAreas();redraw();}
function toast(message){$('mapMessage').textContent=message;}
function download(blob,file){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=file;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function downloadText(text,file,mime='text/plain;charset=utf-8'){download(new Blob([text],{type:mime}),file)}
const csvEsc=x=>'"'+String(x??'').replace(/"/g,'""')+'"';
function makeCSV(rows,headers){return '\ufeff'+[headers.map(csvEsc).join(','),...rows.map(r=>headers.map(k=>csvEsc(r[k])).join(','))].join('\r\n')}
function exportData(type){if(type==='backup'){const prior=localStorage.getItem(KEY+':backup');if(!prior){alert('置換前のバックアップはありません');return}downloadText(prior,'haruhi_before_replace.json','application/json');$('exportDialog').close();return}const prefix='haruhi_pilgrimage_2026';if(type==='json')downloadText(JSON.stringify(db,null,2),prefix+'_editable.json','application/json;charset=utf-8');
else if(type==='csv'){const rows=db.points.map(p=>({'地点名':p.name,'作品':p.works,'地域':p.area,'区分':p.category,'訪問日':p.days,'緯度':p.lat,'経度':p.lon,'住所':p.address,'座標精度':p.precision,'メモ':p.note,'撮影ルール':(isApprox(p)?locationWarning(p)+' / ':'')+(p.rule||''),'出典':p.source,'訪問済':p.visited?'はい':'いいえ','ID':p.id}));downloadText(makeCSV(rows,['地点名','作品','地域','区分','訪問日','緯度','経度','住所','座標精度','メモ','撮影ルール','出典','訪問済','ID']),prefix+'_mymaps.csv','text/csv;charset=utf-8');}
else if(type==='schedule'){const rows=db.events.map(e=>({'旅程':e.plan,'日付':e.day,'時刻':e.time,'区分':e.category,'行動':e.action,'地点ID':e.pointId,'地点名':pointById(e.pointId)?.name||'','確認状態':e.confidence,'時刻の出典':e.source||'','状態':e.status,'メモ':e.note}));downloadText(makeCSV(rows,['旅程','日付','時刻','区分','行動','地点ID','地点名','確認状態','時刻の出典','状態','メモ']),prefix+'_schedule.csv','text/csv;charset=utf-8');}
else if(type==='geojson'){const f=db.points.map(p=>({type:'Feature',id:p.id,geometry:{type:'Point',coordinates:[p.lon,p.lat]},properties:{...p,coordinateDisclaimer:isApprox(p)?locationWarning(p):'座標確認は撮影許可を意味しません'}}));downloadText(JSON.stringify({type:'FeatureCollection',features:f},null,2),prefix+'_points.geojson','application/geo+json;charset=utf-8');}
else if(type==='kml'){let xml='<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>ハルヒ×美少女ゲーム聖地巡礼 2026</name>';for(const p of db.points){xml+=`<Placemark><name>${h(p.name)}</name><description>${h((p.works||'')+' / '+(p.precision||'')+' / '+(isApprox(p)?locationWarning(p):'座標確認は撮影許可を意味しません')+' / '+(p.rule||'')+' / '+(p.note||''))}</description><Point><coordinates>${p.lon},${p.lat},0</coordinates></Point></Placemark>`;}xml+='</Document></kml>';downloadText(xml,prefix+'_mymaps.kml','application/vnd.google-earth.kml+xml;charset=utf-8');}
$('exportDialog').close();}
function readImport(file){const reader=new FileReader();reader.onload=()=>{try{const incoming=JSON.parse(reader.result);if(!valid(incoming))throw new Error('points と events の構造を確認してください');if(!confirm(`地点 ${incoming.points.length} 件、予定 ${incoming.events.length} 件で現在のデータを上書きしますか？\n先に編集用JSONでバックアップすることをおすすめします。`))return;if(!backup())return;db=clone(incoming);save();populateAreas();redraw();fitToVisible();toast('JSONを読み込みました');}catch(e){alert('読み込み失敗：'+e.message)}};reader.onerror=()=>alert('ファイルを読み取れませんでした');reader.readAsText(file,'utf-8')}
function beginAddPoint(){addMode=!addMode;$('addPointBtn').textContent=addMode?'✕ 配置を中止':'＋ 地点を追加';$('map').classList.toggle('map-add-cursor',addMode);if(addMode){toast('地図をクリックすると新しい地点を作れます。地図を操作できない場合は地点一覧の＋新規を使用してください。');if(!map){addMode=false;$('addPointBtn').textContent='＋ 地点を追加';$('map').classList.remove('map-add-cursor');openPointEditor();}}}
$('planSelect').addEventListener('change',e=>{chosenPlan=e.target.value;redraw();fitToVisible();});$('daySelect').addEventListener('change',e=>{chosenDay=e.target.value;redraw();fitToVisible();});
$('pointSearch').addEventListener('input',e=>{search=e.target.value;redraw();});$('areaSelect').addEventListener('change',e=>{chosenArea=e.target.value;redraw();fitToVisible();});
$('showAllPoints').addEventListener('change',e=>{showAll=e.target.checked;redraw();fitToVisible();});$('showRoute').addEventListener('change',e=>{showRoute=e.target.checked;redraw();});
document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));
$('scheduleList').addEventListener('click',e=>{const el=e.target.closest('[data-event]');if(!el)return;const v=db.events.find(x=>x.id===el.dataset.event);if(v)openEventEditor(v);});
$('pointList').addEventListener('click',e=>{const el=e.target.closest('[data-point]');if(!el)return;const v=pointById(el.dataset.point);if(v){selectPoint(v.id);openPointEditor(v);}});
for(const el of [$('scheduleList'),$('pointList')])el.addEventListener('keydown',e=>{if(e.key!=='Enter'&&e.key!==' ')return;const v=e.target.closest('[data-event],[data-point]');if(v){e.preventDefault();v.click();}});
document.body.addEventListener('click',e=>{const pe=e.target.closest('[data-popup-edit]');const ev=e.target.closest('[data-popup-event]');const done=e.target.closest('[data-popup-done]');if(pe){const p=pointById(pe.dataset.popupEdit);if(p)openPointEditor(p)}if(ev)openEventEditor(null,ev.dataset.popupEvent);if(done){const p=pointById(done.dataset.popupDone);if(p){p.visited=!p.visited;save();redraw();const marker=markers.get(p.id);if(marker)marker.openPopup();}}});
$('addPointBtn').addEventListener('click',beginAddPoint);$('addPointListBtn').addEventListener('click',()=>openPointEditor());$('addEventBtn').addEventListener('click',()=>openEventEditor());$('fitBtn').addEventListener('click',fitToVisible);
$('editForm').addEventListener('submit',e=>{e.preventDefault();commitForm();});$('dialogClose').addEventListener('click',()=>$('editDialog').close());$('cancelBtn').addEventListener('click',()=>$('editDialog').close());$('deleteBtn').addEventListener('click',deleteCurrent);
$('exportBtn').addEventListener('click',()=>$('exportDialog').showModal());$('exportClose').addEventListener('click',()=>$('exportDialog').close());
document.querySelectorAll('[data-export]').forEach(b=>b.addEventListener('click',()=>exportData(b.dataset.export)));
$('importBtn').addEventListener('click',()=>$('importFile').click());$('importFile').addEventListener('change',e=>{if(e.target.files[0])readImport(e.target.files[0]);e.target.value='';});
$('resetBtn').addEventListener('click',()=>{if(!confirm('編集中の地点・予定をすべて初期状態に戻しますか？ 先にJSONでバックアップしてください。'))return;if(!backup())return;db=clone(seed);save();populateAreas();redraw();fitToVisible();toast('初期データに戻しました');});
window.addEventListener('storage',e=>{if(e.key===KEY)toast('別タブでデータが変更されました。再読み込みすると反映されます。')});
initMap();populateAreas();redraw();if(map){setTimeout(()=>{map.invalidateSize();fitToVisible()},120);}else toast('ネット接続で地図ライブラリを読み込めなかった場合も、左側の編集と書き出しは利用できます。');
})();
