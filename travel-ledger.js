/* User-verified fare/pass ledger; stored inside the full notebook JSON and Firebase snapshot. */
(() => {
'use strict';
const N=window.RouteNotebook,A=window.RouteActual,$=id=>document.getElementById(id);
const h=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const panel=document.createElement('details');panel.className='service-settings';panel.innerHTML=`<summary>パス適用・候補比較・日別費用</summary><p>対象区間は公式条件を手動照合します。パス登録だけでは無料にしません。料金未確認の候補を最安と判定しません。以前のGoogleパネル台帳は同パネルに保持しています。</p>
<label>券名<input id="passName"></label><label>対象路線・区間・除外条件<input id="passCoverage"></label><label>有効開始<input id="passStart" type="date"></label><label>有効終了<input id="passEnd" type="date"></label><label>購入額（不明は空欄）<input id="passPrice" type="number" min="0"></label><label>公式出典<input id="passSource" type="url"></label><button class="btn" id="passRegister">パスを登録</button><div id="passRows"></div>
<label>比較方針<select id="routePriority"><option value="fast">速さ優先</option><option value="cheap">安さ優先</option><option value="pass">パス活用優先</option></select></label><button class="btn" id="routeRank">取得済み候補から選択</button><p id="ledgerStatus" role="status"></p><div id="fareRows"></div><div id="dailyCosts"></div>`;
$('routesPanel').append(panel);
let current=[];
const fingerprint=(row,index)=>JSON.stringify([row.key,index,row.routes[index].parts]);
const dateOf=(day,year)=>day.includes('-')?day:year+'-'+day.split('/').map(x=>x.padStart(2,'0')).join('-');
function context(){const db=N.getSnapshot(),sel=db.selection;return {db,sel,year:db.trips.find(t=>t.id===sel.tripId).startDate.slice(0,4),passes:(db.travelPasses||[]).filter(p=>p.tripId===sel.tripId),fares:db.routeFares||{}};}
function price(row,index,ctx){const f=ctx.fares[fingerprint(row,index)];if(!f)return {yen:null,pass:false};
 const pass=ctx.passes.find(p=>p.id===f.passId),date=dateOf(row.segment.event.day,ctx.year);
 if(pass&&f.covered&&f.source&&date>=pass.start&&date<=pass.end)return {yen:0,pass:true};
 return {yen:Number.isFinite(f.base)?f.base:null,pass:false};
}
function render(){
 const ctx=context();current=A.getRows();
 $('passRows').innerHTML=ctx.passes.map(p=>`<p>${h(p.name)} · ${h(p.coverage)} · ${h(p.start)} / ${h(p.end)} · ${p.price==null?'購入額未確認':p.price+'円'} <button class="btn" data-pass-delete="${h(p.id)}">削除</button></p>`).join('');
 $('fareRows').innerHTML=current.filter(r=>r.routes).map(r=>{const i=current.indexOf(r),j=r.chosen,f=ctx.fares[fingerprint(r,j)]||{},p=price(r,j,ctx);return `<div class="route-card"><b>${h(r.segment.from.name)} → ${h(r.segment.to.name)} 候補${j+1}</b><p>追加支払：${p.yen==null?'未確認':p.yen+'円'}${p.pass?'（照合済パス適用）':''}</p>
 <label>通常運賃（不明は空欄）<input type="number" min="0" data-base="${i}" value="${f.base??''}"></label><label>使用パス<select data-pass="${i}"><option value="">適用なし</option>${ctx.passes.map(p=>`<option value="${h(p.id)}" ${f.passId===p.id?'selected':''}>${h(p.name)}</option>`).join('')}</select></label><label><input type="checkbox" data-covered="${i}" ${f.covered?'checked':''}>この候補の全乗車区間がパス対象と公式条件で照合済み</label><label>運賃・適用の公式出典<input data-fare-source="${i}" value="${h(f.source||'')}"></label><button class="btn" data-fare-save="${i}">確認値を保存</button></div>`;}).join('');
 const events=ctx.db.events.filter(e=>(e.tripId||'legacy')===ctx.sel.tripId&&e.plan===ctx.sel.plan&&(ctx.sel.day==='all'||e.day===ctx.sel.day));
 $('dailyCosts').innerHTML=[...new Set(events.map(e=>e.day))].map(day=>{
  const es=events.filter(e=>e.day===day),rs=current.filter(r=>r.segment.event.day===day);let transport=0,unknown=0;for(const r of rs){const p=r.routes?price(r,r.chosen,ctx):{yen:null};if(p.yen==null)unknown++;else transport+=p.yen;}
  const cost=kind=>es.filter(e=>(e.costKind||'other')===kind).reduce((s,e)=>s+(e.cost||0),0),passCost=ctx.passes.filter(p=>p.tripId===ctx.sel.tripId&&p.start===dateOf(day,ctx.year)).reduce((s,p)=>s+(p.price||0),0);
  const other=cost('other'),admission=cost('admission'),lodging=cost('lodging');
  return `<p><b>${h(day)}</b> · 交通追加支払${transport}円（未確認${unknown}区間） · 入場${admission}円 · 宿泊${lodging}円 · その他予定費用${other}円 · パス購入${passCost}円 · 把握済合計${transport+admission+lodging+other+passCost}円。未入力費用は含みません。</p>`;
 }).join('')+'<p>旧データの費用は「その他予定費用」に保持。交通費との二重計上があれば予定の費用区分を「交通（経路台帳で集計）」へ変更してください。パス購入額は有効開始日に計上（購入日とは異なる場合があります）。</p>';
}
function apply(db){delete db.selection;N.applySnapshot(db);render();}
$('passRegister').onclick=()=>{try{const {db,sel}=context(),name=$('passName').value.trim(),coverage=$('passCoverage').value.trim(),start=$('passStart').value,end=$('passEnd').value,source=$('passSource').value.trim(),raw=$('passPrice').value;
 if(!name||!coverage||!start||!end||start>end||!source)throw Error('券名・対象区間・有効日・公式出典を入力してください');const price=raw===''?null:+raw;if(price!=null&&(!Number.isSafeInteger(price)||price<0))throw Error('購入額は0以上の整数');
 (db.travelPasses??=[]).push({id:crypto.randomUUID(),tripId:sel.tripId,name,coverage,start,end,price,source});apply(db);$('ledgerStatus').textContent='パスを登録しました。区間の適用確認が別途必要です。';}catch(e){$('ledgerStatus').textContent=e.message;}};
$('passRows').onclick=e=>{const id=e.target.dataset.passDelete;if(!id)return;const {db}=context();db.travelPasses=(db.travelPasses||[]).filter(p=>p.id!==id);apply(db);};
$('fareRows').onclick=e=>{const id=e.target.dataset.fareSave;if(id==null)return;try{const i=+id,row=current[i],{db}=context(),raw=panel.querySelector(`[data-base="${i}"]`).value,base=raw===''?null:+raw,source=panel.querySelector(`[data-fare-source="${i}"]`).value.trim(),covered=panel.querySelector(`[data-covered="${i}"]`).checked;
 if(base!=null&&(!Number.isSafeInteger(base)||base<0))throw Error('運賃は0以上の整数');if((base!=null||covered)&&!source)throw Error('公式出典を入力してください');
 (db.routeFares??={})[fingerprint(row,row.chosen)]={base,passId:panel.querySelector(`[data-pass="${i}"]`).value,covered,source};apply(db);$('ledgerStatus').textContent='候補の確認値を保存しました';}catch(e){$('ledgerStatus').textContent=e.message;}};
$('routeRank').onclick=()=>{const ctx=context(),priority=$('routePriority').value;let unknown=false;for(const row of current){if(!row.routes)continue;const ranked=row.routes.map((r,i)=>({i,seconds:r.seconds,...price(row,i,ctx)}));unknown ||=ranked.some(r=>r.yen==null);ranked.sort((a,b)=>priority==='fast'?a.seconds-b.seconds:priority==='pass'?Number(b.pass)-Number(a.pass)||(a.yen??Infinity)-(b.yen??Infinity)||a.seconds-b.seconds:(a.yen??Infinity)-(b.yen??Infinity)||a.seconds-b.seconds);
 if(priority!=='fast'&&ranked[0].yen==null)continue;A.choose(row.key,ranked[0].i);}
 $('ledgerStatus').textContent=unknown?'取得・料金入力済み候補の範囲で選択しました。未確認候補を含む最安保証はありません。':'取得済み候補の範囲で選択しました。';};
window.addEventListener('notebook-routes',render);window.addEventListener('notebook-change',render);render();
})();
