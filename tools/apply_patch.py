#!/usr/bin/env python3
"""Idempotently add Google-only map routing without modifying itinerary JSON."""
import re
import sys
from pathlib import Path
repo=Path(sys.argv[1]).resolve()
index=repo/'index.html'
app=repo/'app.js'
assert index.is_file() and app.is_file(), 'index.html and app.js are required'
html=index.read_text(encoding='utf-8-sig')
js=app.read_text(encoding='utf-8-sig')
old=html
# Fix URL policy for both Google Embed API and OSM tiles.
html=re.sub(r'<meta\s+name=["\']referrer["\']\s+content=["\']no-referrer["\']\s*/?>',
            '<meta name="referrer" content="strict-origin-when-cross-origin">',html,flags=re.I)
if not re.search(r'<meta\s+name=["\']referrer["\']',html,re.I):
    html=re.sub(r'(<head[^>]*>)',r'\1\n<meta name="referrer" content="strict-origin-when-cross-origin">',html,count=1,flags=re.I)
# These placeholders are intentionally not true routing lines; disable at source.
html=re.sub(r'(\bid=["\']showRoute["\'])\s+checked\b',r'\1',html)
if 'google-route-panel.css' not in html:
    assert '</head>' in html.lower(), 'Expected a regular HTML head'
    html=re.sub(r'</head>', '<link rel="stylesheet" href="google-route-panel.css?v=20261106-1">\n</head>',html,count=1,flags=re.I)
if 'google-route-panel.js' not in html:
    assert '</body>' in html.lower(), 'Expected HTML body'
    scripts='''<script src="google-route-config.js?v=20261106-1"></script>\n<script src="google-route-panel.js?v=20261106-1"></script>\n'''
    html=re.sub(r'</body>',scripts+'</body>',html,count=1,flags=re.I)
# Write only after all postconditions pass.

old=js
js=js.replace('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
              'https://tile.openstreetmap.org/{z}/{x}/{y}.png')
# Support observed app.js route placeholders in current Route Notebook.
straight_pattern=r'L\.polyline\(\[\[r\.from\.lat,r\.from\.lon\],\[r\.to\.lat,r\.to\.lon\]\],[\s\S]*?\.addTo\(routeLayer\);'
js,count=re.subn(straight_pattern,'/* Google Maps provides the actual route: never draw coordinate-to-coordinate straight lines. */',js)
if count>2:raise RuntimeError('Unexpected number of straight-line calls. Review app.js manually')
if re.search(r'L\s*\.\s*polyline\s*\(',js):
    raise RuntimeError('Unmatched polyline remains; no files written. Review source manually.')
if re.search(r'id=["\']showRoute["\'][^>]*checked',html):
    raise RuntimeError('Checked straight-line control remains; no files written.')
if count==0 and 'No coordinate-to-coordinate route layer' not in js and 'never draw coordinate-to-coordinate straight lines' not in js:
    raise RuntimeError('Zero renderer matches without a verified disabled renderer; no files written.')
index.write_text(html,encoding='utf-8')
app.write_text(js,encoding='utf-8')
print('Patched HTML and JS, disabled approximate straight-line paths; changed:',count,'route renderer(s).')
print('No data files were changed.')
