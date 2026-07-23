"""시설 변화감지 AI — 3단계: YOLOv8 파인튜닝 + 가중치 export.

`docs/specs/2026-07-22-시설변화감지-AI-design.md` §7 구현.
검수된 라벨(`vision/labels/`)로 YOLOv8을 파인튜닝하고, 로컬 추론용
가중치를 `vision/weights/facility_v1.pt` 로 내보낸다. Roboflow 호스팅 미사용.

⚠️ 순환논리 가드: **검증셋(val)이 사람 손검수 100%가 아니면 학습을 거부한다.**
   자동라벨로 잰 mAP는 garbage-in이라 발표에 쓸 수 없다(§7).
   정말 급한 리허설이면 --allow-unverified-val 로 우회하되, 그때 나온 mAP는
   **어떤 발표 자료에도 쓰지 말 것.** 콘솔에 경고가 찍힌다.

사용:
    pipeline/.venv-vision/Scripts/python.exe train_facility.py
    ... --epochs 150 --model yolov8s.pt --batch 8
"""
from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

from autolabel import CLASS_KO, CLASSES, OUT_DIR, PHOTO_DIR
from vision_review import Store


def build_dataset(store: Store, out: Path) -> Path:
    """splits.json + labels/ → ultralytics 표준 디렉터리 구조로 복사."""
    ds = out / "dataset"
    if ds.exists():
        shutil.rmtree(ds)
    for split in ("train", "val"):
        (ds / "images" / split).mkdir(parents=True, exist_ok=True)
        (ds / "labels" / split).mkdir(parents=True, exist_ok=True)
        for name in store.splits.get(split, []):
            src_img = store.photos / name
            if not src_img.exists():
                print(f"  ! 사진 없음, 건너뜀: {name}")
                continue
            shutil.copy2(src_img, ds / "images" / split / name)
            stem = Path(name).stem
            src_lab = store.labels / f"{stem}.txt"
            dst_lab = ds / "labels" / split / f"{stem}.txt"
            dst_lab.write_text(
                src_lab.read_text(encoding="utf-8") if src_lab.exists() else "",
                encoding="utf-8",
            )
    return ds


def check_val_verified(store: Store) -> tuple[int, int]:
    st = store.state()
    val = store.splits.get("val", [])
    done = sum(1 for n in val if st.get(n, {}).get("verified"))
    return done, len(val)


def main() -> None:
    ap = argparse.ArgumentParser(description="YOLOv8 시설 탐지 파인튜닝")
    ap.add_argument("--photos", default=str(PHOTO_DIR))
    ap.add_argument("--out", default=str(OUT_DIR))
    ap.add_argument("--model", default="yolov8n.pt", help="시작 가중치 (4GB VRAM이면 n/s)")
    ap.add_argument("--epochs", type=int, default=120)
    ap.add_argument("--imgsz", type=int, default=960)
    ap.add_argument("--batch", type=int, default=4)
    ap.add_argument("--device", default="0", help="'0'=GPU, 'cpu'")
    ap.add_argument("--allow-unverified-val", action="store_true")
    args = ap.parse_args()

    out = Path(args.out)
    store = Store(Path(args.photos), out)

    done, total = check_val_verified(store)
    print(f"[train] 검증셋 손검수 {done}/{total}장")
    if total == 0:
        raise SystemExit("splits.json 이 없습니다. 먼저 autolabel.py 를 돌리세요.")
    if done < total:
        if not args.allow_unverified_val:
            raise SystemExit(
                f"❌ 검증셋 {total - done}장이 미검수입니다.\n"
                "   자동라벨로 잰 mAP는 순환논리라 발표에 쓸 수 없습니다(spec §7).\n"
                "   vision_review.py 에서 '검증' 뱃지 붙은 사진을 전수 확인하세요.\n"
                "   (리허설 목적이면 --allow-unverified-val)"
            )
        print("⚠️⚠️ 미검수 검증셋으로 학습합니다. 여기서 나온 mAP는 발표 금지(순환논리).")

    print("[train] 데이터셋 구성 중...")
    ds = build_dataset(store, out)
    n_tr = len(list((ds / "images" / "train").iterdir()))
    n_va = len(list((ds / "images" / "val").iterdir()))
    boxes = sum(
        len([ln for ln in p.read_text(encoding="utf-8").splitlines() if ln.strip()])
        for p in (ds / "labels").rglob("*.txt")
    )
    print(f"  train {n_tr}장 / val {n_va}장 / 박스 {boxes}개")

    yaml_path = out / "data.yaml"
    yaml_path.write_text(
        f"path: {ds.as_posix()}\n"
        "train: images/train\n"
        "val: images/val\n"
        "names:\n"
        + "".join(f"  {i}: {c}  # {CLASS_KO[c]}\n" for i, c in enumerate(CLASSES)),
        encoding="utf-8",
    )

    from ultralytics import YOLO

    model = YOLO(args.model)
    model.train(
        data=str(yaml_path),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device=args.device,
        project=str(out / "runs"),
        name="facility",
        exist_ok=True,
        patience=30,
        # 64~160장 소량 데이터셋 — 증강을 충분히 켠다
        hsv_h=0.015, hsv_s=0.7, hsv_v=0.4,
        degrees=5.0, translate=0.1, scale=0.5, fliplr=0.5, mosaic=1.0,
    )

    best = out / "runs" / "facility" / "weights" / "best.pt"
    weights = out / "weights"
    weights.mkdir(parents=True, exist_ok=True)
    dst = weights / "facility_v1.pt"
    shutil.copy2(best, dst)
    print(f"\n[train] 가중치 export: {dst}")

    metrics = YOLO(str(dst)).val(data=str(yaml_path), device=args.device, split="val")
    report = {
        "map50": float(metrics.box.map50),
        "map50_95": float(metrics.box.map),
        "per_class": {
            CLASSES[i]: {
                "map50": float(metrics.box.ap50[i]),
                "map50_95": float(metrics.box.ap[i]),
            }
            for i in range(len(CLASSES))
            if i < len(metrics.box.ap50)
        },
        "val_images": n_va,
        "val_hand_verified": done == total,
        "train_images": n_tr,
    }
    (out / "metrics.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print("\n[train] 검증셋 정확도")
    print(f"  mAP50 {report['map50']:.3f} / mAP50-95 {report['map50_95']:.3f}")
    for c, m in report["per_class"].items():
        print(f"  {c:6s} ({CLASS_KO[c]}): mAP50 {m['map50']:.3f}")
    if not report["val_hand_verified"]:
        print("⚠️ 손검수 안 된 검증셋 — 위 수치는 발표 금지.")


if __name__ == "__main__":
    main()
