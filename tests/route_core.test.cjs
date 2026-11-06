const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const C=require('../lib/route-core.js');
const seed={trips:require('../data/trips.json'),points:require('../data/points.json'),events:require('../data/schedule.json')};
const patch=rows=>({kind:'route-notebook-itinerary',version:1,points:[],events:rows});
const clone=x=>JSON.parse(JSON.stringify(x));
test('all original IDs, contents, lodging and constraints retained byte for byte',()=>{
 for(const path of ['data/points.json','data/schedule.json'])assert.equal(fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n'),execFileSync('git',['show','HEAD:'+path],{encoding:'utf8'}).replace(/\r\n/g,'\n'));
 assert.equal(seed.points.length,60);assert.equal(seed.events.length,250);
 assert.equal(seed.points.filter(p=>p.precision==='座標確認').length,14);
 assert.equal(seed.events.filter(e=>e.plan==='旧旅程').length,193);
 assert.equal(seed.events.filter(e=>e.plan==='SOS展改訂').length,57);
 assert.ok(JSON.stringify(seed).includes('エスカル神戸'));C.validate(seed);
});
test('patch preserves omitted IDs, fields and source; does not mutate input',()=>{
 const before=JSON.stringify(seed),e=seed.events[0];
 const next=C.mergeItinerary(seed,patch([{id:e.id,time:'09:07'}]));
 assert.equal(next.events.length,250);assert.equal(next.points.length,60);
 assert.deepEqual(next.events[0],{...e,time:'09:07',confidence:'要確認'});assert.equal(JSON.stringify(seed),before);
 assert.equal(C.changes(seed,next).length,1);
});
test('generic trip, place and event can be added without editing pilgrimage',()=>{
 const p=patch([{id:'new-event',tripId:'paris',plan:'基本',day:'2027-01-05',time:'10:00',action:'美術館',pointId:'museum'}]);
 p.trips=[{id:'paris',title:'Paris',startDate:'2027-01-05',endDate:'2027-01-07',budget:50000}];
 p.points=[{id:'museum',tripId:'paris',name:'Museum',lat:48.86,lon:2.33}];
 const next=C.mergeItinerary(seed,p);assert.equal(next.events.length,251);assert.equal(next.trips.length,2);
 assert.equal(next.events.at(-1).confidence,'計画');assert.equal(next.points.at(-1).precision,'手動追加（未検証）');
});
test('reject duplicate IDs, invalid time, invalid dates, bad coordinates and missing references',()=>{
 const e=seed.events[0];
 for(const rows of [[{id:e.id,time:'25:00'}],[{id:e.id,day:'11/31'}],[{id:e.id,pointId:'missing'}],[{id:e.id},{id:e.id}]])assert.throws(()=>C.mergeItinerary(seed,patch(rows)));
 for(const lat of [null,'34',NaN,91]){const d=clone(seed);d.points[0].lat=lat;assert.throws(()=>C.validate(d));}
 assert.equal(C.validDay('2027-02-29'),false);assert.equal(C.validDay('2028-02-29'),true);
});
test('reject cross-trip references and missing trip membership',()=>{
 const d=clone(seed);d.points[0].tripId='missing';assert.throws(()=>C.validate(d));
 d.trips.push({...d.trips[0],id:'missing'});d.events[0].pointId=d.points[0].id;assert.throws(()=>C.validate(d));
});
test('official timetable and measured time require evidence',()=>{
 for(const confidence of ['公式ダイヤ','実測'])assert.throws(()=>C.mergeItinerary(seed,patch([{id:seed.events[0].id,confidence,source:''}])));
 assert.doesNotThrow(()=>C.mergeItinerary(seed,patch([{id:seed.events[0].id,confidence:'公式ダイヤ',source:'Official URL; target date; checked date'}])));
});
test('moving a place downgrades coordinate precision',()=>{
 const p={kind:'route-notebook-itinerary',version:1,points:[{id:seed.points[0].id,lat:35}],events:[]};
 assert.equal(C.mergeItinerary(seed,p).points[0].precision,'手動調整（未検証）');
});
test('reject prototype keys',()=>assert.throws(()=>C.mergeItinerary(seed,JSON.parse('{"kind":"route-notebook-itinerary","version":1,"points":[],"events":[],"__proto__":{}}'))));
test('links have API=1 and walking/transit modes without API keys',()=>{
 const [a,b]=seed.points;
 for(const mode of ['walking','transit','jr']){const u=new URL(C.directionsURL(a,b,mode));assert.equal(u.searchParams.get('api'),'1');assert.equal(u.searchParams.get('travelmode'),mode==='jr'?'transit':mode);assert.equal(u.searchParams.get('key'),null);}
 assert.equal(new URL(C.searchURL(a)).hostname,'www.google.com');
});
test('segments follow timeline and never connect days, plans or trips',()=>{
 const [a,b]=seed.points,base={plan:'A',day:'11/19',action:'x'};
 const es=[{...base,id:'b',time:'12:00',order:0,pointId:b.id},{...base,id:'a',time:'09:00',order:9,pointId:a.id}];
 assert.equal(C.segments(seed,es)[0].from.id,a.id);
 es[1].day='11/20';assert.equal(C.segments(seed,es).length,0);es[1].day='11/19';es[1].plan='B';assert.equal(C.segments(seed,es).length,0);
});
test('KML escapes XML and includes every place with straight-line disclaimer',()=>{
 const d=clone(seed);d.points[0].name='<A & B>';const k=C.kml(d);
 assert.ok(k.includes('&lt;A &amp; B&gt;'));assert.ok(k.includes('straight-reference'));
 for(const p of seed.points)assert.ok(k.includes('<value>'+p.id+'</value>'));
 assert.ok(k.includes('鉄道路線や所要時間ではありません'));
});

test('full restores reject unsafe keys and noncanonical dates',()=>{
 const d=clone(seed);d.extra=JSON.parse('{"constructor":{"prototype":{}}}');assert.throws(()=>C.validate(d));
 for(const day of ['11-18','2026-11/18','2026-1-01','2026/11/18'])assert.equal(C.validDay(day),false);
});
test('changing a verified departure requires renewed confidence',()=>{
 const d=clone(seed);d.events[0].confidence='公式ダイヤ';d.events[0].source='Previous official timetable';
 const next=C.mergeItinerary(d,patch([{id:d.events[0].id,time:'09:08'}]));
 assert.equal(next.events[0].confidence,'要確認');assert.equal(next.events[0].source,d.events[0].source);
});
