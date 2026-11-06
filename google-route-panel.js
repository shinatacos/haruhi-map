/* Route Notebook / Google-only routing add-on. Google Maps URLs: no API key; Embed: no usage fees, key and billing setup required. */
(function (root) {
  'use strict';
  const STORE = 'route-notebook:google-free:v1';
  const MAPS = 'https://www.google.com/maps/dir/';
  const EMBED = 'https://www.google.com/maps/embed/v1/directions';
  const validCoords = p => p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon)) &&
    Number(p.lat) >= -90 && Number(p.lat) <= 90 && Number(p.lon) >= -180 && Number(p.lon) <= 180;
  const confirmed = p => /座標確認|現地確認|検証済|confirmed/i.test(String(p.precision || p.locationStatus || ''));
  const coord = p => Number(p.lat) + ',' + Number(p.lon);
  const place = p => {
    if (!p) return '';
    // Avoid treating the approximate coordinates of a scene as a verified entrance.
    if (confirmed(p) && validCoords(p)) return coord(p);
    return [p.name, p.address].filter(Boolean).join(' ') || (validCoords(p) ? coord(p) : '');
  };
  function mapsUrl(origin, destination, mode) {
    const u = new URL(MAPS);
    u.searchParams.set('api', '1');
    u.searchParams.set('origin', origin);
    u.searchParams.set('destination', destination);
    u.searchParams.set('travelmode', mode === 'walking' ? 'walking' : 'transit');
    return u.href;
  }
  function embedUrl(key, origin, destination, mode) {
    const u = new URL(EMBED);
    u.searchParams.set('key', key);
    u.searchParams.set('origin', origin);
    u.searchParams.set('destination', destination);
    u.searchParams.set('mode', mode === 'walking' ? 'walking' : 'transit');
    u.searchParams.set('language', 'ja');
    u.searchParams.set('region', 'jp');
    return u.href;
  }
  const yen = n => '¥' + Number(n).toLocaleString('ja-JP');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sortedEvents = (events) => events.slice().sort((a,b) => {
    const d = x => String(x.day||'').replace(/^(\d\d?)\/(\d\d?)$/,(_,m,day)=>'2026-'+m.padStart(2,'0')+'-'+day.padStart(2,'0'));
    return d(a).localeCompare(d(b)) || (+a.order||0)-(+b.order||0) || String(a.time||'').localeCompare(String(b.time||''));
  });
  function legsOf(data, tripId, plan, day) {
    const pts = new Map(data.points.map(p => [p.id, p]));
    const events = sortedEvents(data.events.filter(e =>
      (!tripId || (e.tripId||'legacy') === tripId) && (!plan || e.plan === plan) && (!day || day === 'all' || e.day === day)));
    const prev = new Map(), out = [];
    for (const e of events) {
      if (!e.pointId || !pts.has(e.pointId)) continue;
      const key = [e.tripId||'legacy', e.plan, e.day].join('|');
      const p = prev.get(key);
      if (p && p.pointId !== e.pointId) out.push({ from:p.pointId, to:e.pointId, eventId:e.id, day:e.day, time:e.time, name:e.action });
      prev.set(key, e);
    }
    return out;
  }
  function load() {
    try {
      const v = JSON.parse(localStorage.getItem(STORE) || '{}');
      return {key:typeof v.key === 'string' ? v.key : '', passes:Array.isArray(v.passes)?v.passes:[], fares: v.fares && typeof v.fares==='object'?v.fares:{}};
    } catch (_) { return {key:'', passes:[], fares:{}}; }
  }
  const API = {mapsUrl, embedUrl, legsOf, place, sortedEvents};
  root.RouteGoogleFree = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (!root.document) return;
  const doc = root.document;
  const state = load();
  // A publishable, HTTP-referrer-restricted Maps Embed key can be supplied by the site owner.
  if (!state.key && typeof root.ROUTE_GOOGLE_EMBED_KEY === 'string') state.key = root.ROUTE_GOOGLE_EMBED_KEY.trim();
  let from = '', to = '', mode = 'transit', leg = '', data = null, points = [], dialog = null;
  const $ = id => doc.getElementById('rg-' + id);
  const safeSave = () => { try { localStorage.setItem(STORE,JSON.stringify(state)); return true; } catch (_) { return false; } };
  const pointById = id => points.find(p => String(p.id) === id);
  const selected = () => [pointById(from), pointById(to)];
  const selectedKey = () => [leg || (from+'|'+to),mode].join('|');
  const getCurrentData = () => {
    try {
      // The existing editor persists its database only in its local owner mode.
      if (root.ROUTE_CONFIG?.owner === true && root.location.hostname === '127.0.0.1') {
        const local = JSON.parse(localStorage.getItem('haruhi-pilgrimage-map:v1') || 'null');
        if (local?.points?.length && local?.events?.length) return local;
      }
    } catch (_) {}
    return root.HARUHI_SEED || {points:[],events:[],trips:[]};
  };
  function init() {
    data = getCurrentData();
    points = Array.isArray(data.points) ? data.points.filter(p=>p && p.id && p.name) : [];
    if (!points.length) return;
    const toolbar = doc.querySelector('.mast-actions, .map-toolbar-right, header');
    const launch = doc.createElement('button');
    launch.id = 'rg-launch'; launch.type = 'button'; launch.textContent = '🗺 Google経路';
    launch.setAttribute('aria-haspopup','dialog');
    if (toolbar) toolbar.prepend(launch); else doc.body.append(launch);
    dialog = doc.createElement('dialog'); dialog.id = 'rg-dialog';
    dialog.setAttribute('aria-label', 'Google経路・運賃メモ');
    doc.body.append(dialog);
    launch.addEventListener('click', open);
    // Hide unsupported straight-line route drawing in the current Leaflet view.
    const straight = doc.getElementById('showRoute');
    if (straight) { straight.checked = false; straight.dispatchEvent(new Event('change',{bubbles:true}));
      straight.closest('label')?.setAttribute('hidden',''); }
  }
  function open() {
    leg = '';
    data = getCurrentData(); points = (data.points||[]).filter(p=>p && p.id && p.name);
    if (!points.length) return;
    if (!from || !pointById(from)) from = String(points[0].id);
    if (!to || !pointById(to)) to = String(points.find(p=>p.id!==from)?.id || points[0].id);
    const tripId = doc.getElementById('tripSelect')?.value || (data.trips?.[0]?.id || 'legacy');
    const plan = doc.getElementById('planSelect')?.value || '';
    const day = doc.getElementById('daySelect')?.value || 'all';
    const legs = legsOf(data,tripId,plan,day);
    const option = (value,label,active)=>`<option value="${esc(value)}" ${active?'selected':''}>${esc(label)}</option>`;
    const pointOptions = points.map(p=>option(p.id,p.name+(confirmed(p)?'':' ⚠位置要確認'),false)).join('');
    const routeOptions = '<option value="">任意の2地点を指定</option>' + legs.map((x,i)=>option(i,`${x.day} ${x.time||''}｜${pointById(x.from)?.name||x.from} → ${pointById(x.to)?.name||x.to}`,false)).join('');
    dialog.innerHTML = `<div class="rg-head"><div><h2>Googleマップ 実経路</h2><small>OSMの概略直線ではなくGoogleの経路を表示</small></div><button id="rg-close" type="button" aria-label="閉じる">×</button></div>
    <div class="rg-body">
      <div class="rg-forms">
        <label class="rg-wide">既存旅程から区間を選択<select id="rg-leg">${routeOptions}</select></label>
        <label>出発地<select id="rg-from">${pointOptions}</select></label>
        <label>目的地<select id="rg-to">${pointOptions}</select></label>
        <label>移動手段<select id="rg-mode"><option value="walking">徒歩</option><option value="transit">公共交通（鉄道・バス）</option></select></label>
        <label>Embed APIキー（任意）<input id="rg-key" type="password" autocomplete="off" placeholder="未設定ならGoogleマップで開く" /></label>
      </div>
      <div id="rg-warning" class="rg-info"></div>
      <div class="rg-actions"><a id="rg-open" class="rg-action-primary" target="_blank" rel="noopener noreferrer">Googleマップで経路候補を見る ↗</a><button type="button" id="rg-remove-key">端末のキーを消去</button></div>
      <div id="rg-map-area" class="rg-map-area"></div>
      <p class="rg-info">埋め込みはGoogle Maps Embed API（API利用料0円、Google Cloudキーと請求先登録が必要）。鉄道優先／バス優先、日時指定、複数候補の詳細選択はGoogleマップ内で操作してください。サイト側では自動運賃取得をしていません。</p>
      <section class="rg-section"><h3>区間の交通費メモ</h3>
        <div class="rg-forms"><label>確認した支払額（円）<input id="rg-fare" type="number" min="0" step="1" placeholder="未確認は空欄" /></label>
          <label>この区間で使用したパス<select id="rg-pass"><option value="">適用なし／未確認</option></select></label>
          <label class="rg-wide">確認した路線・メモ<input id="rg-fare-note" placeholder="例：阪急神戸線、公式運賃を確認" /></label></div>
        <button id="rg-save-fare" type="button">区間の支払額を保存</button><span id="rg-fare-status" role="status"></span>
      </section>
      <section class="rg-section"><h3>定期券・フリーパス台帳</h3>
        <p class="rg-info">登録したパスの適用区間をGoogleマップが自動認識するわけではありません。対象区間・有効日・適用条件を照合してから金額を確定してください。</p>
        <div class="rg-forms"><label>券名<input id="rg-pass-name" placeholder="例：阪急一日乗車券" /></label>
        <label>対象路線・区間<input id="rg-pass-coverage" placeholder="事業者・駅間・例外条件" /></label>
        <label>有効開始日<input id="rg-pass-start" type="date" /></label><label>有効終了日<input id="rg-pass-end" type="date" /></label>
        <label>購入金額（円）<input id="rg-pass-price" type="number" min="0" step="1" placeholder="不明なら空欄" /></label></div>
        <button id="rg-add-pass" type="button">パスを登録</button><div id="rg-pass-list"></div>
      </section>
      <section class="rg-section"><h3>支出の集計（入力済みの交通費のみ）</h3><div id="rg-total"></div>
        <button type="button" id="rg-export">パス・交通費をJSON保存</button>
      </section>
    </div>`;
    $('close').onclick = () => dialog.close();
    $('leg').onchange = () => { const v = $('leg').value; if (v !== '' && legs[Number(v)]) {
      leg=String(legs[+v].eventId||'');from=String(legs[+v].from);to=String(legs[+v].to); $('from').value=from;$('to').value=to; refresh(); } };
    $('from').value=from; $('to').value=to; $('mode').value=mode; $('key').value=state.key;
    $('from').onchange = () => {leg='';from=$('from').value;refresh();};
    $('to').onchange = () => {leg='';to=$('to').value;refresh();};
    $('mode').onchange = () => {mode=$('mode').value;refresh();};
    $('key').onchange = () => {state.key=$('key').value.trim();safeSave();refresh();};
    $('remove-key').onclick=()=>{state.key='';$('key').value='';safeSave();refresh();};
    $('save-fare').onclick=saveFare;
    $('add-pass').onclick=addPass;
    $('export').onclick=exportJSON;
    renderPassList(); refresh();
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open','');
  }
  function refresh() {
    const [a,b] = selected(); if (!a || !b) return;
    const origin=place(a),destination=place(b);
    const link=mapsUrl(origin,destination,mode);
    const url = new URL(link);
    if (a.placeId) url.searchParams.set('origin_place_id',a.placeId);
    if (b.placeId) url.searchParams.set('destination_place_id',b.placeId);
    $('open').href=url.href;
    const missing=[];
    if (!confirmed(a)) missing.push('出発地点');
    if (!confirmed(b)) missing.push('目的地点');
    $('warning').textContent = missing.length ? `⚠ ${missing.join('と')}の撮影位置は未検証。Googleの施設名検索先と訪問目的地が一致しているか確認してください。` : '座標確認済の地点を使用。入口・撮影位置の精度は別途確認してください。';
    $('map-area').replaceChildren();
    if (state.key) {
      const frame=doc.createElement('iframe');frame.title='Google Maps：経路';frame.loading='lazy';frame.referrerPolicy='strict-origin-when-cross-origin';
      frame.allowFullscreen=true;frame.src=embedUrl(state.key,a.placeId?'place_id:'+a.placeId:origin,b.placeId?'place_id:'+b.placeId:destination,mode);$('map-area').append(frame);
    } else {
      const msg=doc.createElement('div'); msg.className='rg-empty';msg.textContent='Google地図のサイト内表示はAPIキー設定後に有効になります。キーなしの場合も上のボタンから無料でGoogleマップの経路検索を開けます。';
      $('map-area').append(msg);
    }
    const saved=state.fares[selectedKey()];
    $('fare').value=saved && Number.isFinite(saved.yen)?String(saved.yen):'';
    $('fare-note').value=saved?.note || '';
    renderPassSelect(saved?.passId||''); updateTotal();
  }
  function renderPassSelect(current='') {
    const sel=$('pass'); sel.replaceChildren(); sel.add(new Option('適用なし／未確認',''));
    for(const p of state.passes) sel.add(new Option(p.name+'（'+(p.from||'?')+'〜'+(p.to||'?')+'）',p.id));
    sel.value=current;
  }
  function saveFare() {
    const raw=$('fare').value.trim();const yenValue=raw === '' ? null : Number(raw);
    if (yenValue!==null && (!Number.isSafeInteger(yenValue)||yenValue<0)) { $('fare-status').textContent='金額は0以上の整数にしてください';return; }
    state.fares[selectedKey()]={yen:yenValue,passId:$('pass').value,note:$('fare-note').value.trim(),checkedAt:new Date().toISOString(),from,to,mode};
    const ok=safeSave();$('fare-status').textContent=ok?'この端末に保存しました（オンライン同期は未設定）':'保存に失敗。ブラウザの保存領域を確認してください';updateTotal();
  }
  function addPass() {
    const name=$('pass-name').value.trim(),fromDate=$('pass-start').value,toDate=$('pass-end').value,coverage=$('pass-coverage').value.trim();
    const price=$('pass-price').value.trim();
    if (!name || !coverage || !fromDate || !toDate || fromDate>toDate) { alert('券名、対象区間、有効開始日・終了日を正しく入力してください');return; }
    if (price !== '' && (!Number.isSafeInteger(Number(price)) || Number(price)<0)) {alert('金額は0以上の整数にしてください');return;}
    state.passes.push({id:'pass-'+Date.now()+'-'+Math.random().toString(36).slice(2),name,coverage,from:fromDate,to:toDate,price:price===''?null:Number(price)});
    if (!safeSave()) {alert('保存に失敗しました');return;}
    for(const id of ['pass-name','pass-coverage','pass-start','pass-end','pass-price']) $(id).value='';
    renderPassList();renderPassSelect();updateTotal();
  }
  function renderPassList() {
    const target=$('pass-list');target.replaceChildren();
    state.passes.forEach(p=>{
      const row=doc.createElement('div');row.className='rg-pass-row';
      const text=doc.createElement('span'); text.textContent=`${p.name}｜${p.coverage}｜${p.from}〜${p.to}｜購入額 ${p.price===null?'未確認':yen(p.price)}`;
      const remove=doc.createElement('button');remove.type='button';remove.textContent='削除';remove.onclick=()=>{if (!confirm('このパスを削除しますか？'))return;
        state.passes=state.passes.filter(x=>x.id!==p.id);Object.values(state.fares).forEach(f=>{if(f.passId===p.id)f.passId='';});safeSave();renderPassList();refresh();};
      row.append(text,remove);target.append(row);
    });
  }
  function updateTotal() {
    const values=Object.values(state.fares),known=values.filter(v=>Number.isSafeInteger(v.yen)&&v.yen>=0),unknown=values.length-known.length;
    const tickets=state.passes.filter(p=>Number.isSafeInteger(p.price)&&p.price>=0);
    // These are not a combined spend: pass costs may already have been paid.
    $('total').textContent=`入力済みの区間運賃 ${yen(known.reduce((n,v)=>n+v.yen,0))}（${known.length}区間）／料金未確認 ${unknown}区間。登録済みパス購入額 ${yen(tickets.reduce((n,p)=>n+p.price,0))}（${tickets.length}枚、二重計上防止のため別掲）。未入力区間の料金は含まれません。`;
  }
  function exportJSON() {
    const content=JSON.stringify({kind:'route-google-free-backup',version:1,exportedAt:new Date().toISOString(),passes:state.passes,fares:state.fares},null,2);
    const url=URL.createObjectURL(new Blob([content],{type:'application/json'}));
    const a=doc.createElement('a');a.href=url;a.download='route-google-fares-passes.json';doc.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2500);
  }
  if (doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(typeof window === 'undefined' ? globalThis : window);
