"""Verify the local maeng_coco API against every supplied regression image."""

from __future__ import annotations

import argparse
import json
import urllib.request
from pathlib import Path


def inspect(api_url: str, path: Path) -> dict[str, object]:
    request = urllib.request.Request(
        f"{api_url.rstrip('/')}/api/maeng-coco?threshold=0.15",
        data=path.read_bytes(),
        headers={"Content-Type": "image/jpeg"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=180) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--api-url", default="http://127.0.0.1:8000")
    args = parser.parse_args()

    source = args.source.resolve()
    train = args.dataset.resolve() / "train"
    groups = {
        "bus_information_system_damage": [
            source / "정류장_버스정보시스템파손.jpg",
            source / "정류장_버스정보시스템파손01.jpg",
            source / "정류장_버스정보시스템파손02.jpg",
        ],
        "side_glass_damage": [
            source / "정류장_외벽유리파손.jpg",
            source / "정류장_외벽유리파손01.jpg",
            source / "정류장_외벽유리파손02.jpg",
            source / "정류장_외벽유리파손03.jpg",
            source / "정류장_외벽유리파손04.jpg",
            source / "정류장_외벽유리파손05.jpg",
            source / "151893_17318_1425.jpg",
            source / "images.jpg",
            source / "파손" / "images (1).jpg",
            source / "파손" / "159339_61595_832.jpg",
        ],
        "other_bus_stop_damage": [
            source / "정류장_기둥형파손",
            source / "정류장_안내판파손.jpg",
            source / "정류장_안내판파손01.jpg",
            source / "정류장_안내판파손02.jpg",
            source / "정류장_의자파손.jpg",
            source / "정류장_천장유리파손.jpg",
            source / "정류장_천장유리파손01.jpg",
            source / "파손" / "4830_5592_3830.jpg",
        ],
        "no_damage_detected": [
            source / "정류장_정상.jpg",
            source / "42657_38203_4053.jpg",
            train / "normal_intact_side_glass_00.jpg",
            train / "normal_intact_side_glass_01.jpg",
            train / "normal_intact_side_glass_02.jpg",
            train / "normal_intact_side_glass_03.jpg",
        ],
    }

    rows: list[dict[str, object]] = []
    for expected, paths in groups.items():
        for path in paths:
            if not path.is_file():
                raise FileNotFoundError(path)
            result = inspect(args.api_url, path)
            detections = result["detections"]
            actual = result["label"] if detections else result["verdict"]
            confidence = max(
                (item["confidence"] for item in detections),
                default=0,
            )
            rows.append(
                {
                    "file": path.name,
                    "expected": expected,
                    "actual": actual,
                    "label_display": result["label_display"],
                    "confidence": round(confidence, 4),
                    "detections": len(detections),
                }
            )

    failures = [row for row in rows if row["actual"] != row["expected"]]
    print(json.dumps(rows, ensure_ascii=False, indent=2))
    print(f"TOTAL={len(rows)} FAILURES={len(failures)}")
    if failures:
        print(json.dumps(failures, ensure_ascii=False, indent=2))
        raise SystemExit(1)


if __name__ == "__main__":
    main()
