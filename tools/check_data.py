#!/usr/bin/env python3
import json,re,sys,pathlib,collections
r=pathlib.Path(__file__).resolve().parents[1]
p=json.loads((r/'data/points.json').read_text(encoding='utf-8'))
e=json.loads((r/'data/schedule.json').read_text(encoding='utf-8'))
assert len(p)>0 and len(e)>0
ids=[x['id'] for x in p]; assert len(ids)==len(set(ids)),'Duplicate point IDs'
eids=[x['id'] for x in e]; assert len(eids)==len(set(eids)),'Duplicate event IDs'
missing=[]
for x in p:
 assert -90<=float(x['lat'])<=90 and -180<=float(x['lon'])<=180,(x['id'],'invalid coords')
for x in e:
 assert re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d',x['time']),('invalid time',x)
 assert x['plan'] in ['旧旅程','SOS展改訂'],('invalid plan',x)
 assert x['day'] in ['11/18','11/19','11/20','11/21','11/22'],('invalid day',x)
 if x['pointId'] and x['pointId'] not in ids: missing.append((x['id'],x['pointId']))
assert not missing,missing
print('OK:',len(p),'points',len(e),'events')
print('Plans:',dict(collections.Counter(x['plan'] for x in e)))
print('Non-reviewed coordinates:',sum(x['precision']!='座標確認' for x in p))

assert len(p)==60 and len(e)==250, 'Original inventory changed'
assert collections.Counter(x['plan'] for x in e)=={'旧旅程':193,'SOS展改訂':57}
for x in e:
 if x.get('confidence') in ['公式ダイヤ','実測']:
  assert x.get('source','').strip(), ('Missing time evidence',x['id'])
