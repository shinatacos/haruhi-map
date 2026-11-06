import tempfile,subprocess,sys
from pathlib import Path
r=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as td:
 t=Path(td)
 for f in ['index.html','app.js']:(t/f).write_bytes((r/f).read_bytes())
 def run():return subprocess.run([sys.executable,str(r/'tools/apply_patch.py'),str(t)],capture_output=True)
 assert run().returncode==0
 assert run().returncode==0
 (t/'app.js').write_text('L.polyline(otherShape).addTo(map);',encoding='utf-8')
 before={f:(t/f).read_bytes() for f in ['index.html','app.js']}
 assert run().returncode!=0
 assert all((t/f).read_bytes()==v for f,v in before.items())
 (t/'app.js').write_text('console.log("unrecognized renderer");',encoding='utf-8')
 assert run().returncode!=0
print('PASS patch idempotence; unmatched polyline and zero-match renderer fail without writes')
