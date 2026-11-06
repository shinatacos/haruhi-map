import json, os, sys, threading
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'.test-deps'))
from playwright.sync_api import sync_playwright
os.chdir(root)
server=ThreadingHTTPServer(('127.0.0.1',0),SimpleHTTPRequestHandler)
threading.Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=os.environ.get('CHROME_PATH',r'C:\Program Files\Google\Chrome\Application\chrome.exe'),headless=True)
 page=browser.new_page(accept_downloads=True)
 errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(f'http://127.0.0.1:{server.server_port}/',wait_until='networkidle')
 page.wait_for_selector('[data-event]')
 page.locator('[data-event]').first.click()
 page.locator('#f_時刻').fill('09:07')
 page.locator('#editForm button[type=submit]').click()
 key='haruhi-pilgrimage-map:v1'
 get=lambda:page.evaluate('(key)=>JSON.parse(localStorage.getItem(key))',key)
 assert len(get()['events'])==250
 page.reload(wait_until='networkidle')
 assert any(e['time']=='09:07' for e in get()['events'])
 page.locator('[data-tab=points]').click()
 page.locator('#addPointListBtn').click()
 page.locator('#f_地点名').fill('テスト地点')
 page.locator('#f_地域').fill('テスト地域')
 page.locator('#editForm button[type=submit]').click()
 assert len(get()['points'])==61
 assert 'テスト地域' in page.locator('#areaSelect').inner_text()
 page.locator('#pointSearch').fill('テスト地点')
 assert page.locator('[data-point]').count()==1
 page.locator('[data-point]').click()
 page.once('dialog',lambda d:d.accept())
 page.locator('#deleteBtn').click()
 assert len(get()['points'])==60
 page.locator('#pointSearch').fill('')
 page.locator('[data-tab=schedule]').click()
 page.locator('#addEventBtn').click()
 page.locator('#f_行動').fill('テスト予定')
 page.locator('#editForm button[type=submit]').click()
 assert len(get()['events'])==251
 page.locator('[data-event]').filter(has_text='テスト予定').click()
 page.once('dialog',lambda d:d.accept())
 page.locator('#deleteBtn').click()
 assert len(get()['events'])==250
 for kind in ['json','csv','schedule','geojson','kml']:
  page.locator('#exportBtn').click()
  with page.expect_download() as dl:page.locator(f'[data-export={kind}]').click()
  dest=root/'tests'/('result_'+kind)
  dl.value.save_as(dest)
  assert dest.stat().st_size>0
  if kind=='json': exported=json.loads(dest.read_text(encoding='utf-8'))
  if kind=='geojson':assert len(json.loads(dest.read_text(encoding='utf-8'))['features'])==60
  if kind=='kml':
   import xml.etree.ElementTree as ET
   ET.parse(dest)
 bad=json.loads(json.dumps(exported));bad['points'][0]['lat']=None
 page.once('dialog',lambda d:d.accept())
 page.locator('#importFile').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':json.dumps(bad).encode()})
 page.wait_for_timeout(200)
 assert get()==exported
 page.once('dialog',lambda d:d.accept())
 page.locator('#importFile').set_input_files(root/'tests/result_json')
 page.wait_for_selector('#importDialog[open]')
 page.locator('#importApply').click()
 assert get()==exported
 assert page.evaluate('(k)=>!!localStorage.getItem(k+":backup")',key)
 # Partial import conflicts keep the current row unless explicitly selected.
 event=get()['events'][0]
 patch={'kind':'route-notebook-itinerary','version':1,'points':[],
        'events':[{'id':event['id'],'time':'08:09'}]}
 def upload(value):
  page.locator('#importFile').set_input_files({'name':'patch.json','mimeType':'application/json','buffer':json.dumps(value).encode()})
  page.wait_for_selector('#importDialog[open]')
 upload(patch)
 assert not page.locator('[data-merge]').first.is_checked()
 page.locator('#importApply').click()
 assert get()['events'][0]==event
 upload(patch)
 page.locator('[data-merge]').first.check()
 page.locator('#importApply').click()
 assert get()['events'][0]['time']=='08:09'
 assert len(get()['events'])==250
 assert get()['events'][0]['confidence']=='要確認'
 assert page.evaluate('(k)=>JSON.parse(localStorage.getItem(k+":backup")).events[0].time',key)==event['time']
 # Exercise the actual Leaflet marker drag handler without external route services.
 page.locator('#showAllPoints').check()
 page.locator('[data-tab=points]').click()
 page.locator('[data-point]').first.click()
 page.locator('#dragBtn').click()
 before=get()
 page.evaluate('''() => {
  const icon=document.querySelector('.leaflet-marker-draggable');
  if(!icon)throw Error('Draggable marker missing');
  const r=icon.getBoundingClientRect();window.dragStart={x:r.x+r.width/2,y:r.y+r.height/2};
 }''')
 pos=page.evaluate('window.dragStart')
 page.mouse.move(pos['x'],pos['y'])
 page.mouse.down()
 page.mouse.move(pos['x']+35,pos['y']+25,steps=10)
 page.mouse.up()
 page.wait_for_timeout(200)
 assert get()!=before,'Marker drag did not save'
 assert any(p['precision']=='手動調整（未検証）' for p in get()['points'])
 # Mobile layout: date selection remains available in map mode.
 page.set_viewport_size({'width':390,'height':844})
 page.locator('[data-view=map]').click()
 assert page.locator('#mapDaySelect').is_visible()
 day=page.locator('#mapDaySelect option').nth(1).get_attribute('value')
 page.locator('#mapDaySelect').select_option(day)
 assert page.locator('#daySelect').input_value()==day
 assert page.locator('#map').bounding_box()['height']>200
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.locator('[data-view=schedule]').click()
 assert page.locator('#daySelect').is_visible()
 # Public origin is simulated locally; no deployment or network write occurs.
 public=browser.new_context()
 public.route('https://route-notebook.test/**',lambda route:route.fulfill(
  path=str(root/(route.request.url.split('route-notebook.test/')[1] or 'index.html'))))
 pub=public.new_page()
 pub.add_init_script('localStorage.setItem('+json.dumps(key)+', '+json.dumps(json.dumps(get()))+')')
 pub.goto('https://route-notebook.test/',wait_until='networkidle')
 assert not pub.locator('#importBtn').is_visible()
 assert not pub.locator('#addEventBtn').is_visible()
 assert '閲覧専用' in pub.locator('#saveStatus').inner_text()
 pub.locator('[data-event]').first.click()
 assert not pub.locator('#commitBtn').is_visible()
 assert pub.locator('#editFields input').count()==0
 assert pub.locator('meta[name=robots]').get_attribute('content').startswith('noindex')
 public.close()
 print('Leaflet loaded:',page.evaluate('typeof L!=="undefined"'))
 assert not errors,errors
 browser.close()
server.shutdown()
print('PASS: editing, persistence, filters, exports, validation, restore, merge conflicts, backup, marker drag, mobile dates, public view-only')
