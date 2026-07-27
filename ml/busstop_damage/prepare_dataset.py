"""Prepare the supplied bus-stop damage photos as an RF-DETR COCO dataset.

The source images stay outside the repository. This script converts them to
RGB JPEG, assigns deterministic train/valid/test splits, writes COCO bounding
boxes, a provenance manifest, and an annotation contact sheet.

The supplied images are intentionally treated as one class:
``bus_stop_damage``. There are too few examples per subtype for a defensible
multi-class model. Images with ``bbox=None`` are explicit normal negatives.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from PIL import Image, ImageDraw, ImageFont, ImageOps


@dataclass(frozen=True)
class Sample:
    source_name: str
    output_name: str
    split: str
    subtype: str
    bbox: tuple[int, int, int, int] | None


# Bounding boxes enclose the visibly damaged component/area, not the whole image.
# Format: COCO [x, y, width, height] in source-image pixels.
SAMPLES: Final[tuple[Sample, ...]] = (
    Sample("정류장_기둥형파손", "pillar_damage_00.jpg", "train", "pillar", (65, 173, 169, 199)),
    Sample(
        "정류장_버스정보시스템파손.jpg",
        "bus_information_damage_00.jpg",
        "train",
        "bus_information_system",
        (7, 65, 586, 269),
    ),
    Sample(
        "정류장_버스정보시스템파손01.jpg",
        "bus_information_damage_01.jpg",
        "train",
        "bus_information_system",
        (12, 3, 527, 306),
    ),
    Sample(
        "정류장_버스정보시스템파손02.jpg",
        "bus_information_damage_02.jpg",
        "valid",
        "bus_information_system",
        (249, 74, 310, 359),
    ),
    Sample("정류장_안내판파손.jpg", "sign_damage_00.jpg", "train", "sign", (98, 19, 198, 352)),
    Sample("정류장_안내판파손01.jpg", "sign_damage_01.jpg", "train", "sign", (82, 24, 349, 757)),
    Sample("정류장_안내판파손02.jpg", "sign_damage_02.jpg", "test", "sign", (23, 3, 351, 310)),
    Sample(
        "정류장_외벽유리파손.jpg",
        "side_glass_damage_00.jpg",
        "train",
        "side_glass",
        (153, 54, 285, 334),
    ),
    Sample(
        "정류장_외벽유리파손01.jpg",
        "side_glass_damage_01.jpg",
        "train",
        "side_glass",
        (119, 113, 462, 328),
    ),
    Sample(
        "정류장_외벽유리파손02.jpg",
        "side_glass_damage_02.jpg",
        "train",
        "side_glass",
        (8, 51, 172, 279),
    ),
    Sample(
        "정류장_외벽유리파손03.jpg",
        "side_glass_damage_03.jpg",
        "train",
        "side_glass",
        (44, 40, 267, 306),
    ),
    Sample(
        "정류장_외벽유리파손04.jpg",
        "side_glass_damage_04.jpg",
        "valid",
        "side_glass",
        (86, 147, 625, 363),
    ),
    Sample(
        "정류장_외벽유리파손05.jpg",
        "side_glass_damage_05.jpg",
        "train",
        "side_glass",
        (192, 118, 555, 559),
    ),
    Sample("정류장_의자파손.jpg", "seat_damage_00.jpg", "train", "seat", (137, 231, 407, 244)),
    Sample(
        "정류장_천장유리파손.jpg",
        "roof_glass_damage_00.jpg",
        "train",
        "roof_glass",
        (54, 0, 346, 177),
    ),
    Sample(
        "정류장_천장유리파손01.jpg",
        "roof_glass_damage_01.jpg",
        "test",
        "roof_glass",
        (37, 0, 582, 207),
    ),
    Sample(
        "151893_17318_1425.jpg",
        "hard_cracked_glass_00.jpg",
        "train",
        "side_glass",
        (24, 90, 420, 295),
    ),
    Sample(
        "images.jpg",
        "hard_broken_glass_01.jpg",
        "train",
        "side_glass",
        (184, 124, 218, 222),
    ),
    Sample(
        "파손/images (1).jpg",
        "hard_broken_glass_02.jpg",
        "train",
        "side_glass",
        (126, 89, 238, 244),
    ),
    Sample(
        "정류장_정상.jpg",
        "normal_negative_00.jpg",
        "train",
        "normal_negative",
        None,
    ),
    Sample(
        "42657_38203_4053.jpg",
        "normal_negative_01.jpg",
        "train",
        "normal_negative",
        None,
    ),
)

CATEGORY: Final[dict[str, object]] = {
    "id": 1,
    "name": "bus_stop_damage",
    "supercategory": "damage",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file_handle:
        for chunk in iter(lambda: file_handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_bbox(
    bbox: tuple[int, int, int, int], width: int, height: int, source_name: str
) -> None:
    x, y, box_width, box_height = bbox
    if x < 0 or y < 0 or box_width <= 0 or box_height <= 0:
        raise ValueError(f"{source_name}: invalid bbox {bbox}")
    if x + box_width > width or y + box_height > height:
        raise ValueError(
            f"{source_name}: bbox {bbox} exceeds image dimensions {width}x{height}"
        )


def prepare_split(
    samples: list[Sample], source_dir: Path, output_dir: Path
) -> list[dict[str, object]]:
    split = samples[0].split
    split_dir = output_dir / split
    split_dir.mkdir(parents=True, exist_ok=True)

    images: list[dict[str, object]] = []
    annotations: list[dict[str, object]] = []
    manifest_rows: list[dict[str, object]] = []

    annotation_id = 1
    for index, sample in enumerate(samples, start=1):
        source_path = source_dir / sample.source_name
        if not source_path.is_file():
            raise FileNotFoundError(f"Missing source image: {source_path}")

        with Image.open(source_path) as opened:
            image = ImageOps.exif_transpose(opened).convert("RGB")
            width, height = image.size
            if sample.bbox is not None:
                validate_bbox(sample.bbox, width, height, sample.source_name)
            destination = split_dir / sample.output_name
            image.save(destination, "JPEG", quality=95, optimize=True)

        image_id = index
        images.append(
            {
                "id": image_id,
                "file_name": sample.output_name,
                "width": width,
                "height": height,
            }
        )
        if sample.bbox is not None:
            annotations.append(
                {
                    "id": annotation_id,
                    "image_id": image_id,
                    "category_id": 1,
                    "bbox": list(sample.bbox),
                    "area": sample.bbox[2] * sample.bbox[3],
                    "iscrowd": 0,
                    "attributes": {
                        "damage_subtype": sample.subtype,
                        "annotation_status": "reviewed_manual_v4",
                    },
                }
            )
            annotation_id += 1
        manifest_rows.append(
            {
                "split": split,
                "source_name": sample.source_name,
                "output_name": sample.output_name,
                "subtype": sample.subtype,
                "width": width,
                "height": height,
                "bbox_x": sample.bbox[0] if sample.bbox is not None else "",
                "bbox_y": sample.bbox[1] if sample.bbox is not None else "",
                "bbox_width": sample.bbox[2] if sample.bbox is not None else "",
                "bbox_height": sample.bbox[3] if sample.bbox is not None else "",
                "source_sha256": sha256(source_path),
                "output_sha256": sha256(destination),
            }
        )

    coco = {
        "info": {
            "description": "Bus-stop damage proof-of-concept dataset",
            "version": "4.0",
            "annotation_scope": "visibly damaged component or area",
        },
        "licenses": [],
        "images": images,
        "annotations": annotations,
        "categories": [CATEGORY],
    }
    annotation_path = split_dir / "_annotations.coco.json"
    annotation_path.write_text(
        json.dumps(coco, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return manifest_rows


def create_contact_sheet(output_dir: Path, samples: tuple[Sample, ...]) -> Path:
    tiles: list[Image.Image] = []
    tile_width, tile_height = 384, 300
    font = ImageFont.load_default()

    for sample in samples:
        image_path = output_dir / sample.split / sample.output_name
        with Image.open(image_path) as opened:
            image = opened.convert("RGB")
            if sample.bbox is not None:
                draw = ImageDraw.Draw(image)
                x, y, width, height = sample.bbox
                draw.rectangle(
                    (x, y, x + width, y + height),
                    outline=(255, 40, 40),
                    width=5,
                )
            image.thumbnail((tile_width, tile_height - 42))
            tile = Image.new("RGB", (tile_width, tile_height), "white")
            tile.paste(
                image,
                ((tile_width - image.width) // 2, 30 + (tile_height - 42 - image.height) // 2),
            )
            tile_draw = ImageDraw.Draw(tile)
            status = "positive" if sample.bbox is not None else "negative"
            label = (
                f"{sample.split} | {sample.output_name} | "
                f"{sample.subtype} | {status}"
            )
            tile_draw.text((8, 8), label, fill=(20, 20, 20), font=font)
            tiles.append(tile)

    columns = 4
    rows = (len(tiles) + columns - 1) // columns
    sheet = Image.new("RGB", (columns * tile_width, rows * tile_height), (230, 230, 230))
    for index, tile in enumerate(tiles):
        sheet.paste(tile, ((index % columns) * tile_width, (index // columns) * tile_height))

    review_dir = output_dir / "review"
    review_dir.mkdir(parents=True, exist_ok=True)
    contact_sheet_path = review_dir / "annotations_contact_sheet.jpg"
    sheet.save(contact_sheet_path, "JPEG", quality=92)
    return contact_sheet_path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    source_dir = args.source.resolve()
    output_dir = args.output.resolve()
    if not source_dir.is_dir():
        raise NotADirectoryError(source_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    all_rows: list[dict[str, object]] = []
    for split in ("train", "valid", "test"):
        split_samples = [sample for sample in SAMPLES if sample.split == split]
        all_rows.extend(prepare_split(split_samples, source_dir, output_dir))

    manifest_path = output_dir / "manifest.csv"
    with manifest_path.open("w", encoding="utf-8-sig", newline="") as file_handle:
        writer = csv.DictWriter(file_handle, fieldnames=list(all_rows[0].keys()))
        writer.writeheader()
        writer.writerows(all_rows)

    contact_sheet = create_contact_sheet(output_dir, SAMPLES)
    unique_source_images = len({sample.source_name for sample in SAMPLES})
    summary = {
        "class": CATEGORY["name"],
        "source_images": unique_source_images,
        "training_records": len(SAMPLES),
        "annotations": sum(sample.bbox is not None for sample in SAMPLES),
        "splits": {
            split: sum(sample.split == split for sample in SAMPLES)
            for split in ("train", "valid", "test")
        },
        "limitations": [
            "only 2 normal negative images",
            f"{unique_source_images} unique source images",
            "one bounding box per positive image",
            "news captions and watermarks in several images",
            "not suitable for production evaluation",
        ],
    }
    (output_dir / "dataset_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f"Manifest: {manifest_path}")
    print(f"Annotation review: {contact_sheet}")


if __name__ == "__main__":
    main()
