"""Fine-tune RF-DETR Nano on the prepared bus-stop damage COCO dataset."""

from __future__ import annotations

import argparse
import json
import os
import platform
import sys
from pathlib import Path

# The local MSVC runtime bundled in a Windows virtual environment must be on
# PATH before torch imports its DLLs. UTF-8 also prevents Rich's COCO metrics
# table from failing on Korean Windows consoles.
if os.name == "nt":
    venv_scripts = str(Path(sys.executable).resolve().parent)
    os.environ["PATH"] = venv_scripts + os.pathsep + os.environ.get("PATH", "")
    if hasattr(os, "add_dll_directory"):
        os.add_dll_directory(venv_scripts)
for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8")

import torch
from rfdetr import RFDETRNano


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--device", choices=("auto", "cuda", "cpu"), default="auto")
    parser.add_argument(
        "--initial-checkpoint",
        type=Path,
        help="Optionally continue fine-tuning from a one-class RF-DETR checkpoint.",
    )
    parser.add_argument("--lr", type=float, default=1e-4)
    parser.add_argument("--lr-encoder", type=float, default=1e-5)
    parser.add_argument(
        "--freeze-encoder",
        action="store_true",
        help="Freeze the image encoder to reduce VRAM use (off by default).",
    )
    parser.add_argument("--early-stopping-patience", type=int, default=12)
    args = parser.parse_args()

    dataset_dir = args.dataset.resolve()
    output_dir = args.output.resolve()
    initial_checkpoint = (
        args.initial_checkpoint.resolve() if args.initial_checkpoint else None
    )
    if initial_checkpoint is not None and not initial_checkpoint.is_file():
        raise FileNotFoundError(initial_checkpoint)
    for split in ("train", "valid", "test"):
        annotation_path = dataset_dir / split / "_annotations.coco.json"
        if not annotation_path.is_file():
            raise FileNotFoundError(annotation_path)

    cuda_available = torch.cuda.is_available()
    if args.device == "cuda" and not cuda_available:
        raise RuntimeError("CUDA was requested but torch.cuda.is_available() is False")
    accelerator = (
        "gpu"
        if args.device == "cuda" or (args.device == "auto" and cuda_available)
        else "cpu"
    )

    output_dir.mkdir(parents=True, exist_ok=True)
    dataset_summary_path = dataset_dir / "dataset_summary.json"
    dataset_summary = (
        json.loads(dataset_summary_path.read_text(encoding="utf-8"))
        if dataset_summary_path.is_file()
        else {}
    )
    environment = {
        "python": platform.python_version(),
        "torch": torch.__version__,
        "cuda_build": torch.version.cuda,
        "cuda_available": cuda_available,
        "gpu": torch.cuda.get_device_name(0) if cuda_available else None,
        "epochs": args.epochs,
        "initial_checkpoint": (
            str(initial_checkpoint) if initial_checkpoint is not None else None
        ),
        "lr": args.lr,
        "lr_encoder": args.lr_encoder,
        "freeze_encoder": args.freeze_encoder,
        "early_stopping_patience": args.early_stopping_patience,
        "dataset": str(dataset_dir),
        "output": str(output_dir),
    }
    (output_dir / "environment.json").write_text(
        json.dumps(environment, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(environment, ensure_ascii=False, indent=2))

    # Gradient checkpointing, batch size 1 and disabled EMA keep peak memory low
    # enough for a 4 GB GTX 1650 Ti. Encoder freezing remains an opt-in fallback.
    model_kwargs: dict[str, object] = {
        "gradient_checkpointing": True,
        "freeze_encoder": args.freeze_encoder,
    }
    if initial_checkpoint is not None:
        model_kwargs.update(
            pretrain_weights=str(initial_checkpoint),
            num_classes=1,
        )
    model = RFDETRNano(**model_kwargs)
    model.train(
        dataset_dir=str(dataset_dir),
        output_dir=str(output_dir),
        epochs=args.epochs,
        batch_size=1,
        grad_accum_steps=4,
        resolution=384,
        lr=args.lr,
        lr_encoder=args.lr_encoder,
        use_ema=False,
        multi_scale=False,
        expanded_scales=False,
        num_workers=0,
        amp_dtype="fp16",
        accelerator=accelerator,
        devices=1,
        eval_interval=1,
        checkpoint_interval=5,
        early_stopping=True,
        early_stopping_patience=args.early_stopping_patience,
        tensorboard=True,
        wandb=False,
        mlflow=False,
        clearml=False,
        run_test=True,
        fp16_eval=cuda_available,
        save_dataset_grids=True,
        seed=20260725,
        notes={
            "purpose": "bus-stop damage proof of concept",
            "class": "bus_stop_damage",
            "source_images": dataset_summary.get(
                "source_images", dataset_summary.get("images")
            ),
            "training_records": dataset_summary.get(
                "training_records", dataset_summary.get("images")
            ),
            "warning": "not for production use; tiny dataset",
        },
    )


if __name__ == "__main__":
    main()
