const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../lib/route-engine.js'),P=require('../lib/travel-planner.js'),C=require('../lib/route-core.js');
function encode(points){let a=0,b=0,out='';const put=v=>{v=v<0?~(v<<1):v<<1;while(v>=32){out+=String.fromCharCode((32|(v&31))+63);v>>>=5;}out+=String.fromCharCode(v+63);};for(const [x,y] of points){const c=Math.round(x*1e6),d=Math.round(y*1e6);put(c-a);put(d-b);a=c;b=d;}return out;}
test('Google coordinates use place data before viewport and reject unresolved/foreign URLs',()=>{
 assert.deepEqual(E.coordinates('https://www.google.com/maps/@35,135,16z/data=!3d34.7!4d135.2'),{lat:34.7,lon:135.2});
 assert.deepEqual(E.coordinates('https://www.google.co.jp/maps?q=34.7,135.2'),{lat:34.7,lon:135.2});
 assert.throws(()=>E.coordinates('https://maps.app.goo.gl/example'));
 assert.throws(()=>E.coordinates('https://evil.example/?q=35,135'));
 assert.throws(()=>E.coordinates('https://google.com/maps?q=95,185'));
});
test('requests include planned departure after stay, year and modal costing',()=>{
 const r={from:{lat:35,lon:135},to:{lat:35.1,lon:135.1},mode:'bus',previous:{day:'11/18',time:'23:55',stayMinutes:10}};
 assert.equal(E.request(r,'2026').date_time.value,'2026-11-19T00:05');assert.equal(E.request(r,'2026').costing,'multimodal');
 assert.equal(E.request(r,'2026').alternates,undefined); // Valhalla does not support time-dependent alternates.
 assert.throws(()=>E.request({...r,mode:'unspecified'},'2026'));
 assert.throws(()=>E.request({...r,previous:{day:'11/18',time:'12:00'}},'2026'));
 assert.equal(E.request({...r,mode:'walking',previous:{day:'11/18',time:'12:00'}},'2026').date_time,undefined);
 assert.equal(E.request({...r,mode:'walking',previous:{day:'11/18',time:'12:00'}},'2026').alternates,2);
 assert.throws(()=>E.endpoint('https://valhalla1.openstreetmap.de'));
 assert.throws(()=>E.endpoint('http://example.org'));
 assert.equal(E.endpoint('http://127.0.0.1:8002'),'http://127.0.0.1:8002/route');
});
test('decode provider geometry and split walking, bus, rail; retain alternatives and unknown fares',()=>{
 const coords=[[34.7,135.1],[34.701,135.102],[34.705,135.106],[34.709,135.11]];
 const t={status:0,summary:{time:600,length:1.5},legs:[{shape:encode(coords),maneuvers:[{travel_mode:'pedestrian',begin_shape_index:0,end_shape_index:1},{travel_mode:'transit',travel_type:'bus',type:30,begin_shape_index:1,end_shape_index:2},{travel_mode:'transit',travel_type:'rail',type:30,begin_shape_index:2,end_shape_index:3}]}]};
 assert.deepEqual(E.decode(t.legs[0].shape),coords);const result=E.parse({trip:t,alternates:[{trip:{...t,summary:{time:800,length:2}}}]},'transit');
 assert.deepEqual(result[0].parts.map(p=>p.kind),['walking','bus','rail']);assert.equal(result[0].transfers,1);assert.equal(result[0].fare,null);assert.equal(result.length,2);
 assert.throws(()=>E.parse({trip:{...t,legs:[{...t.legs[0],maneuvers:[{travel_mode:'pedestrian',begin_shape_index:0,end_shape_index:3}]}]}},'transit'));
 assert.throws(()=>E.decode('~~~'));
 assert.throws(()=>E.parse({},'walking'));
 assert.throws(()=>E.parse({trip:{...t,legs:[{...t.legs[0],maneuvers:[{travel_mode:'pedestrian',begin_shape_index:0,end_shape_index:999}]}]}},'walking'));
});
test('insertion respects occupancy, opening hours, buffers and unknown data without moving fixed events',()=>{
 const events=[{id:'a',day:'11/18',time:'09:00',stayMinutes:30,fixed:true},{id:'b',day:'11/18',time:'12:00',bufferMinutes:10,fixed:true}];
 const before=JSON.stringify(events),lookup=(a,b)=>({seconds:a==='a'&&b==='b'?1200:600,fare:null});
 const options={stay:30,buffer:5,preferred:'10:00',open:'10:10',close:'11:00'};
 const out=P.insertions(events,options,lookup);assert.equal(out[0].time,'10:10');assert.equal(out[0].fareDelta,null);assert.equal(out[0].deltaMinutes,0);assert.equal(JSON.stringify(events),before);
 assert.equal(P.insertions(events,{...options,stay:90},lookup).length,0);
 assert.equal(P.insertions(events,options,()=>null).length,0);
 assert.equal(P.insertions(events.map(e=>({...e,bufferMinutes:null})),options,lookup).length,0);
 assert.throws(()=>P.insertions(events,{...options,buffer:-1},lookup));
});
test('a pass only removes fare with explicit covered leg, date and evidence',()=>{
 const pass={confirmed:true,source:'official',legIds:['a'],start:'2026-11-18',end:'2026-11-20'};
 assert.equal(P.fare(300,pass,'a','2026-11-18'),0);assert.equal(P.fare(300,pass,'b','2026-11-18'),300);assert.equal(P.fare(300,pass,'a','2026-11-21'),300);assert.equal(P.fare(null,pass,'a','2026-11-18'),null);
});
test('new appointment constraints reject invalid imported fields',()=>{
 const db={points:require('../data/points.json'),events:structuredClone(require('../data/schedule.json'))};
 for(const patch of [{bufferMinutes:-1},{fixed:'yes'},{openTime:'25:00'},{openTime:'18:00',closeTime:'09:00'}]){const v=structuredClone(db);Object.assign(v.events[0],patch);assert.throws(()=>C.validate(v));}
});
