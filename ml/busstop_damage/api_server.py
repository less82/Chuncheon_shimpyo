"""Local HTTP API for the maeng_coco bus-stop damage screen.

The RF-DETR checkpoint stays outside Git. Set ``MAENG_COCO_MODEL_PATH`` or pass
``--model`` when starting this server. The model is loaded lazily once and then
reused for every request.
"""

from __future__ import annotations

import argparse
import base64
import io
import os
import sys
import threading
from pathlib import Path
from typing import Any

if os.name == "nt":
    venv_scripts = str(Path(sys.executable).resolve().parent)
    os.environ["PATH"] = venv_scripts + os.pathsep + os.environ.get("PATH", "")
    if hasattr(os, "add_dll_directory"):
        os.add_dll_directory(venv_scripts)
for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8")

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ImageDraw, ImageFont, ImageOps, UnidentifiedImageError
from rfdetr import RFDETRNano

MAX_UPLOAD_BYTES = 12 * 1024 * 1024
MAX_RENDER_SIDE = 1600
CANDIDATE_THRESHOLD = 0.15
DAMAGE_THRESHOLD = 0.22
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
DEFAULT_MODEL_PATH = (
    Path.home()
    / "Downloads"
    / "busstop_coco_rfdetr"
    / "output_v4"
    / "checkpoint_best_total.pth"
)


def configured_model_path() -> Path:
    raw = os.environ.get("MAENG_COCO_MODEL_PATH", "").strip()
    return Path(raw).expanduser().resolve() if raw else DEFAULT_MODEL_PATH.resolve()


def configured_origins() -> list[str]:
    raw = os.environ.get(
        "MAENG_COCO_ALLOWED_ORIGINS",
        "http://127.0.0.1:5173,http://localhost:5173,"
        "http://127.0.0.1:4173,http://localhost:4173",
    )
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


class DamageDetector:
    def __init__(self, checkpoint: Path) -> None:
        self.checkpoint = checkpoint
        self._model: RFDETRNano | None = None
        self._load_lock = threading.Lock()
        self._predict_lock = threading.Lock()

    @property
    def loaded(self) -> bool:
        return self._model is not None

    def _get_model(self) -> RFDETRNano:
        if self._model is not None:
            return self._model
        with self._load_lock:
            if self._model is None:
                if not self.checkpoint.is_file():
                    raise FileNotFoundError(self.checkpoint)
                self._model = RFDETRNano(
                    pretrain_weights=str(self.checkpoint),
                    num_classes=1,
                )
        return self._model

    def inspect(self, image: Image.Image, threshold: float) -> dict[str, Any]:
        model = self._get_model()
        with self._predict_lock:
            detections = model.predict(image, threshold=threshold).with_nms(
                threshold=0.5
            )

        rendered = image.copy()
        draw = ImageDraw.Draw(rendered)
        font = ImageFont.load_default()
        rows: list[dict[str, Any]] = []
        for xyxy, confidence in zip(
            detections.xyxy, detections.confidence, strict=True
        ):
            x1, y1, x2, y2 = [float(value) for value in xyxy]
            score = float(confidence)
            draw.rectangle((x1, y1, x2, y2), outline=(239, 45, 45), width=5)
            draw.text(
                (x1 + 5, max(0, y1 - 18)),
                f"damage {score:.2f}",
                fill=(239, 45, 45),
                font=font,
            )
            rows.append(
                {
                    "confidence": score,
                    "xyxy": [x1, y1, x2, y2],
                }
            )

        rendered.thumbnail((MAX_RENDER_SIDE, MAX_RENDER_SIDE))
        output = io.BytesIO()
        rendered.save(output, "JPEG", quality=90, optimize=True)
        encoded = base64.b64encode(output.getvalue()).decode("ascii")
        best_confidence = max(
            (row["confidence"] for row in rows),
            default=0.0,
        )
        if best_confidence >= DAMAGE_THRESHOLD:
            verdict = "damage_suspected"
        elif rows:
            verdict = "review_required"
        else:
            verdict = "no_damage_detected"
        return {
            "verdict": verdict,
            "threshold": threshold,
            "damage_threshold": DAMAGE_THRESHOLD,
            "detections": rows,
            "annotated_image": f"data:image/jpeg;base64,{encoded}",
            "notice": (
                "21장으로 학습한 개념검증 모델입니다. 결과를 사람이 확인해야 합니다."
            ),
        }


_detector: DamageDetector | None = None
_detector_lock = threading.Lock()


def get_detector() -> DamageDetector:
    global _detector
    checkpoint = configured_model_path()
    if _detector is not None and _detector.checkpoint == checkpoint:
        return _detector
    with _detector_lock:
        if _detector is None or _detector.checkpoint != checkpoint:
            _detector = DamageDetector(checkpoint)
    return _detector


app = FastAPI(title="maeng_coco local inference API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=configured_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/api/maeng-coco/health")
def health() -> dict[str, Any]:
    detector = get_detector()
    return {
        "status": "ready" if detector.checkpoint.is_file() else "model_missing",
        "model_path": str(detector.checkpoint),
        "model_loaded": detector.loaded,
    }


@app.post("/api/maeng-coco")
async def inspect_bus_stop(
    request: Request,
    threshold: float = Query(default=CANDIDATE_THRESHOLD, ge=0.05, le=0.9),
) -> dict[str, Any]:
    content_type = request.headers.get("content-type", "").split(";", 1)[0].lower()
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=415,
            detail="JPG, PNG, WEBP 이미지만 검사할 수 있습니다.",
        )

    body = await request.body()
    if not body:
        raise HTTPException(status_code=400, detail="이미지 파일이 비어 있습니다.")
    if len(body) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail="이미지는 12MB 이하만 업로드할 수 있습니다.",
        )

    try:
        with Image.open(io.BytesIO(body)) as opened:
            image = ImageOps.exif_transpose(opened).convert("RGB")
    except (UnidentifiedImageError, OSError, ValueError) as error:
        raise HTTPException(
            status_code=400,
            detail="이미지 파일을 읽을 수 없습니다.",
        ) from error

    try:
        return get_detector().inspect(image, threshold)
    except FileNotFoundError as error:
        raise HTTPException(
            status_code=503,
            detail=f"학습 모델을 찾을 수 없습니다: {error}",
        ) from error


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, default=configured_model_path())
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    os.environ["MAENG_COCO_MODEL_PATH"] = str(args.model.resolve())
    import uvicorn

    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
