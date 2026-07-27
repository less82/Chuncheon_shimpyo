"""Prepare the supplied bus-stop damage photos as an RF-DETR COCO dataset.

The source images stay outside the repository. This script converts them to
RGB JPEG, assigns deterministic train/valid/test splits, writes COCO bounding
boxes, a provenance manifest, and an annotation contact sheet.

By default the supplied images are grouped into two defensible classes:
``side_glass_damage`` and ``other_bus_stop_damage``. Optional modes separate
``bus_information_system_damage`` and create deterministic class-balanced or
distant-structure training augmentations. Images with ``bbox=None`` are
explicit normal negatives.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Final

import albumentations as A
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps


@dataclass(frozen=True)
class Sample:
    source_name: str
    output_name: str
    split: str
    subtype: str
    bbox: tuple[int, int, int, int] | None
    crop_xyxy: tuple[int, int, int, int] | None = None
    reference_only: bool = False
    augmentation_seed: int | None = None
    additional_bboxes: tuple[tuple[int, int, int, int], ...] = ()


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
    Sample(
        "정류장_버스정보시스템파손02.jpg",
        "bus_information_damage_02_repeat_1.jpg",
        "train",
        "bus_information_system",
        (249, 74, 310, 359),
        reference_only=True,
    ),
    Sample(
        "정류장_버스정보시스템파손02.jpg",
        "bus_information_damage_02_repeat_2.jpg",
        "train",
        "bus_information_system",
        (249, 74, 310, 359),
        reference_only=True,
    ),
    Sample("정류장_안내판파손.jpg", "sign_damage_00.jpg", "train", "sign", (98, 19, 198, 352)),
    Sample("정류장_안내판파손01.jpg", "sign_damage_01.jpg", "train", "sign", (82, 24, 349, 757)),
    Sample("정류장_안내판파손02.jpg", "sign_damage_02.jpg", "test", "sign", (23, 3, 351, 310)),
    Sample(
        "정류장_안내판파손02.jpg",
        "sign_damage_02_repeat_1.jpg",
        "train",
        "sign",
        (23, 3, 351, 310),
        reference_only=True,
    ),
    Sample(
        "정류장_안내판파손02.jpg",
        "sign_damage_02_repeat_2.jpg",
        "train",
        "sign",
        (23, 3, 351, 310),
        reference_only=True,
    ),
    Sample(
        "정류장_외벽유리파손.jpg",
        "side_glass_damage_00.jpg",
        "train",
        "side_glass",
        (236, 64, 209, 355),
    ),
    Sample(
        "정류장_외벽유리파손01.jpg",
        "side_glass_damage_01.jpg",
        "train",
        "side_glass",
        (158, 190, 126, 166),
    ),
    Sample(
        "정류장_외벽유리파손02.jpg",
        "side_glass_damage_02.jpg",
        "train",
        "side_glass",
        (0, 78, 82, 164),
    ),
    Sample(
        "정류장_외벽유리파손03.jpg",
        "side_glass_damage_03.jpg",
        "train",
        "side_glass",
        (160, 43, 139, 309),
    ),
    Sample(
        "정류장_외벽유리파손03.jpg",
        "side_glass_damage_03_repeat_1.jpg",
        "train",
        "side_glass",
        (160, 43, 139, 309),
    ),
    Sample(
        "정류장_외벽유리파손03.jpg",
        "side_glass_damage_03_repeat_2.jpg",
        "train",
        "side_glass",
        (160, 43, 139, 309),
    ),
    # Hard-negative crops from the intact right-hand glass panel in the same
    # scene. They teach the detector that a framed glass panel is not damage
    # by itself and suppress the false positive reported in the app.
    Sample(
        "정류장_외벽유리파손03.jpg",
        "normal_intact_side_glass_00.jpg",
        "train",
        "normal_negative",
        None,
        (330, 35, 515, 365),
    ),
    Sample(
        "정류장_외벽유리파손03.jpg",
        "normal_intact_side_glass_01.jpg",
        "train",
        "normal_negative",
        None,
        (345, 75, 515, 360),
    ),
    Sample(
        "정류장_외벽유리파손03.jpg",
        "normal_intact_side_glass_02.jpg",
        "train",
        "normal_negative",
        None,
        (335, 125, 515, 355),
    ),
    Sample(
        "정류장_외벽유리파손03.jpg",
        "normal_intact_side_glass_03.jpg",
        "train",
        "normal_negative",
        None,
        (355, 40, 515, 245),
    ),
    Sample(
        "정류장_외벽유리파손04.jpg",
        "side_glass_damage_04.jpg",
        "train",
        "side_glass",
        (4, 188, 400, 326),
    ),
    Sample(
        "정류장_외벽유리파손05.jpg",
        "side_glass_damage_05.jpg",
        "train",
        "side_glass",
        (286, 142, 337, 441),
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
        "정류장_천장유리파손01.jpg",
        "roof_glass_damage_01_repeat_1.jpg",
        "train",
        "roof_glass",
        (37, 0, 582, 207),
        reference_only=True,
    ),
    Sample(
        "정류장_천장유리파손01.jpg",
        "roof_glass_damage_01_repeat_2.jpg",
        "train",
        "roof_glass",
        (37, 0, 582, 207),
        reference_only=True,
    ),
    Sample(
        "151893_17318_1425.jpg",
        "hard_cracked_glass_00.jpg",
        "train",
        "side_glass",
        (146, 63, 267, 316),
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
        "정류장_외벽유리파손04.jpg",
        "side_glass_damage_04_repeat_1.jpg",
        "train",
        "side_glass",
        (4, 188, 400, 326),
    ),
    Sample(
        "정류장_외벽유리파손04.jpg",
        "side_glass_damage_04_repeat_2.jpg",
        "train",
        "side_glass",
        (4, 188, 400, 326),
    ),
    Sample(
        "파손/images (1).jpg",
        "hard_broken_glass_02_repeat_1.jpg",
        "train",
        "side_glass",
        (126, 89, 238, 244),
    ),
    Sample(
        "파손/images (1).jpg",
        "hard_broken_glass_02_repeat_2.jpg",
        "train",
        "side_glass",
        (126, 89, 238, 244),
    ),
    Sample(
        "파손/images (1).jpg",
        "hard_broken_glass_02_repeat_3.jpg",
        "train",
        "side_glass",
        (126, 89, 238, 244),
    ),
    Sample(
        "파손/4830_5592_3830.jpg",
        "hard_distant_collision_structure_00.jpg",
        "train",
        "collision_structure",
        (373, 415, 287, 205),
    ),
    Sample(
        "파손/159339_61595_832.jpg",
        "hard_missing_side_glass_with_shards_00.jpg",
        "train",
        "side_glass_missing_panel",
        (205, 53, 227, 422),
        additional_bboxes=((205, 420, 170, 55),),
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

BASE_CATEGORIES: Final[tuple[dict[str, object], ...]] = (
    {
        "id": 1,
        "name": "side_glass_damage",
        "supercategory": "damage",
    },
    {
        "id": 2,
        "name": "other_bus_stop_damage",
        "supercategory": "damage",
    },
)
BUS_INFORMATION_CATEGORY: Final[dict[str, object]] = {
    "id": 3,
    "name": "bus_information_system_damage",
    "supercategory": "damage",
}


def categories_for(
    separate_bus_information: bool,
) -> tuple[dict[str, object], ...]:
    if separate_bus_information:
        return (*BASE_CATEGORIES, BUS_INFORMATION_CATEGORY)
    return BASE_CATEGORIES


def category_id_for(sample: Sample, separate_bus_information: bool) -> int:
    if separate_bus_information and sample.subtype == "bus_information_system":
        return 3
    return 1 if sample.subtype.startswith("side_glass") else 2


def bboxes_for(sample: Sample) -> tuple[tuple[int, int, int, int], ...]:
    if sample.bbox is None:
        if sample.additional_bboxes:
            raise ValueError(
                f"{sample.output_name}: additional boxes require a primary box"
            )
        return ()
    return (sample.bbox, *sample.additional_bboxes)


def augmentation_seed_for(sample: Sample, index: int) -> int:
    digest = hashlib.sha256(
        f"{sample.source_name}|{sample.output_name}|{index}".encode("utf-8")
    ).digest()
    return int.from_bytes(digest[:4], "big")


def expand_bus_information_augmentations(
    samples: tuple[Sample, ...],
    copies_per_training_image: int,
) -> tuple[Sample, ...]:
    if copies_per_training_image < 0:
        raise ValueError("--augment-bus-information must be zero or greater")
    expanded = list(samples)
    if copies_per_training_image == 0:
        return tuple(expanded)

    augmented_sources: set[str] = set()
    for sample in samples:
        if (
            sample.split != "train"
            or sample.subtype != "bus_information_system"
            or sample.bbox is None
            or sample.source_name in augmented_sources
        ):
            continue
        augmented_sources.add(sample.source_name)
        stem = Path(sample.output_name).stem
        for index in range(1, copies_per_training_image + 1):
            expanded.append(
                Sample(
                    source_name=sample.source_name,
                    output_name=f"{stem}_aug_{index:02d}.jpg",
                    split=sample.split,
                    subtype=sample.subtype,
                    bbox=sample.bbox,
                    crop_xyxy=sample.crop_xyxy,
                    augmentation_seed=augmentation_seed_for(sample, index),
                    additional_bboxes=sample.additional_bboxes,
                )
            )
    return tuple(expanded)


def expand_other_damage_augmentations(
    samples: tuple[Sample, ...],
    copies_per_training_image: int,
) -> tuple[Sample, ...]:
    if copies_per_training_image < 0:
        raise ValueError("--augment-other-damage must be zero or greater")
    expanded = list(samples)
    if copies_per_training_image == 0:
        return tuple(expanded)

    augmented_sources: set[str] = set()
    for sample in samples:
        if (
            sample.split != "train"
            or sample.subtype.startswith("side_glass")
            or sample.subtype in {
                "bus_information_system",
                "normal_negative",
            }
            or sample.bbox is None
            or sample.source_name in augmented_sources
        ):
            continue
        augmented_sources.add(sample.source_name)
        stem = Path(sample.output_name).stem
        for index in range(1, copies_per_training_image + 1):
            expanded.append(
                Sample(
                    source_name=sample.source_name,
                    output_name=f"{stem}_other_aug_{index:02d}.jpg",
                    split=sample.split,
                    subtype=sample.subtype,
                    bbox=sample.bbox,
                    crop_xyxy=sample.crop_xyxy,
                    augmentation_seed=augmentation_seed_for(
                        sample,
                        10_000 + index,
                    ),
                    additional_bboxes=sample.additional_bboxes,
                )
            )
    return tuple(expanded)


def expand_distant_structure_augmentations(
    samples: tuple[Sample, ...],
    copies_per_training_image: int,
) -> tuple[Sample, ...]:
    """Oversample small, distant collision damage without changing its class."""
    if copies_per_training_image < 0:
        raise ValueError("--augment-distant-structure must be zero or greater")
    expanded = list(samples)
    if copies_per_training_image == 0:
        return tuple(expanded)

    for sample in samples:
        if (
            sample.split != "train"
            or sample.subtype != "collision_structure"
            or sample.bbox is None
            or sample.augmentation_seed is not None
        ):
            continue
        stem = Path(sample.output_name).stem
        for index in range(1, copies_per_training_image + 1):
            expanded.append(
                Sample(
                    source_name=sample.source_name,
                    output_name=f"{stem}_distant_aug_{index:02d}.jpg",
                    split=sample.split,
                    subtype=sample.subtype,
                    bbox=sample.bbox,
                    crop_xyxy=sample.crop_xyxy,
                    augmentation_seed=augmentation_seed_for(
                        sample,
                        20_000 + index,
                    ),
                    additional_bboxes=sample.additional_bboxes,
                )
            )
    return tuple(expanded)


def expand_missing_side_glass_augmentations(
    samples: tuple[Sample, ...],
    copies_per_training_image: int,
) -> tuple[Sample, ...]:
    """Oversample a missing panel while retaining opening and shard boxes."""
    if copies_per_training_image < 0:
        raise ValueError("--augment-missing-side-glass must be zero or greater")
    expanded = list(samples)
    if copies_per_training_image == 0:
        return tuple(expanded)

    for sample in samples:
        if (
            sample.split != "train"
            or sample.subtype != "side_glass_missing_panel"
            or sample.bbox is None
            or sample.augmentation_seed is not None
        ):
            continue
        stem = Path(sample.output_name).stem
        for index in range(1, copies_per_training_image + 1):
            expanded.append(
                Sample(
                    source_name=sample.source_name,
                    output_name=f"{stem}_missing_aug_{index:02d}.jpg",
                    split=sample.split,
                    subtype=sample.subtype,
                    bbox=sample.bbox,
                    crop_xyxy=sample.crop_xyxy,
                    augmentation_seed=augmentation_seed_for(
                        sample,
                        30_000 + index,
                    ),
                    additional_bboxes=sample.additional_bboxes,
                )
            )
    return tuple(expanded)


def augment_image_and_bboxes(
    image: Image.Image,
    bboxes: tuple[tuple[int, int, int, int], ...],
    seed: int,
) -> tuple[Image.Image, tuple[tuple[int, int, int, int], ...]]:
    transform = A.Compose(
        [
            A.Affine(
                scale=(0.9, 1.1),
                translate_percent=(-0.06, 0.06),
                rotate=(-7, 7),
                shear=(-3, 3),
                fit_output=False,
                p=0.9,
            ),
            A.Perspective(scale=(0.02, 0.05), keep_size=True, p=0.35),
            A.OneOf(
                [
                    A.ColorJitter(
                        brightness=0.25,
                        contrast=0.25,
                        saturation=0.18,
                        hue=0.04,
                        p=1,
                    ),
                    A.RandomGamma(gamma_limit=(70, 135), p=1),
                    A.CLAHE(clip_limit=(1, 3), p=1),
                ],
                p=0.9,
            ),
            A.OneOf(
                [
                    A.GaussNoise(std_range=(0.01, 0.05), p=1),
                    A.MotionBlur(blur_limit=(3, 7), p=1),
                    A.ImageCompression(quality_range=(55, 88), p=1),
                ],
                p=0.65,
            ),
            A.CoarseDropout(
                num_holes_range=(1, 3),
                hole_height_range=(0.03, 0.12),
                hole_width_range=(0.03, 0.12),
                fill="random_uniform",
                p=0.3,
            ),
        ],
        bbox_params=A.BboxParams(
            format="coco",
            label_fields=["category_ids"],
            min_area=16,
            min_visibility=0.55,
            clip=True,
        ),
        seed=seed,
    )
    transformed = transform(
        image=np.asarray(image),
        bboxes=list(bboxes),
        category_ids=[1] * len(bboxes),
    )
    transformed_boxes = transformed["bboxes"]
    if len(transformed_boxes) != len(bboxes):
        raise ValueError(f"augmentation seed {seed} removed a damage box")

    array = transformed["image"]
    height, width = array.shape[:2]
    output_bboxes: list[tuple[int, int, int, int]] = []
    for x, y, box_width, box_height in transformed_boxes:
        x1 = max(0, min(width - 1, round(x)))
        y1 = max(0, min(height - 1, round(y)))
        x2 = max(x1 + 1, min(width, round(x + box_width)))
        y2 = max(y1 + 1, min(height, round(y + box_height)))
        output_bboxes.append((x1, y1, x2 - x1, y2 - y1))
    return Image.fromarray(array).convert("RGB"), tuple(output_bboxes)


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
    samples: list[Sample],
    source_dir: Path,
    output_dir: Path,
    annotation_version: str,
    categories: tuple[dict[str, object], ...],
    separate_bus_information: bool,
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
            if sample.crop_xyxy is not None:
                source_width, source_height = image.size
                crop_x1, crop_y1, crop_x2, crop_y2 = sample.crop_xyxy
                if (
                    crop_x1 < 0
                    or crop_y1 < 0
                    or crop_x2 <= crop_x1
                    or crop_y2 <= crop_y1
                    or crop_x2 > source_width
                    or crop_y2 > source_height
                ):
                    raise ValueError(
                        f"{sample.source_name}: crop {sample.crop_xyxy} exceeds "
                        f"image dimensions {source_width}x{source_height}"
                    )
                image = image.crop(sample.crop_xyxy)
            output_bboxes = bboxes_for(sample)
            if sample.augmentation_seed is not None:
                if not output_bboxes:
                    raise ValueError(
                        f"{sample.output_name}: augmentation requires a bbox"
                    )
                image, output_bboxes = augment_image_and_bboxes(
                    image,
                    output_bboxes,
                    sample.augmentation_seed,
                )
            width, height = image.size
            for output_bbox in output_bboxes:
                validate_bbox(output_bbox, width, height, sample.output_name)
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
        for output_bbox in output_bboxes:
            annotations.append(
                {
                    "id": annotation_id,
                    "image_id": image_id,
                    "category_id": category_id_for(
                        sample,
                        separate_bus_information,
                    ),
                    "bbox": list(output_bbox),
                    "area": output_bbox[2] * output_bbox[3],
                    "iscrowd": 0,
                    "attributes": {
                        "damage_subtype": sample.subtype,
                        "annotation_status": (
                            f"reviewed_manual_v{annotation_version}"
                        ),
                    },
                }
            )
            annotation_id += 1
        primary_bbox = output_bboxes[0] if output_bboxes else None
        manifest_rows.append(
            {
                "split": split,
                "source_name": sample.source_name,
                "output_name": sample.output_name,
                "subtype": sample.subtype,
                "width": width,
                "height": height,
                "bbox_x": primary_bbox[0] if primary_bbox is not None else "",
                "bbox_y": primary_bbox[1] if primary_bbox is not None else "",
                "bbox_width": primary_bbox[2] if primary_bbox is not None else "",
                "bbox_height": primary_bbox[3] if primary_bbox is not None else "",
                "additional_bboxes_json": json.dumps(
                    output_bboxes[1:],
                    ensure_ascii=False,
                    separators=(",", ":"),
                ),
                "crop_x1": (
                    sample.crop_xyxy[0] if sample.crop_xyxy is not None else ""
                ),
                "crop_y1": (
                    sample.crop_xyxy[1] if sample.crop_xyxy is not None else ""
                ),
                "crop_x2": (
                    sample.crop_xyxy[2] if sample.crop_xyxy is not None else ""
                ),
                "crop_y2": (
                    sample.crop_xyxy[3] if sample.crop_xyxy is not None else ""
                ),
                "source_sha256": sha256(source_path),
                "output_sha256": sha256(destination),
                "augmentation_seed": (
                    sample.augmentation_seed
                    if sample.augmentation_seed is not None
                    else ""
                ),
            }
        )

    coco = {
        "info": {
            "description": "Bus-stop damage proof-of-concept dataset",
            "version": f"{annotation_version}.0",
            "annotation_scope": "visibly damaged component or area",
        },
        "licenses": [],
        "images": images,
        "annotations": annotations,
        "categories": list(categories),
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
    annotation_boxes: dict[
        tuple[str, str],
        list[tuple[float, float, float, float]],
    ] = {}
    for split in ("train", "valid", "test"):
        annotation_path = output_dir / split / "_annotations.coco.json"
        coco = json.loads(annotation_path.read_text(encoding="utf-8"))
        image_names = {
            image["id"]: image["file_name"]
            for image in coco["images"]
        }
        for annotation in coco["annotations"]:
            annotation_boxes.setdefault(
                (split, image_names[annotation["image_id"]]),
                [],
            ).append(tuple(annotation["bbox"]))

    for sample in samples:
        image_path = output_dir / sample.split / sample.output_name
        with Image.open(image_path) as opened:
            image = opened.convert("RGB")
            bboxes = annotation_boxes.get((sample.split, sample.output_name), [])
            if bboxes:
                draw = ImageDraw.Draw(image)
                for bbox_index, (x, y, width, height) in enumerate(bboxes):
                    draw.rectangle(
                        (x, y, x + width, y + height),
                        outline=(255, 40, 40),
                        width=5,
                    )
                    draw.text(
                        (x + 4, y + 4),
                        str(bbox_index + 1),
                        fill=(255, 40, 40),
                        font=font,
                    )
            image.thumbnail((tile_width, tile_height - 42))
            tile = Image.new("RGB", (tile_width, tile_height), "white")
            tile.paste(
                image,
                ((tile_width - image.width) // 2, 30 + (tile_height - 42 - image.height) // 2),
            )
            tile_draw = ImageDraw.Draw(tile)
            status = f"positive:{len(bboxes)}" if bboxes else "negative"
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
    parser.add_argument(
        "--include-reference-regression",
        action="store_true",
        help=(
            "Duplicate valid/test other-damage sources into train for the "
            "app reference model. This invalidates independent split metrics."
        ),
    )
    parser.add_argument(
        "--separate-bus-information",
        action="store_true",
        help="Add bus_information_system_damage as a third class.",
    )
    parser.add_argument(
        "--augment-bus-information",
        type=int,
        default=0,
        metavar="COPIES",
        help=(
            "Create this many deterministic augmented copies per training "
            "bus-information image. Validation/test images are never augmented."
        ),
    )
    parser.add_argument(
        "--augment-other-damage",
        type=int,
        default=0,
        metavar="COPIES",
        help=(
            "Create this many deterministic augmented copies per unique "
            "training source in the grouped other-damage class."
        ),
    )
    parser.add_argument(
        "--augment-distant-structure",
        type=int,
        default=0,
        metavar="COPIES",
        help=(
            "Create this many deterministic copies of distant, partly "
            "occluded collision-structure damage."
        ),
    )
    parser.add_argument(
        "--augment-missing-side-glass",
        type=int,
        default=0,
        metavar="COPIES",
        help=(
            "Create this many deterministic copies of a missing side-glass "
            "panel with separate opening and shard boxes."
        ),
    )
    args = parser.parse_args()
    if args.augment_bus_information and not args.separate_bus_information:
        parser.error(
            "--augment-bus-information requires --separate-bus-information"
        )

    source_dir = args.source.resolve()
    output_dir = args.output.resolve()
    if not source_dir.is_dir():
        raise NotADirectoryError(source_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    original_samples = tuple(
        sample
        for sample in SAMPLES
        if args.include_reference_regression or not sample.reference_only
    )
    selected_samples = expand_bus_information_augmentations(
        original_samples,
        args.augment_bus_information,
    )
    selected_samples = expand_other_damage_augmentations(
        selected_samples,
        args.augment_other_damage,
    )
    selected_samples = expand_distant_structure_augmentations(
        selected_samples,
        args.augment_distant_structure,
    )
    selected_samples = expand_missing_side_glass_augmentations(
        selected_samples,
        args.augment_missing_side_glass,
    )
    categories = categories_for(args.separate_bus_information)
    if args.separate_bus_information and args.augment_missing_side_glass:
        annotation_version = "14r" if args.include_reference_regression else "14"
    elif args.separate_bus_information and args.augment_distant_structure:
        annotation_version = "13r" if args.include_reference_regression else "13"
    elif args.separate_bus_information and args.augment_other_damage:
        annotation_version = "12r" if args.include_reference_regression else "12"
    elif args.separate_bus_information:
        annotation_version = "11" if args.include_reference_regression else "10"
    else:
        annotation_version = "9" if args.include_reference_regression else "8"
    all_rows: list[dict[str, object]] = []
    for split in ("train", "valid", "test"):
        split_samples = [
            sample for sample in selected_samples if sample.split == split
        ]
        all_rows.extend(
            prepare_split(
                split_samples,
                source_dir,
                output_dir,
                annotation_version,
                categories,
                args.separate_bus_information,
            )
        )

    manifest_path = output_dir / "manifest.csv"
    with manifest_path.open("w", encoding="utf-8-sig", newline="") as file_handle:
        writer = csv.DictWriter(file_handle, fieldnames=list(all_rows[0].keys()))
        writer.writeheader()
        writer.writerows(all_rows)

    contact_sheet = create_contact_sheet(output_dir, selected_samples)
    unique_source_images = len(
        {sample.source_name for sample in selected_samples}
    )
    limitations = [
        "only 2 independent normal source images plus 4 intact-panel crops",
        f"{unique_source_images} unique source images",
        "most positive images have one box; the missing-panel image has separate opening and shard boxes",
        "missing side-glass subtype has only one independent source image",
        "distant collision-structure subtype has only one independent source image",
        "all supplied side-glass images are training data; no independent side-glass holdout",
        "three difficult side-glass sources are oversampled for app regression",
        "four intact-panel hard-negative crops come from one supplied source image",
        "news captions and watermarks in several images",
        "not suitable for production evaluation",
    ]
    if args.separate_bus_information:
        limitations.extend(
            [
                "bus-information class has only 3 independent source images",
                "bus-information augmentation does not replace new field photos",
                (
                    "bus-information validation source is duplicated into train; "
                    "reported validation is not independent"
                    if args.include_reference_regression
                    else "one bus-information source is held out for validation"
                ),
            ]
        )
    else:
        limitations.insert(
            3,
            "non-side-glass subtypes remain grouped into one class",
        )
    if args.include_reference_regression:
        limitations.insert(
            -2,
            "valid/test other-damage sources are duplicated into train for app regression",
        )
    summary = {
        "version": annotation_version,
        "classes": [category["name"] for category in categories],
        "source_images": unique_source_images,
        "training_records": len(selected_samples),
        "augmented_training_records": sum(
            sample.augmentation_seed is not None
            for sample in selected_samples
        ),
        "annotations": sum(
            len(bboxes_for(sample)) for sample in selected_samples
        ),
        "splits": {
            split: sum(sample.split == split for sample in selected_samples)
            for split in ("train", "valid", "test")
        },
        "augmentation": {
            "bus_information_copies_per_training_image": (
                args.augment_bus_information
            ),
            "other_damage_copies_per_training_image": (
                args.augment_other_damage
            ),
            "distant_structure_copies_per_training_image": (
                args.augment_distant_structure
            ),
            "missing_side_glass_copies_per_training_image": (
                args.augment_missing_side_glass
            ),
            "validation_or_test_augmented": False,
            "deterministic": True,
        },
        "limitations": limitations,
    }
    (output_dir / "dataset_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f"Manifest: {manifest_path}")
    print(f"Annotation review: {contact_sheet}")


if __name__ == "__main__":
    main()
