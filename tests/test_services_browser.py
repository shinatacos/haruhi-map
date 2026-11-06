"""Real Chromium UI checks; Valhalla and Firebase SDK responses are explicit test fixtures.
Does not claim to verify a live transit backend, real Google login or deployed Firestore rules.
"""
import json, os, sys, threading
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'.test-deps'))
from playwright.sync_api import sync_playwright
os.chdir(root)
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),Quiet)
threading.Thread(target=server.serve_forever,daemon=True).start()
def shape(points):
 out='';prev=[0,0]
 for p in points:
  for i,v in enumerate(p):
   n=round(v*1e6);d=n-prev[i];prev[i]=n;d=~(d<<1) if d<0 else d<<1
   while d>=32:out+=chr((32|(d&31))+63);d>>=5
   out+=chr(d+63)
 return out
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=os.environ.get('CHROME_PATH',r'C:\Program Files\Google\Chrome\Application\chrome.exe'),headless=True)
 page=browser.new_page(viewport={'width':1440,'height':1000},accept_downloads=True)
 errors=[];requests=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 # Avoid bulk tile downloads while testing UI; live OSM status is a separate manual observation.
 page.route('https://tile.openstreetmap.org/**',lambda r:r.fulfill(status=403,body='Fixture tile failure'))
 def route_fixture(route):
  req=route.request.post_data_json;requests.append(req);a,b=req['locations'];pts=[[a['lat'],a['lon']],[(a['lat']+b['lat'])/2+.001,(a['lon']+b['lon'])/2], [b['lat'],b['lon']]]
  transit=req['costing']=='multimodal'
  trip={'status':0,'summary':{'time':600,'length':1.5},'legs':[{'shape':shape(pts),'maneuvers':[{'travel_mode':'pedestrian','begin_shape_index':0,'end_shape_index':1,'instruction':'Fixture walking'}, {'travel_mode':'transit' if transit else 'pedestrian','travel_type':'bus','type':30,'begin_shape_index':1,'end_shape_index':2,'instruction':'Fixture bus' if transit else 'Fixture walking'}]}]}
  alt=json.loads(json.dumps(trip));alt['summary']['time']=900
  route.fulfill(json={'trip':trip,'alternates':[{'trip':alt}] if req.get('alternates') else []},headers={'Access-Control-Allow-Origin':'*'})
 page.route('https://router.fixture.test/route',route_fixture)
 page.goto(f'http://127.0.0.1:{server.server_port}/',wait_until='networkidle')
 page.wait_for_selector('[data-event]')
 assert len(page.evaluate('RouteNotebook.getSnapshot().points'))==60
 assert len(page.evaluate('RouteNotebook.getSnapshot().events'))==250
 assert page.evaluate("RouteNotebook.getSnapshot().points.filter(p=>p.precision!=='座標確認').length")==46
 # Create a separate test trip while preserving all original seed objects.
 page.evaluate('''() => {const db=RouteNotebook.getSnapshot();delete db.selection;
 db.trips.push({id:'fixture',title:'Fixture trip',startDate:'2026-11-18',endDate:'2026-11-19',budget:0});
 db.points.push(...['A','B','C'].map((id,i)=>({id,tripId:'fixture',name:id,lat:34.7+i*.01,lon:135.2+i*.01,precision:'未検証'})));
 db.events.push(...['A','B','C'].map((id,i)=>({id:'e'+id,tripId:'fixture',pointId:id,plan:'Fixture',day:'11/18',time:['09:00','12:00','15:00'][i],action:id,stayMinutes:i===0?null:20,bufferMinutes:5,travelMode:i===2?'bus':'walking',confidence:'計画',fixed:i===1,cost:0})));
 RouteNotebook.applySnapshot(db);}''')
 page.select_option('#tripSelect','fixture');page.locator('[data-tab=routes]').click()
 page.locator('.service-settings summary').first.click()
 page.fill('#serviceEndpoint','https://router.fixture.test');page.check('#serviceConsent');page.click('#serviceApply')
 page.wait_for_function("document.querySelector('#routingStatus').textContent.includes('取得 2/2')")
 assert page.locator('#actualRoutes [data-route-choice]').count()==2
 assert page.locator('.leaflet-overlay-pane path').count()>=4
 colors=page.locator('.leaflet-overlay-pane path').evaluate_all('(els)=>els.map(e=>e.getAttribute("stroke"))')
 assert '#15803d' in colors and '#d97706' in colors
 page.locator('[data-route-choice]').first.select_option('1')
 assert page.evaluate('RouteActual.getRows()[0].chosen')==1
 # Time edit triggers a fresh routing request, and updates source-of-truth departure.
 count=len(requests)
 page.evaluate("() => {const db=RouteNotebook.getSnapshot();delete db.selection;Object.assign(db.events.find(e=>e.id==='eA'),{time:'09:10',stayMinutes:20});RouteNotebook.applySnapshot(db);}")
 page.wait_for_function("document.querySelector('#routingStatus').textContent.includes('取得 2/2')")
 assert len(requests)>count
 assert any(r.get('date_time',{}).get('value')=='2026-11-18T09:30' for r in requests)
 # Conservative insertion adds one event without moving a fixed appointment.
 page.locator('summary').filter(has_text='空き時間への予定挿入').click()
 page.select_option('#insertPoint','C');page.fill('#insertStay','15');page.fill('#insertBuffer','5');page.fill('#insertTime','10:00');page.click('#insertCalculate')
 page.wait_for_selector('[data-insert]')
 fixed=page.evaluate("RouteNotebook.getSnapshot().events.find(e=>e.id==='eB')")
 page.locator('[data-insert]').first.click()
 assert len(page.evaluate('RouteNotebook.getSnapshot().events'))==254
 assert page.evaluate("RouteNotebook.getSnapshot().events.find(e=>e.id==='eB')")==fixed
 page.click('#undoBtn')
 page.wait_for_function("document.querySelector('#routingStatus').textContent.includes('取得 2/2')")
 # Pass dates, official evidence, candidate fare, selection priority and JSON retention.
 page.locator('summary').filter(has_text='パス適用・候補比較').click()
 for id,value in {'passName':'Fixture pass','passCoverage':'Fixture bus entire leg','passStart':'2026-11-18','passEnd':'2026-11-18','passPrice':'500','passSource':'https://operator.fixture.test/pass'}.items():page.fill('#'+id,value)
 page.click('#passRegister')
 page.wait_for_function("document.querySelector('#routingStatus').textContent.includes('取得 2/2')")
 page.locator('[data-base="0"]').fill('300');pass_id=page.evaluate('RouteNotebook.getSnapshot().travelPasses[0].id')
 page.locator('[data-pass="0"]').select_option(pass_id);page.locator('[data-covered="0"]').check();page.locator('[data-fare-source="0"]').fill('https://operator.fixture.test/pass');page.locator('[data-fare-save="0"]').click()
 page.wait_for_function("document.querySelector('#routingStatus').textContent.includes('取得 2/2')")
 assert '追加支払：0円' in page.locator('#fareRows').inner_text()
 page.select_option('#routePriority','pass');page.click('#routeRank')
 assert '未確認' in page.locator('#ledgerStatus').inner_text()
 assert 'パス購入500円' in page.locator('#dailyCosts').inner_text()
 assert len(page.evaluate('Object.keys(RouteNotebook.getSnapshot().routeFares)'))==1
 # Point URL edit, coordinate downgrade, Undo and persistence.
 page.locator('[data-tab=points]').click();page.locator('[data-point=A]').click()
 page.fill('[name="Google Maps URL"]','https://www.google.com/maps?q=34.72,135.24');page.click('#urlCoordsBtn')
 page.fill('[name="地点名"]','A edited');page.fill('[name="撮影位置メモ"]','公道の代表点');page.click('#commitBtn')
 assert page.evaluate("RouteNotebook.getSnapshot().points.find(p=>p.id==='A').lat")==34.72
 page.click('#undoBtn')
 assert page.evaluate("RouteNotebook.getSnapshot().points.find(p=>p.id==='A').name")=='A'
 page.reload(wait_until='networkidle');page.select_option('#tripSelect','fixture')
 # Map tap relocates an existing point, then saves to the same ID.
 page.locator('[data-tab=points]').click();page.locator('[data-point=A]').click();page.click('#pickPositionBtn')
 page.locator('#map').click(position={'x':220,'y':200});page.wait_for_selector('#editDialog[open]');page.click('#commitBtn')
 assert page.evaluate("RouteNotebook.getSnapshot().points.find(p=>p.id==='A').precision")=='手動調整（未検証）'
 assert len(page.evaluate('RouteNotebook.getSnapshot().points'))==63
 # All required viewport sizes, real map layout/invalidateSize and date changes.
 out=root/'tests/artifacts';out.mkdir(exist_ok=True)
 for width in [1440,390,375,320]:
  page.set_viewport_size({'width':width,'height':1000 if width==1440 else 844})
  if width<850:page.click('[data-view=map]')
  page.wait_for_timeout(200)
  assert page.locator('#map').bounding_box()['height']>200
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  assert page.evaluate('RouteNotebook.getMap().getSize().x===document.querySelector("#map").clientWidth')
  page.select_option('#mapDaySelect','all');assert page.locator('#daySelect').input_value()=='all'
  page.wait_for_function("document.querySelector('#routingStatus').textContent.includes('取得 2/2')")
  assert page.locator('.leaflet-overlay-pane path').count()>=4
  page.screenshot(path=str(out/f'services-map-{width}.png'))
  if width<850:page.click('[data-view=schedule]')
  page.locator('[data-tab=routes]').click();page.screenshot(path=str(out/f'services-panel-{width}.png'))
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
 # Explicit unconfigured auth error; no network SDK or successful auth is implied.
 page.locator('.service-settings summary').first.click() if not page.locator('#googleLogin').is_visible() else None
 page.fill('#firebaseConfig','{}');page.click('#googleLogin')
 assert '認証エラー' in page.locator('#authStatus').inner_text()
 # Official SDK interface fixture only: verify our UID paths and conflict handling.
 page.evaluate("window.fixtureCloud={docs:{},uid:'userA',listener:null}")
 def sdk_fixture(route):
  name=route.request.url.split('/')[-1]
  if name=='firebase-app.js':body="export const initializeApp=(cfg,name)=>({cfg,name});"
  elif name=='firebase-auth.js':body='''export const getAuth=()=>({});export class GoogleAuthProvider{};
export const onAuthStateChanged=(auth,fn)=>{window.fixtureCloud.listener=fn;fn(null)};
export const signInWithPopup=async()=>{window.fixtureCloud.listener({uid:window.fixtureCloud.uid,email:window.fixtureCloud.uid+'@fixture.test'})};
export const signOut=async()=>window.fixtureCloud.listener(null);'''
  else:body='''const snap=ref=>({exists:()=>!!window.fixtureCloud.docs[ref],data:()=>window.fixtureCloud.docs[ref]});
export const getFirestore=()=>({});export const doc=(fs,...path)=>path.join('/');
export const getDoc=async ref=>snap(ref);export const serverTimestamp=()=>1;
export const onSnapshot=(ref,fn)=>{fn(snap(ref));return ()=>{}};
export const runTransaction=async(fs,fn)=>fn({get:async ref=>snap(ref),set:(ref,value)=>{window.fixtureCloud.docs[ref]=value}});'''
  route.fulfill(body=body,content_type='text/javascript',headers={'Access-Control-Allow-Origin':'*'})
 page.route('https://www.gstatic.com/firebasejs/12.5.0/*',sdk_fixture)
 page.fill('#firebaseConfig',json.dumps({'apiKey':'fixture','authDomain':'fixture.test','projectId':'fixture','appId':'fixture'}));page.click('#googleLogin')
 page.wait_for_function("!document.querySelector('#cloudUpload').disabled")
 page.click('#cloudUpload');page.wait_for_function("document.querySelector('#authStatus').textContent.includes('クラウド保存済み')")
 assert page.evaluate("!!window.fixtureCloud.docs['users/userA/notebooks/main']")
 remote=page.evaluate("window.fixtureCloud.docs['users/userA/notebooks/main']")
 assert len(json.loads(remote['json'])['points'])==63
 page.evaluate("window.fixtureCloud.docs['users/userA/notebooks/main'].revision='other-device'")
 page.check('#autoSync');page.click('#cloudUpload');page.wait_for_function("document.querySelector('#authStatus').textContent.includes('競合')")
 assert not page.locator('#autoSync').is_checked()
 assert page.evaluate("window.fixtureCloud.docs['users/userA/notebooks/main'].revision")=='other-device'
 page.click('#cloudDownload');page.wait_for_function("document.querySelector('#authStatus').textContent.includes('取り込みました')")
 page.click('#googleLogout');assert page.locator('#cloudUpload').is_disabled()
 page.evaluate("window.fixtureCloud.uid='userB'");page.click('#googleLogin')
 page.wait_for_function("!document.querySelector('#cloudUpload').disabled")
 assert not page.locator('#autoSync').is_checked()
 page.click('#cloudUpload');page.wait_for_function("document.querySelector('#authStatus').textContent.includes('クラウド保存済み')")
 assert page.evaluate("Object.keys(window.fixtureCloud.docs).sort()") == ['users/userA/notebooks/main','users/userB/notebooks/main']
 assert page.evaluate("window.fixtureCloud.docs['users/userA/notebooks/main'].revision")=='other-device'
 page.click('#googleLogout')
 assert not errors,errors
 print('PASS: seed retention, fixture walking/bus geometry, alternatives, time reroute, insertion/fixed appointment, passes/fares, URL coordinates, Undo, map tap, reload, 1440/390/375/320 layouts, date switch, auth error, SDK-fixture login/logout/UID paths/cloud conflict/import')
 browser.close()
server.shutdown()
