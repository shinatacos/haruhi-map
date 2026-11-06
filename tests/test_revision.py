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
 browser=pw.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',headless=True)
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
 page.wait_for_timeout(200)
 assert get()==exported
 assert page.evaluate('(k)=>!!localStorage.getItem(k+":backup")',key)
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
 print('Leaflet loaded:',page.evaluate('typeof L!=="undefined"'))
 assert not errors,errors
 browser.close()
server.shutdown()
print('PASS: edit, persistence, add/delete, filters, 5 exports, JSON validation/roundtrip/backup; no page errors')
