"""Local HTTP API for the maeng_coco bus-stop damage screen.

The RF-DETR checkpoint stays outside Git. Set ``MAENG_COCO_MODEL_PATH`` or pass
``--model`` when starting this server. The model is loaded lazily once and then
reused for every request.
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import os
import sys
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

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
from pydantic import BaseModel, Field
from rfdetr import RFDETRNano

MAX_UPLOAD_BYTES = 12 * 1024 * 1024
MAX_RENDER_SIDE = 1600
CANDIDATE_THRESHOLD = 0.15
MIN_REVIEW_CONFIDENCE = 0.18
DAMAGE_THRESHOLD = 0.22
MODEL_LABELS: dict[int, dict[str, str]] = {
    0: {
        "label": "side_glass_damage",
        "label_display": "버스 정류장 외벽 유리",
        "annotation_label": "bus stop side glass",
    },
    1: {
        "label": "other_bus_stop_damage",
        "label_display": "버스 정류장 시설",
        "annotation_label": "bus stop facility",
    },
    2: {
        "label": "bus_information_system_damage",
        "label_display": "버스 정류장 버스정보시스템",
        "annotation_label": "bus information system",
    },
}
MODEL_LABELS_BY_NAME = {
    label["label"]: label
    for label in MODEL_LABELS.values()
}
LEGACY_LABEL_DISPLAYS = {
    "side_glass_damage": {"외벽 유리"},
    "other_bus_stop_damage": {"정류장 시설"},
}
NO_DETECTION_LABEL = {
    "label": "unclassified_damage",
    "label_display": "파손 유형 미분류",
}
MAX_REPORT_IMAGE_CHARS = 16 * 1024 * 1024
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
DEFAULT_MODEL_PATH = (
    Path.home()
    / "Downloads"
    / "busstop_coco_rfdetr"
    / "output_v14_glass_evidence_app"
    / "checkpoint_selected_app.pth"
)
DEFAULT_REFERENCE_MODEL_PATH = (
    Path.home()
    / "Downloads"
    / "busstop_coco_rfdetr"
    / "output_v9_reference"
    / "checkpoint_selected_app.pth"
)


def configured_model_path() -> Path:
    raw = os.environ.get("MAENG_COCO_MODEL_PATH", "").strip()
    return Path(raw).expanduser().resolve() if raw else DEFAULT_MODEL_PATH.resolve()


def valid_label_display(label: str, display: str) -> bool:
    model_label = MODEL_LABELS_BY_NAME.get(label)
    return model_label is not None and (
        display == model_label["label_display"]
        or display in LEGACY_LABEL_DISPLAYS.get(label, set())
    )


def configured_reference_model_path() -> Path:
    raw = os.environ.get("MAENG_COCO_REFERENCE_MODEL_PATH", "").strip()
    if raw:
        return Path(raw).expanduser().resolve()
    return DEFAULT_REFERENCE_MODEL_PATH.resolve()


def configured_report_store_path() -> Path:
    raw = os.environ.get("MAENG_COCO_REPORT_STORE_PATH", "").strip()
    if raw:
        return Path(raw).expanduser().resolve()
    return (
        Path.home()
        / "Downloads"
        / "busstop_coco_rfdetr"
        / "maeng_coco_reports.json"
    ).resolve()


def configured_origins() -> list[str]:
    raw = os.environ.get(
        "MAENG_COCO_ALLOWED_ORIGINS",
        "http://127.0.0.1:5173,http://localhost:5173,"
        "http://127.0.0.1:5174,http://localhost:5174,"
        "http://127.0.0.1:4173,http://localhost:4173,"
        "http://127.0.0.1:4174,http://localhost:4174",
    )
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


class DamageDetectionPayload(BaseModel):
    confidence: float = Field(ge=0.0, le=1.0)
    xyxy: tuple[float, float, float, float]
    label: str = Field(min_length=1, max_length=80)
    label_display: str = Field(min_length=1, max_length=80)


class DamageReportPayload(BaseModel):
    label: str = Field(min_length=1, max_length=80)
    label_display: str = Field(min_length=1, max_length=80)
    source_file_name: str = Field(min_length=1, max_length=255)
    photo_data_url: str = Field(min_length=1, max_length=MAX_REPORT_IMAGE_CHARS)
    confidence: float = Field(ge=0.0, le=1.0)
    detections: list[DamageDetectionPayload]


ReportStatus = Literal["received", "reviewing", "task_created", "resolved"]


class ReportStatusPayload(BaseModel):
    status: ReportStatus


_report_lock = threading.Lock()


def _load_damage_reports_unlocked() -> list[dict[str, Any]]:
    path = configured_report_store_path()
    if not path.is_file():
        return []
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    return value if isinstance(value, list) else []


def load_damage_reports() -> list[dict[str, Any]]:
    with _report_lock:
        return _load_damage_reports_unlocked()


def _write_damage_reports_unlocked(reports: list[dict[str, Any]]) -> None:
    path = configured_report_store_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = path.with_suffix(path.suffix + ".tmp")
    temporary_path.write_text(
        json.dumps(reports, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    temporary_path.replace(path)


class DamageDetector:
    def __init__(self, checkpoint: Path, reference_checkpoint: Path) -> None:
        self.checkpoint = checkpoint
        self.reference_checkpoint = reference_checkpoint
        self._model: RFDETRNano | None = None
        self._reference_model: RFDETRNano | None = None
        self._load_lock = threading.Lock()
        self._predict_lock = threading.Lock()

    @property
    def loaded(self) -> bool:
        return self._model is not None and self._reference_model is not None

    @staticmethod
    def _load_model(checkpoint: Path, num_classes: int) -> RFDETRNano:
        if not checkpoint.is_file():
            raise FileNotFoundError(checkpoint)
        return RFDETRNano(
            pretrain_weights=str(checkpoint),
            num_classes=num_classes,
        )

    def _get_model(self) -> RFDETRNano:
        if self._model is not None:
            return self._model
        with self._load_lock:
            if self._model is None:
                self._model = self._load_model(
                    self.checkpoint,
                    len(MODEL_LABELS),
                )
        return self._model

    def _get_reference_model(self) -> RFDETRNano:
        if self._reference_model is not None:
            return self._reference_model
        with self._load_lock:
            if self._reference_model is None:
                self._reference_model = self._load_model(
                    self.reference_checkpoint,
                    2,
                )
        return self._reference_model

    @staticmethod
    def _mapped_rows(detections: Any) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for xyxy, confidence, class_id in zip(
            detections.xyxy,
            detections.confidence,
            detections.class_id,
            strict=True,
        ):
            class_index = int(class_id)
            model_label = MODEL_LABELS.get(class_index)
            if model_label is None:
                continue
            x1, y1, x2, y2 = [float(value) for value in xyxy]
            rows.append(
                {
                    "confidence": float(confidence),
                    "xyxy": [x1, y1, x2, y2],
                    "label": model_label["label"],
                    "label_display": model_label["label_display"],
                    "annotation_label": model_label["annotation_label"],
                }
            )
        return rows

    def inspect(self, image: Image.Image, threshold: float) -> dict[str, Any]:
        model = self._get_model()
        reference_model = self._get_reference_model()
        with self._predict_lock:
            primary_detections = model.predict(image, threshold=threshold).with_nms(
                threshold=0.5
            )
            reference_detections = reference_model.predict(
                image,
                threshold=threshold,
            ).with_nms(
                threshold=0.5
            )

        primary_rows = self._mapped_rows(primary_detections)
        reference_rows = self._mapped_rows(reference_detections)
        reference_other_rows = [
            row
            for row in reference_rows
            if row["label"] == "other_bus_stop_damage"
        ]
        primary_best = max(
            primary_rows,
            key=lambda row: row["confidence"],
            default=None,
        )
        reference_best = max(
            reference_other_rows,
            key=lambda row: row["confidence"],
            default=None,
        )
        reference_overrides = (
            reference_best is not None
            and reference_best["confidence"] >= DAMAGE_THRESHOLD
            and (
                primary_best is None
                or primary_best["label"] == "other_bus_stop_damage"
                or (
                    primary_best["label"]
                    != "bus_information_system_damage"
                    and reference_best["confidence"]
                    >= primary_best["confidence"] * 0.7
                )
            )
        )
        if reference_overrides:
            candidate_rows = reference_other_rows
        elif primary_rows:
            candidate_rows = primary_rows
        else:
            candidate_rows = []

        rendered = image.copy()
        draw = ImageDraw.Draw(rendered)
        font = ImageFont.load_default()
        best_detection = max(
            candidate_rows,
            key=lambda row: row["confidence"],
            default=None,
        )
        if best_detection is None:
            rows: list[dict[str, Any]] = []
        else:
            relative_multiplier = (
                0.65
                if best_detection["label"] == "side_glass_damage"
                else 0.5
            )
            relative_threshold = max(
                threshold,
                MIN_REVIEW_CONFIDENCE,
                best_detection["confidence"] * relative_multiplier,
            )
            rows = [
                row
                for row in sorted(
                    candidate_rows,
                    key=lambda row: row["confidence"],
                    reverse=True,
                )
                if row["label"] == best_detection["label"]
                and row["confidence"] >= relative_threshold
            ][:5]
        for row in rows:
            x1, y1, x2, y2 = row["xyxy"]
            draw.rectangle((x1, y1, x2, y2), outline=(239, 45, 45), width=5)
            draw.text(
                (x1 + 5, max(0, y1 - 18)),
                f"{row['annotation_label']} {row['confidence']:.2f}",
                fill=(239, 45, 45),
                font=font,
            )
            del row["annotation_label"]

        rendered.thumbnail((MAX_RENDER_SIDE, MAX_RENDER_SIDE))
        output = io.BytesIO()
        rendered.save(output, "JPEG", quality=90, optimize=True)
        encoded = base64.b64encode(output.getvalue()).decode("ascii")
        best_confidence = max(
            (row["confidence"] for row in rows),
            default=0.0,
        )
        result_label = (rows[0] if rows else None) or NO_DETECTION_LABEL
        if best_confidence >= DAMAGE_THRESHOLD:
            verdict = "damage_suspected"
        elif rows:
            verdict = "review_required"
        else:
            verdict = "no_damage_detected"
        return {
            "verdict": verdict,
            "label": result_label["label"],
            "label_display": result_label["label_display"],
            "threshold": threshold,
            "damage_threshold": DAMAGE_THRESHOLD,
            "detections": rows,
            "annotated_image": f"data:image/jpeg;base64,{encoded}",
            "notice": (
                "고유 원본 23장과 증식본 54장 기반의 "
                "3종 개념검증 모델입니다. "
                "결과를 사람이 확인해야 합니다."
            ),
        }


_detector: DamageDetector | None = None
_detector_lock = threading.Lock()


def get_detector() -> DamageDetector:
    global _detector
    checkpoint = configured_model_path()
    reference_checkpoint = configured_reference_model_path()
    if (
        _detector is not None
        and _detector.checkpoint == checkpoint
        and _detector.reference_checkpoint == reference_checkpoint
    ):
        return _detector
    with _detector_lock:
        if (
            _detector is None
            or _detector.checkpoint != checkpoint
            or _detector.reference_checkpoint != reference_checkpoint
        ):
            _detector = DamageDetector(checkpoint, reference_checkpoint)
    return _detector


app = FastAPI(title="maeng_coco local inference API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=configured_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["Content-Type"],
)


@app.get("/api/maeng-coco/health")
def health() -> dict[str, Any]:
    detector = get_detector()
    return {
        "status": (
            "ready"
            if detector.checkpoint.is_file()
            and detector.reference_checkpoint.is_file()
            else "model_missing"
        ),
        "model_path": str(detector.checkpoint),
        "reference_model_path": str(detector.reference_checkpoint),
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


@app.get("/api/maeng-coco/reports")
def list_damage_reports() -> list[dict[str, Any]]:
    return load_damage_reports()


@app.post("/api/maeng-coco/reports", status_code=201)
def create_damage_report(payload: DamageReportPayload) -> dict[str, Any]:
    model_label = MODEL_LABELS_BY_NAME.get(payload.label)
    if model_label is None or not valid_label_display(
        payload.label,
        payload.label_display,
    ):
        raise HTTPException(status_code=422, detail="현재 모델 라벨과 일치하지 않습니다.")
    if not payload.detections:
        raise HTTPException(status_code=422, detail="검출된 파손 영역이 없습니다.")
    if len(payload.detections) > 30:
        raise HTTPException(status_code=422, detail="파손 영역은 30개까지 접수할 수 있습니다.")
    if not payload.photo_data_url.startswith("data:image/"):
        raise HTTPException(status_code=422, detail="접수 사진 형식이 올바르지 않습니다.")

    for detection in payload.detections:
        detection_label = MODEL_LABELS_BY_NAME.get(detection.label)
        if (
            detection_label is None
            or not valid_label_display(
                detection.label,
                detection.label_display,
            )
        ):
            raise HTTPException(
                status_code=422,
                detail="검출 영역의 모델 라벨이 올바르지 않습니다.",
            )
    best_detection = max(
        payload.detections,
        key=lambda detection: detection.confidence,
    )
    if best_detection.label != payload.label:
        raise HTTPException(
            status_code=422,
            detail="최고 신뢰도 영역과 대표 모델 라벨이 일치하지 않습니다.",
        )

    now = datetime.now(timezone.utc).isoformat()
    report_id = f"maeng-coco-{uuid.uuid4()}"
    confidence = best_detection.confidence
    report = {
        "id": report_id,
        "stopId": f"unidentified:{report_id}",
        "stopNo": "미확인",
        "stopName": "정류장 위치 미확인",
        "issue": f"({model_label['label_display']}) 파손이 확인되었습니다.",
        "photoDataUrl": payload.photo_data_url,
        "createdAt": now,
        "updatedAt": now,
        "status": "received",
        "source": "maeng_coco",
        "modelLabel": model_label["label"],
        "modelLabelDisplay": model_label["label_display"],
        "modelConfidence": confidence,
        "detectionCount": len(payload.detections),
        "detections": [
            {
                "confidence": detection.confidence,
                "xyxy": list(detection.xyxy),
                "label": detection.label,
                "label_display": detection.label_display,
            }
            for detection in payload.detections
        ],
        "sourceFileName": payload.source_file_name,
    }
    with _report_lock:
        reports = _load_damage_reports_unlocked()
        _write_damage_reports_unlocked(reports + [report])
    return report


@app.patch("/api/maeng-coco/reports/{report_id}")
def update_damage_report(
    report_id: str,
    payload: ReportStatusPayload,
) -> dict[str, Any]:
    with _report_lock:
        reports = _load_damage_reports_unlocked()
        target = next(
            (report for report in reports if report.get("id") == report_id),
            None,
        )
        if target is None:
            raise HTTPException(status_code=404, detail="접수 내역을 찾을 수 없습니다.")
        now = datetime.now(timezone.utc).isoformat()
        target["status"] = payload.status
        target["updatedAt"] = now
        if payload.status == "resolved":
            target["resolvedAt"] = now
        _write_damage_reports_unlocked(reports)
        return target


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, default=configured_model_path())
    parser.add_argument(
        "--reference-model",
        type=Path,
        default=configured_reference_model_path(),
    )
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    os.environ["MAENG_COCO_MODEL_PATH"] = str(args.model.resolve())
    os.environ["MAENG_COCO_REFERENCE_MODEL_PATH"] = str(
        args.reference_model.resolve()
    )
    import uvicorn

    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
