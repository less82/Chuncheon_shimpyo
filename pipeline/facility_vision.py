"""시설 변화감지 AI — 추론 모듈.

`docs/specs/2026-07-22-시설변화감지-AI-design.md` §6 구현.
학습된 가중치를 로드해 사진 1장 → `[{class, conf, bbox}]`.
**순수 추론. 이 모듈은 어떤 데이터도 쓰지 않는다.**

⚠️ 정직성(spec §5 절대규칙 1):
   **미탐지는 '없음'이 아니다.** 이 모듈의 출력은 관측이지 판정이 아니다.
   탐지 결과를 stops.json의 status='no'로 바꾸는 경로는 존재하지 않으며,
   오직 공무원이 확정할 때만 '없음'이 된다.
   따라서 이 모듈은 "없음"이라는 단어를 반환하지 않는다 — 탐지 목록만 준다.

사용(모듈):
    from facility_vision import load_model, detect
    model = load_model()
    dets = detect(model, "사진.png")   # [{'class':'bench','conf':0.83,'bbox':[x1,y1,x2,y2]}]

사용(CLI):
    pipeline/.venv-vision/Scripts/python.exe facility_vision.py 사진1.png 사진2.jpg
    ... --save-dir vision/predictions --conf 0.25 --json
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from autolabel import CLASS_KO, CLASSES

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

WEIGHTS = Path(__file__).resolve().parent / "vision" / "weights" / "facility_v1.pt"

# 표시 기본 임계값. 낮추면 회부 후보가 늘고(공무원 검수 품 ↑),
# 높이면 놓침이 늘어난다. 운영값은 검증셋으로 재조정할 것.
DEFAULT_CONF = 0.25

# NMS IoU. ultralytics 기본값 0.7은 같은 쉘터에 겹치는 박스를 3개씩 남긴다
# (학습 데이터가 적어 박스 크기 회귀가 흔들리는 탓). 0.45로 조여 하나로 합친다.
DEFAULT_IOU = 0.45


def load_model(weights: Path | str = WEIGHTS):
    """YOLO 가중치 로드. 없으면 학습부터 하라고 알려준다."""
    weights = Path(weights)
    if not weights.exists():
        raise SystemExit(
            f"가중치가 없습니다: {weights}\n"
            "  먼저 학습하세요: .venv-vision/Scripts/python.exe train_facility.py"
        )
    from ultralytics import YOLO

    return YOLO(str(weights))


def detect(
    model, image: Path | str, conf: float = DEFAULT_CONF, iou: float = DEFAULT_IOU
) -> list[dict]:
    """사진 1장 → 탐지 목록. 쓰기 없음.

    반환: [{'class': 'bench', 'class_ko': '벤치', 'conf': 0.83,
            'bbox': [x1, y1, x2, y2]}]  (픽셀 좌표, 신뢰도 내림차순)
    빈 리스트 = **미탐지**이지 '시설 없음'이 아니다.
    """
    res = model.predict(str(image), conf=conf, iou=iou, verbose=False)[0]
    dets = [
        {
            "class": CLASSES[int(b.cls.item())],
            "class_ko": CLASS_KO[CLASSES[int(b.cls.item())]],
            "conf": round(float(b.conf.item()), 4),
            "bbox": [round(float(v), 1) for v in b.xyxy[0].tolist()],
        }
        for b in res.boxes
    ]
    return sorted(dets, key=lambda d: -d["conf"])


def render(image: Path, dets: list[dict], dst: Path) -> None:
    """박스를 그려 저장(사람 확인용). 모듈 사용자가 원할 때만 호출."""
    from PIL import Image, ImageDraw

    colors = {"roof": (255, 96, 0), "bench": (0, 176, 255), "bit": (0, 220, 120)}
    img = Image.open(image).convert("RGB")
    drw = ImageDraw.Draw(img)
    for d in dets:
        x1, y1, x2, y2 = d["bbox"]
        c = colors[d["class"]]
        drw.rectangle([x1, y1, x2, y2], outline=c, width=5)
        drw.text((x1 + 6, max(0, y1 + 4)), f"{d['class']} {d['conf']:.2f}", fill=c)
    dst.parent.mkdir(parents=True, exist_ok=True)
    img.save(dst)


def main() -> None:
    ap = argparse.ArgumentParser(description="정류장 시설 탐지 (로컬 추론)")
    ap.add_argument("images", nargs="+", help="사진 경로 (폴더도 가능)")
    ap.add_argument("--weights", default=str(WEIGHTS))
    ap.add_argument("--conf", type=float, default=DEFAULT_CONF)
    ap.add_argument("--iou", type=float, default=DEFAULT_IOU, help="NMS IoU. 낮출수록 중복 박스가 합쳐짐")
    ap.add_argument("--save-dir", default="vision/predictions", help="박스 그린 결과 저장 위치")
    ap.add_argument("--no-save", action="store_true")
    ap.add_argument("--json", action="store_true", help="JSON만 출력")
    args = ap.parse_args()

    paths: list[Path] = []
    for raw in args.images:
        p = Path(raw)
        if p.is_dir():
            paths += sorted(
                q for q in p.iterdir() if q.suffix.lower() in {".png", ".jpg", ".jpeg"}
            )
        elif p.exists():
            paths.append(p)
        else:
            print(f"⚠️ 없는 경로: {p}")
    if not paths:
        raise SystemExit("처리할 사진이 없습니다.")

    model = load_model(args.weights)
    out_dir = Path(args.save_dir)
    report = []
    for p in paths:
        dets = detect(model, p, args.conf, args.iou)
        report.append({"image": str(p), "detections": dets})
        if not args.no_save:
            render(p, dets, out_dir / p.name)
        if args.json:
            continue
        print(f"\n{p.name}")
        if dets:
            for d in dets:
                print(f"  {d['class_ko']:9s} {d['conf']:.2f}  bbox={d['bbox']}")
        else:
            print("  미탐지 — 이것은 '시설 없음'이 아닙니다. 사람이 확인해야 합니다.")

    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    elif not args.no_save:
        print(f"\n박스 그린 결과 → {out_dir}")


if __name__ == "__main__":
    main()
