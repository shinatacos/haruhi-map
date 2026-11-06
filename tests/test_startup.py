"""Chromium startup diagnostics: live tiles separately from injected map failures."""
import json, os, sys, threading
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / '.test-deps'))
from playwright.sync_api import sync_playwright

class Handler(SimpleHTTPRequestHandler):
 def __init__(self, *args, **kwargs): super().__init__(*args, directory=str(root), **kwargs)
 def log_message(self, *args): pass

server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
reports = []
try:
 with sync_playwright() as pw:
  browser = pw.chromium.launch(executable_path=os.environ.get('CHROME_PATH', r'C:\Program Files\Google\Chrome\Application\chrome.exe'), headless=True)
  for case in ['live-http', 'map-exception', 'leaflet-unavailable', 'standalone-offline']:
   context = browser.new_context()
   page = context.new_page()
   errors, failures, responses, warnings = [], [], [], []
   page.on('pageerror', lambda e: errors.append(e.stack or str(e)))
   page.on('requestfailed', lambda r: failures.append({'url':r.url, 'error':r.failure}))
   page.on('response', lambda r: responses.append({'url':r.url, 'status':r.status}))
   page.on('console', lambda m: warnings.append(m.text) if m.type == 'warning' else None)
   if case != 'live-http':
    page.route('https://**/*', lambda r: r.abort())
   if case == 'map-exception':
    source = (root/'lib/leaflet.js').read_text(encoding='utf-8')
    page.route('**/lib/leaflet.js*', lambda r: r.fulfill(body=source+'\nL.map=()=>{throw Error("Injected map startup failure")};', content_type='text/javascript'))
   if case == 'leaflet-unavailable':
    page.route('**/lib/leaflet.js*', lambda r: r.abort())
   url = (root/'haruhi_map_editor_standalone.html').as_uri() if case == 'standalone-offline' else f'http://127.0.0.1:{server.server_port}/'
   page.goto(url, wait_until='load')
   report={'case':case, 'errors':errors, 'warnings':warnings, 'failures':failures, 'responses':responses}
   reports.append(report)
   try:
    page.wait_for_selector('[data-event]')
   except Exception:
    out=root/'tests/artifacts';out.mkdir(exist_ok=True)
    page.screenshot(path=str(out/('startup-'+case+'-failure.png')))
    (out/('startup-'+case+'-failure.html')).write_text(page.content(),encoding='utf-8')
    raise
   page.wait_for_timeout(600)
   # Keep the evidence even when a following assertion fails.
   report.update({'visibleEvents':page.locator('[data-event]').count(), 'scheduleDisplay':page.locator('#schedulePanel').evaluate('(e)=>getComputedStyle(e).display')})
   snapshot = page.evaluate('RouteNotebook.getSnapshot()')
   assert len(snapshot['points']) == 60 and len(snapshot['events']) == 250
   assert not errors, (case, errors)
   if case in ['map-exception', 'leaflet-unavailable']:
    assert page.locator('#mapFallback').is_visible()
   else:
    assert page.locator('#map').bounding_box()['height'] > 200
    assert page.locator('.leaflet-marker-icon').count() > 0
   page.locator('[data-event]').first.click()
   assert page.locator('#commitBtn').is_visible()
   context.close()
  browser.close()
finally:
 server.shutdown()
 out=root/'tests/artifacts';out.mkdir(exist_ok=True)
 (out/'startup-report.json').write_text(json.dumps(reports, ensure_ascii=False, indent=2), encoding='utf-8')
print('PASS: live HTTP startup, injected map exception, unavailable Leaflet, offline standalone; 60 points/250 events and editor retained')
