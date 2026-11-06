from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
html=(root/'haruhi_map_editor_standalone.html').read_text(encoding='utf-8')
import re
html=re.sub(r'<link[^>]+href="https://[^>]+>', '', html)
html=re.sub(r'<script[^>]+src="https://[^>]+></script>', '', html)
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'])
    page=browser.new_page(viewport={'width':1450,'height':900},accept_downloads=True)
    errors=[]
    page.on('pageerror',lambda e: errors.append(str(e)))
    page.set_content(html,wait_until='domcontentloaded',timeout=15000)
    page.set_default_timeout(5000)
    page.wait_for_timeout(500)
    print('Page title:',page.title())
    print('Displayed counts:',page.locator('#pointCount').inner_text(),page.locator('#eventCount').inner_text())
    page.locator('#scheduleList [data-event]').first.click()
    print('Dialog opened:',page.locator('#editDialog').evaluate('(e) => e.open'))
    page.locator('#f_時刻').fill('09:07')
    page.locator('#editForm button[type=submit]').click()
    print('Dialog closed:',not page.locator('#editDialog').evaluate('(e) => e.open'))
    page.locator('.tab[data-tab="points"]').click()
    page.locator('#pointSearch').fill('甲陽園')
    print('Filtered points:',page.locator('#pointShowing').inner_text())
    page.locator('#pointSearch').fill('')
    page.locator('#exportBtn').click()
    with page.expect_download(timeout=15000) as download_info:
        page.locator('[data-export="json"]').click()
    download=download_info.value
    print('Download file:',download.suggested_filename)
    dest='/mnt/data/haruhi_codex_map_app/tests/browser_export.json'
    download.save_as(dest)
    import json
    exported=json.load(open(dest))
    print('Export counts',len(exported['points']),len(exported['events']))
    assert len(exported['points'])==60 and len(exported['events'])==250
    assert len(errors)==0,errors
    page.screenshot(path='/mnt/data/haruhi_codex_map_app/tests/screenshot.png',full_page=True,timeout=10000)
    browser.close()
print('BROWSER TEST OK')
