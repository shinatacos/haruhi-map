/* Valhalla adapter: no public demo endpoint, no fabricated geometry or fare. */
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.RouteEngine=api;})(globalThis,()=>{
'use strict';
function coordinates(value){
 const u=new URL(value);if(!/(^|\.)(google\.[a-z.]+|maps\.google\.[a-z.]+)$/.test(u.hostname))throw Error('Google MapsのURLを入力してください');
 const raw=decodeURIComponent(u.href),m=raw.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/)||raw.match(/[?&](?:q|query)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/)||raw.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
 if(!m)throw Error('座標を含むURLが必要です。短縮URL・施設名だけのURLは展開しません');
 const lat=+m[1],lon=+m[2];if(Math.abs(lat)>90||Math.abs(lon)>180)throw Error('座標が範囲外です');return {lat,lon};
}
function decode(s){let i=0,a=0,b=0,out=[];function read(){let n=0,shift=0,v;do{if(i>=s.length||shift>30)throw Error('不正な経路座標');v=s.charCodeAt(i++)-63;if(v<0||v>63)throw Error('不正な経路座標');n|=(v&31)<<shift;shift+=5;}while(v>=32);return n&1?~(n>>1):n>>1;}
 while(i<s.length){a+=read();b+=read();if(Math.abs(a/1e6)>90||Math.abs(b/1e6)>180)throw Error('経路座標が範囲外');out.push([a/1e6,b/1e6]);}return out;}
const transit=mode=>['transit','bus','jr','hankyu','hanshin','subway'].includes(mode);
function request(r,year){
 if(r.mode==='unspecified')throw Error('移動手段を指定してください');
 const day=r.previous.day.includes('-')?r.previous.day:year+'-'+r.previous.day.split('/').map(x=>x.padStart(2,'0')).join('-');
 const start=new Date(day+'T'+r.previous.time+':00+09:00');if(!Number.isFinite(start.getTime())||(transit(r.mode)&&r.previous.stayMinutes==null))throw Error('公共交通の出発日時と出発地の滞在予定分が必要です');
 const depart=r.previous.stayMinutes==null?null:new Date(start.getTime()+r.previous.stayMinutes*60000+9*3600000).toISOString().slice(0,16);
 return {locations:[{lat:r.from.lat,lon:r.from.lon},{lat:r.to.lat,lon:r.to.lon}],costing:transit(r.mode)?'multimodal':({walking:'pedestrian',driving:'auto',bicycling:'bicycle'})[r.mode],...(r.previous.stayMinutes!=null?{date_time:{type:1,value:depart}}:{alternates:2}),units:'kilometers',language:'ja-JP'};
}
function parse(data,mode){
 if(!data?.trip)throw Error('経路応答がありません');
 return [data.trip,...(data.alternates||[]).map(x=>x.trip)].filter(Boolean).map(t=>{
  if(t.status!==0||!t.legs?.length)throw Error('経路が見つかりません');
  const parts=[],steps=[];let rides=0;
  for(const leg of t.legs){const shape=decode(leg.shape||'');if(shape.length<2)throw Error('実経路座標がありません');
   if(!leg.maneuvers?.length)throw Error('移動手段別の経路情報がありません');
   for(const m of leg.maneuvers){
    if(!['transit','pedestrian','bicycle','drive'].includes(m.travel_mode))throw Error('不明な移動手段です');
    if(!Number.isInteger(m.begin_shape_index)||!Number.isInteger(m.end_shape_index)||m.begin_shape_index<0||m.end_shape_index<m.begin_shape_index||m.end_shape_index>=shape.length)throw Error('経路形状の範囲が不正です');
    const kind=m.travel_mode==='transit'?(m.travel_type==='bus'?'bus':['rail','tram','metro','funicular'].includes(m.travel_type)?'rail':'transit_other'):m.travel_mode==='pedestrian'?'walking':m.travel_mode==='bicycle'?'bicycling':'driving';
    if(m.travel_mode==='transit'&&[30,31].includes(m.type))rides++;
    const coords=shape.slice(m.begin_shape_index,m.end_shape_index+1);if(coords.length>1)parts.push({kind,coords});steps.push(m.instruction||m.transit_info?.short_name||kind);
   }
  }
  if(!parts.length)throw Error('描画できる経路形状がありません');
  if(transit(mode)&&!parts.some(p=>['bus','rail','transit_other'].includes(p.kind)))throw Error('公共交通経路なし（GTFS対象地域・日付を確認）');
  if(!Number.isFinite(t.summary?.time)||t.summary.time<0||!Number.isFinite(t.summary?.length)||t.summary.length<0)throw Error('経路集計が不正です');
  return {parts,steps,seconds:t.summary.time,km:t.summary.length,transfers:transit(mode)?(rides?Math.max(0,rides-1):null):0,fare:null};
 });
}
function endpoint(value){const u=new URL(value);if(u.username||u.password||u.search||u.hash||!(u.protocol==='https:'||(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname))))throw Error('HTTPSまたはローカルHTTPの自己管理URLを指定してください');if(/valhalla1\.openstreetmap\.de|valhalla\.openstreetmap\.de/.test(u.hostname))throw Error('公開デモサーバーは利用できません');return u.href.replace(/\/$/,'')+'/route';}
return {coordinates,decode,request,parse,endpoint,transit};
});
