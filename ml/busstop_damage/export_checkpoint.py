"""Convert an RF-DETR Lightning checkpoint into an inference checkpoint."""

from __future__ import annotations

import argparse
from pathlib import Path

import torch


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument(
        "--template",
        type=Path,
        required=True,
        help="RF-DETR .pth file providing inference metadata and model config.",
    )
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    checkpoint_path = args.checkpoint.resolve()
    template_path = args.template.resolve()
    output_path = args.output.resolve()
    for path in (checkpoint_path, template_path):
        if not path.is_file():
            raise FileNotFoundError(path)
    if output_path.exists():
        raise FileExistsError(output_path)

    lightning = torch.load(
        checkpoint_path,
        map_location="cpu",
        weights_only=False,
    )
    template = torch.load(
        template_path,
        map_location="cpu",
        weights_only=False,
    )
    state_dict = lightning.get("state_dict")
    if not isinstance(state_dict, dict):
        raise ValueError(f"{checkpoint_path} has no Lightning state_dict")

    prefix = "model."
    model_state = {
        key.removeprefix(prefix): value
        for key, value in state_dict.items()
        if key.startswith(prefix)
    }
    if not model_state:
        raise ValueError(f"{checkpoint_path} has no {prefix!r} model weights")

    payload = dict(template)
    payload["model"] = model_state
    payload["state_dict"] = state_dict
    payload["epoch"] = lightning.get("epoch")
    payload["global_step"] = lightning.get("global_step")
    # Optimizer state is unnecessary for inference and would triple the file.
    payload["optimizer_states"] = []
    payload["lr_schedulers"] = []

    output_path.parent.mkdir(parents=True, exist_ok=True)
    torch.save(payload, output_path)
    print(
        f"Exported epoch {payload['epoch']} with {len(model_state)} tensors "
        f"to {output_path}"
    )


if __name__ == "__main__":
    main()
