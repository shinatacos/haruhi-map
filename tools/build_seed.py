#!/usr/bin/env python3
"""Regenerate data/seed.js and offline-capable single-file HTML from editable JSON."""
import json
import base64
import pathlib
import re
root=pathlib.Path(__file__).resolve().parents[1]
points=json.loads((root/'data/points.json').read_text(encoding='utf-8'))
schedule=json.loads((root/'data/schedule.json').read_text(encoding='utf-8'))
trips=json.loads((root/'data/trips.json').read_text(encoding='utf-8'))
obj={'version':2,'name':'Route Notebook','trips':trips,'points':points,'events':schedule}
serialized=json.dumps(obj,ensure_ascii=False,separators=(',',':')).replace('</','<\\/')
(root/'data/seed.js').write_text('/* 自動生成。JSONが正本 */\nwindow.ROUTE_SEED = window.HARUHI_SEED = '+serialized+';\n', encoding='utf-8')
html=(root/'index.html').read_text(encoding='utf-8')
def inline(match):
    name=match.group(1)
    content=(root/name).read_text(encoding='utf-8')
    if name=='lib/leaflet.js':
        content='/*\n'+(root/'lib/leaflet-LICENSE').read_text(encoding='utf-8')+'\n*/\n'+content
    if name=='lib/leaflet.css':
        content=re.sub(r'url\(images/([^)]*)\)',lambda m:'url(data:image/png;base64,'+base64.b64encode((root/'lib/images'/m.group(1)).read_bytes()).decode()+')',content)
    if name.endswith('.css'): return '<style>\n'+content+'\n</style>'
    return '<script>\n'+content.replace('</script>','<\\/script>')+'\n</script>'
for name in ['lib/leaflet.css','lib/leaflet.js','styles.css','google-route-panel.css','lib/route-core.js','data/seed.js','lib/travel-planner.js','lib/route-engine.js','app.js','notebook-services.js','travel-ledger.js','google-route-config.js','google-route-panel.js']:
    pattern=(r'<link rel="stylesheet" href="' if name.endswith('.css') else r'<script src="')+'('+re.escape(name)+r')(?:\?[^"<>]*)?"'+('>' if name.endswith('.css') else r'></script>')
    html,count=re.subn(pattern,inline,html)
    if count!=1: raise RuntimeError(f'Expected exactly one asset reference: {name}, got {count}')
(root/'haruhi_map_editor_standalone.html').write_text(html,encoding='utf-8')
print('wrote seed.js, standalone,',len(points),'points,',len(schedule),'events')
