"""시설 변화감지 AI — 2단계: 오토라벨 검수 편집기 (로컬 웹앱).

Roboflow 애노테이터 대체. 설치 의존성 0(파이썬 표준 라이브러리만),
로컬 호스트에만 바인딩, 외부 전송 없음.

`autolabel.py`가 만든 `vision/labels/*.txt`를 브라우저에서 열어
**틀린 박스만 고치고** 저장한다(그리기 → 검토, spec §7).

사용:
    python vision_review.py            # http://127.0.0.1:8777 자동 오픈
    python vision_review.py --port 9000 --no-open

단축키:
    1/2/3  클래스 선택(지붕·벤치·BIT) | 드래그 새 박스 | 클릭 선택
    Del/Backspace 삭제 | ←/→ 이전·다음 | S 저장 | V 저장+검수완료 표시
"""
from __future__ import annotations

import argparse
import json
import re
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

from autolabel import CLASS_KO, CLASSES, OUT_DIR, PHOTO_DIR

STATE_NAME = "review_state.json"
SAFE_NAME = re.compile(r"^[\w.\- ()가-힣]+$")


class Store:
    """디스크 상태 접근. 라벨 txt(YOLO 포맷)와 검수 상태 JSON만 다룬다."""

    def __init__(self, photos: Path, out: Path):
        self.photos = photos
        self.out = out
        self.labels = out / "labels"
        self.raw = out / "autolabel_raw"
        self.labels.mkdir(parents=True, exist_ok=True)
        self.state_path = out / STATE_NAME
        splits_path = out / "splits.json"
        self.splits = (
            json.loads(splits_path.read_text(encoding="utf-8"))
            if splits_path.exists()
            else {"train": [], "val": []}
        )
        self.val = set(self.splits.get("val", []))

    # ── 상태 ────────────────────────────────────────────────────────────
    def state(self) -> dict:
        if self.state_path.exists():
            return json.loads(self.state_path.read_text(encoding="utf-8"))
        return {}

    def set_verified(self, name: str, verified: bool) -> None:
        st = self.state()
        st.setdefault(name, {})["verified"] = verified
        self.state_path.write_text(
            json.dumps(st, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    # ── 라벨 ────────────────────────────────────────────────────────────
    @staticmethod
    def _read(path: Path) -> list[dict]:
        if not path.exists():
            return []
        boxes = []
        for line in path.read_text(encoding="utf-8").splitlines():
            parts = line.split()
            if len(parts) != 5:
                continue
            c, xc, yc, w, h = int(parts[0]), *map(float, parts[1:])
            boxes.append({"cls": c, "xc": xc, "yc": yc, "w": w, "h": h})
        return boxes

    def boxes(self, name: str) -> list[dict]:
        return self._read(self.labels / f"{Path(name).stem}.txt")

    def raw_count(self, name: str) -> int:
        return len(self._read(self.raw / f"{Path(name).stem}.txt"))

    def save(self, name: str, boxes: list[dict]) -> None:
        lines = [
            f"{int(b['cls'])} {b['xc']:.6f} {b['yc']:.6f} {b['w']:.6f} {b['h']:.6f}"
            for b in boxes
            if b["w"] > 0.001 and b["h"] > 0.001
        ]
        (self.labels / f"{Path(name).stem}.txt").write_text(
            "\n".join(lines), encoding="utf-8"
        )

    # ── 목록 ────────────────────────────────────────────────────────────
    def images(self) -> list[str]:
        return sorted(
            [
                p.name
                for p in self.photos.iterdir()
                if p.suffix.lower() in {".png", ".jpg", ".jpeg"}
            ],
            key=lambda n: (len(Path(n).stem), Path(n).stem),
        )

    def manifest(self) -> dict:
        st = self.state()
        return {
            "classes": CLASSES,
            "classesKo": [CLASS_KO[c] for c in CLASSES],
            "images": [
                {
                    "name": n,
                    "split": "val" if n in self.val else "train",
                    "verified": bool(st.get(n, {}).get("verified")),
                    "auto": self.raw_count(n),
                }
                for n in self.images()
            ],
        }


def make_handler(store: Store, html: str):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):  # 콘솔 조용히
            pass

        def _send(self, code: int, body: bytes, ctype: str) -> None:
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def _json(self, obj, code: int = 200) -> None:
            self._send(code, json.dumps(obj, ensure_ascii=False).encode("utf-8"),
                       "application/json; charset=utf-8")

        @staticmethod
        def _safe(name: str) -> str | None:
            name = unquote(name)
            if "/" in name or "\\" in name or ".." in name or not SAFE_NAME.match(name):
                return None
            return name

        def do_GET(self):  # noqa: N802
            path = urlparse(self.path).path
            if path in ("/", "/index.html"):
                return self._send(200, html.encode("utf-8"), "text/html; charset=utf-8")
            if path == "/api/manifest":
                return self._json(store.manifest())
            if path.startswith("/api/labels/"):
                name = self._safe(path[len("/api/labels/"):])
                if not name:
                    return self._json({"error": "bad name"}, 400)
                return self._json({"boxes": store.boxes(name)})
            if path.startswith("/img/"):
                name = self._safe(path[len("/img/"):])
                fp = store.photos / name if name else None
                if not fp or not fp.exists():
                    return self._json({"error": "not found"}, 404)
                ctype = "image/png" if fp.suffix.lower() == ".png" else "image/jpeg"
                return self._send(200, fp.read_bytes(), ctype)
            return self._json({"error": "not found"}, 404)

        def do_POST(self):  # noqa: N802
            path = urlparse(self.path).path
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length) or b"{}")
            if path.startswith("/api/labels/"):
                name = self._safe(path[len("/api/labels/"):])
                if not name:
                    return self._json({"error": "bad name"}, 400)
                store.save(name, payload.get("boxes", []))
                if "verified" in payload:
                    store.set_verified(name, bool(payload["verified"]))
                return self._json({"ok": True})
            return self._json({"error": "not found"}, 404)

    return Handler


HTML = r"""<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>정류장 시설 라벨 검수</title>
<style>
:root{--bg:#14171c;--fg:#e9edf3;--dim:#8b95a5;--line:#2a3038;--acc:#4aa3ff}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 "Malgun Gothic",system-ui,sans-serif;display:flex;height:100vh;overflow:hidden}
#side{width:230px;flex:none;border-right:1px solid var(--line);display:flex;flex-direction:column}
#side h1{font-size:14px;margin:0;padding:12px;border-bottom:1px solid var(--line)}
#prog{padding:8px 12px;font-size:12px;color:var(--dim);border-bottom:1px solid var(--line)}
#list{overflow:auto;flex:1}
.item{padding:6px 12px;cursor:pointer;display:flex;gap:6px;align-items:center;font-size:13px;border-bottom:1px solid #1c2026}
.item:hover{background:#1c2026}
.item.on{background:#243040;color:#fff}
.item .n{flex:1}
.badge{font-size:10px;padding:1px 5px;border-radius:8px;background:#333b46;color:#b9c3d1}
.badge.val{background:#5a3d16;color:#ffcf8a}
.badge.ok{background:#1d4a2b;color:#8ee9a8}
#main{flex:1;display:flex;flex-direction:column;min-width:0}
#bar{padding:8px 12px;border-bottom:1px solid var(--line);display:flex;gap:8px;align-items:center;flex-wrap:wrap}
button{background:#232a33;color:var(--fg);border:1px solid var(--line);border-radius:6px;padding:5px 10px;cursor:pointer;font-size:13px}
button:hover{background:#2c3541}
button.on{background:var(--acc);border-color:var(--acc);color:#04121f;font-weight:700}
#warn{color:#ffcf8a;font-size:12px}
#stage{flex:1;position:relative;overflow:hidden;background:#0d1014}
canvas{position:absolute;left:0;top:0;cursor:crosshair}
#help{padding:6px 12px;font-size:11px;color:var(--dim);border-top:1px solid var(--line)}
</style></head><body>
<div id="side"><h1>정류장 시설 라벨 검수</h1><div id="prog"></div><div id="list"></div></div>
<div id="main">
  <div id="bar">
    <span id="fname"></span><span id="warn"></span>
    <span style="flex:1"></span>
    <span id="cls"></span>
    <button id="del">삭제 (Del)</button>
    <button id="save">저장 (S)</button>
    <button id="ver">검수완료 (V)</button>
  </div>
  <div id="stage"><canvas id="cv"></canvas></div>
  <div id="help">드래그=새 박스 · 클릭=선택 · 모서리 드래그=크기조절 · 1/2/3=클래스 · ←/→=이동 · 저장 안 하고 이동하면 자동 저장</div>
</div>
<script>
const COLORS=['#ff7a29','#35b6ff','#3ddc84'];
let M=null,idx=0,boxes=[],cls=0,sel=-1,img=new Image(),dirty=false;
let scale=1,ox=0,oy=0,drag=null;
const cv=document.getElementById('cv'),ctx=cv.getContext('2d');

async function boot(){
  M=await (await fetch('/api/manifest')).json();
  document.getElementById('cls').innerHTML=M.classes.map((c,i)=>
    `<button class="cbtn" data-i="${i}">${i+1} ${M.classesKo[i]}</button>`).join(' ');
  document.querySelectorAll('.cbtn').forEach(b=>b.onclick=()=>setCls(+b.dataset.i));
  renderList();setCls(0);load(0);
}
function renderList(){
  document.getElementById('list').innerHTML=M.images.map((im,i)=>
    `<div class="item ${i===idx?'on':''}" data-i="${i}"><span class="n">${im.name}</span>`+
    (im.split==='val'?'<span class="badge val">검증</span>':'')+
    (im.verified?'<span class="badge ok">✓</span>':`<span class="badge">${im.auto}</span>`)+
    '</div>').join('');
  document.querySelectorAll('.item').forEach(el=>el.onclick=()=>go(+el.dataset.i));
  const v=M.images.filter(x=>x.verified).length,
        vv=M.images.filter(x=>x.split==='val'),
        vd=vv.filter(x=>x.verified).length;
  document.getElementById('prog').textContent=
    `검수 ${v}/${M.images.length}  ·  검증셋 ${vd}/${vv.length}`;
  const on=document.querySelector('.item.on'); if(on) on.scrollIntoView({block:'nearest'});
}
async function load(i){
  idx=i;sel=-1;dirty=false;
  const im=M.images[i];
  document.getElementById('fname').textContent=im.name;
  document.getElementById('warn').textContent=
    im.split==='val'?'⚠ 검증셋 — 정확도 측정용. 반드시 전수 손검수(자동라벨 신뢰 금지)':'';
  boxes=(await (await fetch('/api/labels/'+encodeURIComponent(im.name))).json()).boxes;
  img=new Image();
  img.onload=()=>{fit();draw()};
  img.src='/img/'+encodeURIComponent(im.name);
  renderList();
}
async function go(i){ if(i<0||i>=M.images.length)return; if(dirty)await save(false); load(i); }
function fit(){
  const s=document.getElementById('stage');
  scale=Math.min(s.clientWidth/img.width,s.clientHeight/img.height);
  cv.width=img.width*scale;cv.height=img.height*scale;
  ox=(s.clientWidth-cv.width)/2;oy=(s.clientHeight-cv.height)/2;
  cv.style.left=ox+'px';cv.style.top=oy+'px';
}
function px(b){return{x:(b.xc-b.w/2)*cv.width,y:(b.yc-b.h/2)*cv.height,
                     w:b.w*cv.width,h:b.h*cv.height};}
function draw(){
  ctx.clearRect(0,0,cv.width,cv.height);ctx.drawImage(img,0,0,cv.width,cv.height);
  boxes.forEach((b,i)=>{const r=px(b),c=COLORS[b.cls]||'#fff';
    ctx.lineWidth=i===sel?4:2;ctx.strokeStyle=c;ctx.strokeRect(r.x,r.y,r.w,r.h);
    ctx.fillStyle=c;ctx.font='bold 13px sans-serif';
    ctx.fillText(M.classesKo[b.cls]||'?',r.x+4,Math.max(12,r.y-4));
    if(i===sel)[[r.x,r.y],[r.x+r.w,r.y],[r.x,r.y+r.h],[r.x+r.w,r.y+r.h]]
      .forEach(([hx,hy])=>ctx.fillRect(hx-5,hy-5,10,10));
  });
}
function hit(mx,my){
  for(let i=boxes.length-1;i>=0;i--){const r=px(boxes[i]);
    if(mx>=r.x-4&&mx<=r.x+r.w+4&&my>=r.y-4&&my<=r.y+r.h+4)return i;}
  return -1;
}
function corner(i,mx,my){
  const r=px(boxes[i]);
  const cs=[['nw',r.x,r.y],['ne',r.x+r.w,r.y],['sw',r.x,r.y+r.h],['se',r.x+r.w,r.y+r.h]];
  for(const [k,hx,hy] of cs) if(Math.abs(mx-hx)<8&&Math.abs(my-hy)<8) return k;
  return null;
}
cv.onmousedown=e=>{
  const mx=e.offsetX,my=e.offsetY,h=hit(mx,my);
  if(h>=0){const k=corner(h,mx,my);sel=h;
    drag=k?{mode:'resize',k,i:h}:{mode:'move',i:h,mx,my,o:{...boxes[h]}};
  } else {sel=-1;drag={mode:'new',x0:mx,y0:my,x1:mx,y1:my};}
  draw();
};
cv.onmousemove=e=>{
  if(!drag)return;const mx=e.offsetX,my=e.offsetY;
  if(drag.mode==='new'){drag.x1=mx;drag.y1=my;draw();
    ctx.setLineDash([5,4]);ctx.strokeStyle=COLORS[cls];ctx.lineWidth=2;
    ctx.strokeRect(Math.min(drag.x0,mx),Math.min(drag.y0,my),
                   Math.abs(mx-drag.x0),Math.abs(my-drag.y0));ctx.setLineDash([]);
  } else if(drag.mode==='move'){
    const b=boxes[drag.i];
    b.xc=drag.o.xc+(mx-drag.mx)/cv.width;b.yc=drag.o.yc+(my-drag.my)/cv.height;
    dirty=true;draw();
  } else {
    const b=boxes[drag.i],r=px(b);
    let x1=r.x,y1=r.y,x2=r.x+r.w,y2=r.y+r.h;
    if(drag.k.includes('n'))y1=my; if(drag.k.includes('s'))y2=my;
    if(drag.k.includes('w'))x1=mx; if(drag.k.includes('e'))x2=mx;
    b.xc=(x1+x2)/2/cv.width;b.yc=(y1+y2)/2/cv.height;
    b.w=Math.abs(x2-x1)/cv.width;b.h=Math.abs(y2-y1)/cv.height;
    dirty=true;draw();
  }
};
cv.onmouseup=()=>{
  if(drag&&drag.mode==='new'){
    const w=Math.abs(drag.x1-drag.x0),h=Math.abs(drag.y1-drag.y0);
    if(w>6&&h>6){boxes.push({cls,
      xc:(drag.x0+drag.x1)/2/cv.width,yc:(drag.y0+drag.y1)/2/cv.height,
      w:w/cv.width,h:h/cv.height});sel=boxes.length-1;dirty=true;}
  }
  drag=null;draw();
};
function setCls(i){cls=i;
  document.querySelectorAll('.cbtn').forEach(b=>b.classList.toggle('on',+b.dataset.i===i));
  if(sel>=0){boxes[sel].cls=i;dirty=true;draw();}
}
async function save(verified){
  const im=M.images[idx];
  const body={boxes};if(verified!==false)body.verified=true;
  await fetch('/api/labels/'+encodeURIComponent(im.name),
    {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(verified!==false)im.verified=true;
  dirty=false;renderList();
}
document.getElementById('save').onclick=()=>save(false);
document.getElementById('ver').onclick=async()=>{await save(true);go(idx+1);};
document.getElementById('del').onclick=()=>{if(sel>=0){boxes.splice(sel,1);sel=-1;dirty=true;draw();}};
window.onresize=()=>{fit();draw()};
window.onkeydown=e=>{
  if(e.key>='1'&&e.key<='3'){setCls(+e.key-1);return;}
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();
    if(sel>=0){boxes.splice(sel,1);sel=-1;dirty=true;draw();}return;}
  if(e.key==='ArrowRight'){go(idx+1);return;}
  if(e.key==='ArrowLeft'){go(idx-1);return;}
  if(e.key==='s'||e.key==='S'){save(false);return;}
  if(e.key==='v'||e.key==='V'){save(true).then(()=>go(idx+1));return;}
};
boot();
</script></body></html>"""


def main() -> None:
    ap = argparse.ArgumentParser(description="오토라벨 검수 편집기 (로컬)")
    ap.add_argument("--photos", default=str(PHOTO_DIR))
    ap.add_argument("--out", default=str(OUT_DIR))
    ap.add_argument("--port", type=int, default=8777)
    ap.add_argument("--no-open", action="store_true")
    args = ap.parse_args()

    store = Store(Path(args.photos), Path(args.out))
    n = len(store.images())
    url = f"http://127.0.0.1:{args.port}"
    print(f"[review] 사진 {n}장 · 라벨 {store.labels}")
    print(f"[review] {url}  (Ctrl+C 로 종료)")
    if not args.no_open:
        webbrowser.open(url)
    ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(store, HTML)).serve_forever()


if __name__ == "__main__":
    main()
