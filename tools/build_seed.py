#!/usr/bin/env python3
"""Regenerate data/seed.js and offline-capable single-file HTML from editable JSON."""
import json
import pathlib
root=pathlib.Path(__file__).resolve().parents[1]
points=json.loads((root/'data/points.json').read_text(encoding='utf-8'))
schedule=json.loads((root/'data/schedule.json').read_text(encoding='utf-8'))
obj={'version':1,'name':'ハルヒ・美少女ゲーム聖地巡礼 2026','points':points,'events':schedule}
serialized=json.dumps(obj,ensure_ascii=False,separators=(',',':')).replace('</','<\\/')
(root/'data/seed.js').write_text('/* 自動生成。データ更新は points.json と schedule.json を編集して build_seed.py を実行 */\nwindow.HARUHI_SEED = '+serialized+';\n', encoding='utf-8')
html=(root/'index.html').read_text(encoding='utf-8')
css=(root/'styles.css').read_text(encoding='utf-8')
js=(root/'app.js').read_text(encoding='utf-8')
html=html.replace('<link rel="stylesheet" href="styles.css">', '<style>\n'+css+'\n</style>')
html=html.replace('<script src="data/seed.js"></script>', '<script>window.HARUHI_SEED = '+serialized+';</script>')
html=html.replace('<script src="app.js"></script>', '<script>\n'+js.replace('</script>','<\\/script>')+'\n</script>')
(root/'haruhi_map_editor_standalone.html').write_text(html,encoding='utf-8')
print('wrote seed.js, standalone,',len(points),'points,',len(schedule),'events')
