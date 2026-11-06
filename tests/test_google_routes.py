import sys,os,json,threading,traceback
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
r=Path(__file__).resolve().parents[1];sys.path.insert(0,str(r/'.test-deps'))
from playwright.sync_api import sync_playwright
os.chdir(r)
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*a):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
out={'consoleErrors':[],'errors':[],'failed':[],'httpErrors':[],'tiles':[],'widths':[]}
art=r/'tests/artifacts';art.mkdir(exist_ok=True)
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',headless=True)
 page=browser.new_page()
 page.on('console',lambda m:out['consoleErrors'].append(m.text) if m.type=='error' else None)
 page.on('pageerror',lambda e:out['errors'].append(str(e)))
 page.on('requestfailed',lambda q:out['failed'].append({'url':q.url,'error':q.failure}))
 def response(res):
  if res.status>=400:out['httpErrors'].append({'url':res.url,'status':res.status})
  if 'tile.openstreetmap.org' in res.url:out['tiles'].append({'url':res.url,'status':res.status,'referer':res.request.all_headers().get('referer'),'cache':res.headers.get('cache-control')})
 page.on('response',response)
 try:
  page.goto(f'http://127.0.0.1:{server.server_port}/',wait_until='networkidle',timeout=60000)
  page.wait_for_selector('#rg-launch')
  out['initial']=page.evaluate('({leaflet:typeof L,points:RouteNotebook.getSnapshot().points.length,events:RouteNotebook.getSnapshot().events.length})')
  page.locator('#daySelect').select_option('all')
  for width in [1440,390,375,320]:
   page.set_viewport_size({'width':width,'height':900 if width==1440 else 844})
   if width<850:page.locator('[data-view=map]').click()
   page.locator('#mapDaySelect' if width<850 else '#daySelect').select_option('all')
   page.wait_for_timeout(700)
   box=page.locator('#map').bounding_box();assert box['height']>180,box
   sizes=page.evaluate('''()=>{const el=document.querySelector('#map');return {w:el.clientWidth,h:el.clientHeight,tileCount:el.querySelectorAll('.leaflet-tile-loaded').length,overflow:document.documentElement.scrollWidth>innerWidth,polylines:el.querySelectorAll('path.leaflet-interactive').length}}''')
   assert sizes['tileCount']>0,sizes
   assert not sizes['overflow'],sizes
   assert sizes['polylines']==0
   page.locator('#rg-launch').click()
   expected=page.evaluate('RouteCore.segments(RouteNotebook.getSnapshot(),RouteNotebook.getSnapshot().events.filter(e=>e.plan===RouteNotebook.getSnapshot().selection.plan)).length')
   assert page.locator('#rg-leg option').count()==expected+1
   page.locator('#rg-leg').select_option('0')
   # Returning to arbitrary endpoints must stop using the itinerary event's fare key.
   page.locator('#rg-fare').fill('123');page.locator('#rg-save-fare').click()
   page.locator('#rg-leg').select_option('')
   assert page.locator('#rg-fare').input_value()==''
   page.locator('#rg-leg').select_option('0')
   assert page.locator('#rg-fare').input_value()=='123'
   page.locator('#rg-from').dispatch_event('change')
   assert page.locator('#rg-leg').input_value()==''
   page.locator('#rg-leg').select_option('0')
   for mode in ['walking','transit']:
    page.locator('#rg-mode').select_option(mode)
    href=page.locator('#rg-open').get_attribute('href')
    assert 'travelmode='+mode in href,href
    if width in [1440,390,375,320]:
     with page.expect_popup() as popup:page.locator('#rg-open').click()
     dest=popup.value
     popup_errors=[]
     dest.on('requestfailed',lambda q:popup_errors.append({'url':q.url,'error':q.failure}))
     try:dest.wait_for_load_state('domcontentloaded',timeout=45000)
     except Exception as e:out.setdefault('navigationErrors',[]).append(str(e))
     dest.wait_for_timeout(8000)
     out.setdefault('destinations',[]).append({'mode':mode,'href':href,'actual':dest.url,'title':dest.title(),'bodyLength':len(dest.locator('body').inner_text()),'failed':popup_errors})
     dest.screenshot(path=str(art/f'google-{mode}-{width}.png'));dest.close()
   assert page.locator('#rg-map-area iframe').count()==0
   assert 'キー' in page.locator('#rg-map-area').inner_text()
   page.screenshot(path=str(art/f'panel-{width}.png'))
   page.locator('#rg-close').click()
   page.screenshot(path=str(art/f'map-{width}.png'))
   if width<850:
    page.locator('[data-view=schedule]').click();assert page.locator('#daySelect').is_visible()
    page.locator('[data-tab=routes]').click();assert page.locator('.route-card').count()>0
    page.locator('[data-view=map]').click()
    day=page.locator('#mapDaySelect option').nth(1).get_attribute('value');page.locator('#mapDaySelect').select_option(day)
    assert page.locator('#daySelect').input_value()==day
    page.set_viewport_size({'width':844,'height':width});page.wait_for_timeout(500)
    assert page.locator('#map').bounding_box()['height']>50
    page.set_viewport_size({'width':width,'height':844});page.wait_for_timeout(500)
   out['widths'].append({'width':width,'box':box,**sizes})
  # Both old and new plans must use exactly the application's live order.
  page.set_viewport_size({'width':1440,'height':900})
  for plan in page.locator('#planSelect option').evaluate_all('(es)=>es.map(e=>e.value)'):
   page.locator('#planSelect').select_option(plan);page.locator('#daySelect').select_option('all')
   page.locator('#rg-launch').click()
   expected=page.evaluate('RouteCore.segments(RouteNotebook.getSnapshot(),RouteNotebook.getSnapshot().events.filter(e=>e.plan===RouteNotebook.getSnapshot().selection.plan)).map(r=>({from:r.from.id,to:r.to.id,time:r.event.time}))')
   actual=page.evaluate('RouteGoogleFree.legsOf(RouteNotebook.getSnapshot(),RouteNotebook.getSnapshot().selection.tripId,RouteNotebook.getSnapshot().selection.plan,"all").map(r=>({from:r.from,to:r.to,time:r.time}))')
   assert actual==expected
   page.locator('#rg-close').click()
  # Edit through the actual UI, then inspect the live panel and Google URL.
  page.set_viewport_size({'width':1440,'height':900})
  page.locator('[data-tab=points]').click();page.locator('#showAllPoints').check()
  page.locator('[data-point]').first.click();page.locator('#f_地点名').fill('同期確認地点');page.locator('#editForm button[type=submit]').click()
  snapshot=page.evaluate('RouteNotebook.getSnapshot()');edited=next(p for p in snapshot['points'] if p['name']=='同期確認地点')
  page.locator('#rg-launch').click();assert '同期確認地点' in page.locator('#rg-from').inner_text()
  page.locator('#rg-from').select_option(edited['id']);out['editedLink']=page.locator('#rg-open').get_attribute('href')
  page.locator('#rg-close').click()
  page.reload(wait_until='networkidle');assert any(p['name']=='同期確認地点' for p in page.evaluate('RouteNotebook.getSnapshot().points'))
  out['normalConsoleErrors']=list(out['consoleErrors'])
  assert not out['errors'],out['errors']
  assert not out['normalConsoleErrors'],out['normalConsoleErrors']
  # Unconfigured iframe must never be inserted. An explicitly invalid key exercises Google's real rejection.
  page.locator('#rg-launch').click();page.locator('#rg-key').fill('invalid-test-key');page.locator('#rg-key').dispatch_event('change')
  page.wait_for_timeout(3500)
  out['iframe']={'src':page.locator('#rg-map-area iframe').get_attribute('src'),'frames':[{'url':f.url,'text':f.locator('body').inner_text(timeout=10000)[:1500]} for f in page.frames if f!=page.main_frame]}
  page.screenshot(path=str(art/'embed-rejection.png'));page.locator('#rg-remove-key').click();page.locator('#rg-close').click()
  page.goto(f'http://127.0.0.1:{server.server_port}/haruhi_map_editor_standalone.html',wait_until='networkidle');assert page.locator('#rg-launch').is_visible()
  out['standalone']=True
  # An empty newly created trip still exposes Google controls without seed fallback.
  page.locator('#newTripBtn').click();page.locator('#f_タイトル').fill('空の旅行');page.locator('#editForm button[type=submit]').click()
  page.locator('#rg-launch').click()
  assert page.locator('#rg-from option').count()==0
  assert page.locator('#rg-open').get_attribute('href') is None
  out['emptyTrip']=True
 except Exception:
  out['failure']=traceback.format_exc();page.screenshot(path=str(art/'failure.png'))
 finally:
  (art/'route-browser-report.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
  print(json.dumps({k:v for k,v in out.items() if k not in ['tiles','failed']},ensure_ascii=True,indent=2));browser.close();server.shutdown()
if out.get('failure'):sys.exit(1)
