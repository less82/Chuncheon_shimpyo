"""시설 탐지 데모 — 새 사진을 끌어다 놓고 바로 확인하는 로컬 웹앱.

`facility_vision.py`(순수 추론)를 감싸는 얇은 껍데기. 로컬 호스트에만 바인딩,
사진은 서버에 저장하지 않는다(메모리에서 추론하고 버림).

⚠️ 정직성: 아무것도 안 잡히면 "미탐지"라고만 말한다. **'시설 없음'이 아니다.**
   판정은 사람이 한다(spec §5).

사용:
    pipeline/.venv-vision/Scripts/python.exe vision_demo.py
    ... --port 9000 --no-open
"""
from __future__ import annotations

import argparse
import io
import json
import sys
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from autolabel import CLASS_KO, CLASSES
from facility_vision import DEFAULT_IOU, WEIGHTS, load_model

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# 서버는 낮은 임계값으로 다 돌려주고, 화면에서 슬라이더로 거른다
# (임계값 바꿀 때마다 추론을 다시 돌릴 이유가 없다)
SERVER_CONF = 0.05


HTML = r"""<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>정류장 시설 탐지 데모</title>
<style>
:root{--bg:#14171c;--fg:#e9edf3;--dim:#8b95a5;--line:#2a3038;--acc:#4aa3ff}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.6 "Malgun Gothic",system-ui,sans-serif}
header{padding:16px 20px;border-bottom:1px solid var(--line);display:flex;gap:16px;align-items:center;flex-wrap:wrap}
h1{font-size:17px;margin:0}
.sp{flex:1}
label{font-size:13px;color:var(--dim)}
input[type=range]{vertical-align:middle}
#drop{margin:20px;padding:44px;border:2px dashed var(--line);border-radius:12px;text-align:center;color:var(--dim);cursor:pointer}
#drop.on{border-color:var(--acc);background:#182430;color:var(--fg)}
#out{padding:0 20px 40px}
.card{margin-bottom:28px;border:1px solid var(--line);border-radius:12px;overflow:hidden}
.card h2{font-size:14px;margin:0;padding:10px 14px;background:#1a1f26;border-bottom:1px solid var(--line);font-weight:600}
.wrap{position:relative;line-height:0;background:#0d1014}
.wrap img{width:100%;height:auto;display:block}
.wrap canvas{position:absolute;inset:0;width:100%;height:100%}
.res{padding:12px 14px;font-size:14px}
.row{display:flex;gap:10px;align-items:center;padding:3px 0}
.dot{width:12px;height:12px;border-radius:3px;flex:none}
.conf{color:var(--dim);font-variant-numeric:tabular-nums}
.none{color:#ffcf8a}
.note{color:var(--dim);font-size:12px;margin-top:8px;border-top:1px solid var(--line);padding-top:8px}
.busy{color:var(--acc)}
</style></head><body>
<header>
  <h1>정류장 시설 탐지 데모</h1>
  <span class="sp"></span>
  <label>신뢰도 하한 <input id="th" type="range" min="5" max="90" value="25"> <b id="thv">0.25</b></label>
</header>
<div id="drop">사진을 여기로 끌어다 놓거나 클릭해서 선택하세요 (여러 장 가능)</div>
<div id="out"></div>
<input id="file" type="file" accept="image/*" multiple hidden>
<script>
const COLORS={roof:'#ff7a29',bench:'#35b6ff',bit:'#3ddc84'};
const KO={roof:'지붕/차양',bench:'벤치',bit:'BIT 전광판'};
const drop=document.getElementById('drop'),out=document.getElementById('out'),
      fileInput=document.getElementById('file'),th=document.getElementById('th'),
      thv=document.getElementById('thv');
const cards=[];

drop.onclick=()=>fileInput.click();
fileInput.onchange=e=>handle([...e.target.files]);
['dragenter','dragover'].forEach(k=>drop.addEventListener(k,e=>{
  e.preventDefault();drop.classList.add('on');}));
['dragleave','drop'].forEach(k=>drop.addEventListener(k,e=>{
  e.preventDefault();drop.classList.remove('on');}));
drop.addEventListener('drop',e=>handle([...e.dataTransfer.files]));
th.oninput=()=>{thv.textContent=(th.value/100).toFixed(2);cards.forEach(redraw);};

async function handle(files){
  for(const f of files.filter(f=>f.type.startsWith('image/'))) await one(f);
}
async function one(file){
  const card=document.createElement('div');card.className='card';
  card.innerHTML=`<h2>${file.name} <span class="busy">— 추론 중…</span></h2>
    <div class="wrap"><img><canvas></canvas></div><div class="res"></div>`;
  out.prepend(card);
  const img=card.querySelector('img');
  img.src=URL.createObjectURL(file);
  await img.decode();
  const r=await fetch('/api/detect',{method:'POST',body:file});
  const data=await r.json();
  card.querySelector('h2').innerHTML=file.name;
  const rec={card,img,dets:data.detections||[],err:data.error};
  cards.push(rec);redraw(rec);
}
function redraw(rec){
  const min=th.value/100, dets=rec.dets.filter(d=>d.conf>=min);
  const cv=rec.card.querySelector('canvas'),ctx=cv.getContext('2d');
  cv.width=rec.img.naturalWidth;cv.height=rec.img.naturalHeight;
  ctx.clearRect(0,0,cv.width,cv.height);
  const lw=Math.max(3,cv.width/380);
  ctx.font=`bold ${Math.max(14,cv.width/70)}px sans-serif`;
  dets.forEach(d=>{const [x1,y1,x2,y2]=d.bbox,c=COLORS[d.class]||'#fff';
    ctx.strokeStyle=c;ctx.lineWidth=lw;ctx.strokeRect(x1,y1,x2-x1,y2-y1);
    ctx.fillStyle=c;ctx.fillText(`${KO[d.class]} ${d.conf.toFixed(2)}`,x1+lw*2,Math.max(18,y1-lw*2));
  });
  const res=rec.card.querySelector('.res');
  if(rec.err){res.innerHTML=`<div class="none">오류: ${rec.err}</div>`;return;}
  res.innerHTML=(dets.length
    ? dets.map(d=>`<div class="row"><span class="dot" style="background:${COLORS[d.class]}"></span>
        ${KO[d.class]} <span class="conf">${d.conf.toFixed(2)}</span></div>`).join('')
    : `<div class="none">미탐지 — 이 사진에서 지붕·벤치·전광판을 찾지 못했습니다.</div>`)
    + `<div class="note">미탐지는 <b>'시설 없음'이 아닙니다.</b> 각도·가림·화질 때문일 수 있어
       판정은 사람이 합니다. 이 화면의 결과는 어떤 경로로도 정류장 데이터에 자동 반영되지 않습니다.</div>`;
}
</script></body></html>"""


def make_handler(model):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_a):
            pass

        def _send(self, code, body: bytes, ctype: str):
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):  # noqa: N802
            if self.path in ("/", "/index.html"):
                return self._send(200, HTML.encode("utf-8"), "text/html; charset=utf-8")
            return self._send(404, b"{}", "application/json")

        def do_POST(self):  # noqa: N802
            if self.path != "/api/detect":
                return self._send(404, b"{}", "application/json")
            raw = self.rfile.read(int(self.headers.get("Content-Length", 0)))
            try:
                from PIL import Image

                img = Image.open(io.BytesIO(raw)).convert("RGB")
                res = model.predict(img, conf=SERVER_CONF, iou=DEFAULT_IOU, verbose=False)[0]
                dets = sorted(
                    (
                        {
                            "class": CLASSES[int(b.cls.item())],
                            "class_ko": CLASS_KO[CLASSES[int(b.cls.item())]],
                            "conf": round(float(b.conf.item()), 4),
                            "bbox": [round(float(v), 1) for v in b.xyxy[0].tolist()],
                        }
                        for b in res.boxes
                    ),
                    key=lambda d: -d["conf"],
                )
                payload = {"detections": dets}
                print(f"[demo] {len(raw) // 1024}KB → 탐지 {len(dets)}건")
            except Exception as exc:  # 사진이 깨졌거나 지원 안 하는 포맷
                payload = {"error": str(exc), "detections": []}
                print(f"[demo] 실패: {exc}")
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self._send(200, body, "application/json; charset=utf-8")

    return Handler


def main() -> None:
    ap = argparse.ArgumentParser(description="시설 탐지 데모 (로컬)")
    ap.add_argument("--weights", default=str(WEIGHTS))
    ap.add_argument("--port", type=int, default=8778)
    ap.add_argument("--no-open", action="store_true")
    args = ap.parse_args()

    print(f"[demo] 가중치 로드: {args.weights}")
    model = load_model(args.weights)
    url = f"http://127.0.0.1:{args.port}"
    print(f"[demo] {url}  (Ctrl+C 로 종료)")
    if not args.no_open:
        webbrowser.open(url)
    ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(model)).serve_forever()


if __name__ == "__main__":
    main()
