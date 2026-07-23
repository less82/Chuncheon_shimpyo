"""시설 변화감지 AI — 1단계: 오토라벨 부트스트랩.

`docs/specs/2026-07-22-시설변화감지-AI-design.md` §7 구현.
손으로 박스를 그리지 않는다. 오픈보캡 탐지기(YOLO-World)가 텍스트 프롬프트로
박스를 자동 생성하고, 사람은 `vision_review.py`에서 **틀린 것만 고친다.**

Roboflow 호스팅 API를 쓰지 않는다 — 전부 로컬, 호출당 과금 0.

산출물(모두 `pipeline/vision/` 아래):
  autolabel_raw/<이미지>.txt   자동생성 원본. **불변**(검수 전후 대조·감사용).
  labels/<이미지>.txt          검수 대상 사본. 편집기가 여기를 덮어쓴다.
  preview/<이미지>.png         박스를 그려 넣은 눈검사용 이미지(--preview).
  splits.json                  train/val 분할. val은 **사람 손검수 전용**.
  data.yaml                    YOLOv8 학습용 데이터셋 정의.

⚠️ 정직성: 이 스크립트의 출력은 **학습 라벨 초안**일 뿐이다. 여기서 나온 결과를
   정류장 시설 상태(stops.json)로 바로 반영하는 경로는 존재하지 않는다.
   미탐지는 '없음'이 아니다(§5 절대규칙 1).
⚠️ 순환논리 금지: val(검증셋) 라벨은 자동라벨을 **그대로 쓰면 안 된다.**
   반드시 사람이 전수 확인한 뒤에만 정확도(mAP) 측정에 쓴다(§7).

사용:
    pipeline/.venv-vision/Scripts/python.exe autolabel.py
    pipeline/.venv-vision/Scripts/python.exe autolabel.py --preview --model yolov8l-worldv2.pt
"""
from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

# ── 클래스 정의 (spec §7) ────────────────────────────────────────────────
# id 순서가 곧 YOLO 클래스 인덱스. 바꾸면 기존 라벨이 전부 깨진다.
CLASSES = ["roof", "bench", "bit"]
CLASS_KO = {"roof": "지붕/차양", "bench": "벤치", "bit": "BIT 전광판"}

# 디스트랙터 전용 의사(pseudo) 클래스. 라벨 파일에 절대 나가지 않는다.
IGNORE = "_ignore"

# 오픈보캡 프롬프트 → 클래스 매핑.
# 한 클래스에 여러 프롬프트를 걸고, 나중에 클래스 단위 NMS로 중복을 합친다.
PROMPTS: list[tuple[str, str]] = [
    # (프롬프트, 클래스)
    ("bus stop shelter", "roof"),
    ("shelter roof", "roof"),
    ("canopy", "roof"),
    ("awning", "roof"),
    ("bench", "bench"),
    ("bus stop bench", "bench"),
    ("electronic display sign", "bit"),
    ("digital signboard", "bit"),
    ("led display screen", "bit"),
    ("bus arrival information display", "bit"),
    # ↓ 디스트랙터(IGNORE): 라벨로 내보내지 않는다. 오탐을 빨아들이는 용도.
    # BIT 프롬프트가 도로표지판·현수막·버스를 대량 오탐하는 걸 실측으로 확인해 추가했다.
    ("road sign", IGNORE),
    ("traffic sign", IGNORE),
    ("billboard", IGNORE),
    ("advertisement banner", IGNORE),
    ("shop signboard", IGNORE),
    ("bus", IGNORE),
    ("car", IGNORE),
    ("truck", IGNORE),
]

# 디스트랙터 억제를 적용할 클래스. **bit 전용.**
# 실측: roof/bench까지 억제하면 유리 쉘터가 'window'로, 나무에 걸친 지붕이 'tree'로
# 먹혀 진짜 박스가 사라졌다. 오탐이 실제로 문제인 클래스에만 건다.
SUPPRESS_CLASSES = {"bit"}

# 클래스별 신뢰도 하한. 낮추면 수풀·차·간판을 벤치로 잡는 잡음이 폭증하므로
# (실측: 0.10에서 사진 1장당 오탐 3~4개) 벤치는 높게 잡는다.
# BIT는 니치라 누락이 잦으니 낮게 두고 검수에서 지운다 — 지우기가 그리기보다 빠르다(§7).
CONF = {"roof": 0.13, "bench": 0.30, "bit": 0.08, IGNORE: 0.10}

# 클래스 단위 NMS IoU 임계값
NMS_IOU = 0.55

# 디스트랙터 억제: 시설 박스가 디스트랙터 박스와 이만큼 겹치고, 디스트랙터 쪽
# 신뢰도가 **더 높으면** 그 시설 박스를 버린다.
# 신뢰도 비교 조건이 핵심 — 무조건 억제하면 버스 정류장 유리벽('window')이나
# 나무에 가린 진짜 지붕까지 지워져 재현율이 무너진다.
IGNORE_IOU = 0.55

REPO = Path(__file__).resolve().parent.parent
PHOTO_DIR = REPO / "data" / "춘천시 정류장 사진"
OUT_DIR = Path(__file__).resolve().parent / "vision"

VAL_COUNT = 50  # spec §7: 손검수 검증셋 50~100장
SPLIT_SEED = 20260722


def iou(a: list[float], b: list[float]) -> float:
    """xyxy 두 박스의 IoU."""
    ix1, iy1 = max(a[0], b[0]), max(a[1], b[1])
    ix2, iy2 = min(a[2], b[2]), min(a[3], b[3])
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    area_a = max(0.0, a[2] - a[0]) * max(0.0, a[3] - a[1])
    area_b = max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def nms_per_class(dets: list[dict], thr: float = NMS_IOU) -> list[dict]:
    """같은 클래스끼리만 중복 제거. 여러 프롬프트가 같은 물체를 잡은 걸 합친다."""
    kept: list[dict] = []
    for det in sorted(dets, key=lambda d: -d["conf"]):
        if any(
            other["cls"] == det["cls"] and iou(other["xyxy"], det["xyxy"]) > thr
            for other in kept
        ):
            continue
        kept.append(det)
    return kept


def suppress_by_distractors(dets: list[dict], ignores: list[dict]) -> list[dict]:
    """디스트랙터가 더 확신하는 영역의 시설 박스를 버린다(버스·표지판·현수막 오탐 제거)."""
    return [
        d
        for d in dets
        if CLASSES[d["cls"]] not in SUPPRESS_CLASSES
        or not any(
            g["conf"] > d["conf"] and iou(g["xyxy"], d["xyxy"]) > IGNORE_IOU
            for g in ignores
        )
    ]


def detect_one(model, img_path: Path, imgsz: int) -> list[dict]:
    """이미지 1장 → [{cls, conf, xyxy}] (픽셀 좌표). 디스트랙터는 반환하지 않는다."""
    res = model.predict(str(img_path), imgsz=imgsz, conf=0.02, verbose=False)[0]
    dets: list[dict] = []
    ignores: list[dict] = []
    for box in res.boxes:
        _prompt, cls_name = PROMPTS[int(box.cls.item())]
        conf = float(box.conf.item())
        if conf < CONF[cls_name]:
            continue
        item = {
            "conf": round(conf, 4),
            "xyxy": [float(v) for v in box.xyxy[0].tolist()],
        }
        if cls_name == IGNORE:
            ignores.append(item)
        else:
            dets.append({**item, "cls": CLASSES.index(cls_name)})
    return suppress_by_distractors(nms_per_class(dets), ignores)


def to_yolo_lines(dets: list[dict], w: int, h: int) -> list[str]:
    """픽셀 xyxy → YOLO 정규화 `cls xc yc w h` (+ 주석으로 conf 보존은 하지 않음)."""
    lines = []
    for d in dets:
        x1, y1, x2, y2 = d["xyxy"]
        x1, y1 = max(0.0, x1), max(0.0, y1)
        x2, y2 = min(float(w), x2), min(float(h), y2)
        if x2 - x1 < 2 or y2 - y1 < 2:
            continue
        xc = (x1 + x2) / 2 / w
        yc = (y1 + y2) / 2 / h
        bw = (x2 - x1) / w
        bh = (y2 - y1) / h
        lines.append(f"{d['cls']} {xc:.6f} {yc:.6f} {bw:.6f} {bh:.6f}")
    return lines


def draw_preview(img_path: Path, dets: list[dict], dst: Path) -> None:
    from PIL import Image, ImageDraw

    colors = {0: (255, 96, 0), 1: (0, 176, 255), 2: (0, 220, 120)}
    img = Image.open(img_path).convert("RGB")
    drw = ImageDraw.Draw(img)
    for d in dets:
        x1, y1, x2, y2 = d["xyxy"]
        c = colors[d["cls"]]
        drw.rectangle([x1, y1, x2, y2], outline=c, width=4)
        drw.text((x1 + 6, max(0, y1 + 4)), f"{CLASSES[d['cls']]} {d['conf']:.2f}", fill=c)
    dst.parent.mkdir(parents=True, exist_ok=True)
    img.save(dst)


def make_splits(names: list[str]) -> dict:
    """고정 시드 분할. val은 학습에 쓰지 않고 사람이 전수 손검수한다."""
    rng = random.Random(SPLIT_SEED)
    shuffled = sorted(names)
    rng.shuffle(shuffled)
    val = sorted(shuffled[:VAL_COUNT])
    train = sorted(shuffled[VAL_COUNT:])
    return {"train": train, "val": val, "seed": SPLIT_SEED}


def main() -> None:
    ap = argparse.ArgumentParser(description="YOLO-World 오토라벨 부트스트랩")
    ap.add_argument("--photos", default=str(PHOTO_DIR), help="입력 사진 폴더")
    ap.add_argument("--out", default=str(OUT_DIR), help="출력 폴더")
    ap.add_argument("--model", default="yolov8x-worldv2.pt", help="YOLO-World 가중치")
    ap.add_argument("--imgsz", type=int, default=1280, help="작은 BIT 단말을 놓치지 않으려면 1280")
    ap.add_argument("--preview", action="store_true", help="박스 그린 눈검사 이미지 생성")
    ap.add_argument("--limit", type=int, default=0, help="앞 N장만(디버그)")
    ap.add_argument(
        "--force",
        action="store_true",
        help="labels/ 를 자동라벨로 덮어쓴다. 검수 결과가 날아가므로 기본은 보존.",
    )
    args = ap.parse_args()

    photos = Path(args.photos)
    out = Path(args.out)
    raw_dir, lab_dir = out / "autolabel_raw", out / "labels"
    raw_dir.mkdir(parents=True, exist_ok=True)
    lab_dir.mkdir(parents=True, exist_ok=True)

    imgs = sorted(
        [p for p in photos.iterdir() if p.suffix.lower() in {".png", ".jpg", ".jpeg"}],
        key=lambda p: (len(p.stem), p.stem),
    )
    if args.limit:
        imgs = imgs[: args.limit]
    if not imgs:
        raise SystemExit(f"사진이 없습니다: {photos}")
    print(f"[autolabel] 사진 {len(imgs)}장, 모델 {args.model}")

    from PIL import Image
    from ultralytics import YOLOWorld

    model = YOLOWorld(args.model)
    model.set_classes([p for p, _ in PROMPTS])

    counts = {c: 0 for c in CLASSES}
    empty = []
    for i, img_path in enumerate(imgs, 1):
        dets = detect_one(model, img_path, args.imgsz)
        with Image.open(img_path) as im:
            w, h = im.size
        lines = to_yolo_lines(dets, w, h)
        (raw_dir / f"{img_path.stem}.txt").write_text("\n".join(lines), encoding="utf-8")
        target = lab_dir / f"{img_path.stem}.txt"
        if args.force or not target.exists():
            target.write_text("\n".join(lines), encoding="utf-8")
        for d in dets:
            counts[CLASSES[d["cls"]]] += 1
        if not lines:
            empty.append(img_path.name)
        if args.preview:
            draw_preview(img_path, dets, out / "preview" / img_path.name)
        if i % 20 == 0 or i == len(imgs):
            print(f"  {i}/{len(imgs)}")

    splits = make_splits([p.name for p in imgs])
    (out / "splits.json").write_text(
        json.dumps(splits, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (out / "data.yaml").write_text(
        "# YOLOv8 데이터셋 정의 — train_facility.py 가 dataset/ 을 구성한 뒤 사용\n"
        f"path: {(out / 'dataset').as_posix()}\n"
        "train: images/train\n"
        "val: images/val\n"
        "names:\n"
        + "".join(f"  {i}: {c}  # {CLASS_KO[c]}\n" for i, c in enumerate(CLASSES)),
        encoding="utf-8",
    )

    print("\n[autolabel] 자동생성 박스 수")
    for c in CLASSES:
        print(f"  {c:6s} ({CLASS_KO[c]}): {counts[c]}")
    print(f"  박스 0개인 사진: {len(empty)}장")
    print(f"\n분할: train {len(splits['train'])} / val {len(splits['val'])}장")
    print("⚠️ val 라벨은 자동라벨 그대로 쓰지 말 것 — 사람이 전수 확인해야 mAP가 유효.")
    print(f"\n다음: python vision_review.py   → 브라우저에서 박스 검수")
    if not args.preview:
        print("     (--preview 로 다시 돌리면 박스 그린 이미지도 나옵니다)")


if __name__ == "__main__":
    main()
