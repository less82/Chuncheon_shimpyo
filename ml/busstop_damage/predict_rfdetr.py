"""Run a fine-tuned RF-DETR Nano checkpoint and save annotated predictions."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

if os.name == "nt":
    venv_scripts = str(Path(sys.executable).resolve().parent)
    os.environ["PATH"] = venv_scripts + os.pathsep + os.environ.get("PATH", "")
    if hasattr(os, "add_dll_directory"):
        os.add_dll_directory(venv_scripts)

from PIL import Image, ImageDraw, ImageFont
from rfdetr import RFDETRNano


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--images", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--threshold", type=float, default=0.25)
    parser.add_argument("--nms-threshold", type=float, default=0.5)
    args = parser.parse_args()

    checkpoint = args.checkpoint.resolve()
    image_dir = args.images.resolve()
    output_dir = args.output.resolve()
    if not checkpoint.is_file():
        raise FileNotFoundError(checkpoint)
    if not image_dir.is_dir():
        raise NotADirectoryError(image_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    model = RFDETRNano(pretrain_weights=str(checkpoint), num_classes=1)
    font = ImageFont.load_default()
    prediction_rows: list[dict[str, object]] = []
    rendered_paths: list[Path] = []

    for image_path in sorted(image_dir.glob("*.jpg")):
        detections = model.predict(
            str(image_path), threshold=args.threshold
        ).with_nms(threshold=args.nms_threshold)
        with Image.open(image_path) as opened:
            image = opened.convert("RGB")
        draw = ImageDraw.Draw(image)

        for xyxy, confidence, class_id in zip(
            detections.xyxy, detections.confidence, detections.class_id, strict=True
        ):
            x1, y1, x2, y2 = [float(value) for value in xyxy]
            score = float(confidence)
            class_index = int(class_id)
            draw.rectangle((x1, y1, x2, y2), outline=(255, 40, 40), width=4)
            draw.text(
                (x1 + 4, max(0, y1 - 16)),
                f"damage {score:.2f}",
                fill=(255, 40, 40),
                font=font,
            )
            prediction_rows.append(
                {
                    "image": image_path.name,
                    "class_id": class_index,
                    "confidence": score,
                    "xyxy": [x1, y1, x2, y2],
                }
            )

        rendered_path = output_dir / image_path.name
        image.save(rendered_path, "JPEG", quality=95)
        rendered_paths.append(rendered_path)

    (output_dir / "predictions.json").write_text(
        json.dumps(prediction_rows, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    if rendered_paths:
        tile_width, tile_height, label_height = 480, 360, 24
        columns = min(2, len(rendered_paths))
        rows = (len(rendered_paths) + columns - 1) // columns
        sheet = Image.new(
            "RGB",
            (columns * tile_width, rows * (tile_height + label_height)),
            "white",
        )
        sheet_draw = ImageDraw.Draw(sheet)
        for index, rendered_path in enumerate(rendered_paths):
            with Image.open(rendered_path) as opened:
                tile = opened.convert("RGB")
            tile.thumbnail((tile_width, tile_height))
            x = (index % columns) * tile_width
            y = (index // columns) * (tile_height + label_height)
            sheet.paste(tile, (x, y))
            sheet_draw.text(
                (x + 4, y + tile_height + 4),
                rendered_path.name,
                fill="black",
                font=font,
            )
        sheet.save(output_dir / "predictions_contact_sheet.jpg", "JPEG", quality=95)
    print(f"Saved {len(prediction_rows)} predictions to {output_dir}")


if __name__ == "__main__":
    main()
