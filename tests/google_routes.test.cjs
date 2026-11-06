const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../lib/route-core.js');
const G=require('../google-route-panel.js');

test('Google panel ordering matches core with omitted order and mixed date forms',()=>{
 const events=[
  {id:'a',day:'11/9',time:'09:00',order:5},
  {id:'b',day:'11/9',time:'09:00'},
  {id:'c',day:'11/9',time:'08:00',order:9},
  {id:'d',day:'2026-11-10',time:'09:00'},
  {id:'e',day:'11/18',time:'09:00',order:0}
 ];
 assert.deepEqual(G.sortedEvents(events),C.ordered(events));
});

test('Google legs match core after time edits without crossing plan, day or trip',()=>{
 const data={points:require('../data/points.json'),events:require('../data/schedule.json')};
 for(const plan of new Set(data.events.map(e=>e.plan))){
  const events=data.events.filter(e=>e.plan===plan).map((e,i)=>i===0?{...e,time:'23:59'}:e);
  const actual=G.legsOf({...data,events},'legacy',plan,'all');
  const expected=C.segments(data,events).map(r=>({from:r.from.id,to:r.to.id,eventId:r.event.id,day:r.event.day,time:r.event.time,name:r.event.action}));
  assert.deepEqual(actual,expected);
 }
});

test('Google links encode both endpoints and modes without an Embed key',()=>{
 for(const mode of ['walking','transit']){
  const url=new URL(G.mapsUrl('駅 & A','35.1,135.2',mode));
  assert.equal(url.searchParams.get('origin'),'駅 & A');
  assert.equal(url.searchParams.get('destination'),'35.1,135.2');
  assert.equal(url.searchParams.get('travelmode'),mode);
  assert.equal(url.searchParams.get('api'),'1');
  assert.equal(url.searchParams.has('key'),false);
 }
});
